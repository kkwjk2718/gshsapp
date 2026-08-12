import { describe, expect, it, vi } from "vitest";

import { DUMMY_PASSWORD_HASH, verifyLoginCandidate } from "./login-verification";

describe("login password verification", () => {
  it("performs the same password comparison for an unknown identifier", async () => {
    const compare = vi.fn().mockResolvedValue(false);
    await expect(verifyLoginCandidate("submitted", null, compare)).resolves.toBeNull();
    expect(compare).toHaveBeenCalledOnce();
    expect(compare).toHaveBeenCalledWith("submitted", DUMMY_PASSWORD_HASH);
  });

  it("returns a known user only after its hash verifies", async () => {
    const user = { id: "u1", passwordHash: "stored-hash" };
    const compare = vi.fn().mockResolvedValue(true);
    await expect(verifyLoginCandidate("submitted", user, compare)).resolves.toBe(user);
    expect(compare).toHaveBeenCalledWith("submitted", "stored-hash");

    compare.mockResolvedValue(false);
    await expect(verifyLoginCandidate("wrong", user, compare)).resolves.toBeNull();
  });
});
