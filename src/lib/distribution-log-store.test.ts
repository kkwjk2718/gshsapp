import { describe, expect, it, vi } from "vitest";

import { enforceDistributionLogBounds } from "./distribution-log-store";

describe("token distribution log bounds", () => {
  it("retains pending reservations while pruning expired terminal rows and total overflow in bounded batches", async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: "expired" }])
      .mockResolvedValueOnce([{ id: "overflow" }]);
    const count = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(50_001);
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    await enforceDistributionLogBounds({ tokenDistributionLog: { findMany, count, deleteMany, updateMany } } as never, new Date("2026-08-13T00:00:00Z"));

    expect(updateMany).toHaveBeenCalledWith({
      where: { status: "PENDING", createdAt: { lt: new Date("2026-08-05T00:00:00.000Z") } },
      data: { status: "FAILED", errorMessage: "Reservation expired without provider confirmation." },
    });
    expect(findMany.mock.calls[0][0].where).toEqual({ status: { not: "PENDING" }, createdAt: { lt: new Date("2025-08-13T00:00:00.000Z") } });
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
  });
});
