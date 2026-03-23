import { describe, expect, it } from "vitest";

import type { GradeMapping } from "@/lib/grade-mapping";

import { resolveUserRoleChange, UserRoleChangeError } from "./user-role-change";

const gradeMapping: GradeMapping = {
  "1": 42,
  "2": 41,
  "3": 40,
};

describe("user-role-change", () => {
  it("keeps student metadata for broadcast", () => {
    expect(
      resolveUserRoleChange({
        currentStudentId: "1304",
        currentGisu: 42,
        targetRole: "BROADCAST",
      }),
    ).toEqual({
      role: "BROADCAST",
      studentId: "1304",
      gisu: 42,
    });
  });

  it("clears only gisu for admin", () => {
    expect(
      resolveUserRoleChange({
        currentStudentId: "1304",
        currentGisu: 42,
        targetRole: "ADMIN",
      }),
    ).toEqual({
      role: "ADMIN",
      studentId: "1304",
      gisu: null,
    });
  });

  it("clears student metadata for teacher", () => {
    expect(
      resolveUserRoleChange({
        currentStudentId: "1304",
        currentGisu: 42,
        targetRole: "TEACHER",
      }),
    ).toEqual({
      role: "TEACHER",
      studentId: null,
      gisu: null,
    });
  });

  it("requires a valid student id when changing to student", () => {
    expect(() =>
      resolveUserRoleChange({
        currentStudentId: null,
        currentGisu: null,
        targetRole: "STUDENT",
        studentIdInput: "",
        gradeMapping,
      }),
    ).toThrow(UserRoleChangeError);

    expect(() =>
      resolveUserRoleChange({
        currentStudentId: null,
        currentGisu: null,
        targetRole: "STUDENT",
        studentIdInput: "9999",
        gradeMapping,
      }),
    ).toThrow(UserRoleChangeError);
  });

  it("derives gisu from student id when changing to student", () => {
    expect(
      resolveUserRoleChange({
        currentStudentId: null,
        currentGisu: null,
        targetRole: "STUDENT",
        studentIdInput: "2301",
        gradeMapping,
      }),
    ).toEqual({
      role: "STUDENT",
      studentId: "2301",
      gisu: 41,
    });
  });
});
