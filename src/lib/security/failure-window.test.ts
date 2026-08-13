import { describe, expect, it } from "vitest";

import { BoundedFailureWindow } from "./failure-window";

const policy = { maxFailures: 5, windowMs: 10_000, idleTtlMs: 20_000, maxKeys: 2 };

describe("bounded failure lockouts", () => {
  it("locks on genuine failures and blocked probes do not extend the deadline", () => {
    let now = 0;
    const limiter = new BoundedFailureWindow(policy, () => now);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(limiter.recordFailure("user")).toMatchObject({ locked: false, failures: attempt });
    }
    expect(limiter.recordFailure("user")).toMatchObject({ locked: true, retryAfterMs: 10_000 });

    now = 5_000;
    expect(limiter.check("user")).toMatchObject({ locked: true, retryAfterMs: 5_000 });
    expect(limiter.recordFailure("user")).toMatchObject({ locked: true, retryAfterMs: 5_000 });

    now = 10_000;
    expect(limiter.check("user")).toMatchObject({ locked: false, failures: 0 });
  });

  it("bounds keys with LRU eviction without globally locking new principals", () => {
    let now = 0;
    const limiter = new BoundedFailureWindow(policy, () => now);
    limiter.recordFailure("a");
    limiter.recordFailure("b");
    now = 1;
    expect(limiter.check("a")).toMatchObject({ locked: false, failures: 1 });

    expect(limiter.recordFailure("c")).toMatchObject({ locked: false, failures: 1, reason: "OK" });
    expect(limiter.size).toBe(2);
    expect(limiter.check("a")).toMatchObject({ locked: false, failures: 1 });
    expect(limiter.check("b")).toMatchObject({ locked: false, failures: 0 });

    now = 20_000;
    expect(limiter.recordFailure("c")).toMatchObject({ locked: false, failures: 1 });
    expect(limiter.size).toBeLessThanOrEqual(2);
  });

  it("clears one principal after successful verification", () => {
    const limiter = new BoundedFailureWindow(policy, () => 0);
    limiter.recordFailure("user");
    limiter.clear("user");
    expect(limiter.check("user")).toMatchObject({ locked: false, failures: 0 });
  });
});
