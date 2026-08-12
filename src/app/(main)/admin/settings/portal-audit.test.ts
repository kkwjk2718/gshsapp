import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), transaction: vi.fn(), upsert: vi.fn(), findUnique: vi.fn(), auditCreate: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: {
  systemSetting: { upsert: mocks.upsert, findUnique: mocks.findUnique }, auditLog: { create: mocks.auditCreate }, $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));

describe("token portal audit gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.upsert.mockResolvedValue({}); mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ systemSetting: { upsert: mocks.upsert }, auditLog: { create: mocks.auditCreate } }));
  });

  it("audits portal configuration in the settings transaction", async () => {
    const { updateTokenPortalConfig } = await import("./actions");
    const form = new FormData(); form.set("enabled", "on"); form.set("guidance", "help");
    expect(await updateTokenPortalConfig({}, form)).toHaveProperty("success");
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "TOKEN_PORTAL_CONFIG_CHANGED" }) });
  });
});
