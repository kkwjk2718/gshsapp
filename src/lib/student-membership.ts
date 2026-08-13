import type { Prisma } from "@prisma/client";

export const ROSTER_GOVERNED_ROLES = ["STUDENT", "BROADCAST"] as const;

export function isRosterGovernedRole(role: string) {
  return role === "STUDENT" || role === "BROADCAST";
}

type MembershipDb = Pick<Prisma.TransactionClient, "studentRosterEntry">;
type MembershipIdentity = Readonly<{
  id: string;
  name: string;
  email: string | null;
  studentId: string | null;
  gisu: number | null;
}>;

export async function hasActiveRosterMembership(db: MembershipDb, user: MembershipIdentity) {
  if (!user.email || !user.studentId || !user.gisu) return false;
  const roster = await db.studentRosterEntry.findFirst({
    where: { claimedUserId: user.id, active: true },
    select: { name: true, email: true, studentId: true, gisu: true },
  });
  return roster !== null && roster.name === user.name &&
    roster.email.toLowerCase() === user.email.trim().toLowerCase() &&
    roster.studentId === user.studentId && roster.gisu === user.gisu;
}
