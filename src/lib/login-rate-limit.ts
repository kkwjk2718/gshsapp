import { subMinutes } from "date-fns";
import { prisma } from "@/lib/db";
import { BoundedFailureWindow } from "@/lib/security/failure-window";

export const LOGIN_FAILURE_WINDOW_MINUTES = 10;
export const MAX_LOGIN_FAILURES_PER_WINDOW = 5;
export const MAX_LOGIN_NETWORK_FAILURES_PER_WINDOW = 200;

type LoginLimiterOptions = Readonly<{
  now?: () => number;
  maxFailures?: number;
  identifierMaxFailures?: number;
  networkMaxFailures?: number;
  windowMs?: number;
  maxKeys?: number;
  identifierMaxKeys?: number;
  networkMaxKeys?: number;
}>;

type BlockedLogSamplerOptions = Readonly<{
  now?: () => number;
  windowMs?: number;
  maxKeys?: number;
}>;

export function createBlockedLoginLogSampler(options: BlockedLogSamplerOptions = {}) {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? 60_000;
  const maxKeys = options.maxKeys ?? 2_048;
  if (!Number.isInteger(windowMs) || windowMs <= 0 || !Number.isInteger(maxKeys) || maxKeys <= 0) {
    throw new Error("Invalid blocked-login log sampling policy");
  }
  const expirations = new Map<string, number>();

  return {
    shouldLog(identifierKey: string, networkKey: string | null) {
      const currentTime = now();
      const principal = networkKey === null ? `identifier:${identifierKey}` : `network:${networkKey}`;
      const expiration = expirations.get(principal);
      if (expiration !== undefined && expiration > currentTime) return false;
      for (const [key, expiresAt] of expirations) {
        if (expiresAt <= currentTime) expirations.delete(key);
      }
      if (!expirations.has(principal) && expirations.size >= maxKeys) {
        let earliestKey: string | null = null;
        let earliestExpiration = Number.POSITIVE_INFINITY;
        for (const [key, expiresAt] of expirations) {
          if (expiresAt < earliestExpiration) {
            earliestKey = key;
            earliestExpiration = expiresAt;
          }
        }
        if (earliestKey !== null) expirations.delete(earliestKey);
      }
      expirations.set(principal, currentTime + windowMs);
      return true;
    },
  };
}

export function createLoginAttemptLimiter(options: LoginLimiterOptions = {}) {
  const windowMs = options.windowMs ?? LOGIN_FAILURE_WINDOW_MINUTES * 60_000;
  const identifiers = new BoundedFailureWindow({
    maxFailures: options.identifierMaxFailures ?? options.maxFailures ?? MAX_LOGIN_FAILURES_PER_WINDOW,
    windowMs,
    idleTtlMs: windowMs,
    maxKeys: options.identifierMaxKeys ?? options.maxKeys ?? 4_096,
  }, options.now);
  const networks = new BoundedFailureWindow({
    maxFailures: options.networkMaxFailures ?? options.maxFailures ?? MAX_LOGIN_NETWORK_FAILURES_PER_WINDOW,
    windowMs,
    idleTtlMs: windowMs,
    maxKeys: options.networkMaxKeys ?? options.maxKeys ?? 1_024,
  }, options.now);

  return {
    check(identifierKey: string, networkKey: string | null) {
      const identifier = identifiers.check(identifierKey);
      if (identifier.locked || networkKey === null) return identifier;
      return networks.check(networkKey);
    },
    recordFailure(identifierKey: string, networkKey: string | null) {
      const current = this.check(identifierKey, networkKey);
      if (current.locked) return current;
      const identifier = identifiers.recordFailure(identifierKey);
      if (networkKey === null) return identifier;
      const network = networks.recordFailure(networkKey);
      return identifier.locked ? identifier : network;
    },
    clearIdentifier(identifierKey: string) {
      identifiers.clear(identifierKey);
    },
  };
}

export const loginAttemptLimiter = createLoginAttemptLimiter();
export const blockedLoginLogSampler = createBlockedLoginLogSampler();

function escapeJsonStringValue(value: string) {
  return JSON.stringify(value).slice(1, -1);
}

function getLoginMarker(loginId: string) {
  return `"loginId":"${escapeJsonStringValue(loginId)}"`;
}

export async function countRecentFailedLogins(loginId: string) {
  const trimmedLoginId = loginId.trim();
  if (!trimmedLoginId || new TextEncoder().encode(trimmedLoginId).byteLength > 128) {
    return 0;
  }

  return prisma.systemLog.count({
    where: {
      action: "LOGIN_FAILED",
      createdAt: {
        gte: subMinutes(new Date(), LOGIN_FAILURE_WINDOW_MINUTES),
      },
      details: {
        contains: getLoginMarker(trimmedLoginId),
      },
    },
  });
}

export async function isLoginTemporarilyLocked(loginId: string) {
  const recentFailures = await countRecentFailedLogins(loginId);
  return recentFailures >= MAX_LOGIN_FAILURES_PER_WINDOW;
}
