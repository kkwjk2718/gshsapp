import { describe, expect, it } from "vitest";

import { generateInviteSecret, hashInviteSecret } from "./invite-token";

describe("invite token secrets", () => {
  it("generates independent 256-bit base64url values", () => {
    const values = Array.from({ length: 128 }, () => generateInviteSecret());

    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(value, "base64url")).toHaveLength(32);
    }
  });

  it("hashes deterministically without preserving the presented secret", () => {
    const secret = "A".repeat(43);
    const digest = hashInviteSecret(secret);

    expect(digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).not.toContain(secret);
    expect(hashInviteSecret(secret)).toBe(digest);
    expect(hashInviteSecret(`${"A".repeat(42)}B`)).not.toBe(digest);
  });
});
