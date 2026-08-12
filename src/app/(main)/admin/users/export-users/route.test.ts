import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const findManyMock = vi.fn();

class TestAuthorizationError extends Error {}
vi.mock("@/lib/current-user", () => ({ requireAdmin: requireAdminMock, AuthorizationError: TestAuthorizationError }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findMany: findManyMock } } }));

describe("user export route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("self-authorizes against the current database admin", async () => {
    requireAdminMock.mockRejectedValue(new TestAuthorizationError("Forbidden"));
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("returns a generic no-store 500 for unexpected database failures", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    findManyMock.mockRejectedValue(new Error("sensitive database detail"));
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("Internal Server Error");
  });

  it("exports no credential/session fields and prevents caching", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    findManyMock.mockResolvedValue([{
      userId: "student", name: "Student", email: null, role: "STUDENT",
      studentId: "1101", gisu: 42, banExpiresAt: null, isOnboarded: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    }]);
    const { GET } = await import("./route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(payload.version).toBe(2);
    expect(payload.users[0]).not.toHaveProperty("passwordHash");
    expect(payload.users[0]).not.toHaveProperty("sessionVersion");
  });
});
