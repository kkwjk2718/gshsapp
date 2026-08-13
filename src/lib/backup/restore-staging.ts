import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { extractAndVerifyBackupArchive, type InspectedBackupArchive } from "./archive-io";
import { validateSqliteDatabase } from "./sqlite-snapshot";

const DEFAULT_MAX_UPLOAD_BYTES = 128 * 1024 * 1024;
const HARD_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const PENDING_RESTORE_TTL_MS = 24 * 60 * 60 * 1000;
const RESTORE_ID = /^[A-Za-z0-9_-]{20,64}$/u;
const INVALID_FILENAME_CHARACTER = /[\u0000-\u001f\u007f-\u009f\ufeff\\/]/u;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");

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

async function pendingAlreadyExists(pendingPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(pendingPath);
    return stats.isFile() || stats.isSymbolicLink() || stats.isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new RestoreStagingError("STAGING_FAILED");
  }
}

export async function stageRestoreUpload(options: StageRestoreUploadOptions): Promise<StagedRestoreResult> {
  const restoreRoot = path.resolve(options.restoreRoot);
  const pendingPath = getPendingRestorePath(restoreRoot);
  const lockPath = path.join(restoreRoot, "pending.lock");
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
  if (await pendingAlreadyExists(pendingPath)) throw new RestoreStagingError("RESTORE_PENDING");

  let lockHandle: fs.FileHandle;
  try {
    lockHandle = await fs.open(lockPath, "wx", 0o600);
    await lockHandle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RestoreStagingError("RESTORE_PENDING");
    throw new RestoreStagingError("STAGING_FAILED");
  }

  const id = safeId(options.createId ?? (() => randomBytes(18).toString("base64url")));
  const stageDirectory = path.join(restoreRoot, "staged", id);
  const partialPath = path.join(stageDirectory, "artifact.partial");
  const artifactPath = path.join(stageDirectory, `artifact.${format}`);
  let descriptorCommitted = false;

  try {
    await fs.mkdir(stageDirectory, { mode: 0o700 });
    const artifactHandle = await fs.open(partialPath, "wx", 0o600);
    const reader = options.body.getReader();
    const hash = createHash("sha256");
    let bytes = 0;
    try {
      for (;;) {
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

    const now = (options.now ?? (() => new Date()))();
    if (!Number.isFinite(now.getTime())) throw new RestoreStagingError("STAGING_FAILED");
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
    if (!descriptorCommitted) await fs.rm(stageDirectory, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof RestoreStagingError) throw error;
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RestoreStagingError("RESTORE_PENDING");
    throw new RestoreStagingError("STAGING_FAILED");
  } finally {
    await lockHandle.close().catch(() => undefined);
    await fs.rm(lockPath, { force: true }).catch(() => undefined);
  }
}
