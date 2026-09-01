import { describe, expect, it } from "vitest";

import { resolveRosterGovernedRoleChange } from "./roster-role-change";

const roster = { studentId: "1304", gisu: 42, name: "Roster Student", email: "student@example.com" };

describe("roster-governed role changes", () => {
  it("only promotes an exact active student identity to broadcast", () => {
    expect(resolveRosterGovernedRoleChange({
      targetRole: "BROADCAST", currentRole: "STUDENT", studentIdInput: "",
      userName: roster.name, userEmail: "STUDENT@example.com", roster,
    })).toEqual({ role: "BROADCAST", studentId: "1304", gisu: 42 });
  });

  it("rejects teacher-to-student and teacher-to-broadcast without an exact claimed roster identity", () => {
    for (const targetRole of ["STUDENT", "BROADCAST"]) {
      expect(() => resolveRosterGovernedRoleChange({
        targetRole, currentRole: "TEACHER", studentIdInput: "1304",
        userName: "Teacher", userEmail: "teacher@example.com", roster: null,
      })).toThrow("ACTIVE_ROSTER_REQUIRED");
    }
  });

  it("rejects mismatched authoritative fields and arbitrary student IDs", () => {
    expect(() => resolveRosterGovernedRoleChange({
      targetRole: "STUDENT", currentRole: "BROADCAST", studentIdInput: "1305",
      userName: roster.name, userEmail: roster.email, roster,
    })).toThrow("ACTIVE_ROSTER_REQUIRED");
    expect(() => resolveRosterGovernedRoleChange({
      targetRole: "BROADCAST", currentRole: "STUDENT", studentIdInput: "",
      userName: "Other", userEmail: roster.email, roster,
    })).toThrow("ACTIVE_ROSTER_REQUIRED");
  });

  it("leaves non-roster roles to the ordinary role policy", () => {
    expect(resolveRosterGovernedRoleChange({
      targetRole: "TEACHER", currentRole: "STUDENT", studentIdInput: "",
      userName: roster.name, userEmail: roster.email, roster,
    })).toBeNull();
  });
});
