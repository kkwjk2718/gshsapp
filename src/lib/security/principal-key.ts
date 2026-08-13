import { createHmac } from "node:crypto";

const INSECURE_SECRET_VALUES = new Set(["change-me", "changeme", "secret", "development"]);
const INSECURE_SECRET_PATTERN = /(?:replace[-_ ]?with|placeholder|example)/iu;

export function getApplicationSecuritySecret(
  environment: Readonly<Record<string, string | undefined>> = process.env as Readonly<Record<string, string | undefined>>,
): string {
  const secret = environment.AUTH_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || INSECURE_SECRET_VALUES.has(secret.toLowerCase()) || INSECURE_SECRET_PATTERN.test(secret)) {
    throw new Error("AUTH_SECRET must contain at least 32 bytes of non-placeholder secret material");
  }
  return secret;
}

export function hashSecurityPrincipal(namespace: string, value: string, secret: string): string {
  if (!namespace || !value) throw new Error("Security principal namespace and value are required");
  return createHmac("sha256", secret)
    .update(namespace, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("base64url");
}

export function networkPrincipal(address: string | null | undefined): string {
  return address ?? "unknown";
}
