import { BoundedRateLimiter } from "@/lib/security/rate-limit";

export const REPORT_TITLE_MAX_CHARS = 120;
export const REPORT_TITLE_MAX_BYTES = 240;
export const REPORT_CONTENT_MAX_CHARS = 4_000;
export const REPORT_CONTENT_MAX_BYTES = 8_000;
export const REPORT_DAILY_CAP = 5;
export const REPORT_PENDING_CAP = 3;
export const SONG_TITLE_MAX_CHARS = 200;
export const SONG_TITLE_MAX_BYTES = 512;
export const SONG_DAILY_CAP = 3;
export const SONG_PENDING_CAP = 2;
export const SONG_DAILY_READ_CAP = 100;

const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const reportPrincipal = new BoundedRateLimiter({ capacity: 3, refillTokens: 3, refillIntervalMs: 600_000, idleTtlMs: 3_600_000, maxKeys: 4_096 });
const reportShared = new BoundedRateLimiter({ capacity: 120, refillTokens: 120, refillIntervalMs: 60_000, idleTtlMs: 600_000, maxKeys: 1 });
const songPrincipal = new BoundedRateLimiter({ capacity: 5, refillTokens: 5, refillIntervalMs: 600_000, idleTtlMs: 3_600_000, maxKeys: 4_096 });
const songShared = new BoundedRateLimiter({ capacity: 300, refillTokens: 300, refillIntervalMs: 60_000, idleTtlMs: 600_000, maxKeys: 1 });

function boundedText(value: unknown, label: string, maxChars: number, maxBytes: number) {
  if (typeof value !== "string") throw new Error(`Invalid ${label}`);
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maxChars || new TextEncoder().encode(normalized).byteLength > maxBytes || CONTROL.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

export function validateReportSubmission(title: unknown, content: unknown) {
  return {
    title: boundedText(title, "report title", REPORT_TITLE_MAX_CHARS, REPORT_TITLE_MAX_BYTES),
    content: boundedText(content, "report content", REPORT_CONTENT_MAX_CHARS, REPORT_CONTENT_MAX_BYTES),
  };
}

export function validateSongTitle(value: unknown) {
  return boundedText(value, "song title", SONG_TITLE_MAX_CHARS, SONG_TITLE_MAX_BYTES);
}

export function consumeReportSubmissionQuota(principalId: string) {
  if (!reportPrincipal.consume(principalId).allowed || !reportShared.consume("global").allowed) throw new Error("Too many report submissions");
}

export function consumeSongSubmissionQuota(principalId: string) {
  if (!songPrincipal.consume(principalId).allowed || !songShared.consume("global").allowed) throw new Error("Too many song submissions");
}
