import { describe, expect, it } from "vitest";

import { parseTrustedProxyHops, resolveTrustedClientAddress } from "./client-address";

describe("trusted client address", () => {
  it("defaults to zero hops and ignores spoofed forwarding data", () => {
    expect(parseTrustedProxyHops(undefined)).toBe(0);
    expect(resolveTrustedClientAddress({ directAddress: "203.0.113.8", forwardedFor: "198.51.100.9" }, { trustedProxyHops: 0 }))
      .toBe("203.0.113.8");
  });

  it("selects addresses from the trusted edge inward", () => {
    expect(resolveTrustedClientAddress({ forwardedFor: "spoof, 203.0.113.7" }, { trustedProxyHops: 1 }))
      .toBe("203.0.113.7");
    expect(resolveTrustedClientAddress({ forwardedFor: "198.51.100.4, 10.0.0.8" }, { trustedProxyHops: 2 }))
      .toBe("198.51.100.4");
  });

  it.each(["-1", "1.5", "4", "one"])("throws for invalid hop config %s", (raw) => {
    expect(() => parseTrustedProxyHops(raw)).toThrow();
  });

  it.each([
    ["", 1], ["hostname", 1], ["203.0.113.1:443", 1],
    ["1,2,3,4,5,6,7,8,9", 1], ["198.51.100.4", 2],
  ])("rejects invalid chain %j", (forwardedFor, trustedProxyHops) => {
    expect(resolveTrustedClientAddress({ forwardedFor }, { trustedProxyHops })).toBeNull();
  });
});
