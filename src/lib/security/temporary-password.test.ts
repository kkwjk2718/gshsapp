import { describe, expect, it } from "vitest";

import { validatePassword } from "./password-policy";
import { generateTemporaryPassword } from "./temporary-password";

describe("temporary password generation", () => {
  it("uses independent CSPRNG-shaped values accepted by the central policy", () => {
    const values = Array.from({ length: 128 }, () => generateTemporaryPassword());

    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(validatePassword(value)).toEqual({ ok: true });
    }
  });
});
