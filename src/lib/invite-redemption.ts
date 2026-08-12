import type { Prisma } from "@prisma/client";

import { withSqliteWriteRetry } from "@/lib/security/sqlite-retry";

type InviteSnapshot = Readonly<{
  id: string;
  targetRole: string;
  targetGisu: number | null;
  boundEmail: string | null;
  boundStudentId: string | null;
}>;
type InviteRedemptionDb = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

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
      select: { id: true, targetRole: true, targetGisu: true, boundEmail: true, boundStudentId: true },
    });
    if (!invite) throw new InviteRedemptionError("INVALID");

    const claimedEmail = input.claimedIdentity?.email.trim().toLowerCase() ?? null;
    const claimedStudentId = input.claimedIdentity?.studentId?.trim() || null;
    if ((invite.boundEmail && invite.boundEmail !== claimedEmail) ||
        (invite.boundStudentId && invite.boundStudentId !== claimedStudentId)) {
      throw new InviteRedemptionError("INVALID");
    }

    input.validateInvite(invite);

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

    const user = await tx.user.create({ data: {
      ...input.userData,
      role: invite.targetRole,
      gisu: invite.targetGisu,
    } });
    await tx.inviteToken.update({
      where: { id: invite.id },
      data: { usedByUserId: user.id },
    });
    return { userId: user.id, inviteTokenId: invite.id };
  }));
}
