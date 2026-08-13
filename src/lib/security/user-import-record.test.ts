import { describe, expect, it } from "vitest";

import { parseImportedUserRecord } from "./user-import-record";

const safeHash = "$2b$10$arGLgkOEOtbP2fQOC4Cxy.0iRkACGoK62fuMQcE66k2BBCEEu/KU2";

describe("imported user record validation", () => {
  it("normalizes a bounded, typed backup record", () => {
    expect(parseImportedUserRecord({
      userId: " student01 ", name: " Student ", email: " Student@Example.com ", role: "STUDENT",
      studentId: "1304", gisu: 40, banExpiresAt: "2026-09-01T00:00:00.000Z",
      isOnboarded: true, passwordHash: safeHash,
    }, 1)).toEqual({
      userId: "student01", name: "Student", email: "student@example.com", role: "STUDENT",
      studentId: "1304", gisu: 40, banExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
      isOnboarded: true, passwordHash: safeHash,
    });
  });

  it.each([
    { userId: "x", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, passwordHash: safeHash },
    { userId: "student01", name: "x".repeat(81), role: "STUDENT", studentId: "1304", gisu: 40, passwordHash: safeHash },
    { userId: "student01", name: "Student", role: "ROOT", passwordHash: safeHash },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "9999", gisu: 40, passwordHash: safeHash },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, passwordHash: "$2b$04$arGLgkOEOtbP2fQOC4Cxy.0iRkACGoK62fuMQcE66k2BBCEEu/KU2" },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, passwordHash: "$2b$31$arGLgkOEOtbP2fQOC4Cxy.0iRkACGoK62fuMQcE66k2BBCEEu/KU2" },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, passwordHash: "not-a-bcrypt-hash" },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, banExpiresAt: "not-a-date", passwordHash: safeHash },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, banExpiresAt: "2026-09-01", passwordHash: safeHash },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, banExpiresAt: "2026-02-31T00:00:00.000Z", passwordHash: safeHash },
    { userId: "student01", name: "Student", role: "STUDENT", studentId: "1304", gisu: 40, isOnboarded: "yes", passwordHash: safeHash },
  ])("rejects malformed identity, role, date, boolean, or password hash fields", (record) => {
    expect(parseImportedUserRecord(record, 1)).toBeNull();
  });

  it("allows version 2 records to omit a password hash but never accepts a malformed supplied hash", () => {
    const record = parseImportedUserRecord({ userId: "teacher01", name: "Teacher", role: "TEACHER", isOnboarded: false }, 2);
    expect(record).toMatchObject({ userId: "teacher01" });
    expect(record).not.toHaveProperty("passwordHash");
    expect(parseImportedUserRecord({ userId: "teacher01", name: "Teacher", role: "TEACHER", passwordHash: "bad" }, 2))
      .toBeNull();
  });
});
