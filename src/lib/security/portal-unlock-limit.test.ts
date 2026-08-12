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

  it("bounds both keyed registries and fails closed for rotating identities", () => {
    const limiter = new PortalUnlockLimiter({ maxKeys: 1, maxFailures: 3, windowMs: 60_000 });
    limiter.recordFailure("client-a", "network-a");
    expect(limiter.check("client-b", "network-b")).toMatchObject({ allowed: false, dimension: "CAPACITY" });
  });
});
