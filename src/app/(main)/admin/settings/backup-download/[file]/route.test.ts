import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveStoredBackup: vi.fn(),
  open: vi.fn(),
  auditCreate: vi.fn(),
}));

class TestAuthorizationError extends Error {}

vi.mock("@/lib/current-user", () => ({ requireAdmin: mocks.requireAdmin, AuthorizationError: TestAuthorizationError }));
vi.mock("@/lib/backup", () => ({ getBackupDir: () => "C:\\backups" }));
vi.mock("@/lib/backup/backup-engine", () => ({ resolveStoredBackup: mocks.resolveStoredBackup }));
vi.mock("node:fs/promises", () => ({ default: { open: mocks.open } }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: mocks.auditCreate } } }));

describe("backup download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditCreate.mockResolvedValue({});
    mocks.resolveStoredBackup.mockResolvedValue({
      file: "backup-20260813-010203-a1b2c3d4.tar.gz",
      path: "C:\\backups\\backup-20260813-010203-a1b2c3d4.tar.gz",
      size: 3,
      contentType: "application/gzip",
      dev: 1,
      ino: 2,
    });
    mocks.open.mockResolvedValue({
      stat: vi.fn().mockResolvedValue({ isFile: () => true, size: 3, dev: 1, ino: 2 }),
      createReadStream: vi.fn(() => Readable.from([Buffer.from([1, 2, 3])])),
      close: vi.fn(),
    });
  });

  it("denies a stale or demoted session before lookup/open", async () => {
    mocks.requireAdmin.mockRejectedValue(new TestAuthorizationError("Forbidden"));
    const { GET } = await import("./route");
    const response = await GET(new Request("https://gshs.app"), {
      params: Promise.resolve({ file: "backup-20260813-010203-a1b2c3d4.tar.gz" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.resolveStoredBackup).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it.each(["../backup-20260813-010203-a1b2c3d4.tar.gz", "..\\backup-20260813-010203-a1b2c3d4.tar.gz", "attacker.db"])(
    "rejects the non-exact selection %s",
    async (file) => {
      mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
      mocks.resolveStoredBackup.mockRejectedValue(new Error("invalid"));
      const { GET } = await import("./route");
      const response = await GET(new Request("https://gshs.app"), { params: Promise.resolve({ file }) });
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    },
  );

  it("streams an exact no-follow regular file with private no-store", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://gshs.app"), {
      params: Promise.resolve({ file: "backup-20260813-010203-a1b2c3d4.tar.gz" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toBe("application/gzip");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: "admin",
      action: "BACKUP_DOWNLOADED",
      targetId: "backup-20260813-010203-a1b2c3d4.tar.gz",
    }) });
  });
});
