import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(), setting: vi.fn(), send: vi.fn(), updateMany: vi.fn(), createLog: vi.fn(),
  deleteToken: vi.fn(), transaction: vi.fn(), log: vi.fn(), releaseRoster: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  tokenDistributionLog: { count: mocks.count, updateMany: mocks.updateMany, create: mocks.createLog, findFirst: vi.fn() },
  inviteToken: { create: vi.fn(), delete: mocks.deleteToken },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/brevo", () => ({ sendBrevoEmail: mocks.send }));
vi.mock("@/lib/grade-utils", () => ({ getGradeMapping: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: mocks.log }));
vi.mock("@/lib/system-settings", () => ({ getSystemSettingValue: mocks.setting, SYSTEM_SETTING_KEYS: { tokenPortalEmailGuidance: "guidance" } }));

const reservation = { distributionLogId: "distribution", inviteToken: { id: "token", token: "secret", targetRole: "STUDENT", targetGisu: 40, rosterEntryId: "roster-2026-1" } };
const input = { source: "ADMIN_MANUAL" as const, createdBy: "admin", target: { email: "student@example.com", name: "Student", studentId: "1304", targetRole: "STUDENT", targetGisu: 40 }, reservation };

describe("reserved token email transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.count.mockResolvedValue(1); mocks.setting.mockResolvedValue(""); mocks.log.mockResolvedValue(undefined);
    mocks.deleteToken.mockResolvedValue({ id: "token" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      tokenDistributionLog: { updateMany: mocks.updateMany }, inviteToken: { delete: mocks.deleteToken },
      studentRosterEntry: { updateMany: mocks.releaseRoster },
    }));
  });

  it("transitions the exact pending reservation to SENT", async () => {
    mocks.send.mockResolvedValue({ messageId: "message" }); mocks.updateMany.mockResolvedValue({ count: 1 });
    const { sendInviteTokenEmail } = await import("./token-distribution");
    expect(await sendInviteTokenEmail(input)).toMatchObject({ success: expect.any(String), quotaUsed: 1 });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "distribution", status: "PENDING" }, data: expect.objectContaining({ status: "SENT", inviteTokenId: "token", brevoMessageId: "message" }) });
  });

  it("transitions the exact pending reservation to FAILED with bounded details", async () => {
    mocks.send.mockRejectedValue(new Error("x".repeat(2_000))); mocks.updateMany.mockResolvedValue({ count: 1 });
    const { sendInviteTokenEmail } = await import("./token-distribution");
    expect(await sendInviteTokenEmail(input)).toHaveProperty("error");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "distribution", status: "PENDING" }, data: expect.objectContaining({ status: "FAILED", inviteTokenId: null, errorMessage: expect.any(String) }) });
    expect(mocks.deleteToken).toHaveBeenCalledWith({ where: { id: "token" } });
    expect(mocks.releaseRoster).toHaveBeenCalledWith({
      where: { id: "roster-2026-1", studentId: "1304", email: "student@example.com", claimedInviteTokenId: "token", claimedUserId: null },
      data: { claimedAt: null, claimedEmail: null, claimedInviteTokenId: null },
    });
    expect(mocks.updateMany.mock.calls.at(-1)?.[0].data.errorMessage.length).toBeLessThanOrEqual(512);
  });

  it("leaves the reservation PENDING when delivery succeeds but the SENT transition fails", async () => {
    mocks.send.mockResolvedValue({ messageId: "accepted" }); mocks.updateMany.mockRejectedValue(new Error("database unavailable"));
    const { sendInviteTokenEmail } = await import("./token-distribution");
    await expect(sendInviteTokenEmail(input)).rejects.toThrow("database unavailable");
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "distribution", status: "PENDING" }, data: expect.objectContaining({ status: "SENT" }) }));
  });

  it("releases the exact portal roster claim when the provider rejects delivery", async () => {
    const portalInput = {
      ...input,
      source: "PORTAL_AUTO" as const,
      target: { ...input.target, name: "Student", studentId: "1304" },
    };
    mocks.send.mockRejectedValue(new Error("provider unavailable"));
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.releaseRoster.mockResolvedValue({ count: 1 });
    const { sendInviteTokenEmail } = await import("./token-distribution");

    await expect(sendInviteTokenEmail(portalInput)).resolves.toHaveProperty("error");
    expect(mocks.releaseRoster).toHaveBeenCalledWith({
      where: { id: "roster-2026-1", studentId: "1304", email: "student@example.com", claimedInviteTokenId: "token", claimedUserId: null },
      data: { claimedAt: null, claimedEmail: null, claimedInviteTokenId: null },
    });
  });

  it("releases the exact manual roster claim when a reserved send is quota-blocked", async () => {
    mocks.count.mockResolvedValue(251);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.releaseRoster.mockResolvedValue({ count: 1 });
    const { sendInviteTokenEmail } = await import("./token-distribution");
    await expect(sendInviteTokenEmail(input)).resolves.toHaveProperty("error");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.releaseRoster).toHaveBeenCalledWith({
      where: { id: "roster-2026-1", studentId: "1304", email: "student@example.com", claimedInviteTokenId: "token", claimedUserId: null },
      data: { claimedAt: null, claimedEmail: null, claimedInviteTokenId: null },
    });
  });
});
