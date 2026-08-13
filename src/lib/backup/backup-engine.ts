import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { lock as lockFile } from "proper-lockfile";
import { create } from "tar";

import { inspectBackupArchive } from "./archive-io";
import { BACKUP_ARCHIVE_LIMITS } from "./archive-policy";
import {
  assertBackupCapacity,
  BackupLifecycleError,
  cleanupStaleBackupWork,
  pruneBackupGenerations,
  resolveBackupRetentionPolicy,
  type BackupRetentionPolicy,
} from "./backup-retention";
import { copyRegularFileExclusive } from "./private-copy";
import { createSqliteSnapshot, type SqliteSnapshotClient } from "./sqlite-snapshot";
import { syncDirectory as syncDirectoryEntry } from "./fs-durability";

const GENERATED_BACKUP_NAME = /^backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz$/u;
const GENERATED_BACKUP_METADATA_NAME = /^backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz\.json$/u;
const BACKUP_LOCK_STALE_MS = 30 * 60 * 1000;
const BACKUP_LOCK_UPDATE_MS = 60 * 1000;

type ContentRootKey = "uploads" | "user-content" | "storage" | "logs";

export type SafeBackupItem = Readonly<{
  file: string;
  size: number;
  createdAt: Date;
  hasMeta: boolean;
}>;

export type SafeStoredBackup = Readonly<{
  file: string;
  path: string;
  size: number;
  createdAt: Date;
  contentType: "application/gzip" | "application/json";
  dev: number;
  ino: number;
}>;

export type CreateSafeBackupOptions = Readonly<{
  backupDir: string;
  databasePath: string;
  databaseClient: SqliteSnapshotClient;
  snapshot?: typeof createSqliteSnapshot;
  validateArchive?: typeof inspectBackupArchive;
  now?: () => Date;
  randomSuffix?: () => string;
  contentRoots?: ReadonlyMap<string, string>;
  reason?: string;
  retention?: Partial<BackupRetentionPolicy>;
  getAvailableBytes?: (directory: string) => Promise<number>;
  syncDirectory?: (directory: string) => Promise<void>;
}>;

async function hashFile(file: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

function timestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

async function assertBackupDirectory(directory: string, createIfMissing = false) {
  if (createIfMissing) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stats = await fs.lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("Invalid backup directory");
  await fs.chmod(directory, 0o700);
}

async function copyContentTree(sourceRoot: string, destinationRoot: string) {
  const sourceStats = await fs.lstat(sourceRoot);
  if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) throw new Error("Invalid backup content root");
  await fs.mkdir(destinationRoot, { recursive: true, mode: 0o700 });

  async function walk(source: string, destination: string) {
    const children = await fs.readdir(source, { withFileTypes: true });
    for (const child of children) {
      const sourcePath = path.join(source, child.name);
      const destinationPath = path.join(destination, child.name);
      const stats = await fs.lstat(sourcePath);
      if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
        throw new Error("Backup content contains an unsupported filesystem object");
      }
      if (stats.isDirectory()) {
        await fs.mkdir(destinationPath, { mode: 0o700 });
        await walk(sourcePath, destinationPath);
      } else {
        await copyRegularFileExclusive(sourcePath, destinationPath, {
          expected: stats,
          maxBytes: BACKUP_ARCHIVE_LIMITS.maxFileBytes,
        });
      }
    }
  }
  await walk(sourceRoot, destinationRoot);
}

async function buildManifest(staging: string, createdAt: Date, contentRoots: readonly string[]) {
  const files: { path: string; size: number; sha256: string }[] = [];
  async function walk(directory: string, relative: string) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const childRelative = relative ? `${relative}/${child.name}` : child.name;
      if (childRelative === "manifest.json") continue;
      const absolute = path.join(directory, child.name);
      const stats = await fs.lstat(absolute);
      if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) throw new Error("Invalid staging tree");
      if (stats.isDirectory()) await walk(absolute, childRelative);
      else files.push({ path: childRelative, size: stats.size, sha256: await hashFile(absolute) });
    }
  }
  await walk(staging, "");
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    format: "gshsapp-backup",
    version: 2,
    createdAt: createdAt.toISOString(),
    database: "database/dev.db",
    contentRoots: [...contentRoots].sort(),
    files,
  };
  await fs.writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest), { mode: 0o600, flag: "wx" });
}

async function acquireBackupLifecycleLease(backupDir: string) {
  const lockPath = path.join(backupDir, ".backup-lifecycle.lock");
  let compromised: Error | null = null;
  let release: (() => Promise<void>);
  try {
    release = await lockFile(backupDir, {
      lockfilePath: lockPath,
      realpath: false,
      retries: 0,
      stale: BACKUP_LOCK_STALE_MS,
      update: BACKUP_LOCK_UPDATE_MS,
      onCompromised: (error) => { compromised = error; },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new BackupLifecycleError("BACKUP_BUSY");
    }
    throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  }
  return {
    assertOwned() {
      if (compromised) throw new BackupLifecycleError("BACKUP_BUSY");
    },
    async release() {
      try {
        await release();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ERELEASED") {
          throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
        }
      }
    },
  };
}

async function createSafeBackupUnderLease(
  options: CreateSafeBackupOptions,
  backupDir: string,
  assertLeaseOwned: () => void,
) {
  const now = (options.now ?? (() => new Date()))();
  const suffix = (options.randomSuffix ?? (() => randomBytes(4).toString("hex")))();
  if (!Number.isFinite(now.getTime()) || !/^[a-f0-9]{8}$/u.test(suffix)) throw new Error("Invalid backup identity");
  const retention = resolveBackupRetentionPolicy(options.retention);
  const contentRoots = options.contentRoots ?? new Map();
  const syncDirectory = options.syncDirectory ?? syncDirectoryEntry;
  assertLeaseOwned();
  await cleanupStaleBackupWork(backupDir, retention, now, syncDirectory);
  const capacityInput = {
    backupDir,
    databasePath: options.databasePath,
    contentRoots,
    policy: retention,
    getAvailableBytes: options.getAvailableBytes,
  };
  try {
    await assertBackupCapacity(capacityInput);
  } catch (error) {
    if (!(error instanceof BackupLifecycleError) || error.code !== "INSUFFICIENT_SPACE") throw error;
    assertLeaseOwned();
    await pruneBackupGenerations({ backupDir, policy: retention, now, syncDirectory });
    await assertBackupCapacity(capacityInput);
  }
  const work = await fs.mkdtemp(path.join(backupDir, ".create-"));
  const file = `backup-${timestamp(now)}-${suffix}.tar.gz`;
  const partial = path.join(backupDir, `.${file}.partial`);
  const target = path.join(backupDir, file);
  const metadataPartial = path.join(backupDir, `.${file}.json.partial`);
  const metadataTarget = path.join(backupDir, `${file}.json`);
  const staging = path.join(work, "staging");

  try {
    await fs.mkdir(path.join(staging, "database"), { recursive: true, mode: 0o700 });
    await (options.snapshot ?? createSqliteSnapshot)(
      options.databaseClient,
      path.join(staging, "database", "dev.db"),
    );
    assertLeaseOwned();

    const includedRoots: string[] = [];
    for (const [key, source] of contentRoots) {
      if (!["uploads", "user-content", "storage", "logs"].includes(key)) throw new Error("Invalid content root key");
      try {
        await copyContentTree(source, path.join(staging, "content", key));
        includedRoots.push(key);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
    }

    assertLeaseOwned();
    await buildManifest(staging, now, includedRoots);
    await create({
      cwd: staging,
      file: partial,
      gzip: true,
      portable: true,
      follow: false,
      strict: true,
      noMtime: true,
      mode: 0o600,
    }, ["manifest.json", "database", ...(includedRoots.length ? ["content"] : [])]);
    await (options.validateArchive ?? inspectBackupArchive)(partial);
    assertLeaseOwned();
    await fs.chmod(partial, 0o600);
    const artifactHandle = await fs.open(partial, "r+");
    try { await artifactHandle.sync(); } finally { await artifactHandle.close(); }
    await fs.rename(partial, target);
    await syncDirectory(backupDir);

    const size = (await fs.stat(target)).size;
    const metadata = {
      format: "gshsapp-backup",
      version: 2,
      file,
      createdAt: now.toISOString(),
      reason: options.reason ?? "manual",
      size,
      sha256: await hashFile(target),
    };
    const metadataHandle = await fs.open(metadataPartial, "wx", 0o600);
    try {
      await metadataHandle.writeFile(JSON.stringify(metadata, null, 2));
      await metadataHandle.sync();
    } finally {
      await metadataHandle.close();
    }
    assertLeaseOwned();
    await fs.rename(metadataPartial, metadataTarget);
    await syncDirectory(backupDir);
    assertLeaseOwned();
    await pruneBackupGenerations({ backupDir, protectedFile: file, policy: retention, now, syncDirectory });
    return metadata;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
    await fs.rm(partial, { force: true }).catch(() => undefined);
    await fs.rm(metadataPartial, { force: true }).catch(() => undefined);
  }
}

export async function createSafeBackup(options: CreateSafeBackupOptions) {
  const backupDir = path.resolve(options.backupDir);
  await assertBackupDirectory(backupDir, true);
  const lease = await acquireBackupLifecycleLease(backupDir);
  try {
    return await createSafeBackupUnderLease(options, backupDir, lease.assertOwned);
  } finally {
    await lease.release();
  }
}

async function safeRegularFile(directory: string, name: string) {
  const fullPath = path.join(directory, name);
  const stats = await fs.lstat(fullPath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("Backup is not a regular file");
  return { fullPath, stats };
}

export async function listSafeBackups(backupDir: string): Promise<SafeBackupItem[]> {
  const directory = path.resolve(backupDir);
  await assertBackupDirectory(directory, true);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const output: SafeBackupItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !GENERATED_BACKUP_NAME.test(entry.name)) continue;
    try {
      const { stats } = await safeRegularFile(directory, entry.name);
      output.push({ file: entry.name, size: stats.size, createdAt: stats.mtime, hasMeta: names.has(`${entry.name}.json`) });
    } catch {
      // A link or raced entry is never exposed as a selectable backup.
    }
  }
  output.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  return output;
}

export async function resolveStoredBackup(backupDir: string, requested: string): Promise<SafeStoredBackup> {
  if (
    typeof requested !== "string" ||
    requested !== path.basename(requested) ||
    requested.includes("/") ||
    requested.includes("\\") ||
    (!GENERATED_BACKUP_NAME.test(requested) && !GENERATED_BACKUP_METADATA_NAME.test(requested))
  ) {
    throw new Error("Invalid backup selection");
  }
  const directory = path.resolve(backupDir);
  await assertBackupDirectory(directory);
  if (GENERATED_BACKUP_METADATA_NAME.test(requested)) {
    const archiveName = requested.slice(0, -".json".length);
    await safeRegularFile(directory, archiveName);
  }
  const { fullPath, stats } = await safeRegularFile(directory, requested);
  return {
    file: requested,
    path: fullPath,
    size: stats.size,
    createdAt: stats.mtime,
    contentType: requested.endsWith(".json") ? "application/json" : "application/gzip",
    dev: stats.dev,
    ino: stats.ino,
  };
}

export function isGeneratedBackupName(value: string) {
  return GENERATED_BACKUP_NAME.test(value);
}
