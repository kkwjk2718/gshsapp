import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { extractAndVerifyBackupArchive } from "../src/lib/backup/archive-io";
import { schemaFingerprint } from "./migrate-production.mjs";
import { prepareRestoreDrill } from "./validate-backup";

const roots: string[] = [];

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-bootstrap-backup-test-"));
  roots.push(root);
  return root;
}

function pythonCommand() {
  return process.env.PYTHON_BIN?.trim() || (process.platform === "win32" ? "python" : "python3");
}

function runBootstrap(args: readonly string[]) {
  return spawnSync(pythonCommand(), [path.resolve("deploy/bootstrap-backup.py"), ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 60_000,
  });
}

async function sha256(file: string) {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("first-deployment bootstrap backup", () => {
  it("captures committed WAL data and validates a reviewed legacy schema through isolated migration", async () => {
    const root = await temporaryRoot();
    const dataDir = path.join(root, "data");
    const backupDir = path.join(root, "backup");
    await fs.mkdir(dataDir);
    await fs.mkdir(backupDir);
    const databasePath = path.join(dataDir, "dev.db");
    const source = new DatabaseSync(databasePath);
    try {
      source.exec((await fs.readFile(path.resolve("prisma/migrations/20260813000000_baseline/migration.sql"), "utf8"))
        .replaceAll("\r\n", "\n"));
      expect(schemaFingerprint(source)).toBe("3cb19a677a4a6494eac64a996a874be3c36dc8b03c1d90369184cd639bc732e7");
      source.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; PRAGMA wal_checkpoint(TRUNCATE)");
      expect(schemaFingerprint(source)).toBe("3cb19a677a4a6494eac64a996a874be3c36dc8b03c1d90369184cd639bc732e7");
      source.prepare(`
        INSERT INTO "User" ("id", "userId", "passwordHash", "name", "email", "role")
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("bootstrap-user", "bootstrap01", "legacy-hash", "Bootstrap", "bootstrap@example.com", "STUDENT");
      expect(schemaFingerprint(source)).toBe("3cb19a677a4a6494eac64a996a874be3c36dc8b03c1d90369184cd639bc732e7");
      expect((await fs.stat(`${databasePath}-wal`)).size).toBeGreaterThan(0);

      const created = runBootstrap([
        "create",
        "--database", databasePath,
        "--data-root", dataDir,
        "--backup-dir", backupDir,
      ]);
      expect(created.status, created.stderr).toBe(0);
      const file = created.stdout.trim();
      expect(file).toMatch(/^backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz$/u);
      const archive = path.join(backupDir, file);
      const metadataPath = `${archive}.json`;
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as Record<string, unknown>;
      expect(Object.keys(metadata).sort()).toEqual(["createdAt", "file", "format", "reason", "sha256", "size", "version"]);
      expect(metadata).toEqual(expect.objectContaining({
        format: "gshsapp-backup",
        version: 2,
        file,
        reason: "predeployment-bootstrap",
        size: (await fs.stat(archive)).size,
        sha256: await sha256(archive),
      }));

      const extracted = path.join(root, "extracted");
      const inspected = await extractAndVerifyBackupArchive(archive, extracted);
      expect(inspected.layout.layout).toBe("canonical-v2");
      const snapshot = new DatabaseSync(path.join(extracted, "database", "dev.db"), { readOnly: true });
      expect(snapshot.prepare('SELECT "email" FROM "User" WHERE "id" = ?').get("bootstrap-user"))
        .toEqual({ email: "bootstrap@example.com" });
      snapshot.close();

      const restoreOutput = path.join(root, "restore-output");
      await prepareRestoreDrill(archive, restoreOutput, { migrateReviewedInput: true });
      const migrated = new DatabaseSync(path.join(restoreOutput, "data", "dev.db"), { readOnly: true });
      expect(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'StudentRosterEntry'").get())
        .toEqual({ name: "StudentRosterEntry" });
      expect(migrated.prepare('SELECT "email" FROM "User" WHERE "id" = ?').get("bootstrap-user"))
        .toEqual({ email: "bootstrap@example.com" });
      migrated.close();
    } finally {
      source.close();
    }
  }, 60_000);

  it("fails closed without publishing a pair for a malformed database", async () => {
    const root = await temporaryRoot();
    const dataDir = path.join(root, "data");
    const backupDir = path.join(root, "backup");
    await fs.mkdir(dataDir);
    await fs.mkdir(backupDir);
    const databasePath = path.join(dataDir, "dev.db");
    await fs.writeFile(databasePath, "not a sqlite database");

    const result = runBootstrap([
      "create",
      "--database", databasePath,
      "--data-root", dataDir,
      "--backup-dir", backupDir,
    ]);
    expect(result.status).not.toBe(0);
    expect(await fs.readdir(backupDir)).toEqual([]);
  });

  it("detects companion metadata tampering", async () => {
    const root = await temporaryRoot();
    const dataDir = path.join(root, "data");
    const backupDir = path.join(root, "backup");
    await fs.mkdir(dataDir);
    await fs.mkdir(backupDir);
    const databasePath = path.join(dataDir, "dev.db");
    new DatabaseSync(databasePath).close();

    const created = runBootstrap([
      "create",
      "--database", databasePath,
      "--data-root", dataDir,
      "--backup-dir", backupDir,
    ]);
    expect(created.status, created.stderr).toBe(0);
    const file = created.stdout.trim();
    expect(runBootstrap(["verify", "--backup-dir", backupDir, "--name", file]).status).toBe(0);

    const metadataPath = path.join(backupDir, `${file}.json`);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as Record<string, unknown>;
    metadata.createdAt = "2026-01-01T00:00:00.000Z";
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    expect(runBootstrap(["verify", "--backup-dir", backupDir, "--name", file]).status).not.toBe(0);

    const regenerated = runBootstrap(["create", "--database", databasePath, "--data-root", dataDir, "--backup-dir", backupDir]);
    expect(regenerated.status, regenerated.stderr).toBe(0);
    const regeneratedFile = regenerated.stdout.trim();
    const regeneratedMetadataPath = path.join(backupDir, `${regeneratedFile}.json`);
    const regeneratedMetadata = JSON.parse(await fs.readFile(regeneratedMetadataPath, "utf8")) as Record<string, unknown>;
    regeneratedMetadata.sha256 = "0".repeat(64);
    await fs.writeFile(regeneratedMetadataPath, JSON.stringify(regeneratedMetadata));
    expect(runBootstrap(["verify", "--backup-dir", backupDir, "--name", regeneratedFile]).status).not.toBe(0);
  });
});
