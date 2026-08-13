import { spawn } from "node:child_process";
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

async function writeBackupPair(backupDir: string, file: string, createdAt: Date, bytes = 32) {
  const archive = path.join(backupDir, file);
  await fs.writeFile(archive, Buffer.alloc(bytes, 7));
  await fs.writeFile(path.join(backupDir, `${file}.json`), JSON.stringify({
    format: "gshsapp-backup",
    version: 2,
    file,
    createdAt: createdAt.toISOString(),
    reason: "scheduled",
    size: bytes,
    sha256: "a".repeat(64),
  }));
  await fs.utimes(archive, createdAt, createdAt);
  await fs.utimes(path.join(backupDir, `${file}.json`), createdAt, createdAt);
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

  it("syncs the backup directory after archive and metadata publication", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.writeFile(liveDatabase, "live");
    const publicationStates: string[][] = [];

    await createSafeBackup({
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot: async (_client, destination) => fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot")),
      validateArchive: vi.fn(),
      now: () => new Date("2026-08-13T01:02:03.000Z"),
      randomSuffix: () => "facefeed",
      contentRoots: new Map(),
      syncDirectory: async (directory) => {
        publicationStates.push((await fs.readdir(directory)).filter((name) => name.startsWith("backup-")).sort());
      },
    });

    expect(publicationStates).toEqual([
      ["backup-20260813-010203-facefeed.tar.gz"],
      ["backup-20260813-010203-facefeed.tar.gz", "backup-20260813-010203-facefeed.tar.gz.json"],
    ]);
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

  it("fails before snapshot creation when conservative free-space projection cannot fit", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    const content = path.join(root, "uploads");
    await fs.writeFile(liveDatabase, Buffer.alloc(256, 1));
    await fs.mkdir(content);
    await fs.writeFile(path.join(content, "asset.bin"), Buffer.alloc(256, 2));
    const snapshot = vi.fn();

    await expect(createSafeBackup({
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot,
      contentRoots: new Map([["uploads", content]]),
      getAvailableBytes: async () => 512,
      retention: { reserveFreeBytes: 0 },
    } as Parameters<typeof createSafeBackup>[0])).rejects.toMatchObject({ code: "INSUFFICIENT_SPACE" });
    expect(snapshot).not.toHaveBeenCalled();
    expect(await directoryNames(backupDir)).toEqual([]);
  });

  it("fails fast while another Node process owns the backup lifecycle lease", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.mkdir(backupDir);
    await fs.writeFile(liveDatabase, Buffer.alloc(16, 1));
    const lockScript = [
      "const path = require('node:path');",
      "const lock = require('proper-lockfile');",
      "(async () => {",
      "  const root = process.argv[1];",
      "  const release = await lock.lock(root, {",
      "    lockfilePath: path.join(root, '.backup-lifecycle.lock'),",
      "    realpath: false, stale: 1800000, update: 60000",
      "  });",
      "  process.stdout.write('LOCKED\\n');",
      "  process.stdin.once('data', async () => { await release(); process.exit(0); });",
      "  process.stdin.resume();",
      "})().catch((error) => { console.error(error); process.exit(1); });",
    ].join("\n");
    const owner = spawn(process.execPath, ["-e", lockScript, backupDir], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let ownerError = "";
    owner.stderr.setEncoding("utf8");
    owner.stderr.on("data", (chunk) => { ownerError += chunk; });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`lock owner did not start: ${ownerError}`)), 5_000);
      owner.stdout.setEncoding("utf8");
      owner.stdout.once("data", (chunk) => {
        clearTimeout(timer);
        if (!String(chunk).includes("LOCKED")) reject(new Error(`unexpected lock owner output: ${chunk}`));
        else resolve();
      });
      owner.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`lock owner exited early (${code}): ${ownerError}`));
      });
    });
    const snapshot = vi.fn();

    try {
      await expect(createSafeBackup({
        backupDir,
        databasePath: liveDatabase,
        databaseClient: { $executeRawUnsafe: vi.fn() },
        snapshot,
        validateArchive: vi.fn(),
        contentRoots: new Map(),
        getAvailableBytes: async () => 1024 * 1024 * 1024,
      })).rejects.toMatchObject({ code: "BACKUP_BUSY" });
      expect(snapshot).not.toHaveBeenCalled();
    } finally {
      owner.stdin.write("release\n");
      await new Promise<void>((resolve, reject) => {
        owner.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`lock owner failed: ${ownerError}`)));
      });
    }
  });

  it("prunes eligible old generations before capacity preflight so scheduled creation can recover", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.mkdir(backupDir);
    await fs.writeFile(liveDatabase, Buffer.alloc(16, 1));
    const keep = "backup-20260812-000000-a1b2c3d4.tar.gz";
    const remove = "backup-20260701-000000-a1b2c3d4.tar.gz";
    await writeBackupPair(backupDir, keep, new Date("2026-08-12T00:00:00.000Z"), 220);
    await writeBackupPair(backupDir, remove, new Date("2026-07-01T00:00:00.000Z"), 220);
    let capacityChecks = 0;

    await createSafeBackup({
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot: async (_client, destination) => fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot")),
      validateArchive: vi.fn().mockResolvedValue(undefined),
      contentRoots: new Map(),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      randomSuffix: () => "facefeed",
      getAvailableBytes: async () => {
        capacityChecks += 1;
        return (await directoryNames(backupDir)).includes(remove) ? 1 : 1024 * 1024 * 1024;
      },
      retention: {
        minimumGenerations: 1,
        maximumGenerations: 10,
        maximumAgeMs: 7 * 86_400_000,
        maximumTotalBytes: 1024 * 1024,
        reserveFreeBytes: 0,
      },
    });

    expect(capacityChecks).toBe(2);
    expect(await directoryNames(backupDir)).toEqual(expect.arrayContaining([keep, `${keep}.json`]));
    expect(await directoryNames(backupDir)).not.toContain(remove);
  });

  it("prunes complete archive/metadata pairs only after a new validated generation succeeds", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.mkdir(backupDir);
    await fs.writeFile(liveDatabase, Buffer.alloc(32, 1));
    const oldest = "backup-20260801-000000-a1b2c3d4.tar.gz";
    const previous = "backup-20260802-000000-a1b2c3d4.tar.gz";
    await writeBackupPair(backupDir, oldest, new Date("2026-08-01T00:00:00.000Z"));
    await writeBackupPair(backupDir, previous, new Date("2026-08-02T00:00:00.000Z"));
    const durableStates: string[][] = [];
    const common = {
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot: async (_client: unknown, destination: string) => fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot")),
      contentRoots: new Map(),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      getAvailableBytes: async () => 1024 * 1024 * 1024,
      syncDirectory: async () => { durableStates.push(await directoryNames(backupDir)); },
      retention: {
        minimumGenerations: 2,
        maximumGenerations: 2,
        maximumAgeMs: 365 * 86_400_000,
        maximumTotalBytes: 1024 * 1024,
        reserveFreeBytes: 0,
      },
    } as Parameters<typeof createSafeBackup>[0];

    await expect(createSafeBackup({
      ...common,
      randomSuffix: () => "deadbeef",
      validateArchive: async () => { throw new Error("invalid new archive"); },
    })).rejects.toThrow("invalid new archive");
    expect(durableStates).toHaveLength(0);
    expect(await directoryNames(backupDir)).toEqual(expect.arrayContaining([oldest, `${oldest}.json`, previous, `${previous}.json`]));

    await createSafeBackup({
      ...common,
      randomSuffix: () => "cafebabe",
      validateArchive: vi.fn().mockResolvedValue(undefined),
    });
    const names = await directoryNames(backupDir);
    expect(names).not.toContain(oldest);
    expect(names).not.toContain(`${oldest}.json`);
    expect(names).toEqual(expect.arrayContaining([
      previous,
      `${previous}.json`,
      "backup-20260813-000000-cafebabe.tar.gz",
      "backup-20260813-000000-cafebabe.tar.gz.json",
    ]));
    expect(durableStates).toHaveLength(3);
    expect(durableStates[2]).not.toContain(oldest);
  });

  it("enforces age and total-byte limits without deleting the newest or minimum generations", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.mkdir(backupDir);
    await fs.writeFile(liveDatabase, Buffer.alloc(16, 1));
    for (let day = 1; day <= 4; day += 1) {
      await writeBackupPair(
        backupDir,
        `backup-2026070${day}-000000-a1b2c3d${day}.tar.gz`,
        new Date(`2026-07-0${day}T00:00:00.000Z`),
        220,
      );
    }

    await createSafeBackup({
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot: async (_client, destination) => fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot")),
      validateArchive: vi.fn().mockResolvedValue(undefined),
      contentRoots: new Map(),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      randomSuffix: () => "1234abcd",
      getAvailableBytes: async () => 1024 * 1024 * 1024,
      retention: {
        minimumGenerations: 2,
        maximumGenerations: 10,
        maximumAgeMs: 7 * 86_400_000,
        maximumTotalBytes: 900,
        reserveFreeBytes: 0,
      },
    } as Parameters<typeof createSafeBackup>[0]);

    const remaining = await listSafeBackups(backupDir);
    expect(remaining.map((item) => item.file)).toEqual([
      "backup-20260813-000000-1234abcd.tar.gz",
      "backup-20260704-000000-a1b2c3d4.tar.gz",
    ]);
  });

  it("prunes oldest fresh pairs until the total-byte budget is met", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.mkdir(backupDir);
    await fs.writeFile(liveDatabase, Buffer.alloc(16, 1));
    for (let day = 9; day <= 12; day += 1) {
      const paddedDay = String(day).padStart(2, "0");
      await writeBackupPair(
        backupDir,
        `backup-202608${paddedDay}-000000-b1b2c3d${day - 9}.tar.gz`,
        new Date(`2026-08-${paddedDay}T00:00:00.000Z`),
        220,
      );
    }

    await createSafeBackup({
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot: async (_client, destination) => fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot")),
      validateArchive: vi.fn().mockResolvedValue(undefined),
      contentRoots: new Map(),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      randomSuffix: () => "feedface",
      getAvailableBytes: async () => 1024 * 1024 * 1024,
      retention: {
        minimumGenerations: 1,
        maximumGenerations: 10,
        maximumAgeMs: 365 * 86_400_000,
        maximumTotalBytes: 500,
        reserveFreeBytes: 0,
      },
    });

    expect((await listSafeBackups(backupDir)).map((item) => item.file)).toEqual([
      "backup-20260813-000000-feedface.tar.gz",
    ]);
  });

  it("cleans stale engine work and unpaired completed artifacts but leaves recent work and unrelated aliases", async () => {
    const root = await makeRoot();
    const backupDir = path.join(root, "backup");
    const liveDatabase = path.join(root, "live.db");
    await fs.mkdir(backupDir);
    await fs.writeFile(liveDatabase, Buffer.alloc(16, 1));
    const staleWork = path.join(backupDir, ".create-AbCd12");
    const stalePartial = path.join(backupDir, ".backup-20260801-000000-a1b2c3d4.tar.gz.partial");
    const recentPartial = path.join(backupDir, ".backup-20260812-230000-a1b2c3d4.tar.gz.partial");
    const unpaired = path.join(backupDir, "backup-20260801-000000-deadbeef.tar.gz");
    const recentUnpaired = path.join(backupDir, "backup-20260812-230000-deadbeef.tar.gz");
    await fs.mkdir(staleWork);
    await fs.writeFile(path.join(staleWork, "artifact"), "stale");
    await fs.writeFile(stalePartial, "stale");
    await fs.writeFile(recentPartial, "recent");
    await fs.writeFile(unpaired, "valuable orphan");
    await fs.writeFile(recentUnpaired, "creation may still be finishing");
    await fs.writeFile(path.join(backupDir, ".create-not-safe-name!"), "unrelated");
    const stale = new Date("2026-08-01T00:00:00.000Z");
    await fs.utimes(staleWork, stale, stale);
    await fs.utimes(stalePartial, stale, stale);
    await fs.utimes(unpaired, stale, stale);

    await createSafeBackup({
      backupDir,
      databasePath: liveDatabase,
      databaseClient: { $executeRawUnsafe: vi.fn() },
      snapshot: async (_client, destination) => fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot")),
      validateArchive: vi.fn().mockResolvedValue(undefined),
      contentRoots: new Map(),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      randomSuffix: () => "aabbccdd",
      getAvailableBytes: async () => 1024 * 1024 * 1024,
      retention: { staleWorkMaxAgeMs: 24 * 60 * 60 * 1000, reserveFreeBytes: 0 },
    } as Parameters<typeof createSafeBackup>[0]);

    expect(await directoryNames(backupDir)).toEqual(expect.arrayContaining([
      path.basename(recentPartial),
      path.basename(recentUnpaired),
      ".create-not-safe-name!",
    ]));
    await expect(fs.access(staleWork)).rejects.toThrow();
    await expect(fs.access(stalePartial)).rejects.toThrow();
    await expect(fs.access(unpaired)).rejects.toThrow();
  });
});

async function directoryNames(directory: string) {
  try {
    return (await fs.readdir(directory)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
