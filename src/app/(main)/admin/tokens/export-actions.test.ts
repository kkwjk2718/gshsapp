import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ prisma: { tokenBatch: { findUnique: mocks.findUnique }, auditLog: { create: mocks.create } } }));

describe("token export audit gate", () => {
  it("does no database work when the fresh admin guard rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    const { getTokenCsvForExport } = await import("./export-actions");
    await expect(getTokenCsvForExport("batch")).rejects.toThrow("Forbidden");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns no success when audit persistence fails", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
    mocks.findUnique.mockResolvedValue({ id: "batch", tokens: [] });
    mocks.create.mockRejectedValue(new Error("audit unavailable"));
    const { getTokenCsvForExport } = await import("./export-actions");
    await expect(getTokenCsvForExport("batch")).rejects.toThrow("audit unavailable");
  });
});
