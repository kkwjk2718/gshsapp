import fs from "node:fs/promises";
import { getBackupDir } from "@/lib/backup";

export type DiagnosticResult = {
  name: string;
  status: "PASS" | "FAIL";
  message?: string;
  details?: string[];
  latency?: number;
};

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
  getBackupDir: () => string;
  statfs: (targetDir: string) => Promise<StatFsLike>;
};

const defaultDependencies: DiagnosticsDependencies = {
  getAppVersion: () => process.env.APP_VERSION,
  getDatabaseUrl: () => process.env.DATABASE_URL,
  getBackupDir,
  statfs: (targetDir) => fs.statfs(targetDir),
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

  diagnostics.push({
    name: "Disaster Recovery Backup",
    status: "FAIL",
    message: "Authoritative backup status is available only from the root operations console.",
    details: [
      `${backupDir} is an app-managed export area and is not an offsite disaster-recovery receipt source.`,
      "Verify the root-only offsite receipt with the installed operations controls.",
    ],
  });

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
