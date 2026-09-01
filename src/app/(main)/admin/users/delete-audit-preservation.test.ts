import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), transaction: vi.fn(), userFind: vi.fn(), userDelete: vi.fn(), auditDeleteMany: vi.fn(), auditCreate: vi.fn(), logAction: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: mocks.logAction }));
vi.mock("@/lib/grade-utils", () => ({ getGradeMapping: vi.fn() }));

function countDelegate() { return { count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn(), updateMany: vi.fn() }; }
vi.mock("@/lib/db", () => ({ prisma: {
  $transaction: mocks.transaction,
  user: { findUnique: mocks.userFind, delete: mocks.userDelete, count: vi.fn() },
  notice: countDelegate(), schedule: countDelegate(), songRequest: countDelegate(), personalEvent: countDelegate(),
  notification: countDelegate(), errorReport: countDelegate(), auditLog: { count: vi.fn().mockResolvedValue(1), deleteMany: mocks.auditDeleteMany, create: mocks.auditCreate },
  systemLog: countDelegate(), teacherProfile: countDelegate(), inviteToken: countDelegate(),
} }));

describe("user deletion audit preservation", () => {
  it("deletes the account without deleting audit records it authored", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.userFind.mockResolvedValue({ id: "user", userId: "student", name: "Student", role: "STUDENT" });
    mocks.userDelete.mockResolvedValue({ id: "user" });
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback((await import("@/lib/db")).prisma));
    const { deleteUserAccount } = await import("./actions");
    const form = new FormData(); form.set("userId", "user"); form.set("confirmLoginId", "student");

    await expect(deleteUserAccount(form)).resolves.toHaveProperty("success");
    expect(mocks.userDelete).toHaveBeenCalled();
    expect(mocks.auditDeleteMany).not.toHaveBeenCalled();
    expect(mocks.logAction).toHaveBeenCalledWith("user_deleted", expect.objectContaining({
      deletedCounts: expect.objectContaining({ auditLogsPreserved: 1 }),
    }));
    expect(mocks.logAction.mock.calls.at(-1)?.[1].deletedCounts).not.toHaveProperty("auditLogs");
  });
});
