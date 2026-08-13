import path from "node:path";

function resolvedDataRoot() {
  const configured = process.env.DATA_ROOT?.trim();
  if (configured) {
    if (configured.includes("\0") || !path.isAbsolute(configured)) throw new Error("DATA_ROOT must be absolute");
    return path.resolve(configured);
  }
  // Prisma resolves local relative SQLite URLs from the schema directory.
  // Production must provide DATA_ROOT explicitly (the server compose uses /app/data).
  return path.resolve(process.cwd(), "prisma");
}

function isWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function configuredDataPath(value: string | undefined, fallbackName: string) {
  const root = resolvedDataRoot();
  const selected = value?.trim() || fallbackName;
  if (selected.includes("\0") || /^[a-z]:[^\\/]/iu.test(selected)) throw new Error("Invalid data path configuration");
  const portableSegments = selected.replace(/\\/gu, "/").split("/");
  if (portableSegments.some((segment) => segment === ".." || segment === ".")) throw new Error("Invalid data path configuration");
  const resolved = path.isAbsolute(selected) ? path.resolve(selected) : path.resolve(root, selected);
  if (!isWithin(root, resolved)) throw new Error("Configured path escapes DATA_ROOT");
  return resolved;
}

export function getDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:dev.db";
  if (!databaseUrl.startsWith("file:") || databaseUrl.length <= "file:".length) {
    throw new Error("Backups require a file-based SQLite database");
  }
  return configuredDataPath(databaseUrl.slice("file:".length).replace(/^\.([\\/])/u, ""), "dev.db");
}

export function getDatabaseUrl() {
  return `file:${getDatabasePath().replace(/\\/gu, "/")}`;
}

export function getDataRoot() {
  return resolvedDataRoot();
}

export function getBackupDir() {
  return configuredDataPath(process.env.BACKUP_DIR, "backup");
}

export function getRestoreRoot() {
  return configuredDataPath(process.env.RESTORE_ROOT, "restore");
}

export function getWeatherCachePath() {
  return configuredDataPath(process.env.WEATHER_CACHE_PATH, "weather-cache.json");
}

export const BACKUP_CONTENT_ROOT_KEYS = ["uploads", "user-content", "storage", "logs"] as const;
export type BackupContentRootKey = (typeof BACKUP_CONTENT_ROOT_KEYS)[number];

export function getConfiguredContentRoots(): ReadonlyMap<BackupContentRootKey, string> {
  return new Map<BackupContentRootKey, string>([
    ["uploads", configuredDataPath(process.env.UPLOADS_ROOT, "uploads")],
    ["user-content", configuredDataPath(process.env.USER_CONTENT_ROOT, "user-content")],
    ["storage", configuredDataPath(process.env.STORAGE_ROOT, "storage")],
    ["logs", configuredDataPath(process.env.LOG_ROOT, "logs")],
  ]);
}
