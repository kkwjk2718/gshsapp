import { randomBytes } from "node:crypto";

const PRIVATE_DOCUMENT_PREFIXES = [
  "/admin",
  "/me",
  "/notifications",
  "/music",
  "/songs",
  "/timetable",
  "/links",
  "/sites",
  "/teachers",
  "/signup",
  "/login",
  "/logout",
  "/report",
] as const;

export function createRequestNonce() {
  return randomBytes(24).toString("base64url");
}

export function buildContentSecurityPolicy(nonce: string, development: boolean) {
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) {
    throw new Error("Invalid CSP nonce");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google-analytics.com`,
    "script-src-attr 'none'",
    // React uses style attributes throughout this application. This exception is
    // intentionally limited to CSS; executable inline script remains forbidden.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function isPrivateDocumentPath(pathname: string) {
  return PRIVATE_DOCUMENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function privateRobotsDisallowPaths() {
  return PRIVATE_DOCUMENT_PREFIXES.flatMap((prefix) => [`${prefix}$`, `${prefix}/`]);
}

export function securityTxt(now = new Date()) {
  const expires = new Date(now);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  return [
    "Contact: https://github.com/kkwjk2718/gshsapp/security/advisories/new",
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: ko, en",
    "Canonical: https://gshs.app/.well-known/security.txt",
    "Policy: https://github.com/kkwjk2718/gshsapp/security/policy",
    "",
  ].join("\n");
}
