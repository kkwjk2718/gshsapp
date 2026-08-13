import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { lock as lockFile } from "proper-lockfile";

import { extractAndVerifyBackupArchive, type InspectedBackupArchive } from "./archive-io";
import { validateSqliteDatabase } from "./sqlite-snapshot";

const DEFAULT_MAX_UPLOAD_BYTES = 128 * 1024 * 1024;
const HARD_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const PENDING_RESTORE_TTL_MS = 24 * 60 * 60 * 1000;
const RESTORE_LOCK_STALE_MS = 30 * 60 * 1000;
const RESTORE_LOCK_UPDATE_MS = 60 * 1000;
const RESTORE_ID = /^[A-Za-z0-9_-]{20,64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const INVALID_FILENAME_CHARACTER = /[\u0000-\u001f\u007f-\u009f\ufeff\\/]/u;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");
const RESTORE_ROOTS = new Set(["database", "uploads", "user-content", "storage", "logs"]);

export type RestoreArtifactFormat = "db" | "tar.gz";

export type PendingRestoreDescriptor = Readonly<{
  version: 1;
  id: string;
  sha256: string;
  format: RestoreArtifactFormat;
  createdAt: string;
  expiresAt: string;
  roots: readonly string[];
}>;

export type RestoreStagingErrorCode =
  | "RESTORE_PENDING"
  | "RESTORE_NOT_FOUND"
  | "RESTORE_ID_MISMATCH"
  | "INVALID_BODY"
  | "INVALID_LENGTH"
  | "UPLOAD_TOO_LARGE"
  | "INVALID_FILENAME"
  | "FORMAT_MISMATCH"
  | "INVALID_ARTIFACT"
  | "STAGING_FAILED";

export class RestoreStagingError extends Error {
  constructor(readonly code: RestoreStagingErrorCode) {
    super(code);
    this.name = "RestoreStagingError";
  }
}

export type StageRestoreUploadOptions = Readonly<{
  body: ReadableStream<Uint8Array> | null;
  contentLength: number | null;
  originalName: string;
  restoreRoot: string;
  maxBytes?: number;
  validateDatabase?: (file: string) => Promise<void>;
  validateArchive?: (file: string, destination: string) => Promise<InspectedBackupArchive>;
  now?: () => Date;
  createId?: () => string;
}>;

export type StagedRestoreResult = Readonly<{
  id: string;
  format: RestoreArtifactFormat;
  bytes: number;
  sha256: string;
  expiresAt: string;
}>;

function configuredMaximum(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MAX_UPLOAD_BYTES;
  if (!/^\d+$/u.test(value)) throw new RestoreStagingError("STAGING_FAILED");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > HARD_MAX_UPLOAD_BYTES) {
    throw new RestoreStagingError("STAGING_FAILED");
  }
  return parsed;
}

export function getMaxRestoreUploadBytes() {
  return configuredMaximum(process.env.RESTORE_MAX_UPLOAD_BYTES);
}

export function getPendingRestorePath(restoreRoot: string) {
  return path.join(path.resolve(restoreRoot), "pending.json");
}

export function getStagedRestoreArtifactPath(
  restoreRoot: string,
  descriptor: Pick<PendingRestoreDescriptor, "id" | "format">,
) {
  if (!RESTORE_ID.test(descriptor.id)) throw new RestoreStagingError("STAGING_FAILED");
  return path.join(path.resolve(restoreRoot), "staged", descriptor.id, `artifact.${descriptor.format}`);
}

function parseFormat(originalName: string): RestoreArtifactFormat {
  if (
    typeof originalName !== "string" ||
    originalName.length < 1 ||
    originalName.length > 128 ||
    originalName.trim() !== originalName ||
    INVALID_FILENAME_CHARACTER.test(originalName) ||
    path.basename(originalName) !== originalName
  ) {
    throw new RestoreStagingError("INVALID_FILENAME");
  }
  const lower = originalName.toLocaleLowerCase("en-US");
  if (lower.endsWith(".tar.gz")) return "tar.gz";
  if (lower.endsWith(".db")) return "db";
  throw new RestoreStagingError("INVALID_FILENAME");
}

async function assertMagic(file: string, format: RestoreArtifactFormat) {
  const handle = await fs.open(file, "r");
  try {
    const bytes = Buffer.alloc(SQLITE_HEADER.length);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const valid = format === "db"
      ? bytesRead === SQLITE_HEADER.length && bytes.equals(SQLITE_HEADER)
      : bytesRead >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    if (!valid) throw new RestoreStagingError("FORMAT_MISMATCH");
  } finally {
    await handle.close();
  }
}

function safeId(factory: () => string): string {
  const id = factory();
  if (!RESTORE_ID.test(id)) throw new RestoreStagingError("STAGING_FAILED");
  return id;
}

type FileIdentity = Readonly<{ dev: number; ino: number; size: number; mtimeMs: number }>;

function identity(stats: Awaited<ReturnType<typeof fs.lstat>>): FileIdentity {
  return { dev: Number(stats.dev), ino: Number(stats.ino), size: Number(stats.size), mtimeMs: Number(stats.mtimeMs) };
}

function sameIdentity(expected: FileIdentity, actual: Awaited<ReturnType<typeof fs.lstat>>) {
  return expected.dev === actual.dev && expected.ino === actual.ino &&
    expected.size === actual.size && expected.mtimeMs === actual.mtimeMs;
}

function parseTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? parsed : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function canonicalRoots(roots: readonly string[]) {
  return [...new Set(roots)].sort((left, right) =>
    left === "database" ? -1 : right === "database" ? 1 : left.localeCompare(right));
}

function parsePendingDescriptor(value: unknown): PendingRestoreDescriptor {
  if (!isPlainRecord(value)) throw new RestoreStagingError("STAGING_FAILED");
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "createdAt,expiresAt,format,id,roots,sha256,version") {
    throw new RestoreStagingError("STAGING_FAILED");
  }
  const createdAt = parseTimestamp(value.createdAt);
  const expiresAt = parseTimestamp(value.expiresAt);
  const roots = value.roots;
  if (
    value.version !== 1 || typeof value.id !== "string" || !RESTORE_ID.test(value.id) ||
    typeof value.sha256 !== "string" || !SHA256.test(value.sha256) ||
    (value.format !== "db" && value.format !== "tar.gz") || !createdAt || !expiresAt ||
    expiresAt.getTime() - createdAt.getTime() !== PENDING_RESTORE_TTL_MS ||
    !Array.isArray(roots) || roots.length < 1 || roots.length > RESTORE_ROOTS.size ||
    roots.some((root) => typeof root !== "string" || !RESTORE_ROOTS.has(root)) ||
    roots[0] !== "database" || JSON.stringify(roots) !== JSON.stringify(canonicalRoots(roots as string[]))
  ) {
    throw new RestoreStagingError("STAGING_FAILED");
  }
  return {
    version: 1,
    id: value.id,
    sha256: value.sha256,
    format: value.format,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    roots: roots as string[],
  };
}

async function readSmallRegularJson(file: string) {
  const stats = await fs.lstat(file);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 4_096) throw new RestoreStagingError("STAGING_FAILED");
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new RestoreStagingError("STAGING_FAILED");
  }
  return { value, identity: identity(stats) };
}

async function validateRemovalTree(directory: string): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const stats = await fs.lstat(entryPath);
    if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) {
      throw new RestoreStagingError("STAGING_FAILED");
    }
    if (stats.isDirectory()) await validateRemovalTree(entryPath);
  }
}

async function removeOpaqueStageDirectory(restoreRoot: string, id: string) {
  if (!RESTORE_ID.test(id)) throw new RestoreStagingError("STAGING_FAILED");
  const directory = path.join(restoreRoot, "staged", id);
  let stats: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stats = await fs.lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new RestoreStagingError("STAGING_FAILED");
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new RestoreStagingError("STAGING_FAILED");
  const expected = identity(stats);
  await validateRemovalTree(directory);
  const current = await fs.lstat(directory);
  if (!sameIdentity(expected, current)) throw new RestoreStagingError("STAGING_FAILED");
  await fs.rm(directory, { recursive: true });
}

async function consumeExpiredPending(restoreRoot: string, now: Date) {
  const pendingPath = getPendingRestorePath(restoreRoot);
  let pending: Awaited<ReturnType<typeof readSmallRegularJson>>;
  try {
    pending = await readSmallRegularJson(pendingPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const descriptor = parsePendingDescriptor(pending.value);
  if (now.getTime() < new Date(descriptor.expiresAt).getTime()) throw new RestoreStagingError("RESTORE_PENDING");
  await removeOpaqueStageDirectory(restoreRoot, descriptor.id);
  const current = await fs.lstat(pendingPath);
  if (!current.isFile() || current.isSymbolicLink() || !sameIdentity(pending.identity, current)) {
    throw new RestoreStagingError("STAGING_FAILED");
  }
  await fs.unlink(pendingPath);
}

async function removeStaleLegacyFileLock(lockPath: string) {
  let observed: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    observed = await fs.lstat(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new RestoreStagingError("STAGING_FAILED");
  }
  if (observed.isDirectory() && !observed.isSymbolicLink()) return;
  if (!observed.isFile() || observed.isSymbolicLink()) throw new RestoreStagingError("STAGING_FAILED");
  if (Date.now() - observed.mtimeMs <= RESTORE_LOCK_STALE_MS) throw new RestoreStagingError("RESTORE_PENDING");
  const expected = identity(observed);
  const current = await fs.lstat(lockPath);
  if (!current.isFile() || current.isSymbolicLink() || !sameIdentity(expected, current)) {
    throw new RestoreStagingError("RESTORE_PENDING");
  }
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    if (["EISDIR", "EPERM", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      throw new RestoreStagingError("RESTORE_PENDING");
    }
    throw new RestoreStagingError("STAGING_FAILED");
  }
}

async function acquireRestoreLock(restoreRoot: string) {
  const lockPath = path.join(restoreRoot, "pending.lock");
  await removeStaleLegacyFileLock(lockPath);
  let compromised: Error | null = null;
  let release: (() => Promise<void>);
  try {
    release = await lockFile(restoreRoot, {
      lockfilePath: lockPath,
      realpath: false,
      retries: 0,
      stale: RESTORE_LOCK_STALE_MS,
      update: RESTORE_LOCK_UPDATE_MS,
      onCompromised: (error) => { compromised = error; },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") throw new RestoreStagingError("RESTORE_PENDING");
    throw new RestoreStagingError("STAGING_FAILED");
  }
  return {
    assertOwned() {
      if (compromised) throw new RestoreStagingError("STAGING_FAILED");
    },
    async release() {
      try {
        await release();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ERELEASED") throw new RestoreStagingError("STAGING_FAILED");
      }
    },
  };
}

export async function cancelPendingRestore(options: Readonly<{
  restoreRoot: string;
  expectedId: string;
  now?: () => Date;
}>): Promise<PendingRestoreDescriptor> {
  if (!RESTORE_ID.test(options.expectedId)) throw new RestoreStagingError("RESTORE_ID_MISMATCH");
  const restoreRoot = path.resolve(options.restoreRoot);
  const now = (options.now ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) throw new RestoreStagingError("STAGING_FAILED");
  try {
    const rootStats = await fs.lstat(restoreRoot);
    const stagedStats = await fs.lstat(path.join(restoreRoot, "staged"));
    if (
      !rootStats.isDirectory() || rootStats.isSymbolicLink() ||
      !stagedStats.isDirectory() || stagedStats.isSymbolicLink()
    ) throw new RestoreStagingError("STAGING_FAILED");
  } catch (error) {
    if (error instanceof RestoreStagingError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new RestoreStagingError("RESTORE_NOT_FOUND");
    throw new RestoreStagingError("STAGING_FAILED");
  }

  const lock = await acquireRestoreLock(restoreRoot);
  try {
    const pendingPath = getPendingRestorePath(restoreRoot);
    let pending: Awaited<ReturnType<typeof readSmallRegularJson>>;
    try {
      pending = await readSmallRegularJson(pendingPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new RestoreStagingError("RESTORE_NOT_FOUND");
      throw error;
    }
    const descriptor = parsePendingDescriptor(pending.value);
    if (descriptor.id !== options.expectedId) throw new RestoreStagingError("RESTORE_ID_MISMATCH");
    lock.assertOwned();
    await removeOpaqueStageDirectory(restoreRoot, descriptor.id);
    const current = await fs.lstat(pendingPath);
    if (!current.isFile() || current.isSymbolicLink() || !sameIdentity(pending.identity, current)) {
      throw new RestoreStagingError("STAGING_FAILED");
    }
    await fs.unlink(pendingPath);
    return descriptor;
  } finally {
    await lock.release();
  }
}

export async function stageRestoreUpload(options: StageRestoreUploadOptions): Promise<StagedRestoreResult> {
  const restoreRoot = path.resolve(options.restoreRoot);
  const pendingPath = getPendingRestorePath(restoreRoot);
  const clock = options.now ?? (() => new Date());
  const startedAt = clock();
  if (!Number.isFinite(startedAt.getTime())) throw new RestoreStagingError("STAGING_FAILED");
  const maxBytes = options.maxBytes ?? getMaxRestoreUploadBytes();
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > HARD_MAX_UPLOAD_BYTES) {
    throw new RestoreStagingError("STAGING_FAILED");
  }
  if (options.contentLength !== null && (!Number.isSafeInteger(options.contentLength) || options.contentLength < 0)) {
    throw new RestoreStagingError("INVALID_LENGTH");
  }
  if (options.contentLength !== null && options.contentLength > maxBytes) {
    throw new RestoreStagingError("UPLOAD_TOO_LARGE");
  }
  if (!options.body) throw new RestoreStagingError("INVALID_BODY");
  const format = parseFormat(options.originalName);

  try {
    await fs.mkdir(restoreRoot, { recursive: true, mode: 0o700 });
    const rootStats = await fs.lstat(restoreRoot);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("unsafe restore root");
    await fs.chmod(restoreRoot, 0o700);
    const stagedRoot = path.join(restoreRoot, "staged");
    await fs.mkdir(stagedRoot, { mode: 0o700 });
    const stagedStats = await fs.lstat(stagedRoot);
    if (!stagedStats.isDirectory() || stagedStats.isSymbolicLink()) throw new Error("unsafe staged root");
    await fs.chmod(stagedRoot, 0o700);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new RestoreStagingError("STAGING_FAILED");
    const stagedStats = await fs.lstat(path.join(restoreRoot, "staged")).catch(() => null);
    if (!stagedStats?.isDirectory() || stagedStats.isSymbolicLink()) throw new RestoreStagingError("STAGING_FAILED");
    await fs.chmod(restoreRoot, 0o700).catch(() => { throw new RestoreStagingError("STAGING_FAILED"); });
    await fs.chmod(path.join(restoreRoot, "staged"), 0o700).catch(() => { throw new RestoreStagingError("STAGING_FAILED"); });
  }
  const lock = await acquireRestoreLock(restoreRoot);

  let stageDirectory: string | null = null;
  let descriptorCommitted = false;

  try {
    await consumeExpiredPending(restoreRoot, startedAt);
    const id = safeId(options.createId ?? (() => randomBytes(18).toString("base64url")));
    stageDirectory = path.join(restoreRoot, "staged", id);
    const partialPath = path.join(stageDirectory, "artifact.partial");
    const artifactPath = path.join(stageDirectory, `artifact.${format}`);
    await fs.mkdir(stageDirectory, { mode: 0o700 });
    const artifactHandle = await fs.open(partialPath, "wx", 0o600);
    const reader = options.body.getReader();
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      for (;;) {
        lock.assertOwned();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (!Number.isSafeInteger(bytes) || bytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new RestoreStagingError("UPLOAD_TOO_LARGE");
        }
        await artifactHandle.write(value);
        hash.update(value);
      }
      await artifactHandle.sync();
    } finally {
      reader.releaseLock();
      await artifactHandle.close();
    }
    if (options.contentLength !== null && bytes !== options.contentLength) {
      throw new RestoreStagingError("INVALID_LENGTH");
    }

    await fs.rename(partialPath, artifactPath);
    await assertMagic(artifactPath, format);

    let roots: readonly string[] = ["database"];
    try {
      if (format === "db") {
        await (options.validateDatabase ?? validateSqliteDatabase)(artifactPath);
      } else {
        const validationDirectory = path.join(stageDirectory, "validation");
        const inspected = await (options.validateArchive ?? extractAndVerifyBackupArchive)(artifactPath, validationDirectory);
        if (inspected) {
          await (options.validateDatabase ?? validateSqliteDatabase)(
            path.join(validationDirectory, ...inspected.layout.databasePath.split("/")),
          );
          roots = ["database", ...inspected.layout.contentRoots];
        }
        await fs.rm(validationDirectory, { recursive: true, force: true });
      }
    } catch (error) {
      if (error instanceof RestoreStagingError) throw error;
      throw new RestoreStagingError("INVALID_ARTIFACT");
    }

    const now = clock();
    if (!Number.isFinite(now.getTime())) throw new RestoreStagingError("STAGING_FAILED");
    lock.assertOwned();
    const sha256 = hash.digest("hex");
    const descriptor: PendingRestoreDescriptor = {
      version: 1,
      id,
      sha256,
      format,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PENDING_RESTORE_TTL_MS).toISOString(),
      roots: [...new Set(roots)].sort((left, right) => left === "database" ? -1 : right === "database" ? 1 : left.localeCompare(right)),
    };
    const descriptorHandle = await fs.open(pendingPath, "wx", 0o600);
    try {
      await descriptorHandle.writeFile(JSON.stringify(descriptor));
      await descriptorHandle.sync();
    } finally {
      await descriptorHandle.close();
    }
    descriptorCommitted = true;
    return { id, format, bytes, sha256, expiresAt: descriptor.expiresAt };
  } catch (error) {
    if (!descriptorCommitted && stageDirectory) await fs.rm(stageDirectory, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof RestoreStagingError) throw error;
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RestoreStagingError("RESTORE_PENDING");
    throw new RestoreStagingError("STAGING_FAILED");
  } finally {
    await lock.release();
  }
}
