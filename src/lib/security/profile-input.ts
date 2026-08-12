type ProfileInput = Readonly<{ name: string; email: string }>;
type ProfileResult =
  | Readonly<{ ok: true; data: { name: string; email: string } }>
  | Readonly<{ ok: false; error: string }>;

const CONTROLS = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateSelfProfileInput(input: ProfileInput): ProfileResult {
  const name = input.name.trim().normalize("NFC");
  const email = input.email.trim().toLowerCase().normalize("NFC");

  if (!name || CONTROLS.test(name) || [...name].length > 80 || new TextEncoder().encode(name).byteLength > 240) {
    return { ok: false, error: "Invalid name" };
  }
  if (!email || CONTROLS.test(email) || email.length > 254 || !EMAIL.test(email)) {
    return { ok: false, error: "Invalid email" };
  }

  return { ok: true, data: { name, email } };
}
