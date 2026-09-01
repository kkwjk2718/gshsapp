import type { UserRole } from "@/lib/user-roles";

type RosterIdentity = Readonly<{
  studentId: string;
  gisu: number;
  name: string;
  email: string;
}>;

export function resolveRosterGovernedRoleChange(input: Readonly<{
  targetRole: string;
  currentRole: string;
  studentIdInput: string;
  userName: string;
  userEmail: string | null;
  roster: RosterIdentity | null;
}>): { role: UserRole; studentId: string; gisu: number } | null {
  if (input.targetRole !== "STUDENT" && input.targetRole !== "BROADCAST") return null;
  const roster = input.roster;
  const identityMatches = roster && input.userName === roster.name &&
    input.userEmail?.trim().toLowerCase() === roster.email.toLowerCase();
  if (!identityMatches) throw new Error("ACTIVE_ROSTER_REQUIRED");
  if (input.targetRole === "BROADCAST" && input.currentRole !== "STUDENT") {
    throw new Error("ACTIVE_ROSTER_REQUIRED");
  }
  if (input.targetRole === "STUDENT" && input.studentIdInput !== roster.studentId) {
    throw new Error("ACTIVE_ROSTER_REQUIRED");
  }
  return { role: input.targetRole, studentId: roster.studentId, gisu: roster.gisu };
}
