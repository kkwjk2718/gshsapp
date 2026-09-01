import { isIP } from "node:net";

export const MAX_FORWARDED_FOR_ENTRIES = 8;

export type TrustedProxyPolicy = Readonly<{ trustedProxyHops: number }>;
export type ClientAddressInput = Readonly<{
  directAddress?: string | null;
  forwardedFor?: string | null;
}>;

export function parseTrustedProxyHops(raw: string | undefined): number {
  if (raw === undefined) return 0;
  if (!/^[0-3]$/.test(raw)) throw new Error("TRUSTED_PROXY_HOPS must be an integer from 0 through 3");
  return Number(raw);
}

export function normalizeIpAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 45 || raw !== raw.trim()) return null;
  return isIP(raw) === 0 ? null : raw.toLowerCase();
}

export function resolveTrustedClientAddress(
  input: ClientAddressInput,
  policy: TrustedProxyPolicy,
): string | null {
  const hops = policy.trustedProxyHops;
  if (!Number.isInteger(hops) || hops < 0 || hops > 3) throw new Error("Invalid trusted proxy policy");
  if (hops === 0) return normalizeIpAddress(input.directAddress);
  if (!input.forwardedFor) return null;
  const entries = input.forwardedFor.split(",").map((entry) => entry.trim());
  if (entries.length > MAX_FORWARDED_FOR_ENTRIES || entries.length < hops) return null;
  return normalizeIpAddress(entries[entries.length - hops]);
}

export function isSensitiveClientAddressTrusted(address: string | null, trustedProxyHops: number): boolean {
  return trustedProxyHops === 0 || address !== null;
}
