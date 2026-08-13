import { describe, expect, it } from "vitest";

import { validateAtomicUserImportPlan, validateRosterGovernedUserImports } from "./user-import-plan";

const actor = { id: "admin-id", userId: "admin", role: "ADMIN", email: "admin@example.com", studentId: null };

describe("atomic user import plan", () => {
  it("preserves the importing administrator and at least one final administrator", () => {
    expect(() => validateAtomicUserImportPlan([actor], [{ userId: "admin", role: "STUDENT", email: "admin@example.com", studentId: "1304" }], actor))
      .toThrow("IMPORT_ACTOR_ROLE");
    expect(() => validateAtomicUserImportPlan([actor], [{ userId: "student", role: "STUDENT", email: "student@example.com", studentId: "1304" }], actor))
      .not.toThrow();
  });

  it("rejects duplicate final email and student identities before any write", () => {
    const existing = [actor, { id: "u1", userId: "one", role: "STUDENT", email: "one@example.com", studentId: "1304" }];
    expect(() => validateAtomicUserImportPlan(existing, [{ userId: "two", role: "STUDENT", email: "one@example.com", studentId: "1305" }], actor))
      .toThrow("IMPORT_DUPLICATE_EMAIL");
    expect(() => validateAtomicUserImportPlan(existing, [{ userId: "two", role: "STUDENT", email: "two@example.com", studentId: "1304" }], actor))
      .toThrow("IMPORT_DUPLICATE_STUDENT_ID");
  });
});

describe("roster-governed backup imports", () => {
  const current = {
    id: "student-id", userId: "student", role: "STUDENT", name: "Roster Student",
    email: "student@example.com", studentId: "1304", gisu: 42,
  };
  const roster = {
    claimedUserId: "student-id", name: "Roster Student", email: "student@example.com",
    studentId: "1304", gisu: 42,
  };

  it("allows credential-only restoration for an exact active enrolled account", () => {
    expect(() => validateRosterGovernedUserImports([current], [current], [roster])).not.toThrow();
  });

  it("rejects new enrollments, role conversion, and authoritative identity drift", () => {
    expect(() => validateRosterGovernedUserImports([], [current], [roster]))
      .toThrow("IMPORT_ROSTER_ENROLLMENT_FORBIDDEN");
    expect(() => validateRosterGovernedUserImports([{ ...current, role: "TEACHER" }], [current], [roster]))
      .toThrow("IMPORT_ROSTER_ENROLLMENT_FORBIDDEN");
    expect(() => validateRosterGovernedUserImports([current], [{ ...current, name: "Other" }], [roster]))
      .toThrow("IMPORT_ROSTER_IDENTITY_MISMATCH");
  });
});
