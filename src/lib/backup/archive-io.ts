import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { extract, list, type ReadEntry } from "tar";

import {
  BACKUP_ARCHIVE_LIMITS,
  BackupArchivePolicyError,
  validateArchiveEntries,
  type ArchiveEntryInput,
  type ArchivePolicyLimits,
  type ValidatedArchiveLayout,
} from "./archive-policy";

const MAX_META_ENTRY_BYTES = 64 * 1024;
const MAX_DECOMPRESSION_RATIO = 1_000;
const MAX_READ_SIZE = 1024 * 1024;

export type BackupArchiveErrorCode =
  | "INVALID_ARCHIVE"
  | "ARCHIVE_CHANGED"
  | "EXTRACTION_MISMATCH"
  | "MANIFEST_INVALID"
  | "CHECKSUM_MISMATCH";

export class BackupArchiveError extends Error {
  constructor(readonly code: BackupArchiveErrorCode) {
    super(code);
    this.name = "BackupArchiveError";
  }
}

export type InspectedBackupArchive = Readonly<{
  layout: ValidatedArchiveLayout;
  artifactSha256: string;
}>;

type BackupManifestFile = Readonly<{ path: string; size: number; sha256: string }>;

function toArchiveEntry(entry: ReadEntry): ArchiveEntryInput {
  return { path: entry.path, type: entry.type, size: entry.size };
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

function tarReadOptions(file: string) {
  return {
    file,
    strict: true,
    maxReadSize: MAX_READ_SIZE,
    maxMetaEntrySize: MAX_META_ENTRY_BYTES,
    maxDecompressionRatio: MAX_DECOMPRESSION_RATIO,
    onwarn: () => {
      throw new BackupArchiveError("INVALID_ARCHIVE");
    },
  } as const;
}

export async function inspectBackupArchive(
  file: string,
  limits: Partial<ArchivePolicyLimits> = {},
): Promise<InspectedBackupArchive> {
  const entries: ArchiveEntryInput[] = [];
  try {
    await list({
      ...tarReadOptions(file),
      onReadEntry: (entry) => {
        entries.push(toArchiveEntry(entry));
      },
    });
    const layout = validateArchiveEntries(entries, limits);
    return { layout, artifactSha256: await sha256File(file) };
  } catch (error) {
    if (error instanceof BackupArchiveError) throw error;
    if (error instanceof BackupArchivePolicyError) throw new BackupArchiveError("INVALID_ARCHIVE");
    throw new BackupArchiveError("INVALID_ARCHIVE");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseManifest(value: unknown): {
  database: string;
  contentRoots: string[];
  files: BackupManifestFile[];
} {
  if (!isPlainObject(value)) throw new BackupArchiveError("MANIFEST_INVALID");
  const keys = Object.keys(value).sort();
  if (keys.join("|") !== "contentRoots|createdAt|database|files|format|version") {
    throw new BackupArchiveError("MANIFEST_INVALID");
  }
  if (
    value.format !== "gshsapp-backup" ||
    value.version !== 2 ||
    value.database !== "database/dev.db" ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.contentRoots) ||
    !Array.isArray(value.files)
  ) {
    throw new BackupArchiveError("MANIFEST_INVALID");
  }
  if (value.contentRoots.some((root) => typeof root !== "string")) {
    throw new BackupArchiveError("MANIFEST_INVALID");
  }
  const files = value.files.map((item): BackupManifestFile => {
    if (
      !isPlainObject(item) ||
      Object.keys(item).sort().join("|") !== "path|sha256|size" ||
      typeof item.path !== "string" ||
      !Number.isSafeInteger(item.size) ||
      (item.size as number) < 0 ||
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(item.sha256)
    ) {
      throw new BackupArchiveError("MANIFEST_INVALID");
    }
    return { path: item.path, size: item.size as number, sha256: item.sha256 };
  });
  return {
    database: value.database,
    contentRoots: value.contentRoots as string[],
    files,
  };
}

async function walkExtractedTree(root: string): Promise<ArchiveEntryInput[]> {
  const entries: ArchiveEntryInput[] = [];
  async function walk(directory: string, relative: string) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const childRelative = relative ? `${relative}/${child.name}` : child.name;
      const absolute = path.join(directory, child.name);
      const stats = await fs.lstat(absolute);
      if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory())) {
        throw new BackupArchiveError("EXTRACTION_MISMATCH");
      }
      if (stats.isDirectory()) {
        entries.push({ path: childRelative, type: "Directory", size: 0 });
        await walk(absolute, childRelative);
      } else {
        entries.push({ path: childRelative, type: "File", size: stats.size });
      }
    }
  }
  await walk(root, "");
  return entries;
}

function validateExtractedEntries(expected: ValidatedArchiveLayout, actual: readonly ArchiveEntryInput[]) {
  const expectedFiles = new Map(
    expected.entries.filter((entry) => entry.type === "File").map((entry) => [entry.portableKey, entry]),
  );
  const actualFiles = actual.filter((entry) => entry.type === "File");
  if (actualFiles.length !== expectedFiles.size) throw new BackupArchiveError("EXTRACTION_MISMATCH");

  for (const file of actualFiles) {
    const expectedFile = expectedFiles.get(file.path.normalize("NFC").toLocaleLowerCase("en-US"));
    if (!expectedFile || expectedFile.path !== file.path || expectedFile.size !== file.size) {
      throw new BackupArchiveError("EXTRACTION_MISMATCH");
    }
  }

  const expectedPaths = expected.entries.map((entry) => entry.path);
  for (const directory of actual.filter((entry) => entry.type === "Directory")) {
    if (!expectedPaths.some((entryPath) => entryPath === directory.path || entryPath.startsWith(`${directory.path}/`))) {
      throw new BackupArchiveError("EXTRACTION_MISMATCH");
    }
  }
}

async function verifyCanonicalManifest(destination: string, layout: ValidatedArchiveLayout) {
  const manifestPath = path.join(destination, "manifest.json");
  const stats = await fs.stat(manifestPath);
  if (stats.size > 64 * 1024) throw new BackupArchiveError("MANIFEST_INVALID");

  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    throw new BackupArchiveError("MANIFEST_INVALID");
  }
  const manifest = parseManifest(parsed);
  if (
    manifest.database !== layout.databasePath ||
    manifest.contentRoots.slice().sort().join("|") !== layout.contentRoots.slice().sort().join("|")
  ) {
    throw new BackupArchiveError("MANIFEST_INVALID");
  }

  const expectedFiles = layout.entries
    .filter((entry) => entry.type === "File" && entry.path !== "manifest.json")
    .map((entry) => entry.path)
    .sort();
  const manifestPaths = manifest.files.map((file) => file.path).sort();
  if (expectedFiles.join("|") !== manifestPaths.join("|")) throw new BackupArchiveError("MANIFEST_INVALID");

  for (const file of manifest.files) {
    const expected = layout.entries.find((entry) => entry.path === file.path && entry.type === "File");
    if (!expected || expected.size !== file.size) throw new BackupArchiveError("MANIFEST_INVALID");
    const digest = await sha256File(path.join(destination, ...file.path.split("/")));
    if (digest !== file.sha256) throw new BackupArchiveError("CHECKSUM_MISMATCH");
  }
}

export async function extractAndVerifyBackupArchive(
  file: string,
  destination: string,
  limits: Partial<ArchivePolicyLimits> = {},
): Promise<InspectedBackupArchive> {
  const inspected = await inspectBackupArchive(file, limits);
  const expectedEntries = inspected.layout.entries;
  let extractionIndex = 0;
  let extractionMismatch = false;

  await fs.mkdir(destination, { mode: 0o700 });
  try {
    await extract({
      ...tarReadOptions(file),
      cwd: destination,
      preservePaths: false,
      preserveOwner: false,
      chmod: false,
      noMtime: true,
      keep: true,
      unlink: false,
      maxDepth: Math.min(limits.maxDepth ?? BACKUP_ARCHIVE_LIMITS.maxDepth, BACKUP_ARCHIVE_LIMITS.maxDepth),
      filter: (_entryPath, entry) => {
        if (extractionMismatch) return false;
        const actual = toArchiveEntry(entry as ReadEntry);
        const expected = expectedEntries[extractionIndex++];
        const comparablePath = actual.type === "Directory" && actual.path.endsWith("/")
          ? actual.path.slice(0, -1)
          : actual.path;
        if (!expected || comparablePath !== expected.path || actual.type !== expected.type || actual.size !== expected.size) {
          extractionMismatch = true;
          return false;
        }
        return true;
      },
    });
    if (extractionMismatch || extractionIndex !== expectedEntries.length) {
      throw new BackupArchiveError("EXTRACTION_MISMATCH");
    }
    if (await sha256File(file) !== inspected.artifactSha256) throw new BackupArchiveError("ARCHIVE_CHANGED");

    const actualEntries = await walkExtractedTree(destination);
    validateExtractedEntries(inspected.layout, actualEntries);
    if (inspected.layout.layout === "canonical-v2") {
      await verifyCanonicalManifest(destination, inspected.layout);
    }
    return inspected;
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true });
    if (error instanceof BackupArchiveError) throw error;
    throw new BackupArchiveError("INVALID_ARCHIVE");
  }
}

export async function hashBackupArtifact(file: string) {
  return sha256File(file);
}
