import { describe, expect, it } from "vitest";

import { createSignupAttemptLimiter } from "@/lib/signup-rate-limit";

describe("signup attempt limiter", () => {
  it("uses a higher network threshold so several users behind one school NAT do not lock each other out", () => {
    const limiter = createSignupAttemptLimiter({ identifierMaxAttempts: 2, networkMaxAttempts: 5 });

    limiter.recordAttempt("student-a", "school-network");
    limiter.recordAttempt("student-a", "school-network");
    expect(limiter.check("student-a", "school-network").locked).toBe(true);
    expect(limiter.check("student-b", "school-network").locked).toBe(false);

    limiter.recordAttempt("student-b", "school-network");
    limiter.recordAttempt("student-c", "school-network");
    expect(limiter.check("student-d", "school-network").locked).toBe(false);
    limiter.recordAttempt("student-d", "school-network");
    expect(limiter.check("student-e", "school-network").locked).toBe(true);
  });

  it("evicts least-recently-used identifiers instead of failing closed at key capacity", () => {
    let now = 0;
    const limiter = createSignupAttemptLimiter({
      now: () => now,
      identifierMaxAttempts: 2,
      networkMaxAttempts: 100,
      identifierMaxKeys: 2,
      networkMaxKeys: 2,
    });

    limiter.recordAttempt("first", "network-a");
    now += 1;
    limiter.recordAttempt("second", "network-b");
    now += 1;
    expect(limiter.check("first", "network-a").locked).toBe(false);
    now += 1;
    limiter.recordAttempt("third", "network-c");

    expect(limiter.check("fourth", "network-d").locked).toBe(false);
  });

  it("skips the network dimension instead of sharing an unknown-address bucket", () => {
    const limiter = createSignupAttemptLimiter({ identifierMaxAttempts: 2, networkMaxAttempts: 2 });

    limiter.recordAttempt("student-a", null);
    limiter.recordAttempt("student-b", null);
    expect(limiter.check("student-c", null).locked).toBe(false);
  });
});
