import { describe, expect, it } from "vitest";

import { createPasswordChangeLimiter } from "./password-change-limit";

describe("password change verification limiter", () => {
  it("limits each account strictly and a known network at a higher threshold", () => {
    const limiter = createPasswordChangeLimiter({ userMaxFailures: 2, networkMaxFailures: 4, windowMs: 60_000 });

    expect(limiter.recordFailure("user-a", "school-network")).toMatchObject({ locked: false });
    expect(limiter.recordFailure("user-a", "school-network")).toMatchObject({ locked: true });
    expect(limiter.check("user-b", "school-network")).toMatchObject({ locked: false });
    expect(limiter.recordFailure("user-b", "school-network")).toMatchObject({ locked: false });
    expect(limiter.recordFailure("user-c", "school-network")).toMatchObject({ locked: true });
  });

  it("uses only the account dimension when no trustworthy address is available", () => {
    const limiter = createPasswordChangeLimiter({ userMaxFailures: 2, networkMaxFailures: 2, windowMs: 60_000 });
    limiter.recordFailure("user-a", null);
    limiter.recordFailure("user-b", null);
    expect(limiter.check("user-c", null)).toMatchObject({ locked: false });
  });

  it("clears only the successful account principal", () => {
    const limiter = createPasswordChangeLimiter({ userMaxFailures: 2, networkMaxFailures: 10, windowMs: 60_000 });
    limiter.recordFailure("user-a", "network");
    limiter.recordFailure("user-a", "network");
    limiter.clearUser("user-a");
    expect(limiter.check("user-a", "network")).toMatchObject({ locked: false });
  });
});
