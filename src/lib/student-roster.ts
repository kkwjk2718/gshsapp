import type { Prisma } from "@prisma/client";

type RosterDb = Pick<Prisma.TransactionClient, "studentRosterEntry">;

function normalizeRosterName(value: string) {
  return value.trim().normalize("NFC");
}

export async function validatePortalRosterIdentity(
  db: RosterDb,
  identity: Readonly<{ name: string; studentId: string; email: string }>,
) {
  const entry = await db.studentRosterEntry.findUnique({
    where: { studentId: identity.studentId },
    select: {
      studentId: true,
      name: true,
      email: true,
      active: true,
      claimedAt: true,
      claimedInviteTokenId: true,
      claimedUserId: true,
    },
  });
  if (!entry || !entry.active || entry.claimedUserId || normalizeRosterName(entry.name) !== normalizeRosterName(identity.name) ||
      entry.email.trim().toLowerCase() !== identity.email.trim().toLowerCase()) {
    return null;
  }
  return entry;
}
