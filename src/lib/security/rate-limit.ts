export type TokenBucketPolicy = Readonly<{
  capacity: number;
  refillTokens: number;
  refillIntervalMs: number;
  idleTtlMs: number;
  maxKeys: number;
}>;

export type TokenBucketState = Readonly<{
  tokens: number;
  lastRefillAt: number;
  lastSeenAt: number;
}>;

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  reason: "OK" | "LIMIT" | "CAPACITY";
}>;

function assertPositiveFinite(value: number, name: string, integer = false) {
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be a positive${integer ? " integer" : " finite number"}`);
  }
}

function validatePolicy(policy: TokenBucketPolicy) {
  assertPositiveFinite(policy.capacity, "capacity");
  assertPositiveFinite(policy.refillTokens, "refillTokens");
  assertPositiveFinite(policy.refillIntervalMs, "refillIntervalMs");
  assertPositiveFinite(policy.idleTtlMs, "idleTtlMs");
  assertPositiveFinite(policy.maxKeys, "maxKeys", true);
}

export function evaluateTokenBucket(
  previous: TokenBucketState | undefined,
  nowMs: number,
  policy: TokenBucketPolicy,
  cost = 1,
): Readonly<{ state: TokenBucketState; decision: RateLimitDecision }> {
  validatePolicy(policy);
  assertPositiveFinite(cost, "cost");
  if (!Number.isFinite(nowMs)) throw new Error("nowMs must be finite");

  const effectiveNow = previous
    ? Math.max(nowMs, previous.lastRefillAt, previous.lastSeenAt)
    : nowMs;
  const startingTokens = previous?.tokens ?? policy.capacity;
  const elapsed = previous ? effectiveNow - previous.lastRefillAt : 0;
  const tokens = Math.min(
    policy.capacity,
    startingTokens + elapsed * policy.refillTokens / policy.refillIntervalMs,
  );
  const allowed = tokens >= cost;
  const nextTokens = allowed ? tokens - cost : tokens;
  const missing = Math.max(0, cost - tokens);
  const retryAfterMs = allowed
    ? 0
    : Math.ceil(missing * policy.refillIntervalMs / policy.refillTokens);
  const state = {
    tokens: nextTokens,
    lastRefillAt: effectiveNow,
    lastSeenAt: effectiveNow,
  };
  return {
    state,
    decision: {
      allowed,
      remaining: Math.max(0, Math.floor(nextTokens)),
      retryAfterMs,
      reason: allowed ? "OK" : "LIMIT",
    },
  };
}

export function isExpiredBucket(state: TokenBucketState, nowMs: number, idleTtlMs: number): boolean {
  assertPositiveFinite(idleTtlMs, "idleTtlMs");
  return Math.max(nowMs, state.lastSeenAt) - state.lastSeenAt >= idleTtlMs;
}

export class BoundedRateLimiter {
  readonly #policy: TokenBucketPolicy;
  readonly #now: () => number;
  readonly #buckets = new Map<string, TokenBucketState>();

  constructor(policy: TokenBucketPolicy, now: () => number = Date.now) {
    validatePolicy(policy);
    this.#policy = policy;
    this.#now = now;
  }

  consume(key: string, cost = 1): RateLimitDecision {
    assertPositiveFinite(cost, "cost");
    const now = this.#now();
    const previous = this.#buckets.get(key);
    if (!previous) {
      this.prune();
      if (this.#buckets.size >= this.#policy.maxKeys) {
        let earliestExpiry = this.#policy.idleTtlMs;
        for (const state of this.#buckets.values()) {
          earliestExpiry = Math.min(earliestExpiry, state.lastSeenAt + this.#policy.idleTtlMs - now);
        }
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.min(this.#policy.idleTtlMs, Math.max(1, Math.ceil(earliestExpiry))),
          reason: "CAPACITY",
        };
      }
    }

    const result = evaluateTokenBucket(previous, now, this.#policy, cost);
    this.#buckets.set(key, result.state);
    return result.decision;
  }

  prune(): number {
    const now = this.#now();
    let removed = 0;
    for (const [key, state] of this.#buckets) {
      if (isExpiredBucket(state, now, this.#policy.idleTtlMs)) {
        this.#buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size() { return this.#buckets.size; }
}
