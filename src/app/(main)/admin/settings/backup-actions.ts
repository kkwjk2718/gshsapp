"use server";

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createBackup, restoreBackupFile, setBackupIntervalDays, setLastBackupAt, restoreUploadedFile } from "@/lib/backup";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function updateBackupInterval(formData: FormData) {
  await assertAdmin();
  const days = Number(formData.get("days") || "1");
  if (!Number.isFinite(days) || days <= 0) throw new Error("유효한 일(day) 값을 입력하세요.");
  await setBackupIntervalDays(days);
  revalidatePath("/admin/settings");
}

export async function backupNow() {
  await assertAdmin();
  await createBackup("manual");
  await setLastBackupAt(new Date());
  revalidatePath("/admin/settings");
}

export async function restoreFromBackup(formData: FormData) {
  await assertAdmin();
  const file = String(formData.get("file") || "");
  if (!file) throw new Error("복원할 백업을 선택하세요.");
  await restoreBackupFile(file);
  revalidatePath("/admin/settings");
}

type RestoreState = {
  ok?: boolean;
  message?: string;
  summary?: string[];
};

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

export async function restoreFromUpload(_: RestoreState, formData: FormData): Promise<RestoreState> {
  try {
    await assertAdmin();

    const confirmText = String(formData.get("confirmText") || "").trim();
    if (confirmText !== "예") {
      return { ok: false, message: "복원 확인을 위해 '예'를 정확히 입력하세요." };
    }

    const f = formData.get("dbfile");
    if (!(f instanceof File)) return { ok: false, message: "파일을 선택하세요." };
    if (!(f.name.endsWith(".db") || f.name.endsWith(".tar.gz"))) {
      return { ok: false, message: ".db 또는 .tar.gz 파일만 복원 가능합니다." };
    }

    const before = await getCounts().catch(() => null);

    const bytes = Buffer.from(await f.arrayBuffer());
    const temp = path.join(os.tmpdir(), `tmp-restore-${Date.now()}` + (f.name.endsWith(".tar.gz") ? ".tar.gz" : ".db"));
    await fs.writeFile(temp, bytes);
    await restoreUploadedFile(temp, f.name);
    await fs.unlink(temp).catch(() => {});

    const after = await getCounts().catch(() => null);

    revalidatePath("/admin/settings");

    const summary: string[] = [];
    if (before && after) {
      summary.push(`사용자: ${before.users} → ${after.users}`);
      summary.push(`공지: ${before.notices} → ${after.notices}`);
      summary.push(`링크: ${before.links} → ${after.links}`);
      summary.push(`기상곡 요청: ${before.songs} → ${after.songs}`);
      summary.push(`시스템 로그: ${before.logs} → ${after.logs}`);
    }

    return {
      ok: true,
      message: `복원이 완료되었습니다. (${f.name})`,
      summary,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message || "복원 중 오류가 발생했습니다." };
  }
}
