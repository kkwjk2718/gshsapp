import { BoundedFailureWindow } from "@/lib/security/failure-window";

export const SIGNUP_ATTEMPT_WINDOW_MINUTES = 10;
export const MAX_SIGNUP_ATTEMPTS_PER_IDENTIFIER = 5;
export const MAX_SIGNUP_ATTEMPTS_PER_NETWORK = 100;

type SignupLimiterOptions = Readonly<{
  now?: () => number;
  identifierMaxAttempts?: number;
  networkMaxAttempts?: number;
  windowMs?: number;
  identifierMaxKeys?: number;
  networkMaxKeys?: number;
}>;

export function createSignupAttemptLimiter(options: SignupLimiterOptions = {}) {
  const windowMs = options.windowMs ?? SIGNUP_ATTEMPT_WINDOW_MINUTES * 60_000;
  const identifiers = new BoundedFailureWindow({
    maxFailures: options.identifierMaxAttempts ?? MAX_SIGNUP_ATTEMPTS_PER_IDENTIFIER,
    windowMs,
    idleTtlMs: windowMs,
    maxKeys: options.identifierMaxKeys ?? 4_096,
  }, options.now);
  const networks = new BoundedFailureWindow({
    maxFailures: options.networkMaxAttempts ?? MAX_SIGNUP_ATTEMPTS_PER_NETWORK,
    windowMs,
    idleTtlMs: windowMs,
    maxKeys: options.networkMaxKeys ?? 1_024,
  }, options.now);

  return {
    check(identifierKey: string, networkKey: string) {
      const identifier = identifiers.check(identifierKey);
      return identifier.locked ? identifier : networks.check(networkKey);
    },
    recordAttempt(identifierKey: string, networkKey: string) {
      const identifier = identifiers.recordFailure(identifierKey);
      const network = networks.recordFailure(networkKey);
      return identifier.locked ? identifier : network;
    },
  };
}

export const signupAttemptLimiter = createSignupAttemptLimiter();
