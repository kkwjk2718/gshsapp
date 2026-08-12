import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), transaction: vi.fn(), batchCreate: vi.fn(), tokenCreateMany: vi.fn(), auditCreate: vi.fn(),
  distributionCreate: vi.fn(), distributionFindFirst: vi.fn(), tokenCreate: vi.fn(), sendInvite: vi.fn(),
  getQuota: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: {
  tokenBatch: { create: mocks.batchCreate }, inviteToken: { createMany: mocks.tokenCreateMany, create: mocks.tokenCreate }, tokenDistributionLog: { create: mocks.distributionCreate, findFirst: mocks.distributionFindFirst }, auditLog: { create: mocks.auditCreate },
  $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/token-distribution", () => ({ sendInviteTokenEmail: mocks.sendInvite, getDistributionQuotaSummary: mocks.getQuota }));
vi.mock("@/lib/distribution-reservation", () => ({
  reserveDistribution: mocks.reserve,
  DistributionReservationError: class DistributionReservationError extends Error { constructor(public code: string) { super(code); } },
}));

describe("token mutation audit gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.batchCreate.mockResolvedValue({ id: "batch" });
    mocks.tokenCreateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.distributionCreate.mockResolvedValue({ id: "distribution" });
    mocks.distributionFindFirst.mockResolvedValue(null);
    mocks.tokenCreate.mockResolvedValue({ id: "token", token: null, tokenHash: "digest", targetRole: "STUDENT", targetGisu: 40 });
    mocks.sendInvite.mockResolvedValue({ success: "sent" });
    mocks.getQuota.mockResolvedValue({ used: 0, remaining: 250, isLimitReached: false });
    mocks.reserve.mockResolvedValue({ distributionLogId: "distribution", inviteToken: { id: "token", token: "safe-token", tokenHash: "digest", targetRole: "STUDENT", targetGisu: 40 } });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      tokenBatch: { create: mocks.batchCreate }, inviteToken: { createMany: mocks.tokenCreateMany, create: mocks.tokenCreate }, tokenDistributionLog: { create: mocks.distributionCreate, findFirst: mocks.distributionFindFirst }, auditLog: { create: mocks.auditCreate },
    }));
  });

  it("creates a batch and its audit event in one transaction", async () => {
    const { createTokens } = await import("./actions");
    const form = new FormData();
    form.set("count", "1"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40"); form.set("title", "Batch"); form.set("memo", "");
    const result = await createTokens(form);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "TOKEN_BATCH_CREATED", targetId: "batch" }) });
    expect(mocks.tokenCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ token: null, tokenHash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) })] });
    expect(result.csv).toContain("Token");
    expect(result.csv).toMatch(/[A-Za-z0-9_-]{43}/);
  });

  it("persists a targeted pending audit before invoking the email provider flow", async () => {
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData();
    form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("success");
    expect(mocks.sendInvite).toHaveBeenCalledWith(expect.objectContaining({ reservation: expect.objectContaining({ distributionLogId: "distribution" }) }));
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorId: "admin", target: expect.objectContaining({ email: "student@example.com" }) }));
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendInvite.mock.invocationCallOrder[0]);
  });

  it("does not send when the reservation/audit transaction fails", async () => {
    mocks.reserve.mockRejectedValueOnce(new Error("audit unavailable"));
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData(); form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    await expect(sendTokenByEmail({}, form)).rejects.toThrow("audit unavailable");
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("supports the documented BROADCAST manual invite without student cohort metadata", async () => {
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData(); form.set("email", "broadcast@example.com"); form.set("targetRole", "BROADCAST");
    await expect(sendTokenByEmail({}, form)).resolves.toHaveProperty("success");
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      target: expect.objectContaining({ targetRole: "BROADCAST", targetGisu: null }),
    }));
  });

  it("does not re-send a recent pending or sent equivalent request", async () => {
    const { DistributionReservationError } = await import("@/lib/distribution-reservation");
    mocks.reserve.mockRejectedValueOnce(new DistributionReservationError("DUPLICATE"));
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData(); form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("error");
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("does not grow invite tokens when quota-blocked requests repeat", async () => {
    const { DistributionReservationError } = await import("@/lib/distribution-reservation");
    mocks.reserve.mockRejectedValue(new DistributionReservationError("QUOTA"));
    const { sendTokenByEmail } = await import("./actions");
    const form = new FormData(); form.set("email", "student@example.com"); form.set("targetRole", "STUDENT"); form.set("targetGisu", "40");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("error");
    expect(await sendTokenByEmail({}, form)).toHaveProperty("error");
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("rejects partially parsed numeric fields and oversized recipient addresses", async () => {
    const { createTokens, sendTokenByEmail } = await import("./actions");
    const batch = new FormData();
    batch.set("count", "1junk"); batch.set("targetRole", "STUDENT"); batch.set("targetGisu", "40"); batch.set("title", "Batch");
    await expect(createTokens(batch)).rejects.toThrow("Invalid token batch input");
    expect(mocks.transaction).not.toHaveBeenCalled();

    const mail = new FormData();
    mail.set("email", `${"a".repeat(250)}@example.com`); mail.set("targetRole", "STUDENT"); mail.set("targetGisu", "40junk");
    await expect(sendTokenByEmail({}, mail)).resolves.toHaveProperty("error");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
