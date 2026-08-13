"use server"

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/logger";
import { assertSafeExternalHttpsUrl } from "@/lib/network-safety";
import { getCurrentUser } from "@/lib/session";
import { SYSTEM_SETTING_KEYS, normalizeGoogleAnalyticsId } from "@/lib/system-settings";
import { writeAuditLog } from "@/lib/audit";
import { validatePassword } from "@/lib/security/password-policy";
import { MAX_STUDENT_ROSTER_BYTES, parseStudentRosterCsv } from "@/lib/security/student-roster-import";
import { withSqliteWriteRetry } from "@/lib/security/sqlite-retry";
import { replaceStudentRosterInTransaction } from "@/lib/security/student-roster-replacement";

export async function updateGradeMapping(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");

  const g1 = Number.parseInt(formData.get("grade1") as string, 10);
  const g2 = Number.parseInt(formData.get("grade2") as string, 10);
  const g3 = Number.parseInt(formData.get("grade3") as string, 10);

  if (![g1, g2, g3].every((value) => Number.isInteger(value) && value >= 1 && value <= 100)) {
    throw new Error("Invalid grade mapping");
  }

  const mapping = {
    "1": g1,
    "2": g2,
    "3": g3,
  };

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
    where: { key: "GRADE_MAPPING" },
    update: { value: JSON.stringify(mapping) },
    create: { key: "GRADE_MAPPING", value: JSON.stringify(mapping), description: "?숇뀈蹂?湲곗닔 留ㅽ븨" },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "GRADE_MAPPING_CHANGED",
      target: { type: "SYSTEM_SETTING", id: "GRADE_MAPPING" },
    });
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}

export type ActionResult = {
  success?: string;
  error?: string;
  value?: string | null;
  count?: number;
};

export async function replaceStudentRoster(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "ADMIN") throw new Error("Unauthorized");
  if (String(formData.get("confirmText") ?? "").trim() !== "REPLACE ROSTER") {
    return { error: "Type REPLACE ROSTER to confirm the atomic roster replacement." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_STUDENT_ROSTER_BYTES) {
    return { error: "Choose a CSV roster no larger than 256 KiB." };
  }

  try {
    const entries = parseStudentRosterCsv(await file.text());
    await withSqliteWriteRetry(() => prisma.$transaction((tx) =>
      replaceStudentRosterInTransaction(tx, entries, user.id),
    ));
    revalidatePath("/admin/settings");
    revalidatePath("/signup/request");
    return { success: `Student roster replaced atomically (${entries.length} active entries).`, count: entries.length };
  } catch {
    return { error: "The roster was rejected. Verify the CSV format, uniqueness, and claimed identities." };
  }
}

export async function updateICalUrl(prevState: any, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");

  let url = ((formData.get("icalUrl") as string | null) || "").trim();

  if (url) {
    try {
      url = (await assertSafeExternalHttpsUrl(url)).toString();
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? `안전하지 않은 iCal URL입니다. ${error.message}`
            : "안전하지 않은 iCal URL입니다.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: "ICAL_URL" },
      update: { value: url },
      create: { key: "ICAL_URL", value: url, description: "Google Calendar iCal URL for sync" },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "ICAL_FEED_CHANGED",
      target: { type: "SYSTEM_SETTING", id: "ICAL_URL" },
    });
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  return { success: "iCal URL이 업데이트되었습니다." };
}

export async function updateGoogleAnalyticsId(prevState: any, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");

  const rawGoogleAnalyticsId = (formData.get("googleAnalyticsId") as string | null)?.trim() || "";
  const googleAnalyticsId = normalizeGoogleAnalyticsId(rawGoogleAnalyticsId);

  if (rawGoogleAnalyticsId && !googleAnalyticsId) {
    return { error: "Google Analytics measurement IDs must look like G-XXXXXXXXXX." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.googleAnalyticsId },
      update: { value: googleAnalyticsId ?? "" },
      create: {
        key: SYSTEM_SETTING_KEYS.googleAnalyticsId,
        value: googleAnalyticsId ?? "",
        description: "Google Analytics measurement ID",
      },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "ANALYTICS_SETTING_CHANGED",
      target: { type: "SYSTEM_SETTING", id: SYSTEM_SETTING_KEYS.googleAnalyticsId },
    });
  });

  revalidatePath("/admin/settings");

  if (googleAnalyticsId) {
    return {
      success: "Google Analytics measurement ID saved.",
      value: googleAnalyticsId,
    };
  }

  return {
    success: "Google Analytics tracking disabled.",
    value: null,
  };
}

export async function updateTokenPortalConfig(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const enabled = formData.get("enabled") === "on";
  const guidance = (formData.get("guidance") as string | null)?.trim() || "";

  if (guidance.length > 2000) {
    return { error: "異붽? ?덈궡 臾멸뎄??2000???댄븯濡??낅젰?댁＜?몄슂." };
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (enabled && await tx.studentRosterEntry.count({ where: { active: true } }) < 1) {
      return false;
    }
    await tx.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalEnabled },
      update: { value: enabled ? "true" : "false" },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalEnabled,
        value: enabled ? "true" : "false",
        description: "?숈깮 ?좏겙 諛곕? ?ы꽭 ?쒖꽦???щ?",
      },
    });
    await tx.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance },
      update: { value: guidance },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance,
        value: guidance,
        description: "?좏겙 ?덈궡 硫붿씪 ?섎떒 異붽? ?덈궡 臾멸뎄",
      },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "TOKEN_PORTAL_CONFIG_CHANGED",
      target: { type: "SYSTEM_SETTING", id: SYSTEM_SETTING_KEYS.tokenPortalEnabled },
    });
    return true;
  });

  if (!updated) return { error: "Import an active authoritative student roster before enabling the portal." };

  await logAction("token_portal_settings_updated", {
    enabled,
    guidanceLength: guidance.length,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/signup/request");

  return {
    success: enabled ? "?좏겙 諛곕? ?ы꽭???쒖꽦?뷀뻽?듬땲??" : "?좏겙 諛곕? ?ы꽭??鍮꾪솢?깊솕?덉뒿?덈떎.",
  };
}

export async function updateTokenPortalPassword(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const password = (formData.get("password") as string | null)?.trim() || "";
  const confirmPassword = (formData.get("confirmPassword") as string | null)?.trim() || "";

  if (password !== confirmPassword) {
    return { error: "鍮꾨?踰덊샇? 鍮꾨?踰덊샇 ?뺤씤???쇱튂?섏? ?딆뒿?덈떎." };
  }

  const passwordPolicy = validatePassword(password);
  if (!passwordPolicy.ok) return { error: passwordPolicy.message };

  const passwordHash = await bcrypt.hash(password, 10);

  const nextVersion = await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalPasswordHash },
      update: { value: passwordHash },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalPasswordHash,
        value: passwordHash,
        description: "?좏겙 諛곕? ?ы꽭 ?묎렐 鍮꾨?踰덊샇 ?댁떆",
      },
    });
    const sessionVersionSetting = await tx.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion },
    });
    const currentVersion = Number.parseInt(sessionVersionSetting?.value || "", 10);
    const nextVersion = Number.isFinite(currentVersion) && currentVersion > 0 ? currentVersion + 1 : 1;
    await tx.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion },
      update: { value: String(nextVersion) },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion,
        value: String(nextVersion),
        description: "?좏겙 諛곕? ?ы꽭 ?몄뀡 踰꾩쟾",
      },
    });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "TOKEN_PORTAL_PASSWORD_ROTATED",
      target: { type: "SYSTEM_SETTING", id: SYSTEM_SETTING_KEYS.tokenPortalPasswordHash },
    });
    return nextVersion;
  });

  await logAction("token_portal_password_rotated", {
    sessionVersion: nextVersion,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/signup/request");

  return {
    success: "?ы꽭 ?묎렐 鍮꾨?踰덊샇瑜?蹂寃쏀뻽?듬땲?? 湲곗〈 ?몄뀡? 紐⑤몢 留뚮즺?⑸땲??",
  };
}
