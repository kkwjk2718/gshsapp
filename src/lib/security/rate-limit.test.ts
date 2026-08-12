import { describe, expect, it } from "vitest";

import { BoundedRateLimiter, evaluateTokenBucket } from "./rate-limit";

const policy = { capacity: 2, refillTokens: 2, refillIntervalMs: 1_000, idleTtlMs: 5_000, maxKeys: 2 };

describe("bounded token bucket", () => {
  it("allows capacity then reports exact refill delay", () => {
    const first = evaluateTokenBucket(undefined, 0, policy);
    const second = evaluateTokenBucket(first.state, 0, policy);
    const third = evaluateTokenBucket(second.state, 0, policy);
    expect([first.decision.allowed, second.decision.allowed, third.decision.allowed]).toEqual([true, true, false]);
    expect(third.decision).toMatchObject({ remaining: 0, retryAfterMs: 500, reason: "LIMIT" });
    expect(evaluateTokenBucket(third.state, 250, policy).decision).toMatchObject({ allowed: false, retryAfterMs: 250 });
    expect(evaluateTokenBucket(third.state, 500, policy).decision).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("does not refill on clock rollback", () => {
    const first = evaluateTokenBucket(undefined, 1_000, policy);
    const rolledBack = evaluateTokenBucket(first.state, 500, policy);
    expect(rolledBack.state.tokens).toBe(0);
    expect(rolledBack.state.lastRefillAt).toBe(1_000);
  });

  it("prunes exactly at idle TTL", () => {
    let now = 0;
    const limiter = new BoundedRateLimiter(policy, () => now);
    limiter.consume("a");
    now = 4_999;
    expect(limiter.prune()).toBe(0);
    now = 5_000;
    expect(limiter.prune()).toBe(1);
  });

  it("denies rotating keys at capacity without evicting active buckets", () => {
    let now = 0;
    const limiter = new BoundedRateLimiter(policy, () => now);
    limiter.consume("a"); limiter.consume("a");
    limiter.consume("b");
    expect(limiter.consume("c")).toMatchObject({ allowed: false, reason: "CAPACITY", retryAfterMs: 5_000 });
    expect(limiter.size).toBe(2);
    expect(limiter.consume("a")).toMatchObject({ allowed: false, reason: "LIMIT" });
    now = 5_000;
    expect(limiter.consume("c").allowed).toBe(true);
  });
});
