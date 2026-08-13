import { describe, expect, it, vi } from "vitest";

vi.mock("./distribution-log-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./distribution-log-store")>()),
  enforceDistributionLogBounds: vi.fn(),
}));

import { DistributionReservationError, reserveDistribution } from "./distribution-reservation";

function createDb(options: { duplicate?: boolean; quota?: number } = {}) {
  const sequence: string[] = [];
  const tx = {
    tokenDistributionLog: {
      create: vi.fn(async () => { sequence.push("pending"); return { id: "log" }; }),
      findFirst: vi.fn(async () => { sequence.push("cooldown"); return options.duplicate ? { id: "old" } : null; }),
      count: vi.fn(async () => { sequence.push("quota"); return options.quota ?? 1; }),
      update: vi.fn(async () => { sequence.push("attach"); return { id: "log" }; }),
    },
    studentRosterEntry: {
      findFirst: vi.fn(async () => { sequence.push("roster-read"); return { claimedAt: null, claimedInviteTokenId: null }; }),
      updateMany: vi.fn(async () => { sequence.push("roster-claim"); return { count: 1 }; }),
    },
    inviteToken: {
      create: vi.fn(async () => { sequence.push("token"); return { id: "token" }; }),
      findMany: vi.fn(async () => { sequence.push("invite-prune"); return []; }),
      deleteMany: vi.fn(),
    },
    auditLog: { create: vi.fn(async () => { sequence.push("audit"); return { id: "audit" }; }) },
  };
  return { db: { $transaction: vi.fn((callback) => callback(tx)) }, tx, sequence };
}

const input = {
  source: "PORTAL_AUTO" as const, createdBy: "system:portal", clientKey: "client-hash",
  target: { email: "student@example.com", name: "Student", studentId: "1304", targetRole: "STUDENT", targetGisu: 40 },
  now: new Date("2026-08-13T01:00:00.000Z"),
};

describe("atomic invite distribution reservation", () => {
  it("takes the SQLite writer lock first, then checks cooldown/quota and stores only a digest", async () => {
    const { db, tx, sequence } = createDb();
    const result = await reserveDistribution(db as never, input);

    expect(sequence).toEqual(["pending", "cooldown", "quota", "roster-read", "token", "roster-claim", "attach", "invite-prune"]);
    expect(result.inviteToken.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tx.inviteToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ token: null, tokenHash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), boundEmail: "student@example.com", boundStudentId: "1304" }),
      select: { id: true, targetRole: true, targetGisu: true },
    });
    expect(tx.tokenDistributionLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["PENDING", "SENT", "FAILED"] } }),
    }));
    expect(tx.tokenDistributionLog.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: { in: ["PENDING", "SENT", "FAILED"] } }),
    });
    expect(tx.studentRosterEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ studentId: "1304", active: true, claimedUserId: null, claimedInviteTokenId: null }),
      data: expect.objectContaining({ claimedInviteTokenId: "token" }),
    }));
  });

  it("rolls back before token creation for cooldown or quota denial", async () => {
    for (const options of [{ duplicate: true }, { quota: 251 }]) {
      const { db, tx } = createDb(options);
      await expect(reserveDistribution(db as never, input)).rejects.toBeInstanceOf(DistributionReservationError);
      expect(tx.inviteToken.create).not.toHaveBeenCalled();
    }
  });

  it("shares quota with manual sends and transaction-couples their audit", async () => {
    const { db, sequence } = createDb();
    await reserveDistribution(db as never, {
      ...input, source: "ADMIN_MANUAL", createdBy: "admin", clientKey: null, actorId: "admin",
    });
    expect(sequence).toEqual(["pending", "cooldown", "quota", "token", "attach", "audit", "invite-prune"]);
  });
});
