import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocks.transaction },
}));

describe("notification storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      notification: { create: mocks.create, deleteMany: mocks.deleteMany, findMany: mocks.findMany, count: mocks.count },
    }));
  });

  it("rejects an unsafe link before persistence", async () => {
    const { createNotification } = await import("./notifications");
    await expect(createNotification("user", "SYSTEM", "title", "body", "javascript:alert(1)"))
      .rejects.toThrow("Invalid notification link");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates and prunes expired, old, and overflow rows atomically", async () => {
    mocks.findMany.mockResolvedValue([{ id: "old-1" }]);
    const { createNotification } = await import("./notifications");
    await createNotification("user", "SYSTEM", "title", "body", "/notifications");
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ link: "/notifications" }) });
    expect(mocks.deleteMany).toHaveBeenCalledTimes(2);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 500, take: 1_000 }));
  });

  it("does not silently swallow persistence failures", async () => {
    mocks.create.mockRejectedValueOnce(new Error("write failed"));
    const { createNotification } = await import("./notifications");
    await expect(createNotification("user", "SYSTEM", "title", "body"))
      .rejects.toThrow("write failed");
  });

  it("rejects a write when the global hard cap is reached", async () => {
    mocks.count.mockResolvedValue(250_000);
    const { createNotification } = await import("./notifications");
    await expect(createNotification("user", "SYSTEM", "title", "body"))
      .rejects.toThrow("Notification storage limit reached");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
