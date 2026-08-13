import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";
import { parseStudentRosterCsv } from "@/lib/security/student-roster-import";
import { replaceStudentRosterInTransaction } from "@/lib/security/student-roster-replacement";
import { hasActiveRosterMembership } from "@/lib/student-membership";

type SqliteDatabase = { exec(sql: string): void; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as SqliteModule;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("suspended-service roster bootstrap", () => {
  it("migrates, imports atomically, audits, and establishes the membership gate before unsuspension", async () => {
    expect(MEMBER_SERVICE_SUSPENDED).toBe(true);
    const root = mkdtempSync(path.join(tmpdir(), "gshs-roster-bootstrap-"));
    roots.push(root);
    const databasePath = path.join(root, "bootstrap.db");
    const sqlite = new DatabaseSync(databasePath);
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations/20260813000000_baseline/migration.sql"), "utf8"));
    sqlite.exec(`
      INSERT INTO "User" ("id","userId","passwordHash","name","email","role","studentId","gisu","isOnboarded")
      VALUES
        ('admin-id','admin','hash','Admin','admin@example.com','ADMIN',NULL,NULL,1),
        ('student-id','student','hash','Roster Student','student@example.com','STUDENT','1304',42,1),
        ('omitted-id','omitted','hash','Omitted','omitted@example.com','STUDENT','1305',42,1);
    `);
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations/20260813001000_security_hardening/migration.sql"), "utf8"));
    sqlite.close();

    const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replaceAll("\\", "/")}` } } });
    try {
      const entries = parseStudentRosterCsv([
        "academicYear,gisu,studentId,name,email",
        "2026,42,1304,Roster Student,student@example.com",
      ].join("\n"));
      await prisma.$transaction((tx) => replaceStudentRosterInTransaction(tx, entries, "admin-id"));

      const enrolled = await prisma.user.findUniqueOrThrow({ where: { id: "student-id" } });
      const omitted = await prisma.user.findUniqueOrThrow({ where: { id: "omitted-id" } });
      expect(await hasActiveRosterMembership(prisma as never, enrolled)).toBe(true);
      expect(await hasActiveRosterMembership(prisma as never, omitted)).toBe(false);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: "omitted-id" }, select: { sessionVersion: true } }))
        .toEqual({ sessionVersion: 2 });
      expect(await prisma.auditLog.findFirst({ where: { action: "STUDENT_ROSTER_REPLACED" } }))
        .toMatchObject({ actorId: "admin-id", targetId: "year:2026:rows:1" });
    } finally {
      await prisma.$disconnect();
    }
  });
});
