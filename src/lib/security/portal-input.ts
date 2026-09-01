import { isValidStudentId } from "@/lib/student-id";
import { isValidBcryptInput } from "@/lib/security/password-policy";

const CONTROLS = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export type PortalInviteInput = Readonly<{ name: string; studentId: string; email: string }>;

export function validatePortalPasswordInput(value: unknown): string | null {
  return isValidBcryptInput(value) && !CONTROLS.test(value) ? value : null;
}

export function parsePortalInviteInput(input: Readonly<{ name: unknown; studentId: unknown; email: unknown }>): PortalInviteInput | null {
  if (typeof input.name !== "string" || typeof input.studentId !== "string" || typeof input.email !== "string") return null;
  const name = input.name.trim().normalize("NFC");
  const studentId = input.studentId.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || [...name].length > 80 || new TextEncoder().encode(name).byteLength > 240 || CONTROLS.test(name) ||
      !isValidStudentId(studentId) || !EMAIL.test(email) || email.length > 254 ||
      new TextEncoder().encode(email).byteLength > 254 || CONTROLS.test(email)) return null;
  return { name, studentId, email };
}
