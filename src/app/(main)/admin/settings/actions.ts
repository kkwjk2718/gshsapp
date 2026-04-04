"use server"

import bcrypt from "bcryptjs";
import { revalidatePath, unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/logger";
import { assertSafeExternalHttpsUrl } from "@/lib/network-safety";
import { getCurrentUser } from "@/lib/session";
import { SYSTEM_SETTING_KEYS, isValidGoogleAnalyticsId } from "@/lib/system-settings";

export async function updateGradeMapping(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");

  const g1 = Number.parseInt(formData.get("grade1") as string, 10);
  const g2 = Number.parseInt(formData.get("grade2") as string, 10);
  const g3 = Number.parseInt(formData.get("grade3") as string, 10);

  const mapping = {
    "1": g1,
    "2": g2,
    "3": g3,
  };

  await prisma.systemSetting.upsert({
    where: { key: "GRADE_MAPPING" },
    update: { value: JSON.stringify(mapping) },
    create: { key: "GRADE_MAPPING", value: JSON.stringify(mapping), description: "?숇뀈蹂?湲곗닔 留ㅽ븨" },
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

export async function updateICalUrl(prevState: any, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");

  const url = ((formData.get("icalUrl") as string | null) || "").trim();

  if (url) {
    try {
      await assertSafeExternalHttpsUrl(url);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? `안전하지 않은 iCal URL입니다. ${error.message}`
            : "안전하지 않은 iCal URL입니다.",
      };
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: "ICAL_URL" },
    update: { value: url },
    create: { key: "ICAL_URL", value: url, description: "Google Calendar iCal URL for sync" },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  return { success: "iCal URL이 업데이트되었습니다." };
}

export async function updateGoogleAnalyticsId(prevState: any, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");

  const googleAnalyticsId = (formData.get("googleAnalyticsId") as string | null)?.trim() || "";

  if (googleAnalyticsId && !isValidGoogleAnalyticsId(googleAnalyticsId)) {
    return { error: "Google Analytics measurement IDs must look like G-XXXXXXXXXX." };
  }

  await prisma.systemSetting.upsert({
    where: { key: SYSTEM_SETTING_KEYS.googleAnalyticsId },
    update: { value: googleAnalyticsId },
    create: {
      key: SYSTEM_SETTING_KEYS.googleAnalyticsId,
      value: googleAnalyticsId,
      description: "Google Analytics measurement ID",
    },
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

export const getICalUrl = unstable_cache(
  async () => {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "ICAL_URL" } });
    return setting?.value || null;
  },
  ["ical-url"],
  { tags: ["schedules"] },
);

export async function updateTokenPortalConfig(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const enabled = formData.get("enabled") === "on";
  const guidance = (formData.get("guidance") as string | null)?.trim() || "";

  if (guidance.length > 2000) {
    return { error: "異붽? ?덈궡 臾멸뎄??2000???댄븯濡??낅젰?댁＜?몄슂." };
  }

  await prisma.$transaction([
    prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalEnabled },
      update: { value: enabled ? "true" : "false" },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalEnabled,
        value: enabled ? "true" : "false",
        description: "?숈깮 ?좏겙 諛곕? ?ы꽭 ?쒖꽦???щ?",
      },
    }),
    prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance },
      update: { value: guidance },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance,
        value: guidance,
        description: "?좏겙 ?덈궡 硫붿씪 ?섎떒 異붽? ?덈궡 臾멸뎄",
      },
    }),
  ]);

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
  if (!user || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const password = (formData.get("password") as string | null)?.trim() || "";
  const confirmPassword = (formData.get("confirmPassword") as string | null)?.trim() || "";

  if (password.length < 6) {
    return { error: "?ы꽭 鍮꾨?踰덊샇??6???댁긽?쇰줈 ?ㅼ젙?댁＜?몄슂." };
  }

  if (password !== confirmPassword) {
    return { error: "鍮꾨?踰덊샇? 鍮꾨?踰덊샇 ?뺤씤???쇱튂?섏? ?딆뒿?덈떎." };
  }

  const sessionVersionSetting = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion },
  });
  const currentVersion = Number.parseInt(sessionVersionSetting?.value || "", 10);
  const nextVersion = Number.isFinite(currentVersion) && currentVersion > 0 ? currentVersion + 1 : 1;
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalPasswordHash },
      update: { value: passwordHash },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalPasswordHash,
        value: passwordHash,
        description: "?좏겙 諛곕? ?ы꽭 ?묎렐 鍮꾨?踰덊샇 ?댁떆",
      },
    }),
    prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion },
      update: { value: String(nextVersion) },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion,
        value: String(nextVersion),
        description: "?좏겙 諛곕? ?ы꽭 ?몄뀡 踰꾩쟾",
      },
    }),
  ]);

  await logAction("token_portal_password_rotated", {
    sessionVersion: nextVersion,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/signup/request");

  return {
    success: "?ы꽭 ?묎렐 鍮꾨?踰덊샇瑜?蹂寃쏀뻽?듬땲?? 湲곗〈 ?몄뀡? 紐⑤몢 留뚮즺?⑸땲??",
  };
}
