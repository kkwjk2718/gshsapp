-- Expand the authentication and invitation schema while preserving all rows.
-- This migration is intentionally compatible with the pre-hardening application:
-- old binaries ignore the added columns and nullable legacy token storage.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "studentId" TEXT,
    "gisu" INTEGER,
    "banExpiresAt" DATETIME,
    "isOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("banExpiresAt", "createdAt", "email", "gisu", "id", "isOnboarded", "name", "passwordHash", "role", "studentId", "userId")
SELECT "banExpiresAt", "createdAt", "email", "gisu", "id", "isOnboarded", "name", "passwordHash", "role", "studentId", "userId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "new_InviteToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT,
    "tokenHash" TEXT,
    "boundEmail" TEXT,
    "boundStudentId" TEXT,
    "rosterClaimRequired" BOOLEAN NOT NULL DEFAULT false,
    "targetRole" TEXT NOT NULL,
    "targetGisu" INTEGER,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT,
    "usedByUserId" TEXT,
    CONSTRAINT "InviteToken_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TokenBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InviteToken_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InviteToken" ("batchId", "createdAt", "createdBy", "id", "isUsed", "targetGisu", "targetRole", "token", "usedByUserId")
SELECT "batchId", "createdAt", "createdBy", "id", "isUsed", "targetGisu", "targetRole", "token", "usedByUserId" FROM "InviteToken";
DROP TABLE "InviteToken";
ALTER TABLE "new_InviteToken" RENAME TO "InviteToken";
CREATE UNIQUE INDEX "InviteToken_token_key" ON "InviteToken"("token");
CREATE UNIQUE INDEX "InviteToken_tokenHash_key" ON "InviteToken"("tokenHash");
CREATE UNIQUE INDEX "InviteToken_usedByUserId_key" ON "InviteToken"("usedByUserId");

CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "actorId", "createdAt", "id", "ipAddress", "targetId", "targetType")
SELECT "action", "actorId", "createdAt", "id", "ipAddress", "targetId", "targetType" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";

CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");
CREATE INDEX "SystemLog_action_createdAt_idx" ON "SystemLog"("action", "createdAt");

CREATE TABLE "StudentRosterEntry" (
    "studentId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "claimedAt" DATETIME,
    "claimedEmail" TEXT,
    "claimedInviteTokenId" TEXT,
    "claimedUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StudentRosterEntry_email_key" ON "StudentRosterEntry"("email");
CREATE UNIQUE INDEX "StudentRosterEntry_claimedInviteTokenId_key" ON "StudentRosterEntry"("claimedInviteTokenId");
CREATE UNIQUE INDEX "StudentRosterEntry_claimedUserId_key" ON "StudentRosterEntry"("claimedUserId");
CREATE INDEX "StudentRosterEntry_active_claimedAt_idx" ON "StudentRosterEntry"("active", "claimedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
