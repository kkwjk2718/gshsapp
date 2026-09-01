import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { errorReport: { findMany: mocks.findMany, count: mocks.count, update: vi.fn() } } }));

describe("admin report list", () => {
  it.each([[0, 20], [1, 0], [1, 101]])("rejects page/limit %s/%s before querying", async (page, limit) => {
    mocks.getCurrentUser.mockResolvedValue({ role: "ADMIN" });
    const { getErrorReports } = await import("./actions");
    await expect(getErrorReports(page, limit)).rejects.toThrow("Invalid report query");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
