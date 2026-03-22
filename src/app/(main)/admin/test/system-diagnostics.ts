import fs from "node:fs/promises";
import path from "node:path";
import { getBackupDir, getLatestBackup, type BackupItem } from "@/lib/backup";

export type DiagnosticResult = {
  name: string;
  status: "PASS" | "FAIL";
  message?: string;
  details?: string[];
  latency?: number;
};

export const DEFAULT_BACKUP_MAX_AGE_HOURS = 24;
export const MIN_FREE_DISK_BYTES = 768 * 1024 ** 2;
export const EXPECTED_DATABASE_URL = "file:/app/data/dev.db";

type StatFsLike = {
  bavail?: number | bigint;
  bsize?: number | bigint;
  frsize?: number | bigint;
};

type DiagnosticsDependencies = {
  getAppVersion: () => string | undefined;
  getDatabaseUrl: () => string | undefined;
  getBackupMaxAgeHours: () => number;
  getBackupDir: () => string;
  getLatestBackup: () => Promise<BackupItem | null>;
  ensureDir: (targetDir: string) => Promise<void>;
  writeFile: (targetFile: string, value: string) => Promise<void>;
  unlink: (targetFile: string) => Promise<void>;
  statfs: (targetDir: string) => Promise<StatFsLike>;
  now: () => Date;
};

const defaultDependencies: DiagnosticsDependencies = {
  getAppVersion: () => process.env.APP_VERSION,
  getDatabaseUrl: () => process.env.DATABASE_URL,
  getBackupMaxAgeHours: () => {
    const parsedValue = Number.parseInt(process.env.BACKUP_MAX_AGE_HOURS || "", 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_BACKUP_MAX_AGE_HOURS;
  },
  getBackupDir,
  getLatestBackup,
  ensureDir: async (targetDir) => {
    await fs.mkdir(targetDir, { recursive: true });
  },
  writeFile: (targetFile, value) => fs.writeFile(targetFile, value),
  unlink: (targetFile) => fs.unlink(targetFile),
  statfs: (targetDir) => fs.statfs(targetDir),
  now: () => new Date(),
};

function toNumber(value: number | bigint | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return value ?? 0;
}

export function isExpectedDatabaseUrl(databaseUrl: string | null | undefined) {
  return (databaseUrl || "").trim() === EXPECTED_DATABASE_URL;
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let normalizedValue = bytes;
  let unitIndex = 0;

  while (normalizedValue >= 1024 && unitIndex < units.length - 1) {
    normalizedValue /= 1024;
    unitIndex += 1;
  }

  return `${normalizedValue.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export async function runOperationalReadinessDiagnostics(
  dependencies: DiagnosticsDependencies = defaultDependencies,
): Promise<DiagnosticResult[]> {
  const diagnostics: DiagnosticResult[] = [];
  const backupDir = dependencies.getBackupDir();
  const backupMaxAgeHours = dependencies.getBackupMaxAgeHours();

  const appVersion = (dependencies.getAppVersion() || "").trim();
  diagnostics.push({
    name: "Runtime Version",
    status: appVersion ? "PASS" : "FAIL",
    message: appVersion ? `APP_VERSION=${appVersion}` : "APP_VERSION is missing.",
    details: [
      `Current app version: ${appVersion || "missing"}`,
      "Deploy verification expects APP_VERSION to match the immutable image tag.",
    ],
  });

  try {
    await dependencies.ensureDir(backupDir);
    const probePath = path.join(backupDir, `.writable-probe-${Date.now()}.tmp`);
    await dependencies.writeFile(probePath, "ok");
    await dependencies.unlink(probePath);

    diagnostics.push({
      name: "Backup Directory Writable",
      status: "PASS",
      message: `Writable backup directory: ${backupDir}`,
      details: [`Probe file write/delete succeeded in ${backupDir}.`],
    });
  } catch (error) {
    diagnostics.push({
      name: "Backup Directory Writable",
      status: "FAIL",
      message: `Backup directory is not writable: ${backupDir}`,
      details: [error instanceof Error ? error.message : "Unknown error"],
    });
  }

  try {
    const latestBackup = await dependencies.getLatestBackup();
    if (!latestBackup) {
      diagnostics.push({
        name: "Latest Backup Freshness",
        status: "FAIL",
        message: "No backup file was found in the backup directory.",
        details: [`Expected at least one backup in ${backupDir}.`],
      });
    } else {
      const ageMs = dependencies.now().getTime() - latestBackup.createdAt.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      const isFresh = ageHours <= backupMaxAgeHours;

      diagnostics.push({
        name: "Latest Backup Freshness",
        status: isFresh ? "PASS" : "FAIL",
        message: `${latestBackup.file} (${ageHours.toFixed(1)}h ago)`,
        details: [
          `Latest backup file: ${latestBackup.file}`,
          `Created at: ${latestBackup.createdAt.toISOString()}`,
          `Allowed max age: ${backupMaxAgeHours}h`,
        ],
      });
    }
  } catch (error) {
    diagnostics.push({
      name: "Latest Backup Freshness",
      status: "FAIL",
      message: "Failed to inspect backup freshness.",
      details: [error instanceof Error ? error.message : "Unknown error"],
    });
  }

  try {
    const stats = await dependencies.statfs(backupDir);
    const blockSize = toNumber(stats.frsize) || toNumber(stats.bsize);
    const availableBlocks = toNumber(stats.bavail);
    const freeBytes = blockSize * availableBlocks;
    const hasEnoughSpace = Number.isFinite(freeBytes) && freeBytes >= MIN_FREE_DISK_BYTES;

    diagnostics.push({
      name: "Disk Free Space",
      status: hasEnoughSpace ? "PASS" : "FAIL",
      message: `${formatBytes(freeBytes)} available`,
      details: [
        `Checked path: ${backupDir}`,
        `Available bytes: ${freeBytes}`,
        `Minimum recommended free space: ${formatBytes(MIN_FREE_DISK_BYTES)}`,
      ],
    });
  } catch (error) {
    diagnostics.push({
      name: "Disk Free Space",
      status: "FAIL",
      message: "Failed to inspect disk free space.",
      details: [error instanceof Error ? error.message : "Unknown error"],
    });
  }

  const databaseUrl = (dependencies.getDatabaseUrl() || "").trim();
  diagnostics.push({
    name: "Database Path Configuration",
    status: isExpectedDatabaseUrl(databaseUrl) ? "PASS" : "FAIL",
    message: databaseUrl ? `DATABASE_URL=${databaseUrl}` : "DATABASE_URL is missing.",
    details: [`Expected DATABASE_URL=${EXPECTED_DATABASE_URL}`],
  });

  return diagnostics;
}
