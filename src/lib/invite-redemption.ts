import type { Prisma } from "@prisma/client";

import { withSqliteWriteRetry } from "@/lib/security/sqlite-retry";

type InviteSnapshot = Readonly<{
  id: string;
  targetRole: string;
  targetGisu: number | null;
  boundEmail: string | null;
  boundStudentId: string | null;
  rosterClaimRequired: boolean;
  rosterEntryId: string | null;
}>;
type InviteRedemptionDb = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};
type InvitePreflightDb = Pick<Prisma.TransactionClient, "inviteToken" | "studentRosterEntry">;

export type InviteRedemptionErrorCode = "INVALID" | "INVALID_ROLE_DATA" | "INVALID_OR_USED_OR_EXPIRED";

export class InviteRedemptionError extends Error {
  constructor(readonly code: InviteRedemptionErrorCode) {
    super(code);
    this.name = "InviteRedemptionError";
  }
}

type RedeemInviteInput = Readonly<{
  presentedSecret: string;
  tokenHash: string;
  legacyToken: string | null;
  now: Date;
  claimedIdentity?: Readonly<{ email: string; studentId: string | null }>;
  validateInvite: (invite: InviteSnapshot) => void;
  userData: Omit<Prisma.UserCreateInput, "role" | "gisu">;
}>;

type InvitePreflightInput = Readonly<{
  tokenHash: string;
  legacyToken: string | null;
  now: Date;
  claimedIdentity?: Readonly<{ email: string; studentId: string | null }>;
  validateInvite: (invite: InviteSnapshot) => void;
}>;

function validateInviteIdentity(invite: InviteSnapshot, input: Pick<InvitePreflightInput, "claimedIdentity" | "validateInvite">) {
  const claimedEmail = input.claimedIdentity?.email.trim().toLowerCase() ?? null;
  const claimedStudentId = input.claimedIdentity?.studentId?.trim() || null;
  if ((invite.boundEmail && invite.boundEmail !== claimedEmail) ||
      (invite.boundStudentId && invite.boundStudentId !== claimedStudentId)) {
    throw new InviteRedemptionError("INVALID");
  }
  input.validateInvite(invite);
}

export async function preflightInviteRedemption(db: InvitePreflightDb, input: InvitePreflightInput): Promise<InviteSnapshot> {
  const cutoff = new Date(input.now.getTime() - 7 * 86_400_000);
  const invite = await db.inviteToken.findFirst({
    where: {
      OR: [
        { tokenHash: input.tokenHash },
        ...(input.legacyToken ? [{ token: input.legacyToken }] : []),
      ],
      isUsed: false,
      usedByUserId: null,
      createdAt: { gt: cutoff },
    },
    select: { id: true, targetRole: true, targetGisu: true, boundEmail: true, boundStudentId: true, rosterClaimRequired: true, rosterEntryId: true },
  });
  if (!invite) throw new InviteRedemptionError("INVALID");
  validateInviteIdentity(invite, input);
  if (invite.rosterClaimRequired) {
    if (!invite.rosterEntryId || !invite.boundStudentId || !invite.boundEmail || !invite.targetGisu) {
      throw new InviteRedemptionError("INVALID");
    }
    const activeClaim = await db.studentRosterEntry.findFirst({
      where: {
        id: invite.rosterEntryId,
        studentId: invite.boundStudentId,
        email: invite.boundEmail,
        gisu: invite.targetGisu,
        active: true,
        claimedInviteTokenId: invite.id,
        claimedUserId: null,
      },
      select: { id: true },
    });
    if (!activeClaim) throw new InviteRedemptionError("INVALID");
  }
  return invite;
}

export async function redeemInvite(db: InviteRedemptionDb, input: RedeemInviteInput) {
  const cutoff = new Date(input.now.getTime() - 7 * 86_400_000);
  return withSqliteWriteRetry(() => db.$transaction(async (tx) => {
    const invite = await tx.inviteToken.findFirst({
      where: {
        OR: [
          { tokenHash: input.tokenHash },
          ...(input.legacyToken ? [{ token: input.legacyToken }] : []),
        ],
      },
      select: { id: true, targetRole: true, targetGisu: true, boundEmail: true, boundStudentId: true, rosterClaimRequired: true, rosterEntryId: true },
    });
    if (!invite) throw new InviteRedemptionError("INVALID");

    validateInviteIdentity(invite, input);

    const claim = await tx.inviteToken.updateMany({
      where: {
        id: invite.id,
        isUsed: false,
        usedByUserId: null,
        createdAt: { gt: cutoff },
      },
      data: { isUsed: true },
    });
    if (claim.count !== 1) throw new InviteRedemptionError("INVALID_OR_USED_OR_EXPIRED");

    let authoritativeRosterName: string | null = null;
    if (invite.rosterClaimRequired) {
      if (invite.targetRole !== "STUDENT" || !invite.boundStudentId || !invite.boundEmail || !invite.rosterEntryId || !invite.targetGisu) {
        throw new InviteRedemptionError("INVALID");
      }
      const rosterIdentity = await tx.studentRosterEntry.findFirst({
        where: {
          id: invite.rosterEntryId,
          studentId: invite.boundStudentId,
          email: invite.boundEmail,
          gisu: invite.targetGisu,
          active: true,
          claimedInviteTokenId: invite.id,
          claimedUserId: null,
        },
        select: { name: true },
      });
      if (!rosterIdentity) throw new InviteRedemptionError("INVALID");
      authoritativeRosterName = rosterIdentity.name;
    }

    const user = await tx.user.create({ data: {
      ...input.userData,
      ...(authoritativeRosterName ? { name: authoritativeRosterName } : {}),
      role: invite.targetRole,
      gisu: invite.targetGisu,
    } });
    if (invite.rosterClaimRequired) {
      if (invite.targetRole !== "STUDENT" || !invite.boundStudentId || !invite.boundEmail || !invite.rosterEntryId || !invite.targetGisu) {
        throw new InviteRedemptionError("INVALID");
      }
      const rosterClaim = await tx.studentRosterEntry.updateMany({
        where: {
          id: invite.rosterEntryId,
          studentId: invite.boundStudentId,
          name: authoritativeRosterName!,
          email: invite.boundEmail,
          gisu: invite.targetGisu,
          active: true,
          claimedInviteTokenId: invite.id,
          claimedUserId: null,
        },
        data: {
          claimedUserId: user.id,
          claimedInviteTokenId: null,
          claimedAt: input.now,
          claimedEmail: invite.boundEmail,
        },
      });
      if (rosterClaim.count !== 1) throw new InviteRedemptionError("INVALID");
    }
    await tx.inviteToken.update({
      where: { id: invite.id },
      data: { usedByUserId: user.id },
    });
    return { userId: user.id, inviteTokenId: invite.id };
  }));
}
