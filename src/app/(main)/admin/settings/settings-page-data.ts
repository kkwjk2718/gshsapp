import { prisma } from "@/lib/db";
import { getBackupIntervalDays, listBackups } from "@/lib/backup";

export const DEFAULT_GRADE_MAPPING = {
  "1": 42,
  "2": 41,
  "3": 40,
} as const;

export type GradeMapping = Record<keyof typeof DEFAULT_GRADE_MAPPING, number>;
export type BackupItem = Awaited<ReturnType<typeof listBackups>>[number];
export type SystemSettingRecord = {
  key: string;
  value: string;
  description?: string | null;
} | null;

export type SettingsPageData = {
  mapping: GradeMapping;
  iCalUrl: string;
  googleAnalyticsId: string;
  backups: BackupItem[];
  intervalDays: number;
  warnings: string[];
};

type SettingsPageDependencies = {
  findSetting: (key: string) => Promise<SystemSettingRecord>;
  listBackups: () => Promise<BackupItem[]>;
  getBackupIntervalDays: () => Promise<number>;
};

const defaultDependencies: SettingsPageDependencies = {
  findSetting: (key) => prisma.systemSetting.findUnique({ where: { key } }),
  listBackups,
  getBackupIntervalDays,
};

function isValidGradeValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function parseGradeMapping(rawValue: string | null | undefined): GradeMapping {
  if (!rawValue) {
    return { ...DEFAULT_GRADE_MAPPING };
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;

    return {
      "1": isValidGradeValue(parsedValue["1"]) ? parsedValue["1"] : DEFAULT_GRADE_MAPPING["1"],
      "2": isValidGradeValue(parsedValue["2"]) ? parsedValue["2"] : DEFAULT_GRADE_MAPPING["2"],
      "3": isValidGradeValue(parsedValue["3"]) ? parsedValue["3"] : DEFAULT_GRADE_MAPPING["3"],
    };
  } catch {
    return { ...DEFAULT_GRADE_MAPPING };
  }
}

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

  try {
    [backups, intervalDays] = await Promise.all([
      dependencies.listBackups(),
      dependencies.getBackupIntervalDays(),
    ]);
  } catch (error) {
    console.error("[admin/settings] Failed to load backup metadata:", error);
    warnings.push("Backup metadata could not be loaded. Backup tools may be temporarily unavailable.");
  }

  return {
    mapping,
    iCalUrl,
    googleAnalyticsId,
    backups,
    intervalDays,
    warnings,
  };
}
