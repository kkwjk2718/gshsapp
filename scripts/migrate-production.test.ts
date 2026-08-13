import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertNoExecutableSchemaObjects,
  getDatabasePath,
  inspectDatabase,
  schemaFingerprint,
  validatePreMigrationState,
} from "./migrate-production.mjs";

const roots: string[] = [];

function temporaryRoot() {
  const root = join(tmpdir(), `gshsapp-migration-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.DATA_ROOT;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("production migration preflight", () => {
  it("fingerprints the reviewed legacy schema and rejects paths outside DATA_ROOT", () => {
    const root = temporaryRoot();
    const dbPath = join(root, "dev.db");
    const db = new DatabaseSync(dbPath);
    db.exec(readFileSync(join(process.cwd(), "prisma/migrations/20260813000000_baseline/migration.sql"), "utf8"));
    expect(schemaFingerprint(db)).toBe("3cb19a677a4a6494eac64a996a874be3c36dc8b03c1d90369184cd639bc732e7");
    db.close();

    process.env.DATA_ROOT = root;
    process.env.DATABASE_URL = `file:${dbPath.replaceAll("\\", "/")}`;
    expect(getDatabasePath()).toBe(dbPath);

    const outside = temporaryRoot();
    process.env.DATABASE_URL = `file:${join(outside, "dev.db").replaceAll("\\", "/")}`;
    expect(() => getDatabasePath()).toThrow("DATA_ROOT");
  });

  it("distinguishes empty, unmanaged, and Prisma-managed databases", () => {
    const root = temporaryRoot();
    const emptyPath = join(root, "empty.db");
    new DatabaseSync(emptyPath).close();
    expect(inspectDatabase(emptyPath).kind).toBe("empty");

    const legacyPath = join(root, "legacy.db");
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec(readFileSync(join(process.cwd(), "prisma/migrations/20260813000000_baseline/migration.sql"), "utf8"));
    legacy.close();
    expect(inspectDatabase(legacyPath)).toMatchObject({ kind: "unmanaged" });

    const managedPath = join(root, "managed.db");
    copyFileSync(legacyPath, managedPath);
    const managed = new DatabaseSync(managedPath);
    managed.exec('CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY)');
    managed.close();
    expect(inspectDatabase(managedPath).kind).toBe("managed");
  });

  it("detects schema drift instead of silently baselining it", () => {
    const root = temporaryRoot();
    const dbPath = join(root, "drift.db");
    writeFileSync(dbPath, "");
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "unexpected" TEXT)');
    const driftFingerprint = schemaFingerprint(db);
    db.close();
    expect(driftFingerprint).not.toBe("3cb19a677a4a6494eac64a996a874be3c36dc8b03c1d90369184cd639bc732e7");
    expect(driftFingerprint).not.toBe("9b442eccdd07b5be03757ede7a0debc7925c25b6d7fae85c91ed8a96b89ba093");
    expect(() => validatePreMigrationState({ kind: "unmanaged", fingerprint: driftFingerprint })).toThrow(
      "Refusing to baseline an unknown SQLite schema",
    );
    expect(() => validatePreMigrationState({ kind: "managed", fingerprint: driftFingerprint })).toThrow(
      "Refusing to migrate an unknown SQLite schema",
    );
  });

  it("detects triggers, views, checks, collations, and partial-index predicates", () => {
    const baseline = new DatabaseSync(":memory:");
    baseline.exec('CREATE TABLE "Item" ("id" TEXT PRIMARY KEY, "value" TEXT); CREATE INDEX "Item_value_idx" ON "Item"("value") WHERE "value" IS NOT NULL;');
    const expected = schemaFingerprint(baseline);

    const predicateDrift = new DatabaseSync(":memory:");
    predicateDrift.exec('CREATE TABLE "Item" ("id" TEXT PRIMARY KEY, "value" TEXT); CREATE INDEX "Item_value_idx" ON "Item"("value") WHERE length("value") > 0;');
    expect(schemaFingerprint(predicateDrift)).not.toBe(expected);

    const tableDrift = new DatabaseSync(":memory:");
    tableDrift.exec('CREATE TABLE "Item" ("id" TEXT PRIMARY KEY, "value" TEXT COLLATE NOCASE CHECK (length("value") < 20)); CREATE INDEX "Item_value_idx" ON "Item"("value") WHERE "value" IS NOT NULL;');
    expect(schemaFingerprint(tableDrift)).not.toBe(expected);

    baseline.exec('CREATE TRIGGER "Item_after_insert" AFTER INSERT ON "Item" BEGIN UPDATE "Item" SET "value" = upper(NEW."value") WHERE "id" = NEW."id"; END;');
    expect(() => assertNoExecutableSchemaObjects(baseline)).toThrow("trigger:Item_after_insert");
    baseline.exec('CREATE VIEW "Item_view" AS SELECT "id" FROM "Item";');
    expect(() => assertNoExecutableSchemaObjects(baseline)).toThrow("view:Item_view");

    baseline.close();
    predicateDrift.close();
    tableDrift.close();
  });
});
