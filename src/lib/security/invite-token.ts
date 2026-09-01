import { createHash, randomBytes } from "node:crypto";

export const INVITE_SECRET_BYTES = 32;

export function generateInviteSecret(): string {
  return randomBytes(INVITE_SECRET_BYTES).toString("base64url");
}

export function hashInviteSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("base64url");
}
