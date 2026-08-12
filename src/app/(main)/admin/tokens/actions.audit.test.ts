import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), transaction: vi.fn(), batchCreate: vi.fn(), tokenCreateMany: vi.fn(), auditCreate: vi.fn(),
  distributionCreate: vi.fn(), distributionFindFirst: vi.fn(), tokenCreate: vi.fn(), sendInvite: vi.fn(),
  getQuota: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: {
  tokenBatch: { create: mocks.batchCreate }, inviteToken: { createMany: mocks.tokenCreateMany, create: mocks.tokenCreate }, tokenDistributionLog: { create: mocks.distributionCreate, findFirst: mocks.distributionFindFirst }, auditLog: { create: mocks.auditCreate },
  $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/token-distribution", () => ({ sendInviteTokenEmail: mocks.sendInvite, getDistributionQuotaSummary: mocks.getQuota }));

describe("token mutation audit gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.batchCreate.mockResolvedValue({ id: "batch" });
    mocks.tokenCreateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.distributionCreate.mockResolvedValue({ id: "distribution" });
    mocks.distributionFindFirst.mockResolvedValue(null);
    mocks.tokenCreate.mockResolvedValue({ id: "token", token: "safe-token", targetRole: "STUDENT", targetGisu: 40 });
    mocks.sendInvite.mockResolvedValue({ success: "sent" });
    mocks.getQuota.mockResolvedValue({ used: 0, remaining: 250, isLimitReached: false });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      tokenBatch: { create: mocks.batchCreate }, inviteToken: { createMany: mocks.tokenCreateMany, create: mocks.tokenCreate }, tokenDistributionLog: { create: mocks.distributionCreate, findFirst: mocks.distributionFindFirst }, auditLog: { create: mocks.auditCreate },
    }));
  });

  it("creates a batch and its audit event in one transaction", async () => {
    const { createTokens } = await import("./actions");
    const form = new FormData();
    form.set("count", "1"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40"); form.set("title", "Batch"); form.set("memo", "");
    await createTokens(form);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "TOKEN_BATCH_CREATED", targetId: "batch" }) });
  });

  it("persists a targeted pending audit before invoking the email provider flow", async () => {
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData();
    form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("success");
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "TOKEN_EMAIL_REQUESTED", targetId: "distribution" }) });
    expect(mocks.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ reservation: expect.objectContaining({ distributionLogId: "distribution" }) }));
    expect(mocks.auditCreate.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendInvite.mock.invocationCallOrder[0]);
  });

  it("does not send when the reservation/audit transaction fails", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("audit unavailable"));
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData(); form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    await expect(sendTokenByEmail({}, form)).rejects.toThrow("audit unavailable");
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("does not re-send a recent pending or sent equivalent request", async () => {
    mocks.distributionFindFirst.mockResolvedValueOnce({ id: "existing" });
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData(); form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("success");
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("does not grow invite tokens when quota-blocked requests repeat", async () => {
    mocks.getQuota.mockResolvedValue({ used: 250, remaining: 0, isLimitReached: true });
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData(); form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("error");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("error");
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });
});
