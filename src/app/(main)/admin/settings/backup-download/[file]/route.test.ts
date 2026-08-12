import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const readFileMock = vi.fn();
const getBackupDirMock = vi.fn(() => "C:\\backups");

class TestAuthorizationError extends Error {}
vi.mock("@/lib/current-user", () => ({ requireAdmin: requireAdminMock, AuthorizationError: TestAuthorizationError }));
vi.mock("@/lib/backup", () => ({ getBackupDir: getBackupDirMock }));
vi.mock("node:fs/promises", () => ({ default: { readFile: readFileMock } }));
vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue({ user: { role: "ADMIN" } }) }));

describe("backup download route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("denies a stale or demoted session through database-backed authorization", async () => {
    requireAdminMock.mockRejectedValue(new TestAuthorizationError("Forbidden"));
    const { GET } = await import("./route");
    const response = await GET(new Request("https://gshs.app"), {
      params: Promise.resolve({ file: "backup.db" }),
    });
    expect(response.status).toBe(403);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns a generic no-store 500 for unexpected backup path failures", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    getBackupDirMock.mockImplementationOnce(() => { throw new Error("sensitive path detail"); });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://gshs.app"), {
      params: Promise.resolve({ file: "backup.db" }),
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("Internal Server Error");
  });

  it("sets private no-store on a successful download", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin", role: "ADMIN" });
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const { GET } = await import("./route");
    const response = await GET(new Request("https://gshs.app"), {
      params: Promise.resolve({ file: "backup.db" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
