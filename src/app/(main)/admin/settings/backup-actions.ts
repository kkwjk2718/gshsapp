"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/current-user";
import {
  createBackup,
  setBackupIntervalDays,
  setLastBackupAt,
} from "@/lib/backup";
import {
  getActionErrorMessage,
  parsePositiveInteger,
} from "./backup-action-helpers";

type BackupActionState = {
  ok?: boolean;
  message?: string;
};

async function assertAdmin() {
  return requireAdmin();
}

export async function updateBackupInterval(
  _: BackupActionState,
  formData: FormData,
): Promise<BackupActionState> {
  try {
    const actor = await assertAdmin();

    const days = parsePositiveInteger(formData.get("days"));
    if (!days) {
      return { ok: false, message: "Please enter a positive whole number of days." };
    }

    await prisma.$transaction(async (tx) => {
      await setBackupIntervalDays(days, tx);
      await writeAuditLog(tx, {
        actorId: actor.id,
        action: "BACKUP_INTERVAL_CHANGED",
        target: { type: "SYSTEM_SETTING", id: "BACKUP_INTERVAL_DAYS" },
      });
    });
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
    const actor = await assertAdmin();
    await writeAuditLog(prisma, {
      actorId: actor.id,
      action: "BACKUP_CREATE_REQUESTED",
      target: { type: "BACKUP" },
    });
    const backup = await createBackup("manual");
    await setLastBackupAt(new Date());
    await writeAuditLog(prisma, {
      actorId: actor.id,
      action: "BACKUP_CREATED",
      target: { type: "BACKUP", id: backup.file },
    });
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
