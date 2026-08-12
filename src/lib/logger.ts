import { auth } from "@/auth";
import { headers } from "next/headers";

import { parseTrustedProxyHops, resolveTrustedClientAddress } from "@/lib/security/client-address";
import { normalizeConfiguredTelemetryOrigin, normalizeTelemetryPathname } from "@/lib/security/telemetry-request";
import { appendBoundedSystemLog, serializeSystemLogDetails } from "@/lib/system-log-store";

type HeaderReader = { get(name: string): string | null };
export type LogContext = Readonly<{ userId?: string | null; requestHeaders?: HeaderReader }>;

function safeRefererPath(value: string | null, allowedOrigin: string | null) {
  if (!value || !allowedOrigin) return null;
  try {
    const referer = new URL(value);
    if (referer.origin !== allowedOrigin) return null;
    return normalizeTelemetryPathname(referer.pathname);
  } catch { return null; }
}

function trustedAddress(requestHeaders: HeaderReader) {
  return resolveTrustedClientAddress(
    { directAddress: null, forwardedFor: requestHeaders.get("x-forwarded-for") },
    { trustedProxyHops: parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS) },
  );
}

export async function logAction(
  action: string,
  details?: Record<string, unknown> | string,
  path?: string,
  context?: LogContext,
) {
  try {
    const requestHeaders = context?.requestHeaders ?? await headers();
    const userId = context === undefined ? (await auth())?.user?.id ?? null : context.userId ?? null;
    const allowedOrigin = normalizeConfiguredTelemetryOrigin(process.env.NEXT_PUBLIC_APP_URL ?? "");
    const normalizedPath = path === undefined
      ? safeRefererPath(requestHeaders.get("referer"), allowedOrigin)
      : normalizeTelemetryPathname(path);
    await appendBoundedSystemLog({
      action,
      userId,
      ip: trustedAddress(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
      path: normalizedPath,
      details: serializeSystemLogDetails(details),
    });
  } catch (error) {
    console.error("Failed to log action:", error);
  }
}
