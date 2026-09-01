import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getCurrentUser: vi.fn(), resolveCategory: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/notice-categories", () => ({ resolveNoticeCategoryValue: mocks.resolveCategory }));
vi.mock("@/lib/db", () => ({ prisma: { notice: { create: vi.fn(), update: vi.fn(), delete: vi.fn() } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("notice authorization order", () => {
  it.each(["createNotice", "updateNotice"] as const)("%s rejects before category database resolution", async (name) => {
    mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    mocks.getCurrentUser.mockResolvedValue({ id: "stale", role: "ADMIN" });
    const actions = await import("./actions");
    await expect(actions[name](new FormData())).rejects.toThrow("Forbidden");
    expect(mocks.resolveCategory).not.toHaveBeenCalled();
  });
});
