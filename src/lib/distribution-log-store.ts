import type { Prisma } from "@prisma/client";

type DistributionLogDb = Pick<Prisma.TransactionClient, "tokenDistributionLog">;
const RETENTION_MS = 365 * 86_400_000;
const STALE_PENDING_MS = 8 * 86_400_000;
const MAX_ROWS = 50_000;
const DELETE_BATCH = 1_000;

async function deleteOldest(db: DistributionLogDb, where: Prisma.TokenDistributionLogWhereInput, maximum: number) {
  let deleted = 0;
  while (deleted < maximum) {
    const rows = await db.tokenDistributionLog.findMany({
      where, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.min(DELETE_BATCH, maximum - deleted),
    });
    if (rows.length === 0) break;
    const result = await db.tokenDistributionLog.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    if (result.count === 0) break;
    deleted += result.count;
  }
}

export async function enforceDistributionLogBounds(db: DistributionLogDb, now = new Date()) {
  await db.tokenDistributionLog.updateMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } },
    data: { status: "FAILED", errorMessage: "Reservation expired without provider confirmation." },
  });
  const expiredWhere = { status: { not: "PENDING" }, createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } as const;
  const expired = await db.tokenDistributionLog.count({ where: expiredWhere });
  if (expired > 0) await deleteOldest(db, expiredWhere, expired);
  const overflow = Math.max(0, await db.tokenDistributionLog.count() - MAX_ROWS);
  if (overflow > 0) await deleteOldest(db, { status: { not: "PENDING" } }, overflow);
}

export function normalizeDistributionLogText(value: string | null | undefined, maximumBytes: number): string | null {
  if (!value) return null;
  const clean = value.trim().normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\ufeff]/gu, " ");
  let result = "";
  for (const character of clean) {
    if (new TextEncoder().encode(result + character).byteLength > maximumBytes) break;
    result += character;
  }
  return result || null;
}
