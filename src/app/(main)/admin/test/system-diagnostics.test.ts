import { describe, expect, it } from "vitest";
import {
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
    it("never treats the app-writable backup area as authoritative disaster recovery", async () => {
      const diagnostics = await runOperationalReadinessDiagnostics({
        getAppVersion: () => "sha-healthy",
        getDatabaseUrl: () => EXPECTED_DATABASE_URL,
        getBackupDir: () => "/tmp/backups",
        statfs: async () => ({
          bavail: 8,
          bsize: MIN_FREE_DISK_BYTES,
        }),
      });

      expect(diagnostics.find((item) => item.name === "Disaster Recovery Backup")).toEqual(
        expect.objectContaining({ status: "FAIL" }),
      );
      expect(diagnostics.some((item) => item.name === "Latest Backup Freshness")).toBe(false);
      expect(diagnostics.some((item) => item.name === "Backup Directory Writable")).toBe(false);
    });

    it("flags missing app version, low disk space, and wrong database paths", async () => {
      const diagnostics = await runOperationalReadinessDiagnostics({
        getAppVersion: () => "",
        getDatabaseUrl: () => "file:./prisma/dev.db",
        getBackupDir: () => "/tmp/backups",
        statfs: async () => ({
          bavail: 1,
          bsize: 256 * 1024 ** 2,
        }),
      });

      expect(diagnostics.find((item) => item.name === "Runtime Version")?.status).toBe("FAIL");
      expect(diagnostics.find((item) => item.name === "Disaster Recovery Backup")?.status).toBe("FAIL");
      expect(diagnostics.find((item) => item.name === "Disk Free Space")?.status).toBe("FAIL");
      expect(diagnostics.find((item) => item.name === "Database Path Configuration")?.status).toBe("FAIL");
    });
  });
});
