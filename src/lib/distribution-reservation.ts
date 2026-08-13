import type { Prisma } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { writeAuditLog } from "@/lib/audit";
import { generateInviteSecret, hashInviteSecret } from "@/lib/security/invite-token";
import { withSqliteWriteRetry } from "@/lib/security/sqlite-retry";
import { TOKEN_DISTRIBUTION_DAILY_LIMIT } from "@/lib/token-portal-config";
import { enforceDistributionLogBounds, normalizeDistributionLogText } from "@/lib/distribution-log-store";
import { enforceInviteTokenLifecycle } from "@/lib/invite-token-lifecycle";

type ReservationDb = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};
type Source = "PORTAL_AUTO" | "ADMIN_MANUAL";
type Target = Readonly<{
  email: string;
  name?: string | null;
  studentId?: string | null;
  targetRole: string;
  targetGisu?: number | null;
}>;
type Input = Readonly<{
  source: Source;
  createdBy: string;
  clientKey?: string | null;
  target: Target;
  now?: Date;
  actorId?: string | null;
}>;

export class DistributionReservationError extends Error {
  constructor(readonly code: "COOLDOWN" | "DUPLICATE" | "QUOTA") {
    super(code);
    this.name = "DistributionReservationError";
  }
}

function getKstDayRange(baseDate: Date) {
  const start = startOfDay(toZonedTime(baseDate, "Asia/Seoul"));
  return { start: fromZonedTime(start, "Asia/Seoul"), end: fromZonedTime(addDays(start, 1), "Asia/Seoul") };
}

export async function reserveDistribution(db: ReservationDb, input: Input) {
  const now = input.now ?? new Date();
  const { start, end } = getKstDayRange(now);
  const token = generateInviteSecret();
  const normalizedEmail = normalizeDistributionLogText(input.target.email.toLowerCase(), 254);
  const normalizedStudentId = normalizeDistributionLogText(input.target.studentId, 16);
  const normalizedName = normalizeDistributionLogText(input.target.name, 240);
  const normalizedClientKey = normalizeDistributionLogText(input.clientKey, 128);
  if (!normalizedEmail) throw new Error("Invalid distribution email");

  return withSqliteWriteRetry(() => db.$transaction(async (tx) => {
    // SQLite obtains its writer lock on this first statement, serializing all following quota decisions.
    const pending = await tx.tokenDistributionLog.create({
      data: {
        source: input.source,
        recipientEmail: normalizedEmail,
        requesterName: normalizedName,
        studentId: normalizedStudentId,
        targetRole: input.target.targetRole,
        targetGisu: input.target.targetGisu ?? null,
        status: "PENDING",
        clientKey: normalizedClientKey,
        createdBy: normalizeDistributionLogText(input.createdBy, 128) ?? "system",
        createdAt: now,
      },
      select: { id: true },
    });

    const duplicate = await tx.tokenDistributionLog.findFirst({
      where: input.source === "PORTAL_AUTO"
        ? {
            id: { not: pending.id }, clientKey: normalizedClientKey ?? "",
            status: { in: ["PENDING", "SENT", "FAILED"] }, createdAt: { gte: new Date(now.getTime() - 60_000) },
          }
        : {
            id: { not: pending.id }, source: "ADMIN_MANUAL", recipientEmail: normalizedEmail,
            targetRole: input.target.targetRole, targetGisu: input.target.targetGisu ?? null,
            status: { in: ["PENDING", "SENT", "FAILED"] }, createdAt: { gte: new Date(now.getTime() - 10 * 60_000) },
          },
      select: { id: true },
    });
    if (duplicate) throw new DistributionReservationError(input.source === "PORTAL_AUTO" ? "COOLDOWN" : "DUPLICATE");

    const used = await tx.tokenDistributionLog.count({
      where: { status: { in: ["PENDING", "SENT", "FAILED"] }, createdAt: { gte: start, lt: end } },
    });
    if (used > TOKEN_DISTRIBUTION_DAILY_LIMIT) throw new DistributionReservationError("QUOTA");

    const inviteToken = await tx.inviteToken.create({
      data: {
        token: null,
        tokenHash: hashInviteSecret(token),
        boundEmail: normalizedEmail,
        boundStudentId: normalizedStudentId,
        targetRole: input.target.targetRole,
        targetGisu: input.target.targetGisu ?? null,
        createdBy: input.createdBy,
        isUsed: false,
        batchId: null,
      },
      select: { id: true, targetRole: true, targetGisu: true },
    });
    await tx.tokenDistributionLog.update({ where: { id: pending.id }, data: { inviteTokenId: inviteToken.id } });
    if (input.actorId) {
      await writeAuditLog(tx, { actorId: input.actorId, action: "TOKEN_EMAIL_REQUESTED", target: { type: "TOKEN_DISTRIBUTION", id: pending.id } });
    }
    await enforceDistributionLogBounds(tx, now);
    await enforceInviteTokenLifecycle(tx, now);
    return { distributionLogId: pending.id, inviteToken: { ...inviteToken, token } };
  }));
}
