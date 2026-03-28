import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";

const authorized = authConfig.callbacks.authorized;

function createUrl(pathname: string) {
  return new URL(`http://localhost:3000${pathname}`);
}

describe("auth.config authorized callback", () => {
  it("allows teachers onto the notice creation route", () => {
    const result = authorized({
      auth: { user: { id: "teacher-1", role: "TEACHER" } },
      request: { nextUrl: createUrl("/admin/notices/new") },
    });

    expect(result).toBe(true);
  });

  it("keeps students out of the notice creation route", () => {
    const result = authorized({
      auth: { user: { id: "student-1", role: "STUDENT" } },
      request: { nextUrl: createUrl("/admin/notices/new") },
    });

    expect(result).toBe(false);
  });

  it("requires login on the notice edit route so ownership can be checked later", () => {
    const anonymousResult = authorized({
      auth: null,
      request: { nextUrl: createUrl("/admin/notices/notice-1/edit") },
    });
    const loggedInResult = authorized({
      auth: { user: { id: "student-1", role: "STUDENT" } },
      request: { nextUrl: createUrl("/admin/notices/notice-1/edit") },
    });

    expect(anonymousResult).toBe(false);
    expect(loggedInResult).toBe(true);
  });

  it("still keeps regular admin pages admin-only", () => {
    const result = authorized({
      auth: { user: { id: "teacher-1", role: "TEACHER" } },
      request: { nextUrl: createUrl("/admin/notices") },
    });

    expect(result).toBe(false);
  });
});
