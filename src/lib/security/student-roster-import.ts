import { isValidStudentId } from "@/lib/student-id";

export const MAX_STUDENT_ROSTER_BYTES = 256 * 1024;
export const MAX_STUDENT_ROSTER_ROWS = 500;

const HEADER = ["academicYear", "gisu", "studentId", "name", "email"] as const;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export type StudentRosterImportEntry = Readonly<{
  academicYear: number;
  gisu: number;
  studentId: string;
  name: string;
  email: string;
}>;

export type ExistingRosterIdentity = StudentRosterImportEntry & Readonly<{
  id: string;
  claimedUserId: string | null;
}>;

export type ExistingStudentIdentity = Readonly<{
  id: string;
  role: string;
  gisu: number | null;
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

function parseBoundedInteger(value: string, minimum: number, maximum: number, code: string) {
  const normalized = value.trim();
  if (!/^\d+$/u.test(normalized)) throw new Error(code);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code);
  return parsed;
}

function normalizeEntry(row: string[]): StudentRosterImportEntry {
  if (row.length !== HEADER.length) throw new Error("ROSTER_INVALID_COLUMNS");
  const academicYear = parseBoundedInteger(row[0], 2020, 2100, "ROSTER_INVALID_ACADEMIC_YEAR");
  const gisu = parseBoundedInteger(row[1], 1, 200, "ROSTER_INVALID_GISU");
  const studentId = row[2].trim();
  const name = row[3].trim().normalize("NFC");
  const email = row[4].trim().toLowerCase();
  if (!isValidStudentId(studentId)) throw new Error("ROSTER_INVALID_STUDENT_ID");
  if (!name || [...name].length > 80 || new TextEncoder().encode(name).byteLength > 240 || CONTROL.test(name)) {
    throw new Error("ROSTER_INVALID_NAME");
  }
  if (!EMAIL.test(email) || email.length > 254 || new TextEncoder().encode(email).byteLength > 254 || CONTROL.test(email)) {
    throw new Error("ROSTER_INVALID_EMAIL");
  }
  return { academicYear, gisu, studentId, name, email };
}

export function parseStudentRosterCsv(value: string): StudentRosterImportEntry[] {
  if (new TextEncoder().encode(value).byteLength > MAX_STUDENT_ROSTER_BYTES) throw new Error("ROSTER_FILE_TOO_LARGE");
  const rows = parseCsvRows(value.startsWith("\ufeff") ? value.slice(1) : value);
  if (rows.length < 2 || !HEADER.every((field, index) => rows[0][index] === field) || rows[0].length !== HEADER.length) {
    throw new Error("ROSTER_INVALID_HEADER");
  }
  const entries = rows.slice(1).map(normalizeEntry);
  if (entries.length === 0 || entries.length > MAX_STUDENT_ROSTER_ROWS) throw new Error("ROSTER_INVALID_ROW_COUNT");
  const academicYears = new Set(entries.map(({ academicYear }) => academicYear));
  if (academicYears.size !== 1) throw new Error("ROSTER_MIXED_ACADEMIC_YEARS");
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

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function planStudentRosterReplacement(
  entries: readonly StudentRosterImportEntry[],
  rosterEntries: readonly ExistingRosterIdentity[],
  existingUsers: readonly ExistingStudentIdentity[] = [],
  now = new Date(),
) {
  if (entries.length === 0) throw new Error("ROSTER_INVALID_ROW_COUNT");
  const academicYear = entries[0].academicYear;
  if (entries.some((entry) => entry.academicYear !== academicYear)) throw new Error("ROSTER_MIXED_ACADEMIC_YEARS");

  const incomingByStudentId = new Map(entries.map((entry) => [entry.studentId, entry]));
  const usersById = new Map(existingUsers.map((user) => [user.id, user]));
  const usersByEmail = new Map<string, ExistingStudentIdentity[]>();
  const authoritativeClaimByEmail = new Map<string, ExistingRosterIdentity>();

  for (const user of existingUsers) {
    const email = normalizeEmail(user.email);
    if (email) usersByEmail.set(email, [...(usersByEmail.get(email) ?? []), user]);
    const studentIdEntry = user.studentId ? incomingByStudentId.get(user.studentId) : undefined;
    if (studentIdEntry && user.gisu === studentIdEntry.gisu && email !== studentIdEntry.email) {
      throw new Error("ROSTER_EXISTING_STUDENT_ID_CONFLICT");
    }
  }

  // A prior, administrator-imported roster is the stable identity chain. User.email is
  // self-editable, so it must never be sufficient to attach a later generation.
  for (const rosterEntry of rosterEntries) {
    if (!rosterEntry.claimedUserId) continue;
    const email = normalizeEmail(rosterEntry.email);
    if (!email) throw new Error("ROSTER_CLAIMED_IDENTITY_CONFLICT");
    const prior = authoritativeClaimByEmail.get(email);
    if (prior && prior.claimedUserId !== rosterEntry.claimedUserId) {
      throw new Error("ROSTER_CLAIMED_IDENTITY_CONFLICT");
    }
    authoritativeClaimByEmail.set(email, rosterEntry);
  }

  const userClaimByEmail = new Map<string, ExistingStudentIdentity>();
  const claimedIncomingByUser = new Map<string, string>();
  for (const entry of entries) {
    const authoritativeClaim = authoritativeClaimByEmail.get(entry.email);
    let user: ExistingStudentIdentity | undefined;
    if (authoritativeClaim) {
      if (authoritativeClaim.gisu !== entry.gisu || !authoritativeClaim.claimedUserId) {
        throw new Error("ROSTER_CLAIMED_IDENTITY_CONFLICT");
      }
      user = usersById.get(authoritativeClaim.claimedUserId);
      if (!user) throw new Error("ROSTER_CLAIMED_IDENTITY_CONFLICT");
      if (normalizeEmail(user.email) !== entry.email) throw new Error("ROSTER_USER_EMAIL_DRIFT");
    } else {
      // First rollout has no authoritative history. Only an exact current cohort,
      // student-number and email match is safe enough to seed the initial claim.
      const candidates = usersByEmail.get(entry.email) ?? [];
      const exact = candidates.filter((candidate) =>
        (candidate.role === "STUDENT" || candidate.role === "BROADCAST") &&
        candidate.studentId === entry.studentId && candidate.gisu === entry.gisu,
      );
      if (candidates.length > 0 && exact.length !== 1) throw new Error("ROSTER_EXISTING_EMAIL_CONFLICT");
      user = exact[0];
    }
    if (!user) continue;
    const priorEmail = claimedIncomingByUser.get(user.id);
    if (priorEmail && priorEmail !== entry.email) throw new Error("ROSTER_CLAIMED_IDENTITY_CONFLICT");
    claimedIncomingByUser.set(user.id, entry.email);
    userClaimByEmail.set(entry.email, user);
  }

  const currentRows = rosterEntries.filter((entry) => entry.academicYear === academicYear);
  const currentClaimedByUser = new Map(currentRows.filter((entry) => entry.claimedUserId).map((entry) => [entry.claimedUserId!, entry]));
  const currentByStudentId = new Map(currentRows.map((entry) => [entry.studentId, entry]));
  const currentByEmail = new Map(currentRows.map((entry) => [entry.email.toLowerCase(), entry]));
  const updateEntries: Array<{ id: string; data: StudentRosterImportEntry & {
    active: true;
    claimedAt: Date | null;
    claimedEmail: string | null;
    claimedUserId: string | null;
    claimedInviteTokenId: null;
  } }> = [];
  const createEntries: Array<StudentRosterImportEntry & {
    active: true;
    claimedAt?: Date;
    claimedEmail?: string;
    claimedUserId?: string;
  }> = [];
  const userUpdates: Array<{ id: string; studentId: string; gisu: number; name: string }> = [];
  const activeUserIds: string[] = [];
  const usedRowIds = new Set<string>();

  const chooseReusableRow = (entry: StudentRosterImportEntry, userId: string | null) => {
    const byStudentId = currentByStudentId.get(entry.studentId);
    const byEmail = currentByEmail.get(entry.email);
    if (byStudentId && byEmail && byStudentId.id !== byEmail.id) throw new Error("ROSTER_CURRENT_ROW_CONFLICT");
    const row = userId ? currentClaimedByUser.get(userId) ?? byStudentId ?? byEmail : byStudentId ?? byEmail;
    if (!row) return null;
    if (usedRowIds.has(row.id)) throw new Error("ROSTER_CURRENT_ROW_CONFLICT");
    if (row.claimedUserId && row.claimedUserId !== userId) throw new Error("ROSTER_CLAIMED_IDENTITY_CONFLICT");
    usedRowIds.add(row.id);
    return row;
  };

  for (const entry of entries) {
    const user = userClaimByEmail.get(entry.email);
    if (!user) {
      const current = chooseReusableRow(entry, null);
      if (current) {
        updateEntries.push({
          id: current.id,
          data: {
            ...entry,
            active: true,
            claimedAt: null,
            claimedEmail: null,
            claimedUserId: null,
            claimedInviteTokenId: null,
          },
        });
      } else {
        createEntries.push({ ...entry, active: true });
      }
      continue;
    }

    const claimedData = {
      ...entry,
      active: true as const,
      claimedAt: now,
      claimedEmail: entry.email,
      claimedUserId: user.id,
    };
    activeUserIds.push(user.id);
    const currentClaim = chooseReusableRow(entry, user.id);
    if (currentClaim) {
      updateEntries.push({ id: currentClaim.id, data: { ...claimedData, claimedInviteTokenId: null } });
    } else {
      createEntries.push(claimedData);
    }
    if (user.role === "STUDENT" || user.role === "BROADCAST") {
      userUpdates.push({ id: user.id, studentId: entry.studentId, gisu: entry.gisu, name: entry.name });
    }
  }

  return { academicYear, updateEntries, createEntries, userUpdates, activeUserIds };
}
