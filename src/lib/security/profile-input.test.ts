import { describe, expect, it } from "vitest";

import { validateSelfProfileInput } from "./profile-input";

describe("self profile input", () => {
  it("normalizes a bounded name and email while omitting admin-managed student identity", () => {
    expect(validateSelfProfileInput({ name: "  Hong Gildong  ", email: " Student@Example.COM " })).toEqual({
      ok: true,
      data: { name: "Hong Gildong", email: "student@example.com" },
    });
  });

  it("rejects control characters, oversized names, and malformed emails", () => {
    for (const input of [
      { name: "A\nB", email: "student@example.com" },
      { name: "가".repeat(81), email: "student@example.com" },
      { name: "Student", email: "not-an-email" },
      { name: "Student", email: `${"a".repeat(245)}@example.com` },
    ]) {
      expect(validateSelfProfileInput(input)).toMatchObject({ ok: false });
    }
  });
});
