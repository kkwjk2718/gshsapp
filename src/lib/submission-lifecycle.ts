import type { Prisma } from "@prisma/client";

export const MAX_ERROR_REPORT_ROWS = 25_000;
export const MAX_SONG_REQUEST_ROWS = 50_000;
const TERMINAL_RETENTION_MS = 365 * 86_400_000;

type ErrorReportLifecycleDb = Pick<Prisma.TransactionClient, "errorReport">;
type SongRequestLifecycleDb = Pick<Prisma.TransactionClient, "songRequest">;

export async function enforceErrorReportLifecycle(db: ErrorReportLifecycleDb, now = new Date()) {
  const cutoff = new Date(now.getTime() - TERMINAL_RETENTION_MS);
  await db.errorReport.deleteMany({
    where: { status: "RESOLVED", resolvedAt: { lt: cutoff } },
  });
  if (await db.errorReport.count() >= MAX_ERROR_REPORT_ROWS) {
    throw new Error("Report storage limit reached");
  }
}

export async function enforceSongRequestLifecycle(db: SongRequestLifecycleDb, now = new Date()) {
  const cutoff = new Date(now.getTime() - TERMINAL_RETENTION_MS);
  await db.songRequest.deleteMany({
    where: {
      status: { in: ["REJECTED", "PLAYED"] },
      createdAt: { lt: cutoff },
    },
  });
  if (await db.songRequest.count() >= MAX_SONG_REQUEST_ROWS) {
    throw new Error("Song storage limit reached");
  }
}
