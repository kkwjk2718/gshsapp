import { prisma } from "@/lib/db";
import { getBackupIntervalDays, listBackups } from "@/lib/backup";
import { hasBrevoConfiguration } from "@/lib/brevo";
import { DEFAULT_GRADE_MAPPING, parseGradeMapping, type GradeMapping } from "@/lib/grade-mapping";
import { DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE, TOKEN_DISTRIBUTION_DAILY_LIMIT } from "@/lib/token-portal-config";
import { getDistributionQuotaSummary } from "@/lib/token-distribution";
import { getTokenPortalSettings } from "@/lib/system-settings";
export type BackupItem = Awaited<ReturnType<typeof listBackups>>[number];
export type SystemSettingRecord = {
  key: string;
  value: string;
  description?: string | null;
} | null;

export type TokenPortalSettingsData = {
  enabled: boolean;
  guidance: string;
  hasPassword: boolean;
  sessionVersion: number;
  hasBrevoConfiguration: boolean;
  todaySentCount: number;
  remainingDailyQuota: number;
  isQuotaReached: boolean;
};

export type SettingsPageData = {
  mapping: GradeMapping;
  iCalUrl: string;
  googleAnalyticsId: string;
  backups: BackupItem[];
  intervalDays: number;
  tokenPortal: TokenPortalSettingsData;
  warnings: string[];
};

type SettingsPageDependencies = {
  findSetting: (key: string) => Promise<SystemSettingRecord>;
  listBackups: () => Promise<BackupItem[]>;
  getBackupIntervalDays: () => Promise<number>;
  getTokenPortalSettings: () => Promise<{
    enabled: boolean;
    guidance: string;
    hasPassword: boolean;
    sessionVersion: number;
  }>;
  getDistributionQuotaSummary: () => Promise<{
    used: number;
    remaining: number;
    isLimitReached: boolean;
  }>;
  hasBrevoConfiguration: () => boolean;
};

const defaultDependencies: SettingsPageDependencies = {
  findSetting: (key) => prisma.systemSetting.findUnique({ where: { key } }),
  listBackups,
  getBackupIntervalDays,
  getTokenPortalSettings,
  getDistributionQuotaSummary,
  hasBrevoConfiguration,
};

export async function loadSettingsPageData(
  dependencies: SettingsPageDependencies = defaultDependencies,
): Promise<SettingsPageData> {
  if (dependencies === defaultDependencies && !process.env.DATABASE_URL) {
    return {
      mapping: { ...DEFAULT_GRADE_MAPPING },
      iCalUrl: "",
      googleAnalyticsId: "",
      backups: [],
      intervalDays: 1,
      tokenPortal: {
        enabled: false,
        guidance: DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE,
        hasPassword: false,
        sessionVersion: 1,
        hasBrevoConfiguration: false,
        todaySentCount: 0,
        remainingDailyQuota: TOKEN_DISTRIBUTION_DAILY_LIMIT,
        isQuotaReached: false,
      },
      warnings: [],
    };
  }

  const warnings: string[] = [];

  let mapping: GradeMapping = { ...DEFAULT_GRADE_MAPPING };
  let iCalUrl = "";
  let googleAnalyticsId = "";

  try {
    const [gradeMappingSetting, iCalUrlSetting, googleAnalyticsSetting] = await Promise.all([
      dependencies.findSetting("GRADE_MAPPING"),
      dependencies.findSetting("ICAL_URL"),
      dependencies.findSetting("GOOGLE_ANALYTICS_ID"),
    ]);

    mapping = parseGradeMapping(gradeMappingSetting?.value);
    iCalUrl = iCalUrlSetting?.value || "";
    googleAnalyticsId = googleAnalyticsSetting?.value || "";
  } catch (error) {
    console.error("[admin/settings] Failed to load settings values:", error);
    warnings.push("Some settings could not be loaded. Default values are being shown.");
  }

  let backups: BackupItem[] = [];
  let intervalDays = 1;
  let tokenPortal: TokenPortalSettingsData = {
    enabled: false,
    guidance: DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE,
    hasPassword: false,
    sessionVersion: 1,
    hasBrevoConfiguration: dependencies.hasBrevoConfiguration(),
    todaySentCount: 0,
    remainingDailyQuota: TOKEN_DISTRIBUTION_DAILY_LIMIT,
    isQuotaReached: false,
  };

  try {
    [backups, intervalDays] = await Promise.all([
      dependencies.listBackups(),
      dependencies.getBackupIntervalDays(),
    ]);
  } catch (error) {
    console.error("[admin/settings] Failed to load backup metadata:", error);
    warnings.push("Backup metadata could not be loaded. Backup tools may be temporarily unavailable.");
  }

  try {
    const [portalSettings, quota] = await Promise.all([
      dependencies.getTokenPortalSettings(),
      dependencies.getDistributionQuotaSummary(),
    ]);

    tokenPortal = {
      ...portalSettings,
      hasBrevoConfiguration: dependencies.hasBrevoConfiguration(),
      todaySentCount: quota.used,
      remainingDailyQuota: quota.remaining,
      isQuotaReached: quota.isLimitReached,
    };

    if (tokenPortal.enabled && !tokenPortal.hasPassword) {
      warnings.push("Token portal is enabled but no access password is configured yet.");
    }

    if (!tokenPortal.hasBrevoConfiguration) {
      warnings.push("Brevo email delivery is not configured. Token emails cannot be sent until BREVO settings are added.");
    }
  } catch (error) {
    console.error("[admin/settings] Failed to load token portal settings:", error);
    warnings.push("Token distribution portal settings could not be loaded.");
  }

  return {
    mapping,
    iCalUrl,
    googleAnalyticsId,
    backups,
    intervalDays,
    tokenPortal,
    warnings,
  };
}
