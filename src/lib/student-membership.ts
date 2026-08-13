import type { Prisma } from "@prisma/client";

export const ROSTER_GOVERNED_ROLES = ["STUDENT", "BROADCAST"] as const;

export function isRosterGovernedRole(role: string) {
  return role === "STUDENT" || role === "BROADCAST";
}

type MembershipDb = Pick<Prisma.TransactionClient, "studentRosterEntry">;

export async function hasActiveRosterMembership(db: MembershipDb, userId: string) {
  return (await db.studentRosterEntry.findFirst({
    where: { claimedUserId: userId, active: true },
    select: { id: true },
  })) !== null;
}
