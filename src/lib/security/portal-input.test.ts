import { describe, expect, it } from "vitest";

import { parsePortalInviteInput, validatePortalPasswordInput } from "./portal-input";

describe("portal input cost guards", () => {
  it("rejects empty, control-bearing, and bcrypt-oversized passwords before compare", () => {
    expect(validatePortalPasswordInput("valid portal password")).toBe("valid portal password");
    expect(validatePortalPasswordInput("")).toBeNull();
    expect(validatePortalPasswordInput("bad\0password")).toBeNull();
    expect(validatePortalPasswordInput("가".repeat(25))).toBeNull();
  });

  it("normalizes and bounds student invitation fields before settings or quota work", () => {
    expect(parsePortalInviteInput({ name: "  Student  ", studentId: "1304", email: " Student@Example.com " }))
      .toEqual({ name: "Student", studentId: "1304", email: "student@example.com" });
    expect(parsePortalInviteInput({ name: "x".repeat(81), studentId: "1304", email: "a@example.com" })).toBeNull();
    expect(parsePortalInviteInput({ name: "Student", studentId: "9999", email: "a@example.com" })).toBeNull();
    expect(parsePortalInviteInput({ name: "Student", studentId: "1304", email: `${"a".repeat(250)}@example.com` })).toBeNull();
  });
});
