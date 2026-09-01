import { describe, expect, it } from "vitest";

import { getApplicationSecuritySecret, hashSecurityPrincipal, networkPrincipal } from "./principal-key";

describe("keyed security principals", () => {
  it("rejects absent, short, and documented placeholder secrets", () => {
    for (const raw of [undefined, "short", "change-me", "x".repeat(31), "replace-with-a-long-random-secret-value"]) {
      expect(() => getApplicationSecuritySecret({ AUTH_SECRET: raw })).toThrow("AUTH_SECRET");
    }
  });

  it("creates stable namespace-separated keys without retaining identifiers", () => {
    const secret = ["test", "secret", "material", "with", "at", "least", "32", "bytes"].join("-");
    const login = hashSecurityPrincipal("login-id", "student01", secret);
    const network = hashSecurityPrincipal("login-network", "192.0.2.10", secret);

    expect(login).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(login).not.toContain("student01");
    expect(hashSecurityPrincipal("login-id", "student01", secret)).toBe(login);
    expect(network).not.toBe(login);
  });

  it("uses one shared principal when the trusted client address is unavailable", () => {
    expect(networkPrincipal("192.0.2.10")).toBe("192.0.2.10");
    expect(networkPrincipal(null)).toBe("unknown");
    expect(networkPrincipal(undefined)).toBe("unknown");
  });
});
