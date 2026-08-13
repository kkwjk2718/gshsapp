type ExistingIdentity = Readonly<{
  id: string;
  userId: string;
  role: string;
  email: string | null;
  studentId: string | null;
}>;
type ImportedIdentity = Readonly<{
  userId: string;
  role: string;
  email: string | null;
  studentId: string | null;
}>;

function assertUnique(values: Array<string | null>, code: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim().toLowerCase();
    if (seen.has(normalized)) throw new Error(code);
    seen.add(normalized);
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
