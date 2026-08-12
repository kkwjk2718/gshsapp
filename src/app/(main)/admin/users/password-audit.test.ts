import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), transaction: vi.fn(), update: vi.fn(), auditCreate: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: mocks.update }, auditLog: { create: mocks.auditCreate }, $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/grade-utils", () => ({ getGradeMapping: vi.fn() }));

describe("password reset audit gate", () => {
  it("updates credentials and writes audit in one transaction", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.update.mockResolvedValue({ id: "user" });
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ user: { update: mocks.update }, auditLog: { create: mocks.auditCreate } }));
    const { resetPassword } = await import("./actions");
    const form = new FormData(); form.set("userId", "user");
    expect(await resetPassword(form)).toHaveProperty("success");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "USER_PASSWORD_RESET", targetId: "user" }) });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user" },
      data: expect.objectContaining({ mustChangePassword: true, sessionVersion: { increment: 1 } }),
    });
  });
});
