type ImportedMutableFields = {
  passwordHash: string;
  name: string;
  email: string | null;
  role: string;
  studentId: string | null;
  gisu: number | null;
  banExpiresAt: Date | null;
  isOnboarded: boolean;
};
type ImportedUserFields = Partial<ImportedMutableFields> & { role: string };
type ImportedUserSnapshot = ImportedMutableFields & { id: string; sessionVersion: number };
type ImportedUserUpdateData = Partial<ImportedMutableFields> & {
  sessionVersion?: { increment: 1 };
};
type ImportedUserCasWhere = { id: string; sessionVersion: number } & Partial<ImportedMutableFields>;
type ImportedUserOperations = {
  findCurrent(id: string): Promise<ImportedUserSnapshot | null>;
  updateIfCurrent(args: {
    where: ImportedUserCasWhere;
    data: ImportedUserUpdateData;
  }): Promise<{ count: number }>;
};

const IMPORTED_MUTABLE_KEYS = [
  "passwordHash",
  "name",
  "email",
  "role",
  "studentId",
  "gisu",
  "banExpiresAt",
  "isOnboarded",
] as const satisfies readonly (keyof ImportedMutableFields)[];

function valuesEqual(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

export function buildPasswordCredentialUpdate(passwordHash: string) {
  return { passwordHash, sessionVersion: { increment: 1 } } as const;
}

export function buildRoleCredentialUpdate<T extends { role: string; studentId: string | null; gisu: number | null }>(fields: T) {
  return { ...fields, sessionVersion: { increment: 1 } };
}

export async function updateImportedUserSafely(
  initial: ImportedUserSnapshot,
  imported: ImportedUserFields,
  operations: ImportedUserOperations,
) {
  let current: ImportedUserSnapshot | null = initial;
  let intendedKeys = IMPORTED_MUTABLE_KEYS.filter(
    (key) => Object.hasOwn(imported, key) && !valuesEqual(initial[key], imported[key]),
  );

  for (let attempt = 0; attempt < 3 && current; attempt += 1) {
    const snapshot = current;
    const updateKeys = intendedKeys.filter((key) => !valuesEqual(snapshot[key], imported[key]));
    if (updateKeys.length === 0) return;

    const where: ImportedUserCasWhere = { id: snapshot.id, sessionVersion: snapshot.sessionVersion };
    const data: ImportedUserUpdateData = {};
    for (const key of updateKeys) {
      Object.assign(where, { [key]: snapshot[key] });
      Object.assign(data, { [key]: imported[key] });
    }

    if (updateKeys.includes("passwordHash") || updateKeys.includes("role")) {
      data.sessionVersion = { increment: 1 };
    }

    const result = await operations.updateIfCurrent({
      where,
      data,
    });
    if (result.count === 1) return;

    const fresh = await operations.findCurrent(initial.id);
    if (!fresh) throw new Error("IMPORT_USER_NOT_FOUND");
    intendedKeys = intendedKeys.filter((key) => valuesEqual(snapshot[key], fresh[key]));
    current = fresh;
  }

  throw new Error("IMPORT_CONCURRENT_UPDATE");
}
