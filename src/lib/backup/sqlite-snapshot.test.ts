import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BackupDatabaseError,
  createSqliteSnapshot,
  REQUIRED_APPLICATION_TABLES,
  validateSqliteDatabase,
  type SqliteValidationClient,
} from "./sqlite-snapshot";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function makeTemporaryFile(bytes = Buffer.from("SQLite format 3\0fixture")) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-sqlite-test-"));
  temporaryDirectories.push(root);
  const file = path.join(root, "candidate.db");
  await fs.writeFile(file, bytes);
  return { root, file };
}

function validationClient(overrides: Partial<{
  quickCheck: unknown[];
  foreignKeys: unknown[];
  tables: unknown[];
  schemaObjects: unknown[];
}> = {}): SqliteValidationClient {
  const quickCheck = overrides.quickCheck ?? [{ quick_check: "ok" }];
  const foreignKeys = overrides.foreignKeys ?? [];
  const tables = overrides.tables ?? REQUIRED_APPLICATION_TABLES.map((name) => ({ name }));
  const schemaObjects = overrides.schemaObjects ?? [];
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn(async (query: string) => {
      if (query.includes("quick_check")) return quickCheck;
      if (query.includes("foreign_key_check")) return foreignKeys;
      if (query.includes("type IN ('trigger', 'view')")) return schemaObjects;
      if (query.includes("sqlite_master")) return tables;
      throw new Error("unexpected query");
    }),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SQLite backup snapshots", () => {
  it("rejects a malformed SQLite header without opening a database client", async () => {
    const fixture = await makeTemporaryFile(Buffer.from("not sqlite"));
    const factory = vi.fn();
    await expect(validateSqliteDatabase(fixture.file, factory)).rejects.toMatchObject({ code: "INVALID_HEADER" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects executable trigger and view objects in a staged database", async () => {
    const fixture = await makeTemporaryFile();

    await expect(validateSqliteDatabase(fixture.file, async () => validationClient({
      schemaObjects: [{ type: "trigger", name: "persist_after_restore" }],
    }))).rejects.toMatchObject({ code: "UNSAFE_SCHEMA_OBJECTS" });

    await expect(validateSqliteDatabase(fixture.file, async () => validationClient({
      schemaObjects: [{ type: "view", name: "leak_users" }],
    }))).rejects.toMatchObject({ code: "UNSAFE_SCHEMA_OBJECTS" });
  });

  it("rejects failed quick checks, foreign-key violations and missing required tables", async () => {
    const fixture = await makeTemporaryFile();
    await expect(validateSqliteDatabase(fixture.file, async () => validationClient({ quickCheck: [{ quick_check: "broken" }] })))
      .rejects.toMatchObject({ code: "QUICK_CHECK_FAILED" });
    await expect(validateSqliteDatabase(fixture.file, async () => validationClient({ foreignKeys: [{ table: "User" }] })))
      .rejects.toMatchObject({ code: "FOREIGN_KEY_CHECK_FAILED" });
    await expect(validateSqliteDatabase(fixture.file, async () => validationClient({ tables: [{ name: "User" }] })))
      .rejects.toMatchObject({ code: "MISSING_TABLES" });
  });

  it("creates a point-in-time snapshot with parameterized VACUUM INTO and validates it", async () => {
    const fixture = await makeTemporaryFile();
    await fs.unlink(fixture.file);
    const sourceClient = {
      $executeRawUnsafe: vi.fn(async (query: string, ...values: unknown[]) => {
        const destination = String(values[0]);
        expect(query).toBe("VACUUM INTO ?");
        await fs.writeFile(destination, Buffer.from("SQLite format 3\0snapshot"));
        return 0;
      }),
    };
    const opened = validationClient();

    await createSqliteSnapshot(sourceClient, fixture.file, async () => opened);

    expect(await fs.readFile(fixture.file, "utf8")).toContain("SQLite format 3");
    expect(sourceClient.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(opened.$disconnect).toHaveBeenCalledTimes(1);
  });

  it("never overwrites an existing destination", async () => {
    const fixture = await makeTemporaryFile();
    const sourceClient = { $executeRawUnsafe: vi.fn() };
    await expect(createSqliteSnapshot(sourceClient, fixture.file, async () => validationClient()))
      .rejects.toBeInstanceOf(BackupDatabaseError);
    expect(sourceClient.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
