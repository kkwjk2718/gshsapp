import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter } from "./fixed-window-rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("rejects unseen keys at capacity without evicting active counters", () => {
    const limiter = new FixedWindowRateLimiter({
      limit: 1,
      windowMs: 100,
      maxKeys: 2,
    });

    expect(limiter.consume(["active:a"], 0)).toBe(true);
    expect(limiter.consume(["active:b"], 0)).toBe(true);
    expect(limiter.consume(["unseen:c"], 1)).toBe(false);
    expect(limiter.consume(["active:a"], 1)).toBe(false);
    expect(limiter.consume(["unseen:c"], 100)).toBe(true);
  });

  it("reserves capacity for all keys atomically", () => {
    const limiter = new FixedWindowRateLimiter({
      limit: 2,
      windowMs: 100,
      maxKeys: 2,
    });

    expect(limiter.consume(["principal:a"], 0)).toBe(true);
    expect(limiter.consume(["principal:b", "ip:b"], 1)).toBe(false);
    expect(limiter.consume(["principal:b"], 2)).toBe(true);
  });
});
