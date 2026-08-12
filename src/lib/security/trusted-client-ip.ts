import { isIP } from "node:net";

export const SHARED_UNKNOWN_CLIENT_IP = "unknown";
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const MAX_HEADER_NAME_LENGTH = 128;

type HeaderReader = {
  get(name: string): string | null;
};

export function resolveTrustedClientIp(
  headers: HeaderReader,
  trustedHeaderName: string | undefined,
) {
  const normalizedHeaderName = trustedHeaderName?.trim();
  if (
    !normalizedHeaderName ||
    normalizedHeaderName.length > MAX_HEADER_NAME_LENGTH ||
    !HTTP_HEADER_NAME_PATTERN.test(normalizedHeaderName)
  ) {
    return SHARED_UNKNOWN_CLIENT_IP;
  }

  const candidate = headers.get(normalizedHeaderName)?.trim();
  if (!candidate || isIP(candidate) === 0) {
    return SHARED_UNKNOWN_CLIENT_IP;
  }

  return candidate.toLowerCase();
}
