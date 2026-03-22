import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GRADE_MAPPING, parseGradeMapping } from "@/lib/grade-mapping";
import { DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE, TOKEN_DISTRIBUTION_DAILY_LIMIT } from "@/lib/token-portal-config";
import { loadSettingsPageData } from "./settings-page-data";

vi.mock("@/lib/token-distribution", () => ({
  getDistributionQuotaSummary: vi.fn(),
}));

describe("settings-page-data", () => {
  describe("parseGradeMapping", () => {
    it("parses a valid mapping payload", () => {
      expect(parseGradeMapping('{"1":11,"2":22,"3":33}')).toEqual({
        "1": 11,
        "2": 22,
        "3": 33,
      });
    });

    it("falls back to defaults for invalid JSON", () => {
      expect(parseGradeMapping("{not-json}")).toEqual(DEFAULT_GRADE_MAPPING);
    });

    it("falls back per key when values are invalid", () => {
      expect(parseGradeMapping('{"1":99,"2":"x","3":0}')).toEqual({
        "1": 99,
        "2": DEFAULT_GRADE_MAPPING["2"],
        "3": DEFAULT_GRADE_MAPPING["3"],
      });
    });

    it("falls back to defaults when no mapping exists", () => {
      expect(parseGradeMapping(null)).toEqual(DEFAULT_GRADE_MAPPING);
    });
  });

  describe("loadSettingsPageData", () => {
    const baseDependencies = {
      hasBrevoConfiguration: () => true,
      getTokenPortalSettings: async () => ({
        enabled: true,
        guidance: "guide",
        hasPassword: true,
        sessionVersion: 3,
      }),
      getDistributionQuotaSummary: async () => ({
        used: 12,
        remaining: 288,
        isLimitReached: false,
      }),
    };

    it("loads settings and backups without warnings", async () => {
      const result = await loadSettingsPageData({
        ...baseDependencies,
        findSetting: async (key) => {
          if (key === "GRADE_MAPPING") {
            return { key, value: '{"1":1,"2":2,"3":3}' };
          }

          if (key === "ICAL_URL") {
            return { key, value: "https://calendar.example.com" };
          }

          if (key === "GOOGLE_ANALYTICS_ID") {
            return { key, value: "G-TEST123" };
          }

          return null;
        },
        listBackups: async () => [
          {
            file: "backup.tar.gz",
            size: 1024,
            createdAt: new Date("2026-03-19T00:00:00.000Z"),
            hasMeta: true,
          },
        ],
        getBackupIntervalDays: async () => 7,
      });

      expect(result).toEqual({
        mapping: { "1": 1, "2": 2, "3": 3 },
        iCalUrl: "https://calendar.example.com",
        googleAnalyticsId: "G-TEST123",
        backups: [
          {
            file: "backup.tar.gz",
            size: 1024,
            createdAt: new Date("2026-03-19T00:00:00.000Z"),
            hasMeta: true,
          },
        ],
        intervalDays: 7,
        tokenPortal: {
          enabled: true,
          guidance: "guide",
          hasPassword: true,
          sessionVersion: 3,
          hasBrevoConfiguration: true,
          todaySentCount: 12,
          remainingDailyQuota: 288,
          isQuotaReached: false,
        },
        warnings: [],
      });
    });

    it("falls back to defaults when settings loading fails", async () => {
      const result = await loadSettingsPageData({
        ...baseDependencies,
        findSetting: async () => {
          throw new Error("db unavailable");
        },
        listBackups: async () => [],
        getBackupIntervalDays: async () => 1,
      });

      expect(result.mapping).toEqual(DEFAULT_GRADE_MAPPING);
      expect(result.iCalUrl).toBe("");
      expect(result.googleAnalyticsId).toBe("");
      expect(result.warnings).toContain("Some settings could not be loaded. Default values are being shown.");
    });

    it("falls back to safe backup defaults when backup metadata fails", async () => {
      const result = await loadSettingsPageData({
        ...baseDependencies,
        findSetting: async (key) => ({ key, value: "" }),
        listBackups: async () => {
          throw new Error("disk unavailable");
        },
        getBackupIntervalDays: async () => {
          throw new Error("disk unavailable");
        },
      });

      expect(result.backups).toEqual([]);
      expect(result.intervalDays).toBe(1);
      expect(result.warnings).toContain(
        "Backup metadata could not be loaded. Backup tools may be temporarily unavailable.",
      );
    });

    it("surfaces token portal warnings when password or brevo config is missing", async () => {
      const result = await loadSettingsPageData({
        findSetting: async (key) => ({ key, value: "" }),
        listBackups: async () => [],
        getBackupIntervalDays: async () => 1,
        hasBrevoConfiguration: () => false,
        getTokenPortalSettings: async () => ({
          enabled: true,
          guidance: DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE,
          hasPassword: false,
          sessionVersion: 1,
        }),
        getDistributionQuotaSummary: async () => ({
          used: TOKEN_DISTRIBUTION_DAILY_LIMIT,
          remaining: 0,
          isLimitReached: true,
        }),
      });

      expect(result.tokenPortal.hasBrevoConfiguration).toBe(false);
      expect(result.tokenPortal.isQuotaReached).toBe(true);
      expect(result.warnings).toContain("Token portal is enabled but no access password is configured yet.");
      expect(result.warnings).toContain(
        "Brevo email delivery is not configured. Token emails cannot be sent until BREVO settings are added.",
      );
    });
  });
});
