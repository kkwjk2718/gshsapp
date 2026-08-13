import fs from "node:fs/promises";
import path from "node:path";

import { BACKUP_ARCHIVE_LIMITS } from "./archive-policy";

const GENERATED_BACKUP_NAME = /^backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz$/u;
const GENERATED_BACKUP_METADATA_NAME = /^backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz\.json$/u;
const STALE_WORK_DIRECTORY = /^\.create-[A-Za-z0-9_-]{6,64}$/u;
const STALE_PARTIAL_FILE = /^\.backup-\d{8}-\d{6}-[a-f0-9]{8}\.tar\.gz(?:\.json)?\.partial$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DAY_MS = 86_400_000;
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export type BackupRetentionPolicy = Readonly<{
  minimumGenerations: number;
  maximumGenerations: number;
  maximumAgeMs: number;
  maximumTotalBytes: number;
  reserveFreeBytes: number;
  staleWorkMaxAgeMs: number;
}>;

const DEFAULT_POLICY: BackupRetentionPolicy = {
  minimumGenerations: 3,
  maximumGenerations: 30,
  maximumAgeMs: 90 * DAY_MS,
  maximumTotalBytes: 20 * GIB,
  reserveFreeBytes: 256 * MIB,
  staleWorkMaxAgeMs: DAY_MS,
};

export type BackupLifecycleErrorCode =
  | "BACKUP_BUSY"
  | "INSUFFICIENT_SPACE"
  | "INVALID_RETENTION_POLICY"
  | "UNSAFE_BACKUP_SOURCE";

export class BackupLifecycleError extends Error {
  constructor(readonly code: BackupLifecycleErrorCode) {
    super(code);
    this.name = "BackupLifecycleError";
  }
}

type FileIdentity = Readonly<{
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
}>;

type BackupGeneration = Readonly<{
  file: string;
  metadataFile: string;
  createdAtMs: number;
  totalBytes: number;
  archive: FileIdentity;
  metadata: FileIdentity;
}>;

export type BackupProjectionInput = Readonly<{
  backupDir: string;
  databasePath: string;
  contentRoots: ReadonlyMap<string, string>;
  policy: BackupRetentionPolicy;
  getAvailableBytes?: (directory: string) => Promise<number>;
}>;

function configuredInteger(name: string, fallback: number, maximum: number, allowZero = false) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/u.test(raw)) throw new BackupLifecycleError("INVALID_RETENTION_POLICY");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum || value < (allowZero ? 0 : 1)) {
    throw new BackupLifecycleError("INVALID_RETENTION_POLICY");
  }
  return value;
}

export function resolveBackupRetentionPolicy(
  overrides: Partial<BackupRetentionPolicy> = {},
): BackupRetentionPolicy {
  const configured: BackupRetentionPolicy = {
    minimumGenerations: configuredInteger("BACKUP_RETENTION_MIN_GENERATIONS", DEFAULT_POLICY.minimumGenerations, 1_000),
    maximumGenerations: configuredInteger("BACKUP_RETENTION_MAX_GENERATIONS", DEFAULT_POLICY.maximumGenerations, 1_000),
    maximumAgeMs: configuredInteger("BACKUP_RETENTION_MAX_AGE_DAYS", DEFAULT_POLICY.maximumAgeMs / DAY_MS, 3_650) * DAY_MS,
    maximumTotalBytes: configuredInteger("BACKUP_RETENTION_MAX_TOTAL_BYTES", DEFAULT_POLICY.maximumTotalBytes, 1024 * GIB),
    reserveFreeBytes: configuredInteger("BACKUP_RESERVE_FREE_BYTES", DEFAULT_POLICY.reserveFreeBytes, 1024 * GIB, true),
    staleWorkMaxAgeMs: configuredInteger("BACKUP_STALE_WORK_MAX_AGE_HOURS", DEFAULT_POLICY.staleWorkMaxAgeMs / 3_600_000, 24 * 365) * 3_600_000,
  };
  const policy = { ...configured, ...overrides };
  const integerKeys = Object.keys(policy) as (keyof BackupRetentionPolicy)[];
  if (integerKeys.some((key) => !Number.isSafeInteger(policy[key]) || policy[key] < 0)) {
    throw new BackupLifecycleError("INVALID_RETENTION_POLICY");
  }
  if (
    policy.minimumGenerations < 1 ||
    policy.maximumGenerations < policy.minimumGenerations ||
    policy.maximumAgeMs < 1 ||
    policy.maximumTotalBytes < 1 ||
    policy.staleWorkMaxAgeMs < 1
  ) {
    throw new BackupLifecycleError("INVALID_RETENTION_POLICY");
  }
  return policy;
}

function identity(stats: Awaited<ReturnType<typeof fs.lstat>>): FileIdentity {
  return { dev: Number(stats.dev), ino: Number(stats.ino), size: Number(stats.size), mtimeMs: Number(stats.mtimeMs) };
}

function sameIdentity(left: FileIdentity, right: Awaited<ReturnType<typeof fs.lstat>>) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs;
}

async function assertRegularFile(file: string) {
  const stats = await fs.lstat(file);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  return stats;
}

async function measureSourceTree(source: string) {
  const rootStats = await fs.lstat(source);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  let bytes = 0;
  let entries = 0;
  const walk = async (directory: string): Promise<void> => {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children) {
      entries += 1;
      if (entries > BACKUP_ARCHIVE_LIMITS.maxEntries) throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
      const childPath = path.join(directory, child.name);
      const stats = await fs.lstat(childPath);
      if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
        throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
      }
      if (stats.isDirectory()) {
        await walk(childPath);
      } else {
        if (stats.size > BACKUP_ARCHIVE_LIMITS.maxFileBytes) throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
        bytes += stats.size;
        if (!Number.isSafeInteger(bytes) || bytes > BACKUP_ARCHIVE_LIMITS.maxTotalBytes) {
          throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
        }
      }
    }
  };
  await walk(source);
  return { bytes, entries };
}

async function availableBytes(directory: string) {
  const stats = await fs.statfs(directory);
  const value = BigInt(stats.bavail) * BigInt(stats.bsize);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}

export async function assertBackupCapacity(input: BackupProjectionInput) {
  const databaseStats = await assertRegularFile(path.resolve(input.databasePath));
  if (databaseStats.size > BACKUP_ARCHIVE_LIMITS.maxFileBytes) {
    throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  }
  let sourceBytes = databaseStats.size;
  let entryCount = 1;
  for (const [key, source] of input.contentRoots) {
    if (!["uploads", "user-content", "storage", "logs"].includes(key)) {
      throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
    }
    try {
      const measured = await measureSourceTree(path.resolve(source));
      sourceBytes += measured.bytes;
      entryCount += measured.entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes > BACKUP_ARCHIVE_LIMITS.maxTotalBytes) {
    throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  }

  // The snapshot and an incompressible tar stream coexist until validation ends.
  // Include tar headers, manifest/checksums, and filesystem allocation slack.
  const projectedBytes = sourceBytes * 2 + entryCount * 4_096 + 16 * MIB;
  if (!Number.isSafeInteger(projectedBytes)) throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  const freeBytes = await (input.getAvailableBytes ?? availableBytes)(input.backupDir);
  if (!Number.isSafeInteger(freeBytes) || freeBytes < 0) throw new BackupLifecycleError("INSUFFICIENT_SPACE");
  if (freeBytes < projectedBytes + input.policy.reserveFreeBytes) {
    throw new BackupLifecycleError("INSUFFICIENT_SPACE");
  }
  return projectedBytes;
}

async function validateRemovalTree(directory: string): Promise<void> {
  const children = await fs.readdir(directory, { withFileTypes: true });
  for (const child of children) {
    const childPath = path.join(directory, child.name);
    const stats = await fs.lstat(childPath);
    if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
      throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
    }
    if (stats.isDirectory()) await validateRemovalTree(childPath);
  }
}

export async function cleanupStaleBackupWork(
  backupDir: string,
  policy: BackupRetentionPolicy,
  now: Date,
) {
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  for (const entry of entries) {
    const isWorkDirectory = STALE_WORK_DIRECTORY.test(entry.name);
    const isPartialFile = STALE_PARTIAL_FILE.test(entry.name);
    const isOrphanArchive = GENERATED_BACKUP_NAME.test(entry.name) && !names.has(`${entry.name}.json`);
    const isOrphanMetadata = GENERATED_BACKUP_METADATA_NAME.test(entry.name) &&
      !names.has(entry.name.slice(0, -".json".length));
    if (!isWorkDirectory && !isPartialFile && !isOrphanArchive && !isOrphanMetadata) continue;
    const target = path.join(backupDir, entry.name);
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink()) continue;
    if ((isWorkDirectory && !stats.isDirectory()) || (!isWorkDirectory && !stats.isFile())) continue;
    if (now.getTime() - stats.mtimeMs < policy.staleWorkMaxAgeMs) continue;
    const expected = identity(stats);
    if (isWorkDirectory) await validateRemovalTree(target);
    const current = await fs.lstat(target);
    if (!sameIdentity(expected, current)) continue;
    if (isWorkDirectory) await fs.rm(target, { recursive: true });
    else await fs.unlink(target);
  }
}

function strictTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? parsed.getTime() : null;
}

async function scanGenerations(backupDir: string, nowMs: number): Promise<BackupGeneration[]> {
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const generations: BackupGeneration[] = [];
  for (const entry of entries) {
    if (!GENERATED_BACKUP_NAME.test(entry.name) || !names.has(`${entry.name}.json`)) continue;
    try {
      const archivePath = path.join(backupDir, entry.name);
      const metadataPath = path.join(backupDir, `${entry.name}.json`);
      const archiveStats = await fs.lstat(archivePath);
      const metadataStats = await fs.lstat(metadataPath);
      if (
        archiveStats.isSymbolicLink() || metadataStats.isSymbolicLink() ||
        !archiveStats.isFile() || !metadataStats.isFile() || metadataStats.size > 64 * 1024
      ) continue;
      const parsed = JSON.parse(await fs.readFile(metadataPath, "utf8")) as Record<string, unknown>;
      const createdAtMs = strictTimestamp(parsed.createdAt);
      if (
        parsed.format !== "gshsapp-backup" || parsed.version !== 2 || parsed.file !== entry.name ||
        parsed.size !== archiveStats.size || typeof parsed.reason !== "string" ||
        typeof parsed.sha256 !== "string" || !SHA256.test(parsed.sha256) || createdAtMs === null ||
        createdAtMs > nowMs + 5 * 60_000
      ) continue;
      generations.push({
        file: entry.name,
        metadataFile: `${entry.name}.json`,
        createdAtMs,
        totalBytes: archiveStats.size + metadataStats.size,
        archive: identity(archiveStats),
        metadata: identity(metadataStats),
      });
    } catch {
      // Unpaired, malformed, linked, or raced entries are never retention deletion candidates.
    }
  }
  return generations.sort((left, right) => right.createdAtMs - left.createdAtMs || right.file.localeCompare(left.file));
}

async function unlinkExpected(file: string, expected: FileIdentity) {
  const stats = await fs.lstat(file);
  if (!stats.isFile() || stats.isSymbolicLink() || !sameIdentity(expected, stats)) {
    throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  }
  await fs.unlink(file);
}

export async function pruneBackupGenerations(input: Readonly<{
  backupDir: string;
  protectedFile?: string;
  policy: BackupRetentionPolicy;
  now: Date;
}>) {
  if (input.protectedFile !== undefined && !GENERATED_BACKUP_NAME.test(input.protectedFile)) {
    throw new BackupLifecycleError("UNSAFE_BACKUP_SOURCE");
  }
  const generations = await scanGenerations(input.backupDir, input.now.getTime());
  const protectedFiles = new Set(generations.slice(0, input.policy.minimumGenerations).map((generation) => generation.file));
  if (input.protectedFile) protectedFiles.add(input.protectedFile);
  const survivors = new Set(generations.map((generation) => generation.file));
  let totalBytes = generations.reduce((sum, generation) => sum + generation.totalBytes, 0);
  const deleted: string[] = [];

  for (const generation of [...generations].reverse()) {
    if (protectedFiles.has(generation.file)) continue;
    const isTooOld = input.now.getTime() - generation.createdAtMs > input.policy.maximumAgeMs;
    const isOverCount = survivors.size > input.policy.maximumGenerations;
    const isOverBytes = totalBytes > input.policy.maximumTotalBytes;
    if (!isTooOld && !isOverCount && !isOverBytes) continue;
    await unlinkExpected(path.join(input.backupDir, generation.file), generation.archive);
    await unlinkExpected(path.join(input.backupDir, generation.metadataFile), generation.metadata);
    survivors.delete(generation.file);
    totalBytes -= generation.totalBytes;
    deleted.push(generation.file);
  }
  return { deleted, retained: survivors.size, retainedBytes: totalBytes };
}
