import { describe, expect, it, vi } from "vitest";

import { isTransientSqliteWriteConflict, withSqliteWriteRetry } from "./sqlite-retry";

describe("SQLite write conflict retry", () => {
  it("retries only bounded transient lock conflicts", async () => {
    const locked = Object.assign(new Error("database is locked (SQLITE_BUSY)"), { code: "P2034" });
    const operation = vi.fn()
      .mockRejectedValueOnce(locked)
      .mockRejectedValueOnce(locked)
      .mockResolvedValue("committed");

    await expect(withSqliteWriteRetry(operation, { delay: async () => undefined })).resolves.toBe("committed");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry validation, uniqueness, or generic transaction failures", async () => {
    for (const error of [
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      Object.assign(new Error("Transaction already closed"), { code: "P2028" }),
      new Error("validation failed"),
    ]) {
      const operation = vi.fn().mockRejectedValue(error);
      await expect(withSqliteWriteRetry(operation, { delay: async () => undefined })).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it("recognizes only explicit SQLite lock signals", () => {
    expect(isTransientSqliteWriteConflict(Object.assign(new Error("write conflict"), { code: "P2034" }))).toBe(true);
    expect(isTransientSqliteWriteConflict(new Error("SQLITE_BUSY: database is locked"))).toBe(true);
    expect(isTransientSqliteWriteConflict(Object.assign(new Error("transaction failed"), { code: "P2028" }))).toBe(false);
  });
});
