import { describe, expect, it, vi } from "vitest";

import { AUDIT_ACTIONS, buildAuditLogData, writeAuditLog } from "./audit";

describe("audit records", () => {
  it("builds exact bounded Prisma data for every supported action", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(buildAuditLogData({ actorId: "admin-1", action, target: { type: "USER", id: "user-1" }, ipAddress: "2001:DB8::1" }))
        .toEqual({ actorId: "admin-1", action, targetType: "USER", targetId: "user-1", ipAddress: "2001:db8::1" });
    }
  });

  it.each([
    { actorId: "", action: "USER_DELETED" },
    { actorId: "a".repeat(129), action: "USER_DELETED" },
    { actorId: "admin", action: "UNKNOWN" },
    { actorId: "admin", action: "USER_DELETED", target: { type: "USER", id: "x\nsecret" } },
    { actorId: "admin", action: "USER_DELETED", target: { type: "USER", id: "한".repeat(43) } },
    { actorId: "admin", action: "USER_DELETED", ipAddress: "host.example" },
  ])("rejects invalid event %#", (event) => {
    expect(() => buildAuditLogData(event as never)).toThrow();
  });

  it("writes once on the supplied client and propagates failure", async () => {
    const error = new Error("audit unavailable");
    const create = vi.fn().mockRejectedValue(error);
    await expect(writeAuditLog({ auditLog: { create } } as never, { actorId: "admin", action: "USER_EXPORTED" }))
      .rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("enforces the hard row cap after a successful write", async () => {
    const create = vi.fn().mockResolvedValue({});
    const findMany = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "oldest" }])
      .mockResolvedValueOnce([]);
    const count = vi.fn().mockResolvedValue(50_001);
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    await writeAuditLog({ auditLog: { create, findMany, count, deleteMany } } as never, { actorId: "admin", action: "USER_EXPORTED" });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["oldest"] } } });
  });
});
