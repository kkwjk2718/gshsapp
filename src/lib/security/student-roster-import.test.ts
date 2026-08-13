import { describe, expect, it } from "vitest";

import {
  MAX_STUDENT_ROSTER_BYTES,
  parseStudentRosterCsv,
  planStudentRosterReplacement,
} from "./student-roster-import";

describe("student roster import", () => {
  it("parses a bounded RFC 4180 roster and canonicalizes identities", () => {
    expect(parseStudentRosterCsv([
      "studentId,name,email",
      '1304,"Hong, Gildong",STUDENT@example.com',
      "2401,  Kim Student  ,kim@example.com",
    ].join("\r\n"))).toEqual([
      { studentId: "1304", name: "Hong, Gildong", email: "student@example.com" },
      { studentId: "2401", name: "Kim Student", email: "kim@example.com" },
    ]);
  });

  it.each([
    ["wrong header", "name,studentId,email\nStudent,1304,a@example.com"],
    ["duplicate student", "studentId,name,email\n1304,A,a@example.com\n1304,B,b@example.com"],
    ["duplicate email", "studentId,name,email\n1304,A,a@example.com\n1305,B,A@example.com"],
    ["invalid student", "studentId,name,email\n9999,A,a@example.com"],
    ["extra field", "studentId,name,email\n1304,A,a@example.com,extra"],
    ["unterminated quote", 'studentId,name,email\n1304,"A,a@example.com'],
    ["spreadsheet control", "studentId,name,email\n1304,A,a@example.com\n" + "1305,B,b@example.com\u0000"],
  ])("rejects %s", (_name, csv) => {
    expect(() => parseStudentRosterCsv(csv)).toThrow();
  });

  it("rejects oversized files and row counts before database work", () => {
    expect(() => parseStudentRosterCsv("x".repeat(MAX_STUDENT_ROSTER_BYTES + 1))).toThrow("ROSTER_FILE_TOO_LARGE");
    const rows = Array.from({ length: 501 }, (_, index) => {
      const grade = index % 3 + 1;
      const classNumber = index % (grade === 3 ? 4 : 5) + 1;
      const number = String(index % 99 + 1).padStart(2, "0");
      return `${grade}${classNumber}${number},Student ${index},student${index}@example.com`;
    });
    expect(() => parseStudentRosterCsv(["studentId,name,email", ...rows].join("\n"))).toThrow("ROSTER_TOO_MANY_ROWS");
  });

  it("preserves immutable claimed identities while replacing unclaimed rows", () => {
    const claimed = [
      { studentId: "1304", name: "Claimed", email: "claimed@example.com" },
      { studentId: "1305", name: "Old", email: "old@example.com" },
    ];
    expect(planStudentRosterReplacement([
      { studentId: "1304", name: "Claimed", email: "claimed@example.com" },
      { studentId: "2401", name: "New", email: "new@example.com" },
    ], claimed)).toEqual({
      reactivateStudentIds: ["1304"],
      createEntries: [{ studentId: "2401", name: "New", email: "new@example.com" }],
    });
  });

  it("rejects changing a claimed identity or reusing its email", () => {
    const claimed = [{ studentId: "1304", name: "Claimed", email: "claimed@example.com" }];
    expect(() => planStudentRosterReplacement([
      { studentId: "1304", name: "Changed", email: "claimed@example.com" },
    ], claimed)).toThrow("ROSTER_CLAIMED_IDENTITY_CONFLICT");
    expect(() => planStudentRosterReplacement([
      { studentId: "1305", name: "Other", email: "claimed@example.com" },
    ], claimed)).toThrow("ROSTER_CLAIMED_EMAIL_CONFLICT");
  });

  it("seeds exact existing student accounts as consumed and rejects ambiguous legacy identities", () => {
    const entries = [{ studentId: "1304", name: "Existing", email: "existing@example.com" }];
    const now = new Date("2026-08-13T00:00:00.000Z");
    expect(planStudentRosterReplacement(entries, [], [
      { id: "user-1", studentId: "1304", name: "Existing", email: "EXISTING@example.com" },
    ], now)).toEqual({ reactivateStudentIds: [], createEntries: [{
      ...entries[0], claimedAt: now, claimedEmail: "existing@example.com", claimedUserId: "user-1",
    }] });

    expect(() => planStudentRosterReplacement(entries, [], [
      { id: "user-1", studentId: "1304", name: "Existing", email: "existing@example.com" },
      { id: "user-2", studentId: "1304", name: "Duplicate", email: "duplicate@example.com" },
    ])).toThrow("ROSTER_EXISTING_STUDENT_ID_CONFLICT");
    expect(() => planStudentRosterReplacement(entries, [], [
      { id: "user-1", studentId: "1304", name: "Existing", email: "changed@example.com" },
    ])).toThrow("ROSTER_EXISTING_IDENTITY_CONFLICT");
  });
});
