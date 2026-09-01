export type FailureWindowPolicy = Readonly<{
  maxFailures: number;
  windowMs: number;
  idleTtlMs: number;
  maxKeys: number;
}>;

export type FailureDecision = Readonly<{
  locked: boolean;
  failures: number;
  retryAfterMs: number;
  reason: "OK" | "LOCKED";
}>;

type FailureState = {
  failureTimes: number[];
  lockedUntil: number;
  lastSeenAt: number;
};

function validatePolicy(policy: FailureWindowPolicy) {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  }
  if (policy.idleTtlMs < policy.windowMs) throw new Error("idleTtlMs must cover the failure window");
}

export class BoundedFailureWindow {
  readonly #policy: FailureWindowPolicy;
  readonly #now: () => number;
  readonly #states = new Map<string, FailureState>();

  constructor(policy: FailureWindowPolicy, now: () => number = Date.now) {
    validatePolicy(policy);
    this.#policy = policy;
    this.#now = now;
  }

  #normalize(state: FailureState, now: number): FailureState | null {
    if (state.lockedUntil > now) return state;
    if (state.lockedUntil > 0) return null;
    state.failureTimes = state.failureTimes.filter((time) => time > now - this.#policy.windowMs);
    return state.failureTimes.length > 0 ? state : null;
  }

  #evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const [key, state] of this.#states) {
      if (state.lastSeenAt < oldestSeen) {
        oldestKey = key;
        oldestSeen = state.lastSeenAt;
      }
    }
    if (oldestKey !== null) this.#states.delete(oldestKey);
  }

  check(key: string): FailureDecision {
    const now = this.#now();
    const state = this.#states.get(key);
    if (!state) {
      this.prune();
      return { locked: false, failures: 0, retryAfterMs: 0, reason: "OK" };
    }
    const normalized = this.#normalize(state, now);
    if (!normalized) {
      this.#states.delete(key);
      return { locked: false, failures: 0, retryAfterMs: 0, reason: "OK" };
    }
    if (normalized.lockedUntil > now) {
      normalized.lastSeenAt = now;
      return {
        locked: true,
        failures: normalized.failureTimes.length,
        retryAfterMs: normalized.lockedUntil - now,
        reason: "LOCKED",
      };
    }
    normalized.lastSeenAt = now;
    return { locked: false, failures: normalized.failureTimes.length, retryAfterMs: 0, reason: "OK" };
  }

  recordFailure(key: string): FailureDecision {
    const now = this.#now();
    const existing = this.#states.get(key);
    if (existing?.lockedUntil && existing.lockedUntil > now) return this.check(key);

    if (!existing) {
      this.prune();
      if (this.#states.size >= this.#policy.maxKeys) this.#evictLeastRecentlyUsed();
    }

    const state = existing ?? { failureTimes: [], lockedUntil: 0, lastSeenAt: now };
    const normalized = this.#normalize(state, now) ?? { failureTimes: [], lockedUntil: 0, lastSeenAt: now };
    normalized.failureTimes.push(now);
    normalized.lastSeenAt = now;
    if (normalized.failureTimes.length >= this.#policy.maxFailures) {
      normalized.lockedUntil = now + this.#policy.windowMs;
    }
    this.#states.set(key, normalized);
    return this.check(key);
  }

  clear(key: string): void {
    this.#states.delete(key);
  }

  prune(): number {
    const now = this.#now();
    let removed = 0;
    for (const [key, state] of this.#states) {
      if ((state.lockedUntil > 0 && state.lockedUntil <= now) || state.lastSeenAt + this.#policy.idleTtlMs <= now) {
        this.#states.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.#states.size;
  }
}
