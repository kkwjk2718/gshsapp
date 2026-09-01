import type { Prisma } from "@prisma/client";

import { createSafeBackup, listSafeBackups } from "@/lib/backup/backup-engine";
import {
  BACKUP_CONTENT_ROOT_KEYS,
  getBackupDir as resolveBackupDir,
  getConfiguredContentRoots,
  getDatabasePath,
} from "@/lib/backup/paths";
import { prisma } from "@/lib/db";

export type BackupItem = Awaited<ReturnType<typeof listSafeBackups>>[number];

let createBackupInFlight: Promise<Awaited<ReturnType<typeof createSafeBackup>>> | null = null;

async function selectedContentRoots() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "BACKUP_EXTRA_PATHS" } });
  const selected = setting?.value
    ? setting.value.split(",").map((value) => value.trim()).filter(Boolean)
    : [...BACKUP_CONTENT_ROOT_KEYS];
  if (selected.some((value) => !BACKUP_CONTENT_ROOT_KEYS.includes(value as (typeof BACKUP_CONTENT_ROOT_KEYS)[number]))) {
    throw new Error("BACKUP_EXTRA_PATHS contains an unsupported logical root");
  }
  const configured = getConfiguredContentRoots();
  return new Map(selected.map((key) => [key, configured.get(key as (typeof BACKUP_CONTENT_ROOT_KEYS)[number]) as string]));
}

export async function createBackup(reason = "manual") {
  if (createBackupInFlight) return createBackupInFlight;
  createBackupInFlight = (async () => createSafeBackup({
    backupDir: resolveBackupDir(),
    databasePath: getDatabasePath(),
    databaseClient: prisma,
    contentRoots: await selectedContentRoots(),
    reason,
  }))();
  try {
    return await createBackupInFlight;
  } finally {
    createBackupInFlight = null;
  }
}

export async function listBackups() {
  return listSafeBackups(resolveBackupDir());
}

export async function getLatestBackup() {
  const backups = await listBackups();
  return backups[0] ?? null;
}

export function getBackupDir() {
  return resolveBackupDir();
}

export async function getBackupIntervalDays() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "BACKUP_INTERVAL_DAYS" } });
  const days = Number(setting?.value || "1");
  return Number.isInteger(days) && days > 0 && days <= 365 ? days : 1;
}

type BackupSettingsDb = Pick<Prisma.TransactionClient, "systemSetting">;

export async function setBackupIntervalDays(days: number, db: BackupSettingsDb = prisma) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Invalid backup interval");
  await db.systemSetting.upsert({
    where: { key: "BACKUP_INTERVAL_DAYS" },
    update: { value: String(days), description: "Automatic backup interval (days)" },
    create: { key: "BACKUP_INTERVAL_DAYS", value: String(days), description: "Automatic backup interval (days)" },
  });
}

export async function getLastBackupAt() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "LAST_BACKUP_AT" } });
  return setting?.value ? new Date(setting.value) : null;
}

export async function setLastBackupAt(date: Date, db: BackupSettingsDb = prisma) {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid backup timestamp");
  await db.systemSetting.upsert({
    where: { key: "LAST_BACKUP_AT" },
    update: { value: date.toISOString(), description: "Last scheduled backup time" },
    create: { key: "LAST_BACKUP_AT", value: date.toISOString(), description: "Last scheduled backup time" },
  });
}

let scheduledBackupRunning = false;

export async function maybeRunScheduledBackup() {
  if (scheduledBackupRunning) return;
  scheduledBackupRunning = true;
  try {
    const [days, last] = await Promise.all([getBackupIntervalDays(), getLastBackupAt()]);
    const due = !last || !Number.isFinite(last.getTime()) || Date.now() - last.getTime() >= days * 86_400_000;
    if (!due) return;
    await createBackup("scheduled");
    await setLastBackupAt(new Date());
  } finally {
    scheduledBackupRunning = false;
  }
}
