import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".localdomain",
  ".internal",
  ".home.arpa",
];

function isIpv4InRange(ip: string, prefix: string, maskBits: number) {
  const ipParts = ip.split(".").map((part) => Number.parseInt(part, 10));
  const prefixParts = prefix.split(".").map((part) => Number.parseInt(part, 10));

  if (ipParts.length !== 4 || prefixParts.length !== 4 || ipParts.some(Number.isNaN) || prefixParts.some(Number.isNaN)) {
    return false;
  }

  let ipValue = 0;
  let prefixValue = 0;

  for (let index = 0; index < 4; index += 1) {
    ipValue = (ipValue << 8) + ipParts[index];
    prefixValue = (prefixValue << 8) + prefixParts[index];
  }

  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipValue & mask) === (prefixValue & mask);
}

export function isPrivateOrReservedIpAddress(ip: string) {
  if (net.isIPv4(ip)) {
    const blockedIpv4Ranges: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
    ];

    return blockedIpv4Ranges.some(([prefix, maskBits]) => isIpv4InRange(ip, prefix, maskBits));
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return true;
}

export function hasBlockedHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();

  if (!normalizedHostname) {
    return true;
  }

  if (BLOCKED_HOSTNAMES.has(normalizedHostname)) {
    return true;
  }

  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix));
}

export function parseExternalHttpsUrl(rawUrl: string) {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    throw new Error("URL is required.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only https:// URLs are allowed.");
  }

  if (!parsedUrl.hostname) {
    throw new Error("URL hostname is required.");
  }

  if (hasBlockedHostname(parsedUrl.hostname)) {
    throw new Error("Blocked hostname.");
  }

  if (net.isIP(parsedUrl.hostname) && isPrivateOrReservedIpAddress(parsedUrl.hostname)) {
    throw new Error("Private or reserved IP addresses are not allowed.");
  }

  return parsedUrl;
}

export async function assertSafeExternalHttpsUrl(rawUrl: string) {
  const parsedUrl = parseExternalHttpsUrl(rawUrl);

  if (net.isIP(parsedUrl.hostname)) {
    return parsedUrl;
  }

  const records = await dns.lookup(parsedUrl.hostname, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error("Hostname could not be resolved.");
  }

  if (records.some((record) => isPrivateOrReservedIpAddress(record.address))) {
    throw new Error("Hostname resolves to a private or reserved IP address.");
  }

  return parsedUrl;
}
