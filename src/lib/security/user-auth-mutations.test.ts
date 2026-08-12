import { describe, expect, it } from "vitest";
import {
  buildImportedUserUpdate,
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

  it("retries an import against fresh auth fields when an optimistic write loses a race", async () => {
    const updates: unknown[] = [];
    const operations = {
        findCurrent: async () => ({ id: "u1", passwordHash: "concurrent", role: "ADMIN", sessionVersion: 4 }),
        updateIfCurrent: async ({ data }: { data: unknown }) => {
          updates.push(data);
          return { count: updates.length === 1 ? 0 : 1 };
        },
    };

    await updateImportedUserSafely(
      { id: "u1", passwordHash: "old", role: "STUDENT", sessionVersion: 3 },
      { passwordHash: "imported", role: "STUDENT", name: "Imported" },
      operations,
    );

    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({
      passwordHash: "imported",
      role: "STUDENT",
      name: "Imported",
      sessionVersion: { increment: 1 },
    });
  });

  it("increments the session version in the same role update", () => {
    expect(buildRoleCredentialUpdate({ role: "TEACHER", studentId: null, gisu: null })).toEqual({
      role: "TEACHER",
      studentId: null,
      gisu: null,
      sessionVersion: { increment: 1 },
    });
  });

  it("increments once when an import changes a password hash or role", () => {
    const existing = { passwordHash: "old", role: "STUDENT" };
    expect(buildImportedUserUpdate(existing, { passwordHash: "new", role: "ADMIN", name: "A" })).toEqual({
      passwordHash: "new",
      role: "ADMIN",
      name: "A",
      sessionVersion: { increment: 1 },
    });
  });

  it("does not import a supplied session version or increment for profile-only changes", () => {
    const existing = { passwordHash: "same", role: "STUDENT" };
    expect(buildImportedUserUpdate(existing, {
      passwordHash: "same",
      role: "STUDENT",
      name: "New name",
      sessionVersion: 999,
    })).toEqual({ passwordHash: "same", role: "STUDENT", name: "New name" });
  });
});
