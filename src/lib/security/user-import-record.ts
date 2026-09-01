import { isValidStudentId } from "@/lib/student-id";
import { isUserRole, type UserRole } from "@/lib/user-roles";

const LOGIN_ID = /^[A-Za-z0-9._-]{3,64}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const BCRYPT_HASH = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/u;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export type ImportedUserRecord = Readonly<{
  userId: string;
  passwordHash?: string;
  name: string;
  email: string | null;
  role: UserRole;
  studentId: string | null;
  gisu: number | null;
  banExpiresAt: Date | null;
  isOnboarded: boolean;
}>;

function optionalString(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value.trim() : undefined;
}

function parseBcryptHash(value: unknown, required: boolean): string | null | undefined {
  if (value === undefined || value === null || value === "") return required ? null : undefined;
  if (typeof value !== "string") return null;
  const match = BCRYPT_HASH.exec(value);
  if (!match) return null;
  const cost = Number(match[1]);
  return cost >= 10 && cost <= 14 ? value : null;
}

export function parseImportedUserRecord(value: unknown, version: number): ImportedUserRecord | null {
  if (!value || typeof value !== "object" || (version !== 1 && version !== 2)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.userId !== "string" || typeof raw.name !== "string" || typeof raw.role !== "string") return null;
  const userId = raw.userId.trim();
  const name = raw.name.trim().normalize("NFC");
  if (!LOGIN_ID.test(userId) || !name || [...name].length > 80 || new TextEncoder().encode(name).byteLength > 240 || CONTROLS.test(name) || !isUserRole(raw.role)) return null;

  const emailValue = optionalString(raw.email);
  if (emailValue === undefined) return null;
  const email = emailValue?.toLowerCase() ?? null;
  if (email && (!EMAIL.test(email) || email.length > 254 || new TextEncoder().encode(email).byteLength > 254 || CONTROLS.test(email))) return null;

  const studentIdValue = optionalString(raw.studentId);
  if (studentIdValue === undefined) return null;
  const studentId = studentIdValue ?? null;
  if (studentId && !isValidStudentId(studentId)) return null;
  if (raw.role === "STUDENT" && !studentId) return null;
  if (raw.role === "TEACHER" && studentId) return null;

  const gisu = raw.gisu === null || raw.gisu === undefined ? null : raw.gisu;
  if (gisu !== null && (!Number.isSafeInteger(gisu) || (gisu as number) < 1 || (gisu as number) > 200)) return null;
  if (raw.role === "STUDENT" && gisu === null) return null;
  if (raw.role === "TEACHER" && gisu !== null) return null;

  let banExpiresAt: Date | null = null;
  if (raw.banExpiresAt !== null && raw.banExpiresAt !== undefined && raw.banExpiresAt !== "") {
    if (typeof raw.banExpiresAt !== "string" || raw.banExpiresAt.length > 40 || CONTROLS.test(raw.banExpiresAt) || !ISO_UTC_TIMESTAMP.test(raw.banExpiresAt)) return null;
    banExpiresAt = new Date(raw.banExpiresAt);
    if (!Number.isFinite(banExpiresAt.getTime())) return null;
    const canonicalInput = raw.banExpiresAt.includes(".") ? raw.banExpiresAt : raw.banExpiresAt.replace("Z", ".000Z");
    if (banExpiresAt.toISOString() !== canonicalInput) return null;
  }

  if (raw.isOnboarded !== undefined && typeof raw.isOnboarded !== "boolean") return null;
  const passwordHash = parseBcryptHash(raw.passwordHash, version === 1);
  if (passwordHash === null) return null;
  return {
    userId, ...(passwordHash ? { passwordHash } : {}), name, email, role: raw.role,
    studentId, gisu: gisu as number | null, banExpiresAt, isOnboarded: raw.isOnboarded ?? false,
  };
}
