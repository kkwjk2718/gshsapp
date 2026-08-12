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

export const DEFAULT_ICAL_ALLOWED_HOSTS = new Set(["calendar.google.com"]);

export interface ResolvedAddress {
  address: string;
  family: number;
}

type LookupAll = (hostname: string) => Promise<ResolvedAddress[]>;

export type PinnedLookup = net.LookupFunction;

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
      ["240.0.0.0", 4],
    ];

    return blockedIpv4Ranges.some(([prefix, maskBits]) => isIpv4InRange(ip, prefix, maskBits));
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) return isPrivateOrReservedIpAddress(mappedIpv4);
    return (
      normalized.startsWith("::") ||
      normalized.startsWith("64:ff9b::") ||
      normalized.startsWith("64:ff9b:1:") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fec") ||
      normalized.startsWith("fed") ||
      normalized.startsWith("fee") ||
      normalized.startsWith("fef") ||
      normalized.startsWith("2001:db8") ||
      normalized.startsWith("100:") ||
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

function addressLiteralFromHostname(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
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

  const addressLiteral = addressLiteralFromHostname(parsedUrl.hostname);
  if (net.isIP(addressLiteral) && isPrivateOrReservedIpAddress(addressLiteral)) {
    throw new Error("Private or reserved IP addresses are not allowed.");
  }

  return parsedUrl;
}

function configuredICalAllowedHosts(rawValue = process.env.ICAL_ALLOWED_HOSTS) {
  if (!rawValue?.trim()) return DEFAULT_ICAL_ALLOWED_HOSTS;

  const hosts = rawValue
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(host));

  return hosts.length > 0 && hosts.length <= 20 ? new Set(hosts) : DEFAULT_ICAL_ALLOWED_HOSTS;
}

function hasExplicitPort(rawUrl: string) {
  const authority = rawUrl.slice("https://".length).split(/[/?#]/, 1)[0];
  const hostPort = authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority;
  return hostPort.startsWith("[") ? hostPort.includes("]:") : hostPort.includes(":");
}

export function parseAllowedICalHttpsUrl(
  rawUrl: string,
  allowedHosts: ReadonlySet<string> = configuredICalAllowedHosts(),
) {
  if (rawUrl.length > 2_048) throw new Error("iCal URL is too long.");
  const parsedUrl = parseExternalHttpsUrl(rawUrl);

  if (net.isIP(addressLiteralFromHostname(parsedUrl.hostname))) {
    throw new Error("iCal URLs must use an allowed hostname.");
  }
  if (parsedUrl.username || parsedUrl.password) throw new Error("URL credentials are not allowed.");
  if (parsedUrl.port || hasExplicitPort(rawUrl.trim())) throw new Error("Custom URL ports are not allowed.");
  if (parsedUrl.hash) throw new Error("URL fragments are not allowed.");
  if (!allowedHosts.has(parsedUrl.hostname.toLowerCase())) throw new Error("iCal provider hostname is not allowed.");

  return parsedUrl;
}

export async function resolvePinnedPublicAddress(
  hostname: string,
  lookupAll: LookupAll = async (host) => dns.lookup(host, { all: true, verbatim: true }),
) {
  const records = await lookupAll(hostname);
  if (!records.length || records.length > 32) throw new Error("Hostname could not be resolved safely.");
  if (records.some((record) => isPrivateOrReservedIpAddress(record.address))) {
    throw new Error("Hostname resolves to a private or reserved IP address.");
  }

  const selected = records.find((record) => record.family === 4) || records[0];
  if ((selected.family !== 4 && selected.family !== 6) || net.isIP(selected.address) !== selected.family) {
    throw new Error("Hostname returned an invalid address.");
  }
  return { address: selected.address, family: selected.family };
}

export function createPinnedLookup(address: ResolvedAddress): PinnedLookup {
  return ((
    _hostname: string,
    options: { all?: boolean },
    callback: (error: NodeJS.ErrnoException | null, result: string | ResolvedAddress[], family?: number) => void,
  ) => {
    if (options.all) {
      callback(null, [address]);
      return;
    }
    callback(null, address.address, address.family);
  }) as PinnedLookup;
}

export async function resolveAllowedICalTarget(rawUrl: string) {
  const url = parseAllowedICalHttpsUrl(rawUrl);
  const address = await resolvePinnedPublicAddress(url.hostname);
  return { url, address };
}

export async function assertSafeExternalHttpsUrl(rawUrl: string) {
  const { url } = await resolveAllowedICalTarget(rawUrl);
  return url;
}
