import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASELINE_MIGRATION = "20260813000000_baseline";
const SECURITY_MIGRATION = "20260813001000_security_hardening";
const LEGACY_SCHEMA_FINGERPRINT = "3cb19a677a4a6494eac64a996a874be3c36dc8b03c1d90369184cd639bc732e7";
const CURRENT_SCHEMA_FINGERPRINT = "f1322c5ee67e3ae36f82867e42eb468db9d321934f2c45a1d262deb4c1fa05a3";

export function schemaFingerprint(db) {
  const schemaObjects = db.prepare(`
    SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
      AND name <> '_prisma_migrations'
      AND tbl_name <> '_prisma_migrations'
    ORDER BY type, name
  `).all().map(({ type, name, tableName, sql }) => ({ type, name, tableName, sql }));

  return createHash("sha256").update(JSON.stringify(schemaObjects)).digest("hex");
}

export function assertNoExecutableSchemaObjects(db) {
  const unexpected = db.prepare(`
    SELECT type, name
    FROM sqlite_master
    WHERE type IN ('trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all();
  if (unexpected.length > 0) {
    throw new Error(`Unexpected executable SQLite schema objects: ${unexpected.map(({ type, name }) => `${type}:${name}`).join(", ")}`);
  }
}

export function getDatabasePath() {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) throw new Error("DATABASE_URL is required for production migration");

  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "file:" || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.host) {
    throw new Error("Production migration requires a local absolute SQLite file URL without credentials or parameters");
  }

  const databasePath = fileURLToPath(parsed);
  if (!isAbsolute(databasePath)) throw new Error("DATABASE_URL must point to an absolute SQLite path");

  const dataRoot = resolve(process.env.DATA_ROOT?.trim() || dirname(databasePath));
  const canonicalRoot = realpathSync(dataRoot);
  const canonicalParent = realpathSync(dirname(databasePath));
  const fromRoot = relative(canonicalRoot, canonicalParent);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error("SQLite database must stay inside DATA_ROOT");
  }
  if (existsSync(databasePath) && lstatSync(databasePath).isSymbolicLink()) {
    throw new Error("Refusing to migrate a symbolic-link database");
  }
  return databasePath;
}

export function inspectDatabase(databasePath) {
  const db = new DatabaseSync(databasePath, { timeout: 5_000 });
  try {
    const quickCheck = db.prepare("PRAGMA quick_check").all();
    if (quickCheck.length !== 1 || quickCheck[0].quick_check !== "ok") {
      throw new Error("SQLite quick_check failed before migration");
    }
    assertNoExecutableSchemaObjects(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all().map((row) => row.name);
    return {
      kind: tables.length === 0 ? "empty" : tables.includes("_prisma_migrations") ? "managed" : "unmanaged",
      fingerprint: schemaFingerprint(db),
    };
  } finally {
    db.close();
  }
}

export function validatePreMigrationState(state) {
  if (state.kind === "empty") return;
  if (state.fingerprint === LEGACY_SCHEMA_FINGERPRINT || state.fingerprint === CURRENT_SCHEMA_FINGERPRINT) return;

  const verb = state.kind === "managed" ? "migrate" : "baseline";
  throw new Error(`Refusing to ${verb} an unknown SQLite schema: ${state.fingerprint}`);
}

function runPrisma(args) {
  const cli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  if (!existsSync(cli)) throw new Error("The lockfile-resolved Prisma CLI is missing from the migration image");
  const result = spawnSync(process.execPath, [cli, ...args, "--schema", "prisma/schema.prisma"], {
    cwd: process.cwd(),
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma command failed with status ${result.status}`);
}

function assertPostMigration(databasePath) {
  const db = new DatabaseSync(databasePath, { timeout: 5_000 });
  try {
    const quickCheck = db.prepare("PRAGMA quick_check").all();
    const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();
    if (quickCheck.length !== 1 || quickCheck[0].quick_check !== "ok" || foreignKeyErrors.length !== 0) {
      throw new Error("SQLite integrity verification failed after migration");
    }
    assertNoExecutableSchemaObjects(db);
    const fingerprint = schemaFingerprint(db);
    if (fingerprint !== CURRENT_SCHEMA_FINGERPRINT) {
      throw new Error(`Post-migration schema fingerprint is not the reviewed schema: ${fingerprint}`);
    }
  } finally {
    db.close();
  }
}

export function migrateProduction() {
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_MIGRATION_TEST !== "true") {
    throw new Error("Production migration refuses to run outside NODE_ENV=production");
  }
  const databasePath = getDatabasePath();
  const before = inspectDatabase(databasePath);
  validatePreMigrationState(before);

  if (before.kind === "unmanaged") {
    if (before.fingerprint === LEGACY_SCHEMA_FINGERPRINT) {
      runPrisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
    } else if (before.fingerprint === CURRENT_SCHEMA_FINGERPRINT) {
      runPrisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
      runPrisma(["migrate", "resolve", "--applied", SECURITY_MIGRATION]);
    }
  }

  runPrisma(["migrate", "deploy"]);
  assertPostMigration(databasePath);
  process.stdout.write("Reviewed Prisma migrations applied and SQLite integrity verified.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    migrateProduction();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
