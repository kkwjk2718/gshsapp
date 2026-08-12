import { describe, expect, it, vi } from "vitest";

import { InviteRedemptionError, redeemInvite } from "./invite-redemption";

function createDb(options: { claimCount?: number; createError?: Error } = {}) {
  const sequence: string[] = [];
  const invite: { id: string; targetRole: string; targetGisu: number | null; boundEmail: string | null; boundStudentId: string | null } = { id: "invite-1", targetRole: "STUDENT", targetGisu: 40, boundEmail: null, boundStudentId: null };
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
  };
  const db = { $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
  return { db, tx, sequence };
}

describe("atomic invite redemption", () => {
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
      select: { id: true, targetRole: true, targetGisu: true, boundEmail: true, boundStudentId: true },
    });
  });

  it("rejects a forwarded targeted invite before the conditional claim", async () => {
    const { db, tx } = createDb();
    tx.inviteToken.findFirst.mockResolvedValueOnce({
      id: "invite-1", targetRole: "STUDENT", targetGisu: 40,
      boundEmail: "intended@example.com", boundStudentId: "1304",
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

  it("keeps generic batch invites unbound", async () => {
    const { db } = createDb();
    await expect(redeemInvite(db as never, {
      presentedSecret: "secret", tokenHash: "digest", legacyToken: null,
      now: new Date(), claimedIdentity: { email: "any@example.com", studentId: "1305" },
      validateInvite: () => undefined,
      userData: { userId: "student", passwordHash: "hash", name: "Student" },
    })).resolves.toEqual({ userId: "user-1", inviteTokenId: "invite-1" });
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
