import { describe, expect, it } from "vitest";
import {
  buildPasswordCredentialUpdate,
  buildRoleCredentialUpdate,
  updateImportedUserSafely,
} from "./user-auth-mutations";

describe("credential mutation writes", () => {
  it("increments the session version in the same password update", () => {
    expect(buildPasswordCredentialUpdate("new-hash")).toEqual({
      passwordHash: "new-hash",
      sessionVersion: { increment: 1 },
    });
  });

  it("preserves a concurrent profile, gisu, and ban change instead of replaying a stale payload", async () => {
    const writes: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
    const operations = {
      findCurrent: async () => ({
        id: "u1", passwordHash: "same", role: "STUDENT", sessionVersion: 3,
        name: "Concurrent", email: "new@example.com", studentId: "1101", gisu: 43,
        banExpiresAt: new Date("2026-09-01"), isOnboarded: true,
      }),
      updateIfCurrent: async (write: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        writes.push(write);
        return { count: writes.length === 1 ? 0 : 1 };
      },
    };

    await updateImportedUserSafely(
      {
        id: "u1", passwordHash: "same", role: "STUDENT", sessionVersion: 3,
        name: "Old", email: "old@example.com", studentId: "1101", gisu: 42,
        banExpiresAt: null, isOnboarded: true,
      },
      {
        passwordHash: "same", role: "STUDENT", name: "Imported", email: "import@example.com",
        studentId: "1101", gisu: 41, banExpiresAt: new Date("2026-08-20"), isOnboarded: true,
      },
      operations,
    );

    expect(writes).toHaveLength(1);
    expect(writes[0].where).toMatchObject({ name: "Old", email: "old@example.com", gisu: 42, banExpiresAt: null });
    expect(writes[0].data).toMatchObject({ name: "Imported", email: "import@example.com", gisu: 41 });
  });

  it("preserves a concurrent password while applying an unaffected role change with one revocation increment", async () => {
    const writes: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
    const initial = {
      id: "u1", passwordHash: "old", role: "STUDENT", sessionVersion: 3,
      name: "Old", email: null, studentId: "1101", gisu: 42, banExpiresAt: null, isOnboarded: true,
    };
    await updateImportedUserSafely(initial, {
      passwordHash: "imported", role: "ADMIN", name: "Old", email: null,
      studentId: "1101", gisu: 42, banExpiresAt: null, isOnboarded: true,
    }, {
      findCurrent: async () => ({ ...initial, passwordHash: "concurrent", sessionVersion: 4 }),
      updateIfCurrent: async (write) => {
        writes.push(write);
        return { count: writes.length === 1 ? 0 : 1 };
      },
    });

    expect(writes).toHaveLength(2);
    expect(writes[1].data).toEqual({
      role: "ADMIN",
      sessionVersion: { increment: 1 },
    });
    expect(writes[1].data).not.toHaveProperty("passwordHash");
  });

  it("increments the session version in the same role update", () => {
    expect(buildRoleCredentialUpdate({ role: "TEACHER", studentId: null, gisu: null })).toEqual({
      role: "TEACHER",
      studentId: null,
      gisu: null,
      sessionVersion: { increment: 1 },
    });
  });

});
