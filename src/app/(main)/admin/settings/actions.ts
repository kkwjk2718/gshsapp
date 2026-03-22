"use server"

import { prisma } from "@/lib/db";
import { revalidatePath, unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { SYSTEM_SETTING_KEYS, isValidGoogleAnalyticsId } from "@/lib/system-settings";
import bcrypt from "bcryptjs";
import { logAction } from "@/lib/logger";

export async function updateGradeMapping(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

  const g1 = parseInt(formData.get("grade1") as string);
  const g2 = parseInt(formData.get("grade2") as string);
  const g3 = parseInt(formData.get("grade3") as string);

  const mapping = {
      "1": g1,
      "2": g2,
      "3": g3
  };

  await prisma.systemSetting.upsert({
      where: { key: "GRADE_MAPPING" },
      update: { value: JSON.stringify(mapping) },
      create: { key: "GRADE_MAPPING", value: JSON.stringify(mapping), description: "학년별 기수 매핑" }
  });

  // revalidateTag("grade-mapping");
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
    if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

    const url = formData.get("icalUrl") as string;
    
    // Basic URL validation
    if (url && !url.startsWith("https://")) {
        return { error: "유효하지 않은 URL입니다. https://로 시작해야 합니다." }
    }

    await prisma.systemSetting.upsert({
        where: { key: "ICAL_URL" },
        update: { value: url },
        create: { key: "ICAL_URL", value: url, description: "Google Calendar iCal URL for sync" }
    });
    
    revalidatePath("/admin/settings");
    // revalidateTag("schedules"); 
    revalidatePath("/", "layout");
    return { success: "iCal URL이 업데이트되었습니다." };
}

export async function updateGoogleAnalyticsId(prevState: any, formData: FormData): Promise<ActionResult> {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

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
            description: "Google Analytics measurement ID"
        }
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
    { tags: ["schedules"] }
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
    return { error: "추가 안내 문구는 2000자 이하로 입력해주세요." };
  }

  await prisma.$transaction([
    prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalEnabled },
      update: { value: enabled ? "true" : "false" },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalEnabled,
        value: enabled ? "true" : "false",
        description: "학생 토큰 배부 포털 활성화 여부",
      },
    }),
    prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance },
      update: { value: guidance },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance,
        value: guidance,
        description: "토큰 안내 메일 하단 추가 안내 문구",
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
    success: enabled ? "토큰 배부 포털을 활성화했습니다." : "토큰 배부 포털을 비활성화했습니다.",
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
    return { error: "포털 비밀번호는 6자 이상으로 설정해주세요." };
  }

  if (password !== confirmPassword) {
    return { error: "비밀번호와 비밀번호 확인이 일치하지 않습니다." };
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
        description: "토큰 배부 포털 접근 비밀번호 해시",
      },
    }),
    prisma.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion },
      update: { value: String(nextVersion) },
      create: {
        key: SYSTEM_SETTING_KEYS.tokenPortalSessionVersion,
        value: String(nextVersion),
        description: "토큰 배부 포털 세션 버전",
      },
    }),
  ]);

  await logAction("token_portal_password_rotated", {
    sessionVersion: nextVersion,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/signup/request");

  return {
    success: "포털 접근 비밀번호를 변경했습니다. 기존 세션은 모두 만료됩니다.",
  };
}
