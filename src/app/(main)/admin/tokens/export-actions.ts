"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { serializeTokenCsv } from "@/lib/token-csv";

const SAFE_ID = /^[^\u0000-\u001f\u007f-\u009f\ufeff]{1,128}$/u;

export async function getTokenCsvForExport(batchId: string) {
  const actor = await requireAdmin();
  if (typeof batchId !== "string" || !SAFE_ID.test(batchId) || new TextEncoder().encode(batchId).byteLength > 128) throw new Error("Invalid token batch");
  const batch = await prisma.tokenBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      tokens: {
        orderBy: { createdAt: "asc" },
        take: 10_000,
        select: {
          token: true, targetRole: true, targetGisu: true, isUsed: true,
          usedBy: { select: { name: true, studentId: true, role: true } },
        },
      },
    },
  });
  if (!batch) throw new Error("Token batch not found");
  const csv = serializeTokenCsv(batch.tokens);
  await writeAuditLog(prisma, { actorId: actor.id, action: "TOKEN_EXPORTED", target: { type: "TOKEN_BATCH", id: batch.id } });
  return csv;
}
