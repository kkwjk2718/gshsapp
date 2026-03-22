import { prisma } from "@/lib/db";
import { DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE } from "@/lib/token-portal-config";

export const SYSTEM_SETTING_KEYS = {
  googleAnalyticsId: "GOOGLE_ANALYTICS_ID",
  gradeMapping: "GRADE_MAPPING",
  iCalUrl: "ICAL_URL",
  tokenPortalEnabled: "TOKEN_PORTAL_ENABLED",
  tokenPortalPasswordHash: "TOKEN_PORTAL_PASSWORD_HASH",
  tokenPortalSessionVersion: "TOKEN_PORTAL_SESSION_VERSION",
  tokenPortalEmailGuidance: "TOKEN_PORTAL_EMAIL_GUIDANCE",
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

function parseBooleanSetting(value: string | null) {
  if (!value) {
    return false;
  }

  return value === "true" || value === "1";
}

function parseIntegerSetting(value: string | null, fallbackValue: number) {
  const parsedValue = Number.parseInt(value || "", 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

export async function getTokenPortalSettings() {
  const [enabledValue, passwordHash, sessionVersionValue, guidanceValue] = await Promise.all([
    getSystemSettingValue(SYSTEM_SETTING_KEYS.tokenPortalEnabled),
    getSystemSettingValue(SYSTEM_SETTING_KEYS.tokenPortalPasswordHash),
    getSystemSettingValue(SYSTEM_SETTING_KEYS.tokenPortalSessionVersion),
    getSystemSettingValue(SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance),
  ]);

  return {
    enabled: parseBooleanSetting(enabledValue),
    hasPassword: Boolean(passwordHash?.trim()),
    passwordHash: passwordHash?.trim() || null,
    sessionVersion: parseIntegerSetting(sessionVersionValue, 1),
    guidance: guidanceValue?.trim() || DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE,
  };
}
