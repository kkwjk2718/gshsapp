import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSafeBackup, listSafeBackups, resolveStoredBackup } from "./backup-engine";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function makeRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-backup-engine-test-"));
  temporaryDirectories.push(root);
  return root;
}

describe("safe backup engine", () => {
  it("creates a private canonical archive from a snapshot rather than copying the live database", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.writeFile(liveDatabase, "live");
    const snapshot = vi.fn(async (_client: unknown, destination: string) => {
      expect(destination).not.toBe(liveDatabase);
      await fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot"));
    });

    const backup = await createSafeBackup({
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot,
      now: () => new Date("2026-08-13T01:02:03.000Z"),
      randomSuffix: () => "a1b2c3d4",
      contentRoots: new Map(),
      reason: "manual",
    });

    expect(backup.file).toBe("backup-20260813-010203-a1b2c3d4.tar.gz");
    expect(await fs.readFile(liveDatabase, "utf8")).toBe("live");
    if (process.platform !== "win32") {
      expect((await fs.stat(path.join(backupDir, backup.file))).mode & 0o777).toBe(0o600);
    }
    expect(JSON.parse(await fs.readFile(path.join(backupDir, `${backup.file}.json`), "utf8"))).toEqual(
      expect.objectContaining({ format: "gshsapp-backup", version: 2, reason: "manual" }),
    );
  });

  it("rejects a configured content root that is not a directory", async () => {
    const root = await makeRoot();
    const content = path.join(root, "uploads");
    await fs.writeFile(content, "not-a-directory");
    await expect(createSafeBackup({
      backupDir: path.join(root, "backup"),
      databasePath: path.join(root, "live.db"),
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot: async (_client, destination) => fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot")),
      validateArchive: vi.fn(),
      contentRoots: new Map([["uploads", content]]),
    })).rejects.toThrow();
  });

  it("enumerates only generated regular backup files and rejects aliases", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    await fs.mkdir(backupDir);
    const safeName = "backup-20260813-010203-a1b2c3d4.tar.gz";
    await fs.writeFile(path.join(backupDir, safeName), "safe");
    await fs.writeFile(path.join(backupDir, "attacker.db"), "bad");
    const orphanMetadata = "backup-20260813-010204-a1b2c3d4.tar.gz.json";
    await fs.writeFile(path.join(backupDir, orphanMetadata), "not associated with a stored archive");

    const backups = await listSafeBackups(backupDir);
    expect(backups.map((item) => item.file)).toEqual([safeName]);
    await expect(resolveStoredBackup(backupDir, "../" + safeName)).rejects.toThrow();
    await expect(resolveStoredBackup(backupDir, "attacker.db")).rejects.toThrow();
    await expect(resolveStoredBackup(backupDir, "backup-20260813-010204-a1b2c3d4.tar.gz")).rejects.toThrow();
    await expect(resolveStoredBackup(backupDir, orphanMetadata)).rejects.toThrow();
    await expect(resolveStoredBackup(backupDir, safeName)).resolves.toEqual(expect.objectContaining({ file: safeName }));
  });

  it("rejects a backup directory that is itself a filesystem link", async (context) => {
    const root = await makeRoot();
    const real = path.join(root, "real");
    const linked = path.join(root, "linked");
    await fs.mkdir(real);
    try {
      await fs.symlink(real, linked, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return context.skip();
      throw error;
    }
    const safeName = "backup-20260813-010203-a1b2c3d4.tar.gz";
    await fs.writeFile(path.join(real, safeName), "outside configured directory");
    await expect(resolveStoredBackup(linked, safeName)).rejects.toThrow();
  });
});
