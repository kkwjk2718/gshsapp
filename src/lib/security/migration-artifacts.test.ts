import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsRoot = join(process.cwd(), "prisma", "migrations");
const baselinePath = join(migrationsRoot, "20260813000000_baseline", "migration.sql");
const securityPath = join(migrationsRoot, "20260813001000_security_hardening", "migration.sql");

function columns(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>).map((row) => row.name);
}

describe("reviewed production migrations", () => {
  it("creates a fresh database through the baseline and security migration", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(baselinePath, "utf8"));
    db.exec(readFileSync(securityPath, "utf8"));

    expect(columns(db, "User")).toEqual(expect.arrayContaining(["sessionVersion", "mustChangePassword"]));
    expect(columns(db, "InviteToken")).toEqual(expect.arrayContaining(["tokenHash", "boundEmail", "boundStudentId", "rosterClaimRequired", "rosterEntryId"]));
    expect(columns(db, "StudentRosterEntry")).toEqual(expect.arrayContaining(["id", "academicYear", "gisu", "studentId", "email"]));
    expect((db.prepare("PRAGMA foreign_key_check").all())).toEqual([]);
    db.close();
  });

  it("preserves legacy users, invitations, and audit evidence while applying the security migration", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(baselinePath, "utf8"));
    db.exec(`
      INSERT INTO "User" ("id", "userId", "passwordHash", "name", "email", "role")
      VALUES ('user-1', 'student01', 'legacy-hash', 'Student', 'student@example.com', 'STUDENT');
      INSERT INTO "InviteToken" ("id", "token", "targetRole", "createdBy", "isUsed", "usedByUserId")
      VALUES ('invite-used', 'legacy-used-token', 'STUDENT', 'admin', true, 'user-1');
      INSERT INTO "InviteToken" ("id", "token", "targetRole", "createdBy")
      VALUES ('invite-unused', 'legacy-low-entropy-token', 'STUDENT', 'admin');
      INSERT INTO "TokenDistributionLog" ("id", "source", "recipientEmail", "targetRole", "inviteTokenId", "status", "createdBy")
      VALUES ('distribution-1', 'ADMIN_MANUAL', 'student@example.com', 'STUDENT', 'invite-unused', 'SENT', 'admin');
      INSERT INTO "AuditLog" ("id", "actorId", "action")
      VALUES ('audit-1', 'user-1', 'LEGACY_EVENT');
    `);

    db.exec(readFileSync(securityPath, "utf8"));

    expect(db.prepare('SELECT "userId", "sessionVersion", "mustChangePassword" FROM "User"').get()).toEqual({
      userId: "student01",
      sessionVersion: 1,
      mustChangePassword: 0,
    });
    expect(db.prepare('SELECT "token", "tokenHash" FROM "InviteToken"').get()).toEqual({
      token: null,
      tokenHash: null,
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM "InviteToken"').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT "inviteTokenId" FROM "TokenDistributionLog" WHERE "id" = ?').get("distribution-1"))
      .toEqual({ inviteTokenId: null });
    expect(db.prepare('SELECT "actorId", "action" FROM "AuditLog"').get()).toEqual({
      actorId: "user-1",
      action: "LEGACY_EVENT",
    });

    db.exec("PRAGMA foreign_keys=ON; DELETE FROM \"User\" WHERE \"id\" = 'user-1';");
    expect(db.prepare('SELECT "actorId" FROM "AuditLog" WHERE "id" = ?').get("audit-1")).toEqual({ actorId: null });
    expect((db.prepare("PRAGMA foreign_key_check").all())).toEqual([]);
    db.close();
  });
});
