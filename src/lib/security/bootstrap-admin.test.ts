import { describe, expect, it, vi } from "vitest";

import { BootstrapAdminError, bootstrapAdmin } from "./bootstrap-admin";

function database(existing: unknown = null) {
  return {
    user: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "created" }),
    },
  };
}

const validEnvironment = {
  BOOTSTRAP_ADMIN_USER_ID: "initial-admin",
  BOOTSTRAP_ADMIN_EMAIL: "admin@example.invalid",
  BOOTSTRAP_ADMIN_PASSWORD: "Sufficiently-long-random-passphrase-42!",
  BOOTSTRAP_ADMIN_NAME: "Initial Administrator",
};

describe("create-once administrator bootstrap", () => {
  it.each([
    {},
    { ...validEnvironment, BOOTSTRAP_ADMIN_PASSWORD: "short" },
    { ...validEnvironment, BOOTSTRAP_ADMIN_PASSWORD: "replace-with-a-long-random-secret" },
    { ...validEnvironment, BOOTSTRAP_ADMIN_EMAIL: "not-email" },
  ])("rejects missing, weak, placeholder or malformed environment input", async (environment) => {
    const db = database();
    await expect(bootstrapAdmin(environment, db, vi.fn())).rejects.toBeInstanceOf(BootstrapAdminError);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("creates an admin once with a password hash and never returns the credential", async () => {
    const db = database();
    const hash = vi.fn().mockResolvedValue("opaque-hash");
    const result = await bootstrapAdmin(validEnvironment, db, hash);
    expect(result).toEqual({ created: true });
    expect(db.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "initial-admin",
      email: "admin@example.invalid",
      role: "ADMIN",
      passwordHash: "opaque-hash",
    }) });
    expect(JSON.stringify(result)).not.toContain(validEnvironment.BOOTSTRAP_ADMIN_PASSWORD);
    expect(JSON.stringify(result)).not.toContain("opaque-hash");
  });

  it("refuses to update any existing login or email", async () => {
    const db = database({ id: "existing" });
    const hash = vi.fn();
    await expect(bootstrapAdmin(validEnvironment, db, hash)).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(hash).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
