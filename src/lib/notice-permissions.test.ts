import { describe, expect, it } from "vitest";
import { canCreateNotice, canManageNotice } from "@/lib/notice-permissions";

describe("notice-permissions", () => {
  it("allows admins and teachers to create notices", () => {
    expect(canCreateNotice({ id: "admin-1", role: "ADMIN" })).toBe(true);
    expect(canCreateNotice({ id: "teacher-1", role: "TEACHER" })).toBe(true);
  });

  it("blocks non-author roles from creating notices", () => {
    expect(canCreateNotice({ id: "student-1", role: "STUDENT" })).toBe(false);
    expect(canCreateNotice(null)).toBe(false);
  });

  it("lets admins manage any notice", () => {
    expect(canManageNotice({ id: "admin-1", role: "ADMIN" }, "writer-1")).toBe(true);
  });

  it("lets the original writer manage their own notice", () => {
    expect(canManageNotice({ id: "writer-1", role: "TEACHER" }, "writer-1")).toBe(true);
  });

  it("blocks other users from managing a notice", () => {
    expect(canManageNotice({ id: "teacher-2", role: "TEACHER" }, "writer-1")).toBe(false);
    expect(canManageNotice({ id: "student-1", role: "STUDENT" }, "writer-1")).toBe(false);
  });
});
