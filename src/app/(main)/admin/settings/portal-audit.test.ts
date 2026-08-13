import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), transaction: vi.fn(), upsert: vi.fn(), findUnique: vi.fn(), auditCreate: vi.fn(), rosterCount: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: {
  systemSetting: { upsert: mocks.upsert, findUnique: mocks.findUnique }, studentRosterEntry: { count: mocks.rosterCount }, auditLog: { create: mocks.auditCreate }, $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));

describe("token portal audit gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.upsert.mockResolvedValue({}); mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.rosterCount.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ systemSetting: { upsert: mocks.upsert }, studentRosterEntry: { count: mocks.rosterCount }, auditLog: { create: mocks.auditCreate } }));
  });

  it("audits portal configuration in the settings transaction", async () => {
    const { updateTokenPortalConfig } = await import("./actions");
    const form = new FormData(); form.set("enabled", "on"); form.set("guidance", "help");
    expect(await updateTokenPortalConfig({}, form)).toHaveProperty("success");
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "TOKEN_PORTAL_CONFIG_CHANGED" }) });
  });

  it("rejects a weak portal password before hashing or writing", async () => {
    const { updateTokenPortalPassword } = await import("./actions");
    const form = new FormData(); form.set("password", "short"); form.set("confirmPassword", "short");
    expect(await updateTokenPortalPassword({}, form)).toHaveProperty("error");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("reads and increments the portal session version after taking a writer lock", async () => {
    const order: string[] = [];
    mocks.findUnique.mockImplementation(async () => { order.push("read-version"); return { value: "7" }; });
    mocks.upsert.mockImplementation(async ({ where }: { where: { key: string } }) => { order.push(where.key.includes("PASSWORD") ? "password" : "version"); return {}; });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ systemSetting: { upsert: mocks.upsert, findUnique: mocks.findUnique }, studentRosterEntry: { count: mocks.rosterCount }, auditLog: { create: mocks.auditCreate } }));
    const { updateTokenPortalPassword } = await import("./actions");
    const form = new FormData(); form.set("password", "safe-portal-password-2026"); form.set("confirmPassword", "safe-portal-password-2026");
    expect(await updateTokenPortalPassword({}, form)).toHaveProperty("success");
    expect(order.slice(0, 3)).toEqual(["password", "read-version", "version"]);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: "8" } }));
  });

  it("fails closed when an administrator enables the portal without an active roster", async () => {
    mocks.rosterCount.mockResolvedValueOnce(0);
    const { updateTokenPortalConfig } = await import("./actions");
    const form = new FormData(); form.set("enabled", "on"); form.set("guidance", "help");
    await expect(updateTokenPortalConfig({}, form)).resolves.toHaveProperty("error");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
