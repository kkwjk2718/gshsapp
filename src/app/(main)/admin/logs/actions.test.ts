import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: {
  systemLog: { findMany: mocks.findMany, count: mocks.count, deleteMany: vi.fn() },
  systemSetting: { findUnique: vi.fn(), upsert: mocks.upsert },
  auditLog: { create: mocks.auditCreate },
  $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("admin log actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    mocks.getCurrentUser.mockResolvedValue({ id: "stale-admin", role: "ADMIN" });
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
  });

  it("does not export an anonymous cleanup action", async () => {
    const actions = await import("./actions");
    expect("cleanupLogs" in actions).toBe(false);
    expect("getLogSettings" in actions).toBe(false);
    expect("getLogStats" in actions).toBe(false);
  });

  it.each(["saveRetentionSettings", "getLogsForExport", "getSystemLogs"] as const)(
    "%s rejects through the fresh admin guard before database work",
    async (name) => {
      const actions = await import("./actions");
      const call = name === "saveRetentionSettings"
        ? actions.saveRetentionSettings(30)
        : name === "getSystemLogs"
          ? actions.getSystemLogs({ page: 1, limit: 20, action: "ALL", search: "", role: "ALL" })
          : actions.getLogsForExport();
      await expect(call).rejects.toThrow("Forbidden");
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.count).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid list input after authorization without querying", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const { getSystemLogs } = await import("./actions");
    await expect(getSystemLogs({ page: 0, limit: 101, action: "ALL", search: "", role: "ALL" }))
      .rejects.toThrow("Invalid log query");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("quotes and neutralizes every exported CSV field before audit-gated return", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.findMany.mockResolvedValue([{ id: "log", createdAt: new Date("2026-01-02T03:04:05Z"), action: "=ACTION", ip: "+IP", path: "-PATH", details: "@DETAIL", user: { name: "=NAME", studentId: "+ID" } }]);
    mocks.auditCreate.mockResolvedValue({});
    const { getLogsForExport } = await import("./actions");
    const csv = await getLogsForExport();
    for (const value of ["'=ACTION", "'+IP", "'-PATH", "'@DETAIL", "'=NAME", "'+ID"]) {
      expect(csv).toContain(`"${value}"`);
    }
  });
});
