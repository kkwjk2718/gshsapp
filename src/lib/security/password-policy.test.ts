import { describe, expect, it } from "vitest";
import { validatePassword } from "./password-policy";

describe("validatePassword", () => {
  it("accepts a non-common password with 12 Unicode code points", () => {
    expect(validatePassword("강한암호문구입니다!12")).toEqual({ ok: true });
  });

  it("counts Unicode code points instead of UTF-16 code units", () => {
    expect(validatePassword("😀😀😀😀😀😀abcdef")).toEqual({ ok: true });
    expect(validatePassword("😀😀😀😀😀😀abcde")).toMatchObject({ ok: false, code: "TOO_SHORT" });
  });

  it("rejects values longer than bcrypt's 72 UTF-8 byte boundary", () => {
    expect(validatePassword("가".repeat(25))).toMatchObject({ ok: false, code: "TOO_LONG" });
  });

  it.each(["password", "123456789012", "qwerty123456", "password1234"])(
    "rejects the common password %s",
    (password) => {
      expect(validatePassword(password)).toMatchObject({ ok: false, code: "COMMON" });
    },
  );

  it("rejects NUL bytes", () => {
    expect(validatePassword("valid-looking\0password")).toMatchObject({ ok: false, code: "NUL" });
  });
});
