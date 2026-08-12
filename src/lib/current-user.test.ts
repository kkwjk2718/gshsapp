import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: findUniqueMock } },
}));
vi.mock("@/lib/member-service-suspension", () => ({ MEMBER_SERVICE_SUSPENDED: false }));

describe("database-backed current user authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([undefined, null, "1", 1.5, Number.NaN])(
    "rejects a missing or malformed session version claim (%j)",
    async (sessionVersion) => {
      authMock.mockResolvedValue({ user: { id: "user-1", sessionVersion } });
      const { getCurrentUser } = await import("./current-user");

      await expect(getCurrentUser()).resolves.toBeNull();
      expect(findUniqueMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a session version that differs from the database", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", sessionVersion: 2 } });
    findUniqueMock.mockResolvedValue({ id: "user-1", role: "ADMIN", sessionVersion: 3 });
    const { getCurrentUser } = await import("./current-user");

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns the current database user for an exact version match", async () => {
    const dbUser = { id: "user-1", role: "STUDENT", sessionVersion: 3 };
    authMock.mockResolvedValue({ user: { id: "user-1", role: "ADMIN", sessionVersion: 3 } });
    findUniqueMock.mockResolvedValue(dbUser);
    const { getCurrentUser } = await import("./current-user");

    await expect(getCurrentUser()).resolves.toEqual(dbUser);
  });

  it("denies admin access when a JWT says ADMIN but the database says STUDENT", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "ADMIN", sessionVersion: 3 } });
    findUniqueMock.mockResolvedValue({ id: "user-1", role: "STUDENT", sessionVersion: 3 });
    const { requireAdmin } = await import("./current-user");

    await expect(requireAdmin()).rejects.toThrow("Forbidden");
  });
});
