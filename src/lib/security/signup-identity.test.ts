import { describe, expect, it } from "vitest";

import { validateSignupInviteIdentity } from "./signup-identity";

describe("signup invite role identity", () => {
  it("requires a valid student ID only for student invitations", () => {
    expect(() => validateSignupInviteIdentity({ targetRole: "STUDENT" }, "1304")).not.toThrow();
    expect(() => validateSignupInviteIdentity({ targetRole: "STUDENT" }, null)).toThrow();
    expect(() => validateSignupInviteIdentity({ targetRole: "STUDENT" }, "9999")).toThrow();
    expect(() => validateSignupInviteIdentity({ targetRole: "TEACHER" }, null)).not.toThrow();
    expect(() => validateSignupInviteIdentity({ targetRole: "TEACHER" }, "1304")).toThrow();
    expect(() => validateSignupInviteIdentity({ targetRole: "ROOT" }, null)).toThrow();
  });
});
