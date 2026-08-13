import { describe, expect, it, vi } from "vitest";

import { InviteRedemptionError, preflightInviteRedemption, redeemInvite } from "./invite-redemption";

function createDb(options: { claimCount?: number; createError?: Error } = {}) {
  const sequence: string[] = [];
  const invite: {
    id: string; targetRole: string; targetGisu: number | null; boundEmail: string | null;
    boundStudentId: string | null; rosterClaimRequired: boolean;
  } = { id: "invite-1", targetRole: "STUDENT", targetGisu: 40, boundEmail: null, boundStudentId: null, rosterClaimRequired: false };
  const tx = {
    inviteToken: {
      findFirst: vi.fn(async () => { sequence.push("lookup"); return invite; }),
      updateMany: vi.fn(async () => { sequence.push("claim"); return { count: options.claimCount ?? 1 }; }),
      update: vi.fn(async () => { sequence.push("associate"); return invite; }),
    },
    user: {
      create: vi.fn(async () => {
        sequence.push("create-user");
        if (options.createError) throw options.createError;
        return { id: "user-1" };
      }),
    },
    studentRosterEntry: {
      updateMany: vi.fn(async () => { sequence.push("complete-roster"); return { count: 1 }; }),
    },
  };
  const db = { $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
  return { db, tx, sequence };
}

describe("atomic invite redemption", () => {
  it("cheaply rejects inactive or mismatched invites before password hashing can begin", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "invite-1", targetRole: "STUDENT", targetGisu: 40,
      boundEmail: "student@example.com", boundStudentId: "1304", rosterClaimRequired: true,
    });
    const validateInvite = vi.fn();
    const now = new Date("2026-08-13T00:00:00.000Z");
    await expect(preflightInviteRedemption({ inviteToken: { findFirst } } as never, {
      tokenHash: "digest", legacyToken: null, now,
      claimedIdentity: { email: "student@example.com", studentId: "1304" }, validateInvite,
    })).resolves.toMatchObject({ id: "invite-1" });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ tokenHash: "digest" }], isUsed: false, usedByUserId: null,
        createdAt: { gt: new Date("2026-08-06T00:00:00.000Z") },
      },
      select: { id: true, targetRole: true, targetGisu: true, boundEmail: true, boundStudentId: true, rosterClaimRequired: true },
    });
    expect(validateInvite).toHaveBeenCalledOnce();

    findFirst.mockResolvedValueOnce(null);
    await expect(preflightInviteRedemption({ inviteToken: { findFirst } } as never, {
      tokenHash: "invalid", legacyToken: null, now, validateInvite,
    })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("claims conditionally before creating and associating the account", async () => {
    const { db, tx, sequence } = createDb();
    const result = await redeemInvite(db as never, {
      presentedSecret: "secret",
      tokenHash: "digest",
      legacyToken: "legacy",
      now: new Date("2026-08-13T00:00:00.000Z"),
      validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    });

    expect(result).toEqual({ userId: "user-1", inviteTokenId: "invite-1" });
    expect(sequence).toEqual(["lookup", "claim", "create-user", "associate"]);
    expect(tx.inviteToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "invite-1",
        isUsed: false,
        usedByUserId: null,
        createdAt: { gt: new Date("2026-08-06T00:00:00.000Z") },
      },
      data: { isUsed: true },
    });
  });

  it("creates no account when the conditional claim loses the race", async () => {
    const { db, tx } = createDb({ claimCount: 0 });

    await expect(redeemInvite(db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: "legacy",
      now: new Date("2026-08-13T00:00:00.000Z"), validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    })).rejects.toMatchObject({ code: "INVALID_OR_USED_OR_EXPIRED" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("uses hash lookup while allowing an exact legacy fallback during migration", async () => {
    const { db, tx } = createDb();
    await redeemInvite(db as never, {
      presentedSecret: "legacy-value", tokenHash: "sha256-digest", legacyToken: "legacy-value",
      now: new Date("2026-08-13T00:00:00.000Z"), validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    });
    expect(tx.inviteToken.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ tokenHash: "sha256-digest" }, { token: "legacy-value" }] },
      select: { id: true, targetRole: true, targetGisu: true, boundEmail: true, boundStudentId: true, rosterClaimRequired: true },
    });
  });

  it("rejects a forwarded targeted invite before the conditional claim", async () => {
    const { db, tx } = createDb();
    tx.inviteToken.findFirst.mockResolvedValueOnce({
      id: "invite-1", targetRole: "STUDENT", targetGisu: 40,
      boundEmail: "intended@example.com", boundStudentId: "1304", rosterClaimRequired: true,
    });
    await expect(redeemInvite(db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: null,
      now: new Date(), claimedIdentity: { email: "attacker@example.com", studentId: "1305" },
      validateInvite: () => undefined,
      userData: { userId: "attacker", passwordHash: "hash", name: "Attacker" },
    })).rejects.toMatchObject({ code: "INVALID" });
    expect(tx.inviteToken.updateMany).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("atomically marks a roster identity consumed after account creation", async () => {
    const { db, tx, sequence } = createDb();
    tx.inviteToken.findFirst.mockResolvedValueOnce({
      id: "invite-1", targetRole: "STUDENT", targetGisu: 40,
      boundEmail: "student@example.com", boundStudentId: "1304", rosterClaimRequired: true,
    });
    await redeemInvite(db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: null,
      now: new Date("2026-08-13T00:00:00.000Z"),
      claimedIdentity: { email: "student@example.com", studentId: "1304" },
      validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    });
    expect(sequence).toEqual(["claim", "create-user", "complete-roster", "associate"]);
    expect(tx.studentRosterEntry.updateMany).toHaveBeenCalledWith({
      where: { studentId: "1304", email: "student@example.com", claimedInviteTokenId: "invite-1", claimedUserId: null },
      data: { claimedUserId: "user-1", claimedInviteTokenId: null, claimedAt: new Date("2026-08-13T00:00:00.000Z"), claimedEmail: "student@example.com" },
    });
  });

  it("keeps generic batch invites unbound", async () => {
    const { db } = createDb();
    await expect(redeemInvite(db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: null,
      now: new Date(), claimedIdentity: { email: "any@example.com", studentId: "1305" },
      validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    })).resolves.toEqual({ userId: "user-1", inviteTokenId: "invite-1" });
  });

  it("allows a bound manual student invite without a portal roster claim", async () => {
    const { db, tx } = createDb();
    tx.inviteToken.findFirst.mockResolvedValueOnce({
      id: "invite-1", targetRole: "STUDENT", targetGisu: 40,
      boundEmail: "student@example.com", boundStudentId: "1304", rosterClaimRequired: false,
    });
    await expect(redeemInvite(db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: null, now: new Date(),
      claimedIdentity: { email: "student@example.com", studentId: "1304" },
      validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    })).resolves.toMatchObject({ userId: "user-1" });
    expect(tx.studentRosterEntry.updateMany).not.toHaveBeenCalled();
  });

  it("does not convert validation or account uniqueness failures into retryable claims", async () => {
    const { db, tx } = createDb({ createError: Object.assign(new Error("duplicate"), { code: "P2002" }) });
    await expect(redeemInvite(db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: null,
      now: new Date(), validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    })).rejects.toMatchObject({ code: "P2002" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    const validation = new InviteRedemptionError("INVALID_ROLE_DATA");
    const second = createDb();
    await expect(redeemInvite(second.db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: null,
      now: new Date(), validateInvite: () => { throw validation; },
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    })).rejects.toBe(validation);
    expect(second.tx.inviteToken.updateMany).not.toHaveBeenCalled();
  });
});
