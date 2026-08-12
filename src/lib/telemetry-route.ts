import { resolveTrustedClientAddress, parseTrustedProxyHops } from "@/lib/security/client-address";
import { BoundedRateLimiter, type RateLimitDecision } from "@/lib/security/rate-limit";
import {
  TelemetryBodyError,
  normalizeConfiguredTelemetryOrigin,
  parseMealViewPayload,
  parsePageViewPayload,
  readBoundedJsonBody,
  validateTelemetryRequestMetadata,
} from "@/lib/security/telemetry-request";
import { appendBoundedSystemLog } from "@/lib/system-log-store";

type TelemetryKind = "PAGE_VIEW" | "MEAL_VIEW";
const TEN_MINUTES = 600_000;
const pageClient = new BoundedRateLimiter({ capacity: 30, refillTokens: 30, refillIntervalMs: 60_000, idleTtlMs: TEN_MINUTES, maxKeys: 4_096 });
const pageGlobal = new BoundedRateLimiter({ capacity: 600, refillTokens: 600, refillIntervalMs: 60_000, idleTtlMs: TEN_MINUTES, maxKeys: 1 });
const mealClient = new BoundedRateLimiter({ capacity: 10, refillTokens: 10, refillIntervalMs: 60_000, idleTtlMs: TEN_MINUTES, maxKeys: 4_096 });
const mealGlobal = new BoundedRateLimiter({ capacity: 300, refillTokens: 300, refillIntervalMs: 60_000, idleTtlMs: TEN_MINUTES, maxKeys: 1 });

function json(status: number, body: unknown, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function resolveClientAddress(request: Request): string | null {
  const trustedProxyHops = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
  return resolveTrustedClientAddress(
    { directAddress: null, forwardedFor: request.headers.get("x-forwarded-for") },
    { trustedProxyHops },
  );
}

function applyLimit(kind: TelemetryKind, address: string | null): RateLimitDecision | null {
  if (address) {
    const clientDecision = (kind === "PAGE_VIEW" ? pageClient : mealClient).consume(address);
    if (!clientDecision.allowed) return clientDecision;
  }
  const globalDecision = (kind === "PAGE_VIEW" ? pageGlobal : mealGlobal).consume("global");
  return globalDecision.allowed ? null : globalDecision;
}

export async function handleTelemetryRequest(request: Request, kind: TelemetryKind): Promise<Response> {
  const configuredOrigin = normalizeConfiguredTelemetryOrigin(process.env.NEXT_PUBLIC_APP_URL ?? "");
  const metadata = validateTelemetryRequestMetadata({
    origin: request.headers.get("origin"),
    contentType: request.headers.get("content-type"),
    fetchSite: request.headers.get("sec-fetch-site"),
    fetchMode: request.headers.get("sec-fetch-mode"),
    fetchDest: request.headers.get("sec-fetch-dest"),
  }, configuredOrigin ? [configuredOrigin] : []);
  if (!metadata.ok) {
    return json(metadata.code === "BAD_CONTENT_TYPE" ? 415 : 403, { ok: false });
  }

  let address: string | null;
  try { address = resolveClientAddress(request); } catch { return json(403, { ok: false }); }
  const limited = applyLimit(kind, address);
  if (limited) {
    return json(429, { ok: false }, { "Retry-After": String(Math.max(1, Math.ceil(limited.retryAfterMs / 1_000))) });
  }

  let body: unknown;
  try { body = await readBoundedJsonBody(request); } catch (error) {
    return json(error instanceof TelemetryBodyError ? error.status : 400, { ok: false });
  }
  const payload = kind === "PAGE_VIEW" ? parsePageViewPayload(body) : parseMealViewPayload(body);
  if (!payload.ok) return json(400, { ok: false });

  await appendBoundedSystemLog({
    action: kind,
    ip: address,
    userAgent: request.headers.get("user-agent"),
    path: kind === "PAGE_VIEW" ? (payload.value as { pathname: string }).pathname : "/meals",
    details: kind === "MEAL_VIEW" ? "Meal viewed via tracker" : null,
  });
  return json(202, { ok: true });
}
