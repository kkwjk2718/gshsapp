import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));

describe("admin report moderation audit", () => {
  beforeEach(() => vi.clearAllMocks());
  it("validates the current state and commits status plus audit in one transaction", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      errorReport: { updateMany: mocks.updateMany },
      auditLog: { create: mocks.auditCreate },
    }));
    const { updateReportStatus } = await import("./actions");
    await expect(updateReportStatus("report-1", "REVIEWING", "Checking"))
      .resolves.toEqual({ success: true });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "report-1", status: { in: ["PENDING", "REVIEWING"] } },
    }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: "admin-1",
      action: "REPORT_STATUS_CHANGED",
      targetType: "ERROR_REPORT",
      targetId: "report-1",
    }) });
  });

  it("rejects an already-terminal or concurrently changed report", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      errorReport: { updateMany: mocks.updateMany },
      auditLog: { create: mocks.auditCreate },
    }));
    const { updateReportStatus } = await import("./actions");
    await expect(updateReportStatus("report-1", "RESOLVED"))
      .rejects.toThrow("Report status changed concurrently");
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
