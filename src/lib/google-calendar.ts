import { request as httpsRequest } from "node:https";
import ical from "node-ical";
import { createPinnedLookup, resolveAllowedICalTarget, type ResolvedAddress } from "@/lib/network-safety";
import { formatOutboundError, readBoundedNodeStreamText } from "@/lib/outbound-response";

const ICAL_TIMEOUT_MS = 10_000;
const ICAL_MAX_RESPONSE_BYTES = 1_500_000;
const ICAL_MAX_EVENTS = 500;
const ICAL_MAX_INPUT_EVENTS = 1_000;
const ICAL_MAX_PHYSICAL_LINES = 40_000;
const ICAL_MAX_LOGICAL_LINES = 20_000;
const ICAL_MAX_LOGICAL_LINE_BYTES = 64 * 1024;
const ICAL_MAX_FOLDS_PER_LINE = 1_024;
const ICAL_MAX_TITLE_LENGTH = 200;
const ICAL_MAX_DESCRIPTION_LENGTH = 2_000;
const ICAL_MAX_EVENT_SPAN_MS = 366 * 86_400_000;
const ICAL_MAX_UID_BYTES = 512;
const FORBIDDEN_ICAL_OBJECT_KEYS = new Set(
  [...Object.getOwnPropertyNames(Object.prototype), "prototype"].map((key) => key.toLowerCase()),
);

export interface ICalEvent {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  category: "EXTERNAL";
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isAllowedCalendarContentType(value: string | undefined) {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "text/calendar" || mediaType === "text/plain" || mediaType === "application/octet-stream";
}

async function fetchPinnedICal(url: URL, address: ResolvedAddress) {
  return await new Promise<string>((resolve, reject) => {
    const signal = AbortSignal.timeout(ICAL_TIMEOUT_MS);
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        family: address.family,
        agent: false,
        signal,
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, application/octet-stream;q=0.5",
          "User-Agent": "gshsapp-calendar/1.0",
        },
        lookup: createPinnedLookup(address),
      },
      async (response) => {
        try {
          const status = response.statusCode || 0;
          if (status < 200 || status >= 300) {
            response.resume();
            throw new Error(`iCal fetch failed with status ${status}`);
          }
          if (!isAllowedCalendarContentType(firstHeader(response.headers["content-type"]))) {
            response.resume();
            throw new Error("iCal response has an invalid content type.");
          }

          const text = await readBoundedNodeStreamText(response, {
            maxBytes: ICAL_MAX_RESPONSE_BYTES,
            contentLength: firstHeader(response.headers["content-length"]),
          });
          resolve(text);
        } catch (error) {
          response.destroy();
          reject(error);
        }
      },
    );

    request.once("error", reject);
    request.end();
  });
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function decodeICalText(value: string) {
  return value
    .replaceAll(String.raw`\,`, ",")
    .replaceAll(String.raw`\;`, ";")
    .replaceAll(/\\[nN]/g, "\n")
    .replaceAll("\\\\", "\\")
    .replace(/^"(.*)"$/, "$1");
}

function isSafeICalParserInput(rawCalendar: string) {
  const physicalLines = rawCalendar.split(/\r?\n/);
  if (physicalLines.length > ICAL_MAX_PHYSICAL_LINES) return false;
  let logicalLine = "";
  let logicalLineBytes = 0;
  let logicalLineFolds = 0;
  let logicalLines = 0;
  let eventDefinitions = 0;

  const isSafeLogicalLine = (line: string) => {
    logicalLines += 1;
    if (logicalLines > ICAL_MAX_LOGICAL_LINES) return false;
    if (Buffer.byteLength(line, "utf8") > ICAL_MAX_LOGICAL_LINE_BYTES) return false;
    const match = line.match(/^([\w\d-]+)(?:;[^:]*)?:(.*)$/);
    if (!match) return true;

    const propertyName = match[1].toLowerCase();
    if (FORBIDDEN_ICAL_OBJECT_KEYS.has(propertyName)) return false;
    if (propertyName === "begin" && match[2].trim().toUpperCase() === "VEVENT") {
      eventDefinitions += 1;
      if (eventDefinitions > ICAL_MAX_INPUT_EVENTS) return false;
    }
    if (propertyName !== "uid") return true;

    const uid = decodeICalText(match[2]);
    return (
      Buffer.byteLength(uid, "utf8") <= ICAL_MAX_UID_BYTES &&
      !FORBIDDEN_ICAL_OBJECT_KEYS.has(uid.trim().toLowerCase())
    );
  };

  for (const physicalLine of physicalLines) {
    if (/^[ \t]/.test(physicalLine)) {
      logicalLineFolds += 1;
      if (logicalLineFolds > ICAL_MAX_FOLDS_PER_LINE) return false;
      const continuation = physicalLine.slice(1);
      logicalLineBytes += Buffer.byteLength(continuation, "utf8");
      if (logicalLineBytes > ICAL_MAX_LOGICAL_LINE_BYTES) return false;
      logicalLine += continuation;
      continue;
    }
    if (logicalLine && !isSafeLogicalLine(logicalLine)) return false;
    logicalLine = physicalLine;
    logicalLineBytes = Buffer.byteLength(physicalLine, "utf8");
    logicalLineFolds = 0;
    if (logicalLineBytes > ICAL_MAX_LOGICAL_LINE_BYTES) return false;
  }

  return !logicalLine || isSafeLogicalLine(logicalLine);
}

function isOwnCalendarComponent(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(component: Record<string, unknown>, key: string) {
  return Object.hasOwn(component, key) ? component[key] : undefined;
}

export function parseICalEvents(rawCalendar: string, now = new Date()): ICalEvent[] {
  if (Buffer.byteLength(rawCalendar, "utf8") > ICAL_MAX_RESPONSE_BYTES) return [];
  if (!isSafeICalParserInput(rawCalendar)) return [];

  const currentYear = now.getUTCFullYear();
  const earliest = Date.UTC(currentYear - 1, 0, 1);
  const latest = Date.UTC(currentYear + 1, 11, 31, 23, 59, 59, 999);
  const parsed = ical.sync.parseICS(rawCalendar);
  const result: ICalEvent[] = [];

  for (const [key, component] of Object.entries(parsed)) {
    if (result.length >= ICAL_MAX_EVENTS) break;
    if (!isOwnCalendarComponent(component) || ownValue(component, "type") !== "VEVENT") continue;

    const title = boundedText(ownValue(component, "summary"), ICAL_MAX_TITLE_LENGTH);
    const startDate = new Date(ownValue(component, "start") as Date);
    const endDate = new Date(ownValue(component, "end") as Date);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    if (
      !title ||
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs < earliest ||
      endMs > latest ||
      endMs < startMs ||
      endMs - startMs > ICAL_MAX_EVENT_SPAN_MS
    ) {
      continue;
    }

    const id = boundedText(ownValue(component, "uid"), 256) || boundedText(key, 256);
    if (!id) continue;

    result.push({
      id,
      title,
      description: boundedText(ownValue(component, "description"), ICAL_MAX_DESCRIPTION_LENGTH),
      startDate,
      endDate,
      category: "EXTERNAL",
    });
  }

  return result;
}

export async function getEventsFromICal(url: string): Promise<ICalEvent[]> {
  if (!url) return [];

  try {
    const target = await resolveAllowedICalTarget(url);
    const rawCalendar = await fetchPinnedICal(target.url, target.address);
    return parseICalEvents(rawCalendar);
  } catch (error) {
    console.error("Failed to fetch or parse iCal feed:", formatOutboundError(error));
    return [];
  }
}
