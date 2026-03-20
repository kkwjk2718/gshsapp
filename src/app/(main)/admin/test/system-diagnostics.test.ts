import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKUP_MAX_AGE_HOURS,
  EXPECTED_DATABASE_URL,
  formatBytes,
  isExpectedDatabaseUrl,
  MIN_FREE_DISK_BYTES,
  runOperationalReadinessDiagnostics,
} from "./system-diagnostics";

describe("system-diagnostics", () => {
  describe("formatBytes", () => {
    it("formats whole bytes without decimals", () => {
      expect(formatBytes(512)).toBe("512 B");
    });

    it("formats gigabytes with decimals", () => {
      expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 GB");
    });
  });

  describe("isExpectedDatabaseUrl", () => {
    it("accepts the expected docker sqlite path", () => {
      expect(isExpectedDatabaseUrl(EXPECTED_DATABASE_URL)).toBe(true);
    });

    it("rejects other database paths", () => {
      expect(isExpectedDatabaseUrl("file:./prisma/dev.db")).toBe(false);
    });
  });

  describe("runOperationalReadinessDiagnostics", () => {
    it("returns passing diagnostics when the environment is healthy", async () => {
      const diagnostics = await runOperationalReadinessDiagnostics({
        getAppVersion: () => "sha-healthy",
        getDatabaseUrl: () => EXPECTED_DATABASE_URL,
        getBackupMaxAgeHours: () => DEFAULT_BACKUP_MAX_AGE_HOURS,
        getBackupDir: () => "/tmp/backups",
        getLatestBackup: async () => ({
          file: "backup-20260321.tar.gz",
          size: 1024,
          createdAt: new Date("2026-03-21T00:30:00.000Z"),
          hasMeta: true,
        }),
        ensureDir: async () => {},
        writeFile: async () => {},
        unlink: async () => {},
        statfs: async () => ({
          bavail: 8,
          bsize: MIN_FREE_DISK_BYTES,
        }),
        now: () => new Date("2026-03-21T12:00:00.000Z"),
      });

      expect(diagnostics.every((item) => item.status === "PASS")).toBe(true);
    });

    it("flags stale backups, missing app version, and wrong database paths", async () => {
      const diagnostics = await runOperationalReadinessDiagnostics({
        getAppVersion: () => "",
        getDatabaseUrl: () => "file:./prisma/dev.db",
        getBackupMaxAgeHours: () => 24,
        getBackupDir: () => "/tmp/backups",
        getLatestBackup: async () => ({
          file: "backup-old.tar.gz",
          size: 1024,
          createdAt: new Date("2026-03-18T00:00:00.000Z"),
          hasMeta: false,
        }),
        ensureDir: async () => {},
        writeFile: async () => {},
        unlink: async () => {},
        statfs: async () => ({
          bavail: 1,
          bsize: 256 * 1024 ** 2,
        }),
        now: () => new Date("2026-03-21T12:00:00.000Z"),
      });

      expect(diagnostics.find((item) => item.name === "Runtime Version")?.status).toBe("FAIL");
      expect(diagnostics.find((item) => item.name === "Latest Backup Freshness")?.status).toBe("FAIL");
      expect(diagnostics.find((item) => item.name === "Disk Free Space")?.status).toBe("FAIL");
      expect(diagnostics.find((item) => item.name === "Database Path Configuration")?.status).toBe("FAIL");
    });
  });
});
