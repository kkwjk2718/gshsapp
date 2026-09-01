export const MAX_TELEMETRY_BODY_BYTES = 1_024;
export const MAX_TELEMETRY_PATH_BYTES = 512;

export type TelemetryRequestMetadata = Readonly<{
  origin: string | null;
  contentType: string | null;
  fetchSite: string | null;
  fetchMode: string | null;
  fetchDest: string | null;
}>;
export type TelemetryValidationCode = "BAD_ORIGIN" | "BAD_FETCH_METADATA" | "BAD_CONTENT_TYPE" | "BAD_PATHNAME" | "BAD_PAYLOAD";
export type ValidationResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: TelemetryValidationCode }>;

export class TelemetryBodyError extends Error {
  readonly code: "BODY_TOO_LARGE" | "INVALID_JSON";
  readonly status: 413 | 400;
  constructor(code: "BODY_TOO_LARGE" | "INVALID_JSON") {
    super(code);
    this.code = code;
    this.status = code === "BODY_TOO_LARGE" ? 413 : 400;
  }
}

export function normalizeConfiguredTelemetryOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (url.protocol !== "https:" && url.origin !== "http://localhost:3000") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const parts = value.split(";").map((part) => part.trim());
  if (parts[0].toLowerCase() !== "application/json") return false;
  if (parts.length === 1) return true;
  return parts.length === 2 && /^charset=utf-8$/i.test(parts[1]);
}

export function validateTelemetryRequestMetadata(
  metadata: TelemetryRequestMetadata,
  allowedOrigins: readonly string[],
): ValidationResult<null> {
  const origin = metadata.origin ? normalizeConfiguredTelemetryOrigin(metadata.origin) : null;
  if (!origin || metadata.origin === "null" || !allowedOrigins.includes(origin)) {
    return { ok: false, code: "BAD_ORIGIN" };
  }
  if (
    metadata.fetchSite !== "same-origin" ||
    metadata.fetchDest !== "empty" ||
    !["cors", "same-origin", "no-cors"].includes(metadata.fetchMode ?? "")
  ) return { ok: false, code: "BAD_FETCH_METADATA" };
  if (!validJsonContentType(metadata.contentType)) return { ok: false, code: "BAD_CONTENT_TYPE" };
  return { ok: true, value: null };
}

const FORBIDDEN_PATH_CODEPOINT = /[\u0000-\u001f\u007f-\u009f\ufeff\\]/u;

export function normalizeTelemetryPathname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes < 1 || bytes > MAX_TELEMETRY_PATH_BYTES || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.trim() !== value || value.includes("?") || value.includes("#") || FORBIDDEN_PATH_CODEPOINT.test(value)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (FORBIDDEN_PATH_CODEPOINT.test(decoded)) return null;
  try {
    const parsed = new URL(value, "https://telemetry.invalid");
    if (parsed.origin !== "https://telemetry.invalid" || parsed.pathname !== value) return null;
  } catch { return null; }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parsePageViewPayload(value: unknown): ValidationResult<{ pathname: string }> {
  if (!isPlainObject(value) || Object.keys(value).length !== 1 || !Object.prototype.hasOwnProperty.call(value, "pathname")) {
    return { ok: false, code: "BAD_PAYLOAD" };
  }
  const pathname = normalizeTelemetryPathname(value.pathname);
  return pathname ? { ok: true, value: { pathname } } : { ok: false, code: "BAD_PATHNAME" };
}

export function parseMealViewPayload(value: unknown): ValidationResult<Record<string, never>> {
  return isPlainObject(value) && Object.keys(value).length === 0
    ? { ok: true, value: {} }
    : { ok: false, code: "BAD_PAYLOAD" };
}

export async function readBoundedJsonBody(request: Request, maxBytes = MAX_TELEMETRY_BODY_BYTES): Promise<unknown> {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("maxBytes must be positive");
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new TelemetryBodyError("INVALID_JSON");
    if (Number(contentLength) > maxBytes) throw new TelemetryBodyError("BODY_TOO_LARGE");
  }
  if (!request.body) throw new TelemetryBodyError("INVALID_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new TelemetryBodyError("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof TelemetryBodyError) throw error;
    throw new TelemetryBodyError("INVALID_JSON");
  }
}
