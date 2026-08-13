import type { Prisma } from "@prisma/client";

const INVITE_TTL_MS = 7 * 86_400_000;
const DELETE_BATCH = 1_000;
const MAX_DELETE_PER_RUN = 5_000;

type InviteLifecycleDb = Pick<Prisma.TransactionClient, "inviteToken" | "tokenDistributionLog">;

export async function enforceInviteTokenLifecycle(db: InviteLifecycleDb, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - INVITE_TTL_MS);
  let deleted = 0;
  while (deleted < MAX_DELETE_PER_RUN) {
    const expired = await db.inviteToken.findMany({
      where: { createdAt: { lte: cutoff } }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.min(DELETE_BATCH, MAX_DELETE_PER_RUN - deleted),
    });
    if (expired.length === 0) break;
    const ids = expired.map(({ id }) => id);
    await db.tokenDistributionLog.updateMany({ where: { inviteTokenId: { in: ids } }, data: { inviteTokenId: null } });
    const result = await db.inviteToken.deleteMany({ where: { id: { in: ids } } });
    if (result.count === 0) break;
    deleted += result.count;
  }
  return deleted;
}
