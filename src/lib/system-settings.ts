import { prisma } from "@/lib/db";

export const SYSTEM_SETTING_KEYS = {
  googleAnalyticsId: "GOOGLE_ANALYTICS_ID",
  gradeMapping: "GRADE_MAPPING",
  iCalUrl: "ICAL_URL",
} as const;

export async function getSystemSettingValue(key: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  });

  return setting?.value ?? null;
}

export async function getGoogleAnalyticsId() {
  const value = await getSystemSettingValue(SYSTEM_SETTING_KEYS.googleAnalyticsId);
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

export function isValidGoogleAnalyticsId(value: string) {
  return /^G-[A-Z0-9]+$/i.test(value);
}
