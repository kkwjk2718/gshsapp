import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { planStudentRosterReplacement, type StudentRosterImportEntry } from "@/lib/security/student-roster-import";

export async function replaceStudentRosterInTransaction(
  tx: Prisma.TransactionClient,
  entries: readonly StudentRosterImportEntry[],
  actorId: string,
) {
  // Obtain SQLite's writer lease before authorization and identity snapshots.
  await tx.systemSetting.updateMany({
    where: { key: "__roster_import_write_lease__" },
    data: { value: "" },
  });
  const actor = await tx.user.findFirst({
    where: { id: actorId, role: "ADMIN" },
    select: { id: true },
  });
  if (!actor) throw new Error("ROSTER_ACTOR_NOT_ADMIN");

  const rosterEntries = await tx.studentRosterEntry.findMany({
    select: {
      id: true, academicYear: true, gisu: true, studentId: true, name: true, email: true,
      claimedUserId: true,
    },
  });
  const existingUsers = await tx.user.findMany({
    select: { id: true, role: true, gisu: true, studentId: true, name: true, email: true },
  });
  const plan = planStudentRosterReplacement(entries, rosterEntries, existingUsers);
  const pendingClaims = await tx.studentRosterEntry.findMany({
    where: { active: true, claimedInviteTokenId: { not: null }, claimedUserId: null },
    select: { claimedInviteTokenId: true },
  });
  const pendingTokenIds = pendingClaims.flatMap(({ claimedInviteTokenId }) =>
    claimedInviteTokenId ? [claimedInviteTokenId] : [],
  );
  if (pendingTokenIds.length > 0) {
    await tx.tokenDistributionLog.updateMany({
      where: { inviteTokenId: { in: pendingTokenIds } },
      data: { inviteTokenId: null },
    });
    const revoked = await tx.inviteToken.deleteMany({
      where: { id: { in: pendingTokenIds }, isUsed: false, usedByUserId: null },
    });
    if (revoked.count !== pendingTokenIds.length) throw new Error("ROSTER_PENDING_INVITE_CHANGED");
  }

  await tx.studentRosterEntry.updateMany({
    where: { claimedUserId: null },
    data: { claimedAt: null, claimedEmail: null, claimedInviteTokenId: null },
  });
  await tx.studentRosterEntry.updateMany({ data: { active: false } });
  for (const update of plan.updateEntries) {
    await tx.studentRosterEntry.update({ where: { id: update.id }, data: update.data });
  }
  if (plan.createEntries.length > 0) {
    await tx.studentRosterEntry.createMany({ data: plan.createEntries });
  }
  for (const update of plan.userUpdates) {
    const result = await tx.user.updateMany({
      where: { id: update.id, role: { in: ["STUDENT", "BROADCAST"] } },
      data: {
        studentId: update.studentId,
        gisu: update.gisu,
        name: update.name,
        sessionVersion: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new Error("ROSTER_USER_CHANGED");
  }
  await tx.user.updateMany({
    where: {
      role: { in: ["STUDENT", "BROADCAST"] },
      ...(plan.activeUserIds.length > 0 ? { id: { notIn: plan.activeUserIds } } : {}),
    },
    data: { sessionVersion: { increment: 1 } },
  });
  await writeAuditLog(tx, {
    actorId,
    action: "STUDENT_ROSTER_REPLACED",
    target: { type: "STUDENT_ROSTER", id: `year:${plan.academicYear}:rows:${entries.length}` },
  });
  return plan;
}
