import { describe, expect, it, vi } from "vitest";

import { enforceInviteTokenLifecycle } from "./invite-token-lifecycle";

describe("invite token lifecycle", () => {
  it("detaches distribution history before deleting expired invite records in bounded batches", async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: "old-a" }, { id: "old-b" }])
      .mockResolvedValueOnce([]);
    const detach = vi.fn().mockResolvedValue({ count: 2 });
    const remove = vi.fn().mockResolvedValue({ count: 2 });
    const db = {
      inviteToken: { findMany, deleteMany: remove },
      tokenDistributionLog: { updateMany: detach },
    };
    const now = new Date("2026-08-13T00:00:00.000Z");

    await enforceInviteTokenLifecycle(db as never, now);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { lte: new Date("2026-08-06T00:00:00.000Z") } },
      take: 1_000,
    }));
    expect(detach).toHaveBeenCalledWith({
      where: { inviteTokenId: { in: ["old-a", "old-b"] } }, data: { inviteTokenId: null },
    });
    expect(remove).toHaveBeenCalledWith({ where: { id: { in: ["old-a", "old-b"] } } });
    expect(detach.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });
});
