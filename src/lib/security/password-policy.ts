export type PasswordPolicyErrorCode = "TOO_SHORT" | "TOO_LONG" | "COMMON" | "NUL";

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; code: PasswordPolicyErrorCode; message: string };

const COMMON_PASSWORDS = new Set([
  "password",
  "password1234",
  "qwerty123456",
  "123456789012",
  "letmein123456",
]);

export function validatePassword(password: string): PasswordPolicyResult {
  if (password.includes("\0")) {
    return { ok: false, code: "NUL", message: "비밀번호에는 NUL 문자를 사용할 수 없습니다." };
  }

  if (COMMON_PASSWORDS.has(password.normalize("NFKC").toLocaleLowerCase("en-US"))) {
    return { ok: false, code: "COMMON", message: "널리 사용되는 비밀번호는 사용할 수 없습니다." };
  }

  if ([...password].length < 12) {
    return { ok: false, code: "TOO_SHORT", message: "비밀번호는 12자 이상이어야 합니다." };
  }

  if (new TextEncoder().encode(password).byteLength > 72) {
    return { ok: false, code: "TOO_LONG", message: "비밀번호는 UTF-8 기준 72바이트 이하여야 합니다." };
  }

  return { ok: true };
}
