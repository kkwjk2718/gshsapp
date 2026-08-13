import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { tokenDistributionLog: { count } } }));
vi.mock("@/lib/brevo", () => ({ sendBrevoEmail: vi.fn() }));
vi.mock("@/lib/grade-utils", () => ({ getGradeMapping: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/system-settings", () => ({
  getSystemSettingValue: vi.fn(), SYSTEM_SETTING_KEYS: { tokenPortalEmailGuidance: "guidance" },
}));

describe("token distribution security boundaries", () => {
  beforeEach(() => count.mockReset().mockResolvedValue(3));

  it("counts failed provider attempts against the shared daily quota", async () => {
    const { getTodayDistributionUsage } = await import("./token-distribution");
    await expect(getTodayDistributionUsage()).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: { in: ["PENDING", "SENT", "FAILED"] } }),
    });
  });

  it("puts invite secrets in fragments rather than request-visible query strings", async () => {
    const { buildInviteEmail } = await import("./token-distribution");
    const email = buildInviteEmail({ name: "Student", token: "secret-token", guidance: "" });
    expect(email.htmlContent).toContain("/signup#token=secret-token");
    expect(email.textContent).toContain("/signup#token=secret-token");
    expect(`${email.htmlContent}\n${email.textContent}`).not.toContain("/signup?token=");
  });
});
