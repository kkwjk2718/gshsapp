import { describe, expect, it } from "vitest";
import {
  getActionErrorMessage,
  isSupportedBackupFileName,
  parsePositiveInteger,
  RESTORE_CONFIRM_TEXT,
} from "./backup-action-helpers";

describe("backup-action-helpers", () => {
  describe("parsePositiveInteger", () => {
    it("accepts a positive integer string", () => {
      expect(parsePositiveInteger("7")).toBe(7);
    });

    it("trims surrounding whitespace", () => {
      expect(parsePositiveInteger(" 12 ")).toBe(12);
    });

    it("rejects blank input", () => {
      expect(parsePositiveInteger("   ")).toBeNull();
    });

    it("rejects zero", () => {
      expect(parsePositiveInteger("0")).toBeNull();
    });

    it("rejects negative values", () => {
      expect(parsePositiveInteger("-3")).toBeNull();
    });

    it("rejects decimals", () => {
      expect(parsePositiveInteger("1.5")).toBeNull();
    });

    it("rejects non-numeric input", () => {
      expect(parsePositiveInteger("abc")).toBeNull();
    });

    it("rejects missing values", () => {
      expect(parsePositiveInteger(null)).toBeNull();
    });
  });

  describe("isSupportedBackupFileName", () => {
    it("accepts .db files", () => {
      expect(isSupportedBackupFileName("backup.db")).toBe(true);
    });

    it("accepts .tar.gz files", () => {
      expect(isSupportedBackupFileName("backup.tar.gz")).toBe(true);
    });

    it("accepts uppercase extensions", () => {
      expect(isSupportedBackupFileName("BACKUP.TAR.GZ")).toBe(true);
    });

    it("trims the file name before validation", () => {
      expect(isSupportedBackupFileName(" backup.db ")).toBe(true);
    });

    it("rejects unsupported extensions", () => {
      expect(isSupportedBackupFileName("backup.zip")).toBe(false);
    });

    it("rejects lookalike file names", () => {
      expect(isSupportedBackupFileName("backup.db.txt")).toBe(false);
    });
  });

  describe("getActionErrorMessage", () => {
    it("returns the error message when available", () => {
      expect(getActionErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    });

    it("falls back when the error message is blank", () => {
      expect(getActionErrorMessage(new Error("   "), "fallback")).toBe("fallback");
    });

    it("falls back for unknown errors", () => {
      expect(getActionErrorMessage("boom", "fallback")).toBe("fallback");
    });
  });

  it("uses a stable restore confirmation token", () => {
    expect(RESTORE_CONFIRM_TEXT).toBe("RESTORE");
  });
});
