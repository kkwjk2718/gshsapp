"use server";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  createBackup,
  restoreBackupFile,
  restoreUploadedFile,
  setBackupIntervalDays,
  setLastBackupAt,
} from "@/lib/backup";
import {
  getActionErrorMessage,
  isSupportedBackupFileName,
  parsePositiveInteger,
  RESTORE_CONFIRM_TEXT,
} from "./backup-action-helpers";

type BackupActionState = {
  ok?: boolean;
  message?: string;
};

type RestoreState = BackupActionState & {
  summary?: string[];
};

async function assertAdmin() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}

async function getCounts() {
  const [users, notices, links, songs, logs] = await Promise.all([
    prisma.user.count(),
    prisma.notice.count(),
    prisma.linkItem.count(),
    prisma.songRequest.count(),
    prisma.systemLog.count(),
  ]);

  return { users, notices, links, songs, logs };
}

export async function updateBackupInterval(
  _: BackupActionState,
  formData: FormData,
): Promise<BackupActionState> {
  try {
    await assertAdmin();

    const days = parsePositiveInteger(formData.get("days"));
    if (!days) {
      return { ok: false, message: "Please enter a positive whole number of days." };
    }

    await setBackupIntervalDays(days);
    revalidatePath("/admin/settings");

    return {
      ok: true,
      message: `Backup interval updated to every ${days} day(s).`,
    };
  } catch (error) {
    return {
      ok: false,
      message: getActionErrorMessage(error, "Failed to update the backup interval."),
    };
  }
}

export async function backupNow(_: BackupActionState): Promise<BackupActionState> {
  try {
    await assertAdmin();
    await createBackup("manual");
    await setLastBackupAt(new Date());
    revalidatePath("/admin/settings");

    return {
      ok: true,
      message: "Backup completed successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: getActionErrorMessage(error, "Failed to create a backup."),
    };
  }
}

export async function restoreFromBackup(formData: FormData) {
  await assertAdmin();

  const file = String(formData.get("file") || "");
  if (!file) {
    throw new Error("Please choose a backup file to restore.");
  }

  await restoreBackupFile(file);
  revalidatePath("/admin/settings");
}

export async function restoreFromUpload(
  _: RestoreState,
  formData: FormData,
): Promise<RestoreState> {
  try {
    await assertAdmin();

    const confirmText = String(formData.get("confirmText") || "").trim();
    if (confirmText !== RESTORE_CONFIRM_TEXT) {
      return {
        ok: false,
        message: `Type ${RESTORE_CONFIRM_TEXT} exactly to confirm the restore.`,
      };
    }

    const file = formData.get("dbfile");
    if (!(file instanceof File)) {
      return { ok: false, message: "Please choose a backup file." };
    }

    if (!isSupportedBackupFileName(file.name)) {
      return { ok: false, message: "Only .db or .tar.gz backup files are supported." };
    }

    const before = await getCounts().catch(() => null);
    const bytes = Buffer.from(await file.arrayBuffer());
    const tempExtension = file.name.toLowerCase().endsWith(".tar.gz") ? ".tar.gz" : ".db";
    const tempPath = path.join(os.tmpdir(), `tmp-restore-${Date.now()}${tempExtension}`);

    await fs.writeFile(tempPath, bytes);

    try {
      await restoreUploadedFile(tempPath, file.name);
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }

    const after = await getCounts().catch(() => null);
    revalidatePath("/admin/settings");

    const summary: string[] = [];
    if (before && after) {
      summary.push(`Users: ${before.users} -> ${after.users}`);
      summary.push(`Notices: ${before.notices} -> ${after.notices}`);
      summary.push(`Links: ${before.links} -> ${after.links}`);
      summary.push(`Song requests: ${before.songs} -> ${after.songs}`);
      summary.push(`System logs: ${before.logs} -> ${after.logs}`);
    }

    return {
      ok: true,
      message: `Restore completed successfully from ${file.name}.`,
      summary,
    };
  } catch (error) {
    return {
      ok: false,
      message: getActionErrorMessage(error, "An unexpected error occurred during restore."),
    };
  }
}
