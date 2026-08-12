import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), consume: vi.fn(), validate: vi.fn((title: string, content: string) => ({ title, content })),
  count: vi.fn(), create: vi.fn(), transaction: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/security/submission-controls", () => ({
  REPORT_DAILY_CAP: 5, REPORT_PENDING_CAP: 3,
  consumeReportSubmissionQuota: mocks.consume, validateReportSubmission: mocks.validate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction, errorReport: { count: mocks.count, create: mocks.create } } }));

describe("report submission", () => {
  it("applies validation, principal/shared limiter, and caps inside a transaction", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "member" });
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "report" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ errorReport: { count: mocks.count, create: mocks.create } }));
    const { submitErrorReport } = await import("./actions");
    await expect(submitErrorReport("Title", "Content")).resolves.toEqual({ success: true, id: "report" });
    expect(mocks.validate).toHaveBeenCalledWith("Title", "Content");
    expect(mocks.consume).toHaveBeenCalledWith("member");
    expect(mocks.count).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
