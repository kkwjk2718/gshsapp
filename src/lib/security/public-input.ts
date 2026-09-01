import { normalizeLocalRedirect } from "@/lib/security/local-redirect";

const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const ENCODED_PATH_CONTROL = /%(?:00|0a|0d|5c)/iu;
const LINK_CATEGORIES = new Set(["GENERAL", "LEARNING", "SCHOOL", "EXTERNAL"]);
const RELATED_SITE_CATEGORIES = new Set(["OFFICIAL", "CLUB", "COMMUNITY"]);
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function boundedText(
  value: unknown,
  label: string,
  maxChars: number,
  maxBytes: number,
  optional = false,
) {
  if (typeof value !== "string") throw new Error(`Invalid ${label}`);
  const normalized = value.trim();
  if (optional && !normalized) return "";
  if (
    !normalized ||
    [...normalized].length > maxChars ||
    new TextEncoder().encode(normalized).byteLength > maxBytes ||
    CONTROL.test(normalized)
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

export function normalizeNotificationLink(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    [...trimmed].length > 512 ||
    new TextEncoder().encode(trimmed).byteLength > 1_024 ||
    CONTROL.test(trimmed) ||
    ENCODED_PATH_CONTROL.test(trimmed)
  ) {
    return null;
  }
  const normalized = normalizeLocalRedirect(trimmed, "");
  return normalized || null;
}

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function normalizeExternalHttpsUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid link URL");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    IPV4_HOST.test(hostname) ||
    hostname.includes(":")
  ) {
    throw new Error("Invalid link URL");
  }
  return parsed.toString();
}

export function normalizeLinkItemInput(input: {
  title: unknown;
  url: unknown;
  description: unknown;
  category: unknown;
}) {
  const title = boundedText(input.title, "link title", 120, 240);
  const description = boundedText(input.description ?? "", "link description", 500, 1_000, true);
  const rawUrl = boundedText(input.url, "link URL", 1_024, 2_048);
  if (typeof input.category !== "string" || !LINK_CATEGORIES.has(input.category)) {
    throw new Error("Invalid link category");
  }

  return {
    title,
    url: normalizeExternalHttpsUrl(rawUrl),
    description: description || null,
    category: input.category,
  };
}

export function normalizeRelatedSiteInput(input: {
  name: unknown;
  url: unknown;
  description: unknown;
  category: unknown;
}) {
  const name = boundedText(input.name, "site name", 120, 240);
  const description = boundedText(input.description ?? "", "site description", 500, 1_000, true);
  const rawUrl = boundedText(input.url, "site URL", 1_024, 2_048);
  if (typeof input.category !== "string" || !RELATED_SITE_CATEGORIES.has(input.category)) {
    throw new Error("Invalid site category");
  }
  return {
    name,
    url: normalizeExternalHttpsUrl(rawUrl),
    description: description || null,
    category: input.category,
  };
}

export function isSafeExternalHttpsUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    return normalizeExternalHttpsUrl(value) === value;
  } catch {
    return false;
  }
}

export function normalizeStoredExternalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return normalizeExternalHttpsUrl(value);
  } catch {
    return null;
  }
}

export function normalizeNoticeCategoryInput(labelValue: unknown, categoryValue: unknown) {
  const label = boundedText(labelValue, "category label", 80, 160);
  if (typeof categoryValue !== "string") throw new Error("Invalid category value");
  const value = categoryValue.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,40}$/.test(value)) throw new Error("Invalid category value");
  return { label, value };
}
