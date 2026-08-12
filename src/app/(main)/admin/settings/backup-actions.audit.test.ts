import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), createBackup: vi.fn(), setLast: vi.fn(), auditCreate: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: mocks.auditCreate } } }));
vi.mock("@/lib/backup", () => ({ createBackup: mocks.createBackup, setLastBackupAt: mocks.setLast, setBackupIntervalDays: vi.fn(), restoreBackupFile: vi.fn(), restoreUploadedFile: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("backup action auditing", () => {
  it("audits a durable manual backup before reporting success", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.createBackup.mockResolvedValue({ file: "backup.tar.gz" });
    mocks.setLast.mockResolvedValue(undefined);
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    const { backupNow } = await import("./backup-actions");
    expect(await backupNow({})).toEqual(expect.objectContaining({ ok: true }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "BACKUP_CREATED", targetId: "backup.tar.gz" }) });
  });
});
