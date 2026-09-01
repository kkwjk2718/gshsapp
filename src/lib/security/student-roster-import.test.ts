import { describe, expect, it } from "vitest";

import {
  MAX_STUDENT_ROSTER_BYTES,
  parseStudentRosterCsv,
  planStudentRosterReplacement,
} from "./student-roster-import";

describe("student roster import", () => {
  it("parses a bounded RFC 4180 roster and canonicalizes identities", () => {
    expect(parseStudentRosterCsv([
      "academicYear,gisu,studentId,name,email",
      '2026,42,1304,"Hong, Gildong",STUDENT@example.com',
      "2026,41,2401,  Kim Student  ,kim@example.com",
    ].join("\r\n"))).toEqual([
      { academicYear: 2026, gisu: 42, studentId: "1304", name: "Hong, Gildong", email: "student@example.com" },
      { academicYear: 2026, gisu: 41, studentId: "2401", name: "Kim Student", email: "kim@example.com" },
    ]);
  });

  it.each([
    ["wrong header", "name,studentId,email\nStudent,1304,a@example.com"],
    ["duplicate student", "academicYear,gisu,studentId,name,email\n2026,42,1304,A,a@example.com\n2026,42,1304,B,b@example.com"],
    ["duplicate email", "academicYear,gisu,studentId,name,email\n2026,42,1304,A,a@example.com\n2026,42,1305,B,A@example.com"],
    ["mixed academic years", "academicYear,gisu,studentId,name,email\n2026,42,1304,A,a@example.com\n2027,42,2304,A,a@example.com"],
    ["invalid year", "academicYear,gisu,studentId,name,email\n1999,42,1304,A,a@example.com"],
    ["invalid cohort", "academicYear,gisu,studentId,name,email\n2026,0,1304,A,a@example.com"],
    ["invalid student", "academicYear,gisu,studentId,name,email\n2026,42,9999,A,a@example.com"],
    ["extra field", "academicYear,gisu,studentId,name,email\n2026,42,1304,A,a@example.com,extra"],
    ["unterminated quote", 'academicYear,gisu,studentId,name,email\n2026,42,1304,"A,a@example.com'],
    ["spreadsheet control", "academicYear,gisu,studentId,name,email\n2026,42,1304,A,a@example.com\n" + "2026,42,1305,B,b@example.com\u0000"],
  ])("rejects %s", (_name, csv) => {
    expect(() => parseStudentRosterCsv(csv)).toThrow();
  });

  it("rejects oversized files and row counts before database work", () => {
    expect(() => parseStudentRosterCsv("x".repeat(MAX_STUDENT_ROSTER_BYTES + 1))).toThrow("ROSTER_FILE_TOO_LARGE");
    const rows = Array.from({ length: 501 }, (_, index) => {
      const grade = index % 3 + 1;
      const classNumber = index % (grade === 3 ? 4 : 5) + 1;
      const number = String(index % 99 + 1).padStart(2, "0");
      return `2026,42,${grade}${classNumber}${number},Student ${index},student${index}@example.com`;
    });
    expect(() => parseStudentRosterCsv(["academicYear,gisu,studentId,name,email", ...rows].join("\n"))).toThrow("ROSTER_TOO_MANY_ROWS");
  });

  it("starts a new academic generation without colliding with reused student IDs", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    const entries = [
      { academicYear: 2027, gisu: 42, studentId: "2304", name: "Returning", email: "returning@example.com" },
      { academicYear: 2027, gisu: 43, studentId: "1304", name: "New", email: "new@example.com" },
    ];
    expect(planStudentRosterReplacement(entries, [{
      id: "old-row", academicYear: 2026, gisu: 42, studentId: "1304", name: "Returning",
      email: "returning@example.com", claimedUserId: "user-1",
    }], [
      { id: "user-1", role: "STUDENT", gisu: 42, studentId: "1304", name: "Returning", email: "RETURNING@example.com" },
    ], now)).toEqual({
      academicYear: 2027,
      updateEntries: [],
      createEntries: [
        { ...entries[0], active: true, claimedAt: now, claimedEmail: "returning@example.com", claimedUserId: "user-1" },
        { ...entries[1], active: true },
      ],
      userUpdates: [{ id: "user-1", studentId: "2304", gisu: 42, name: "Returning" }],
      activeUserIds: ["user-1"],
    });
  });

  it("never attaches a new identity through a self-edited profile email", () => {
    const entries = [
      { academicYear: 2027, gisu: 42, studentId: "2301", name: "Student A", email: "a@example.com" },
      { academicYear: 2027, gisu: 42, studentId: "2302", name: "Student B", email: "b@example.com" },
    ];
    const prior = [{
      id: "a-2026", academicYear: 2026, gisu: 42, studentId: "1301", name: "Student A",
      email: "a@example.com", claimedUserId: "user-a",
    }];
    const users = [{
      id: "user-a", role: "STUDENT", gisu: 42, studentId: "1301", name: "Student A", email: "b@example.com",
    }];

    expect(() => planStudentRosterReplacement(entries, prior, users)).toThrow("ROSTER_USER_EMAIL_DRIFT");
  });

  it("updates a claimed row in the same academic year by stable cohort and email", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    const entry = { academicYear: 2026, gisu: 42, studentId: "2304", name: "Returning", email: "returning@example.com" };
    expect(planStudentRosterReplacement([entry], [{
      id: "row-1", academicYear: 2026, gisu: 42, studentId: "1304", name: "Returning",
      email: "returning@example.com", claimedUserId: "user-1",
    }], [
      { id: "user-1", role: "STUDENT", gisu: 42, studentId: "1304", name: "Returning", email: "returning@example.com" },
    ], now)).toEqual({
      academicYear: 2026,
      updateEntries: [{ id: "row-1", data: { ...entry, active: true, claimedAt: now, claimedEmail: entry.email, claimedUserId: "user-1", claimedInviteTokenId: null } }],
      createEntries: [],
      userUpdates: [{ id: "user-1", studentId: "2304", gisu: 42, name: "Returning" }],
      activeUserIds: ["user-1"],
    });
  });

  it("reuses an exact same-year pending row after its invitation is revoked", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    const entry = { academicYear: 2026, gisu: 42, studentId: "1304", name: "Pending", email: "pending@example.com" };
    expect(planStudentRosterReplacement([entry], [{
      id: "pending-row", ...entry, claimedUserId: null,
    }], [], now)).toEqual({
      academicYear: 2026,
      updateEntries: [{ id: "pending-row", data: {
        ...entry, active: true, claimedAt: null, claimedEmail: null, claimedUserId: null, claimedInviteTokenId: null,
      } }],
      createEntries: [],
      userUpdates: [],
      activeUserIds: [],
    });
  });

  it("preserves a roster claim when a former student has been promoted to admin", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    const entry = { academicYear: 2026, gisu: 42, studentId: "1304", name: "Student Admin", email: "admin@example.com" };
    expect(planStudentRosterReplacement([entry], [{
      id: "admin-row", ...entry, claimedUserId: "admin-user",
    }], [{
      id: "admin-user", role: "ADMIN", gisu: null, studentId: "1304", name: "Student Admin", email: "admin@example.com",
    }], now)).toEqual({
      academicYear: 2026,
      updateEntries: [{ id: "admin-row", data: {
        ...entry, active: true, claimedAt: now, claimedEmail: entry.email, claimedUserId: "admin-user", claimedInviteTokenId: null,
      } }],
      createEntries: [],
      userUpdates: [],
      activeUserIds: ["admin-user"],
    });
  });

  it("rejects ambiguous accounts inside the same cohort while allowing older cohorts to reuse a number", () => {
    const entry = { academicYear: 2027, gisu: 43, studentId: "1304", name: "New", email: "new@example.com" };
    expect(() => planStudentRosterReplacement([entry], [], [
      { id: "current", role: "STUDENT", gisu: 43, studentId: "1304", name: "Other", email: "other@example.com" },
    ])).toThrow("ROSTER_EXISTING_STUDENT_ID_CONFLICT");
    expect(() => planStudentRosterReplacement([entry], [], [
      { id: "email-owner", role: "STUDENT", gisu: 42, studentId: "2304", name: "New", email: "new@example.com" },
    ])).toThrow("ROSTER_EXISTING_EMAIL_CONFLICT");
    expect(planStudentRosterReplacement([entry], [], [
      { id: "graduate", role: "STUDENT", gisu: 40, studentId: "1304", name: "Graduate", email: "graduate@example.com" },
    ]).createEntries).toEqual([{ ...entry, active: true }]);
  });
});
