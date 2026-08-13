const DEFAULT_LIMITS = {
  maxEntries: 10_000,
  maxTotalBytes: 512 * 1024 * 1024,
  maxFileBytes: 512 * 1024 * 1024,
  maxPathBytes: 512,
  maxDepth: 32,
} as const;

const HARD_LIMITS = {
  maxEntries: 50_000,
  maxTotalBytes: 4 * 1024 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024 * 1024,
  maxPathBytes: 512,
  maxDepth: 32,
} as const;

export type ArchivePolicyLimits = Readonly<{
  maxEntries: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  maxPathBytes: number;
  maxDepth: number;
}>;

export type ArchiveEntryInput = Readonly<{
  path: string;
  type: string;
  size: number;
}>;

export type ValidatedArchiveEntry = Readonly<{
  path: string;
  type: "File" | "Directory";
  size: number;
  portableKey: string;
}>;

export type ArchiveLayout = "canonical-v2" | "legacy";

export type ValidatedArchiveLayout = Readonly<{
  layout: ArchiveLayout;
  entries: readonly ValidatedArchiveEntry[];
  databasePath: string;
  contentRoots: readonly string[];
  totalBytes: number;
}>;

export type BackupArchivePolicyCode =
  | "INVALID_LIMIT"
  | "ENTRY_LIMIT"
  | "UNSUPPORTED_TYPE"
  | "INVALID_PATH"
  | "PATH_LIMIT"
  | "DEPTH_LIMIT"
  | "FILE_SIZE_LIMIT"
  | "TOTAL_SIZE_LIMIT"
  | "PATH_COLLISION"
  | "UNEXPECTED_PATH"
  | "MIXED_LAYOUT"
  | "DESTINATION_COLLISION"
  | "MISSING_DATABASE"
  | "MISSING_MANIFEST";

export class BackupArchivePolicyError extends Error {
  constructor(readonly code: BackupArchivePolicyCode) {
    super(code);
    this.name = "BackupArchivePolicyError";
  }
}

const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\ufeff\\:<>"|?*]/u;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const LEGACY_DATABASE_PATHS = new Set(["dev.db", "data/dev.db", "prisma/dev.db"]);

const CANONICAL_CONTENT_ROOTS = ["uploads", "user-content", "storage", "logs"] as const;
const LEGACY_CONTENT_ROOTS = [
  { source: "public/uploads", target: "uploads" },
  { source: "uploads", target: "uploads" },
  { source: "public/user-content", target: "user-content" },
  { source: "storage", target: "storage" },
  { source: "logs", target: "logs" },
] as const;

function fail(code: BackupArchivePolicyCode): never {
  throw new BackupArchivePolicyError(code);
}

function resolveLimits(overrides: Partial<ArchivePolicyLimits> = {}): ArchivePolicyLimits {
  const result = { ...DEFAULT_LIMITS, ...overrides };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof ArchivePolicyLimits)[]) {
    const value = result[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > HARD_LIMITS[key]) fail("INVALID_LIMIT");
  }
  return result;
}

function normalizeEntryPath(rawPath: string, type: string, limits: ArchivePolicyLimits): string {
  if (typeof rawPath !== "string" || rawPath.length === 0 || rawPath.normalize("NFC") !== rawPath) {
    fail("INVALID_PATH");
  }
  if (FORBIDDEN_CHARACTERS.test(rawPath)) fail("INVALID_PATH");

  let archivePath = rawPath;
  if (archivePath.endsWith("/")) {
    if (type !== "Directory" || archivePath.endsWith("//")) fail("INVALID_PATH");
    archivePath = archivePath.slice(0, -1);
  }

  if (
    archivePath.length === 0 ||
    archivePath.startsWith("/") ||
    archivePath.startsWith("~") ||
    archivePath.startsWith("./") ||
    /^[a-z]:/iu.test(archivePath)
  ) {
    fail("INVALID_PATH");
  }

  const segments = archivePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail("INVALID_PATH");
  }
  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" ") || WINDOWS_DEVICE.test(segment))) {
    fail("INVALID_PATH");
  }
  if (segments.length > limits.maxDepth) fail("DEPTH_LIMIT");
  if (new TextEncoder().encode(archivePath).byteLength > limits.maxPathBytes) fail("PATH_LIMIT");
  return archivePath;
}

function isPathOrDescendant(value: string, root: string): boolean {
  return value === root || value.startsWith(`${root}/`);
}

function classifyAllowedPath(archivePath: string, type: "File" | "Directory") {
  if (archivePath === "manifest.json") return { layout: "canonical" as const, leaf: type === "File" };
  if (archivePath === "database") return { layout: "canonical" as const, leaf: type === "Directory" };
  if (archivePath === "database/dev.db") return { layout: "canonical" as const, leaf: type === "File" };
  if (archivePath === "content") return { layout: "canonical" as const, leaf: type === "Directory" };
  for (const root of CANONICAL_CONTENT_ROOTS) {
    const source = `content/${root}`;
    if (isPathOrDescendant(archivePath, source)) {
      return { layout: "canonical" as const, leaf: archivePath !== source || type === "Directory", contentRoot: root };
    }
  }

  if (LEGACY_DATABASE_PATHS.has(archivePath)) return { layout: "legacy" as const, leaf: type === "File" };
  if (["data", "prisma", "public"].includes(archivePath)) return { layout: "legacy" as const, leaf: type === "Directory" };
  for (const root of LEGACY_CONTENT_ROOTS) {
    if (isPathOrDescendant(archivePath, root.source)) {
      return {
        layout: "legacy" as const,
        leaf: archivePath !== root.source || type === "Directory",
        contentRoot: root.target,
        sourceRoot: root.source,
      };
    }
  }
  return null;
}

export function validateArchiveEntries(
  entries: readonly ArchiveEntryInput[],
  limitOverrides: Partial<ArchivePolicyLimits> = {},
): ValidatedArchiveLayout {
  const limits = resolveLimits(limitOverrides);
  if (entries.length < 1 || entries.length > limits.maxEntries) fail("ENTRY_LIMIT");

  const validated: ValidatedArchiveEntry[] = [];
  const paths = new Map<string, ValidatedArchiveEntry>();
  const layouts = new Set<"canonical" | "legacy">();
  const contentRoots = new Set<string>();
  const legacySourceByDestination = new Map<string, string>();
  let totalBytes = 0;

  for (const input of entries) {
    if (input.type !== "File" && input.type !== "Directory") fail("UNSUPPORTED_TYPE");
    if (!Number.isSafeInteger(input.size) || input.size < 0) fail("FILE_SIZE_LIMIT");
    if (input.type === "Directory" && input.size !== 0) fail("FILE_SIZE_LIMIT");
    if (input.type === "File" && input.size > limits.maxFileBytes) fail("FILE_SIZE_LIMIT");

    const archivePath = normalizeEntryPath(input.path, input.type, limits);
    if (archivePath === "manifest.json" && input.size > 64 * 1024) fail("FILE_SIZE_LIMIT");
    const classification = classifyAllowedPath(archivePath, input.type);
    if (!classification || !classification.leaf) fail("UNEXPECTED_PATH");

    layouts.add(classification.layout);
    if (classification.contentRoot) contentRoots.add(classification.contentRoot);
    if (classification.layout === "legacy" && classification.contentRoot && classification.sourceRoot) {
      const previous = legacySourceByDestination.get(classification.contentRoot);
      if (previous && previous !== classification.sourceRoot) fail("DESTINATION_COLLISION");
      legacySourceByDestination.set(classification.contentRoot, classification.sourceRoot);
    }

    const portableKey = archivePath.toLocaleLowerCase("en-US");
    if (paths.has(portableKey)) fail("PATH_COLLISION");
    for (const existing of paths.values()) {
      if (
        (archivePath.startsWith(`${existing.path}/`) && existing.type === "File") ||
        (existing.path.startsWith(`${archivePath}/`) && input.type === "File")
      ) {
        fail("PATH_COLLISION");
      }
    }

    const item: ValidatedArchiveEntry = { path: archivePath, type: input.type, size: input.size, portableKey };
    paths.set(portableKey, item);
    validated.push(item);
    if (input.type === "File") {
      totalBytes += input.size;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) fail("TOTAL_SIZE_LIMIT");
    }
  }

  if (layouts.size !== 1) fail("MIXED_LAYOUT");
  const layout = layouts.has("canonical") ? "canonical-v2" : "legacy";
  const databasePaths = validated
    .filter((entry) => entry.type === "File" && (entry.path === "database/dev.db" || LEGACY_DATABASE_PATHS.has(entry.path)))
    .map((entry) => entry.path);
  if (databasePaths.length !== 1) fail("MISSING_DATABASE");
  if (layout === "canonical-v2" && !paths.has("manifest.json")) fail("MISSING_MANIFEST");

  return {
    layout,
    entries: validated,
    databasePath: databasePaths[0],
    contentRoots: [...contentRoots].sort(),
    totalBytes,
  };
}

export const BACKUP_ARCHIVE_LIMITS = DEFAULT_LIMITS;
