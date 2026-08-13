import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createBackup: vi.fn(), setLast: vi.fn(), auditCreate: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: mocks.auditCreate } } }));
vi.mock("@/lib/backup", () => ({ createBackup: mocks.createBackup, setLastBackupAt: mocks.setLast, setBackupIntervalDays: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("backup action auditing", () => {
  it("audits a durable manual backup before reporting success", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.createBackup.mockResolvedValue({ file: "backup.tar.gz" });
    mocks.setLast.mockResolvedValue(undefined);
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    const { backupNow } = await import("./backup-actions");
    expect(await backupNow({})).toEqual(expect.objectContaining({ ok: true }));
    expect(mocks.auditCreate.mock.invocationCallOrder[0]).toBeLessThan(mocks.createBackup.mock.invocationCallOrder[0]);
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "BACKUP_CREATE_REQUESTED" }) });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "BACKUP_CREATED", targetId: "backup.tar.gz" }) });
  });
});
