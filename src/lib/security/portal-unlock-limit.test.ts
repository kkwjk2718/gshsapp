import { describe, expect, it } from "vitest";

import { PortalUnlockLimiter } from "./portal-unlock-limit";

describe("portal unlock limiter", () => {
  it("denies when either the client or network dimension is exhausted", () => {
    let now = 0;
    const limiter = new PortalUnlockLimiter({ now: () => now, maxFailures: 3, windowMs: 60_000 });

    for (let index = 0; index < 3; index += 1) limiter.recordFailure("client-a", "network-a");
    expect(limiter.check("client-a", "network-b")).toMatchObject({ allowed: false, dimension: "CLIENT" });
    expect(limiter.check("client-b", "network-a")).toMatchObject({ allowed: false, dimension: "NETWORK" });

    now = 60_000;
    expect(limiter.check("client-a", "network-a")).toMatchObject({ allowed: true });
  });

  it("bounds both keyed registries without a global capacity lock", () => {
    const limiter = new PortalUnlockLimiter({ maxKeys: 1, maxFailures: 3, windowMs: 60_000 });
    limiter.recordFailure("client-a", "network-a");
    expect(limiter.recordFailure("client-b", "network-b")).toMatchObject({ allowed: true, dimension: "NONE" });
  });

  it("uses a higher defaultable network threshold than the client threshold", () => {
    const limiter = new PortalUnlockLimiter({ clientMaxFailures: 2, networkMaxFailures: 4, windowMs: 60_000 });
    limiter.recordFailure("a", "school");
    limiter.recordFailure("b", "school");
    expect(limiter.check("c", "school")).toMatchObject({ allowed: true });
    expect(limiter.recordFailure("a", "school")).toMatchObject({ allowed: false, dimension: "CLIENT" });
    expect(limiter.check("c", "school")).toMatchObject({ allowed: true });
    expect(limiter.recordFailure("c", "school")).toMatchObject({ allowed: false, dimension: "NETWORK" });
  });

  it("does not turn an unavailable address into a shared global network bucket", () => {
    const limiter = new PortalUnlockLimiter({ clientMaxFailures: 2, networkMaxFailures: 2 });

    expect(limiter.recordFailure("a", null)).toMatchObject({ allowed: true });
    expect(limiter.recordFailure("b", null)).toMatchObject({ allowed: true });
    expect(limiter.check("c", null)).toMatchObject({ allowed: true });
  });
});
