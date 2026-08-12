type ExistingAuthFields = { passwordHash: string; role: string };
type ImportedUserFields = Record<string, unknown> & { passwordHash?: string; role: string };
type ImportedUserSnapshot = ExistingAuthFields & { id: string; sessionVersion: number };
type ImportedUserOperations = {
  findCurrent(id: string): Promise<ImportedUserSnapshot | null>;
  updateIfCurrent(args: {
    id: string;
    sessionVersion: number;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
};

export function buildPasswordCredentialUpdate(passwordHash: string) {
  return { passwordHash, sessionVersion: { increment: 1 } } as const;
}

export function buildRoleCredentialUpdate<T extends { role: string; studentId: string | null; gisu: number | null }>(fields: T) {
  return { ...fields, sessionVersion: { increment: 1 } };
}

export function buildImportedUserUpdate(existing: ExistingAuthFields, imported: ImportedUserFields) {
  const { sessionVersion: _ignored, ...safeImported } = imported;
  const authChanged =
    (typeof safeImported.passwordHash === "string" && safeImported.passwordHash !== existing.passwordHash) ||
    safeImported.role !== existing.role;

  return authChanged
    ? { ...safeImported, sessionVersion: { increment: 1 } }
    : safeImported;
}

export async function updateImportedUserSafely(
  initial: ImportedUserSnapshot,
  imported: ImportedUserFields,
  operations: ImportedUserOperations,
) {
  let current: ImportedUserSnapshot | null = initial;

  for (let attempt = 0; attempt < 3 && current; attempt += 1) {
    const result = await operations.updateIfCurrent({
      id: current.id,
      sessionVersion: current.sessionVersion,
      data: buildImportedUserUpdate(current, imported),
    });
    if (result.count === 1) return;

    current = await operations.findCurrent(initial.id);
  }

  throw new Error("IMPORT_CONCURRENT_UPDATE");
}
