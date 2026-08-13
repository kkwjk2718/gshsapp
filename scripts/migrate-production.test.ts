import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { getDatabasePath, inspectDatabase, schemaFingerprint } from "./migrate-production.mjs";

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
    expect(schemaFingerprint(db)).toBe("1518f3d3ccb7b305bcd59d6ff916dce66002bfcac8b028c2b2dc50c83d88e609");
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
    expect(driftFingerprint).not.toBe("1518f3d3ccb7b305bcd59d6ff916dce66002bfcac8b028c2b2dc50c83d88e609");
    expect(driftFingerprint).not.toBe("3462920d8439a76ba1ee9471d10f10350837df815692cd09f74ed2c1913eac2f");
  });
});
