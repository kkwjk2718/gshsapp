import { isValidStudentId } from "@/lib/student-id";

export const MAX_STUDENT_ROSTER_BYTES = 256 * 1024;
export const MAX_STUDENT_ROSTER_ROWS = 500;

const HEADER = ["studentId", "name", "email"] as const;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export type StudentRosterImportEntry = Readonly<{
  studentId: string;
  name: string;
  email: string;
}>;
type ExistingStudentIdentity = Readonly<{
  id: string;
  studentId: string | null;
  name: string;
  email: string | null;
}>;

function parseCsvRows(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const pushField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    if (rows.length > MAX_STUDENT_ROSTER_ROWS + 1) throw new Error("ROSTER_TOO_MANY_ROWS");
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"') {
        if (value[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("ROSTER_INVALID_CSV");
    }
    if (character === '"') {
      if (field) throw new Error("ROSTER_INVALID_CSV");
      quoted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && value[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("ROSTER_INVALID_CSV");
  if (field || row.length > 0 || afterQuote) pushRow();
  return rows;
}

function normalizeEntry(row: string[]): StudentRosterImportEntry {
  if (row.length !== HEADER.length) throw new Error("ROSTER_INVALID_COLUMNS");
  const studentId = row[0].trim();
  const name = row[1].trim().normalize("NFC");
  const email = row[2].trim().toLowerCase();
  if (!isValidStudentId(studentId)) throw new Error("ROSTER_INVALID_STUDENT_ID");
  if (!name || [...name].length > 80 || new TextEncoder().encode(name).byteLength > 240 || CONTROL.test(name)) {
    throw new Error("ROSTER_INVALID_NAME");
  }
  if (!EMAIL.test(email) || email.length > 254 || new TextEncoder().encode(email).byteLength > 254 || CONTROL.test(email)) {
    throw new Error("ROSTER_INVALID_EMAIL");
  }
  return { studentId, name, email };
}

export function parseStudentRosterCsv(value: string): StudentRosterImportEntry[] {
  if (new TextEncoder().encode(value).byteLength > MAX_STUDENT_ROSTER_BYTES) throw new Error("ROSTER_FILE_TOO_LARGE");
  const rows = parseCsvRows(value.startsWith("\ufeff") ? value.slice(1) : value);
  if (rows.length < 2 || !HEADER.every((field, index) => rows[0][index] === field) || rows[0].length !== HEADER.length) {
    throw new Error("ROSTER_INVALID_HEADER");
  }
  const entries = rows.slice(1).map(normalizeEntry);
  if (entries.length === 0 || entries.length > MAX_STUDENT_ROSTER_ROWS) throw new Error("ROSTER_INVALID_ROW_COUNT");
  const studentIds = new Set<string>();
  const emails = new Set<string>();
  for (const entry of entries) {
    if (studentIds.has(entry.studentId)) throw new Error("ROSTER_DUPLICATE_STUDENT_ID");
    if (emails.has(entry.email)) throw new Error("ROSTER_DUPLICATE_EMAIL");
    studentIds.add(entry.studentId);
    emails.add(entry.email);
  }
  return entries;
}

export function planStudentRosterReplacement(
  entries: readonly StudentRosterImportEntry[],
  claimedEntries: readonly StudentRosterImportEntry[],
  existingStudents: readonly ExistingStudentIdentity[] = [],
  now = new Date(),
) {
  const incomingByStudentId = new Map(entries.map((entry) => [entry.studentId, entry]));
  const incomingByEmail = new Map(entries.map((entry) => [entry.email, entry]));
  const existingByStudentId = new Map<string, ExistingStudentIdentity[]>();
  const existingClaims = new Map<string, ExistingStudentIdentity>();
  for (const user of existingStudents) {
    if (user.email) {
      const emailEntry = incomingByEmail.get(user.email.trim().toLowerCase());
      if (emailEntry && emailEntry.studentId !== user.studentId) throw new Error("ROSTER_EXISTING_EMAIL_CONFLICT");
    }
    if (!user.studentId || !incomingByStudentId.has(user.studentId)) continue;
    const matches = existingByStudentId.get(user.studentId) ?? [];
    matches.push(user);
    existingByStudentId.set(user.studentId, matches);
  }
  for (const [studentId, users] of existingByStudentId) {
    if (users.length !== 1) throw new Error("ROSTER_EXISTING_STUDENT_ID_CONFLICT");
    const user = users[0];
    const incoming = incomingByStudentId.get(studentId)!;
    if (!user.email || user.email.trim().toLowerCase() !== incoming.email || user.name.trim().normalize("NFC") !== incoming.name) {
      throw new Error("ROSTER_EXISTING_IDENTITY_CONFLICT");
    }
    existingClaims.set(studentId, user);
  }
  const claimedByEmail = new Map(claimedEntries.map((entry) => [entry.email.toLowerCase(), entry]));
  const reactivateStudentIds: string[] = [];
  for (const claimed of claimedEntries) {
    const incoming = incomingByStudentId.get(claimed.studentId);
    if (incoming) {
      if (incoming.name !== claimed.name || incoming.email !== claimed.email.toLowerCase()) {
        throw new Error("ROSTER_CLAIMED_IDENTITY_CONFLICT");
      }
      reactivateStudentIds.push(claimed.studentId);
    }
  }
  const createEntries = entries.flatMap((entry) => {
    const claimedForEmail = claimedByEmail.get(entry.email);
    if (claimedForEmail && claimedForEmail.studentId !== entry.studentId) {
      throw new Error("ROSTER_CLAIMED_EMAIL_CONFLICT");
    }
    if (reactivateStudentIds.includes(entry.studentId)) return [];
    const existing = existingClaims.get(entry.studentId);
    return [{
      ...entry,
      ...(existing ? {
        claimedAt: now,
        claimedEmail: entry.email,
        claimedUserId: existing.id,
      } : {}),
    }];
  });
  return { reactivateStudentIds, createEntries };
}
