type ExistingIdentity = Readonly<{
  id: string;
  userId: string;
  role: string;
  email: string | null;
  studentId: string | null;
  name?: string;
  gisu?: number | null;
}>;
type ImportedIdentity = Readonly<{
  userId: string;
  role: string;
  email: string | null;
  studentId: string | null;
  name?: string;
  gisu?: number | null;
}>;

type ActiveRosterIdentity = Readonly<{
  claimedUserId: string | null;
  name: string;
  email: string;
  studentId: string;
  gisu: number;
}>;

function isRosterRole(role: string) {
  return role === "STUDENT" || role === "BROADCAST";
}

function assertUnique(values: Array<string | null>, code: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim().toLowerCase();
    if (seen.has(normalized)) throw new Error(code);
    seen.add(normalized);
  }
}

export function validateRosterGovernedUserImports(
  existing: readonly ExistingIdentity[],
  imported: readonly ImportedIdentity[],
  activeRoster: readonly ActiveRosterIdentity[],
) {
  const existingByLogin = new Map(existing.map((user) => [user.userId, user]));
  const rosterByUser = new Map<string, ActiveRosterIdentity>();
  for (const roster of activeRoster) {
    if (!roster.claimedUserId) continue;
    if (rosterByUser.has(roster.claimedUserId)) throw new Error("IMPORT_AMBIGUOUS_ROSTER_CLAIM");
    rosterByUser.set(roster.claimedUserId, roster);
  }

  for (const user of imported) {
    if (!isRosterRole(user.role)) continue;
    const current = existingByLogin.get(user.userId);
    // Account backup import is not an enrollment path. New student identities and
    // role transitions must go through the authoritative roster workflow.
    if (!current || current.role !== user.role || !isRosterRole(current.role)) {
      throw new Error("IMPORT_ROSTER_ENROLLMENT_FORBIDDEN");
    }
    const roster = rosterByUser.get(current.id);
    if (!roster || roster.name !== user.name || roster.email.toLowerCase() !== user.email?.toLowerCase() ||
        roster.studentId !== user.studentId || roster.gisu !== user.gisu) {
      throw new Error("IMPORT_ROSTER_IDENTITY_MISMATCH");
    }
  }
}

export function validateAtomicUserImportPlan(
  existing: readonly ExistingIdentity[],
  imported: readonly ImportedIdentity[],
  actor: Pick<ExistingIdentity, "id" | "userId">,
) {
  const final = new Map(existing.map((user) => [user.userId, { ...user }]));
  for (const user of imported) {
    const current = final.get(user.userId);
    final.set(user.userId, { id: current?.id ?? `new:${user.userId}`, ...user });
  }
  const actorAfter = final.get(actor.userId);
  if (!actorAfter || actorAfter.id !== actor.id || actorAfter.role !== "ADMIN") throw new Error("IMPORT_ACTOR_ROLE");
  const finalUsers = [...final.values()];
  if (!finalUsers.some((user) => user.role === "ADMIN")) throw new Error("IMPORT_LAST_ADMIN");
  assertUnique(finalUsers.map((user) => user.email), "IMPORT_DUPLICATE_EMAIL");
  assertUnique(finalUsers.filter((user) => user.role === "STUDENT").map((user) => user.studentId), "IMPORT_DUPLICATE_STUDENT_ID");
}
