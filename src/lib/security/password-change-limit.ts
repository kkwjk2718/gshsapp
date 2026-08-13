import { BoundedFailureWindow, type FailureDecision } from "./failure-window";

type Options = Readonly<{
  now?: () => number;
  userMaxFailures?: number;
  networkMaxFailures?: number;
  windowMs?: number;
  userMaxKeys?: number;
  networkMaxKeys?: number;
}>;

export function createPasswordChangeLimiter(options: Options = {}) {
  const windowMs = options.windowMs ?? 10 * 60_000;
  const users = new BoundedFailureWindow({
    maxFailures: options.userMaxFailures ?? 5,
    windowMs,
    idleTtlMs: windowMs,
    maxKeys: options.userMaxKeys ?? 4_096,
  }, options.now);
  const networks = new BoundedFailureWindow({
    maxFailures: options.networkMaxFailures ?? 100,
    windowMs,
    idleTtlMs: windowMs,
    maxKeys: options.networkMaxKeys ?? 1_024,
  }, options.now);

  return {
    check(userKey: string, networkKey: string | null): FailureDecision {
      const user = users.check(userKey);
      return user.locked || networkKey === null ? user : networks.check(networkKey);
    },
    recordFailure(userKey: string, networkKey: string | null): FailureDecision {
      const current = this.check(userKey, networkKey);
      if (current.locked) return current;
      const user = users.recordFailure(userKey);
      if (networkKey === null) return user;
      const network = networks.recordFailure(networkKey);
      return user.locked ? user : network;
    },
    clearUser(userKey: string) {
      users.clear(userKey);
    },
  };
}

export const passwordChangeLimiter = createPasswordChangeLimiter();
