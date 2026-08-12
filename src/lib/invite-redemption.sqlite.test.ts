import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import { InviteRedemptionError, redeemInvite } from "./invite-redemption";

type SqliteDatabase = { exec(sql: string): void; close(): void };
type SqliteModule = { DatabaseSync: new (filename: string) => SqliteDatabase };
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as SqliteModule;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

function provisionDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), "gshs-invite-race-"));
  temporaryDirectories.push(directory);
  const filename = path.join(directory, "race.db");
  const database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 1000;
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "sessionVersion" INTEGER NOT NULL DEFAULT 1,
      "mustChangePassword" INTEGER NOT NULL DEFAULT 0,
      "name" TEXT NOT NULL,
      "email" TEXT,
      "role" TEXT NOT NULL DEFAULT 'STUDENT',
      "studentId" TEXT,
      "gisu" INTEGER,
      "banExpiresAt" DATETIME,
      "isOnboarded" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");
    CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
    CREATE TABLE "InviteToken" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token" TEXT,
      "tokenHash" TEXT,
      "boundEmail" TEXT,
      "boundStudentId" TEXT,
      "targetRole" TEXT NOT NULL,
      "targetGisu" INTEGER,
      "isUsed" INTEGER NOT NULL DEFAULT 0,
      "createdBy" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "batchId" TEXT,
      "usedByUserId" TEXT
    );
    CREATE UNIQUE INDEX "InviteToken_token_key" ON "InviteToken"("token");
    CREATE UNIQUE INDEX "InviteToken_tokenHash_key" ON "InviteToken"("tokenHash");
    CREATE UNIQUE INDEX "InviteToken_usedByUserId_key" ON "InviteToken"("usedByUserId");
  `);
  database.close();
  return `file:${filename.replace(/\\/g, "/")}`;
}

describe("file-backed SQLite invite claim", () => {
  it("allows exactly one account when two clients redeem the same token concurrently", async () => {
    const databaseUrl = provisionDatabase();
    const first = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const second = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await first.inviteToken.create({
        data: { tokenHash: "race-digest", targetRole: "STUDENT", targetGisu: 40, createdBy: "admin" },
      });
      const attempt = (client: PrismaClient, suffix: string) => redeemInvite(client, {
        presentedSecret: "race-secret",
        tokenHash: "race-digest",
        legacyToken: null,
        now: new Date(),
        validateInvite: () => undefined,
        userData: { userId: `student-${suffix}`, passwordHash: "hash", name: `Student ${suffix}` },
      });

      const results = await Promise.allSettled([attempt(first, "a"), attempt(second, "b")]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(rejection?.reason).toBeInstanceOf(InviteRedemptionError);
      expect(await first.user.count()).toBe(1);
      expect(await first.inviteToken.findFirst({ select: { isUsed: true, usedByUserId: true } }))
        .toMatchObject({ isUsed: true, usedByUserId: expect.any(String) });
    } finally {
      await Promise.all([first.$disconnect(), second.$disconnect()]);
    }
  });
});
