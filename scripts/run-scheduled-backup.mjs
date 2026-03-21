import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const DB_URL = process.env.DATABASE_URL || "file:./prisma/dev.db";
const IS_FILE_DB = DB_URL.startsWith("file:");
const DB_FILE = IS_FILE_DB ? DB_URL.replace(/^file:/, "") : null;
const DB_PATH = DB_FILE ? path.resolve(ROOT, DB_FILE) : null;
const DEFAULT_BACKUP_DIR = DB_PATH
  ? path.resolve(path.dirname(DB_PATH), "backup")
  : path.resolve(ROOT, "data_backup");
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR);

const DEFAULT_EXTRA_PATHS = [
  "public/uploads",
  "uploads",
  "storage",
  "public/user-content",
  "logs",
];
const BACKUP_FILE_SUFFIXES = [".tar.gz", ".db", ".bak"];

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function ensureDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function checkpoint() {
  try {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(FULL);");
  } catch {}
}

function toUnixPath(targetPath) {
  return targetPath.replace(/\\/g, "/");
}

function relFromRoot(targetPath) {
  return toUnixPath(path.relative(ROOT, targetPath).replace(/^\.\//, ""));
}

async function getSetting(key) {
  return prisma.systemSetting.findUnique({ where: { key } });
}

async function setSetting(key, value, description) {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value, description },
    create: { key, value, description },
  });
}

async function getExtraPaths() {
  const setting = await getSetting("BACKUP_EXTRA_PATHS");
  const custom = (setting?.value || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const merged = [...new Set([...DEFAULT_EXTRA_PATHS, ...custom])];
  return merged
    .map((entry) => path.resolve(ROOT, entry))
    .filter((entry) => fssync.existsSync(entry));
}

async function createBackup(reason = "scheduled") {
  await ensureDir();
  await checkpoint();

  const stamp = nowStamp();
  const file = `backup-${stamp}.tar.gz`;
  const target = path.join(BACKUP_DIR, file);

  const extraPaths = await getExtraPaths();
  let dbExists = false;
  if (DB_PATH) {
    try {
      const stat = await fs.stat(DB_PATH);
      dbExists = stat.isFile();
    } catch {
      dbExists = false;
    }
  }

  const includeRel = [
    ...(dbExists && DB_PATH ? [relFromRoot(DB_PATH)] : []),
    ...extraPaths.map(relFromRoot),
  ].filter(Boolean);

  if (includeRel.length === 0) {
    throw new Error("No backup targets were found.");
  }

  await execFileAsync("tar", ["-czf", toUnixPath(target), "-C", toUnixPath(ROOT), ...includeRel]);

  const size = (await fs.stat(target)).size;
  const meta = {
    file,
    createdAt: new Date().toISOString(),
    reason,
    included: includeRel,
    size,
  };

  await fs.writeFile(path.join(BACKUP_DIR, `${file}.json`), JSON.stringify(meta, null, 2));
  return meta;
}

async function listBackups() {
  await ensureDir();
  const items = await fs.readdir(BACKUP_DIR);
  const files = items.filter((name) => BACKUP_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix)));
  const output = [];

  for (const file of files) {
    const stat = await fs.stat(path.join(BACKUP_DIR, file));
    output.push({
      file,
      size: stat.size,
      createdAt: stat.mtime,
      hasMeta: items.includes(`${file}.json`),
    });
  }

  output.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return output;
}

async function getLatestBackup() {
  const backups = await listBackups();
  return backups[0] ?? null;
}

async function getBackupIntervalDays() {
  const setting = await getSetting("BACKUP_INTERVAL_DAYS");
  const days = Number(setting?.value || "1");
  return Number.isFinite(days) && days > 0 ? days : 1;
}

async function getLastBackupAt() {
  const setting = await getSetting("LAST_BACKUP_AT");
  return setting?.value ? new Date(setting.value) : null;
}

async function setLastBackupAt(date) {
  await setSetting("LAST_BACKUP_AT", date.toISOString(), "Last scheduled backup time");
}

let running = false;

async function maybeRunScheduledBackup() {
  if (running) {
    return;
  }

  running = true;
  try {
    const [days, lastBackupAt] = await Promise.all([
      getBackupIntervalDays(),
      getLastBackupAt(),
    ]);
    const due =
      !lastBackupAt ||
      Date.now() - lastBackupAt.getTime() >= days * 24 * 60 * 60 * 1000;

    if (!due) {
      return;
    }

    await createBackup("scheduled");
    await setLastBackupAt(new Date());
  } finally {
    running = false;
  }
}

async function main() {
  const before = await getLastBackupAt();

  await maybeRunScheduledBackup();

  const [after, latestBackup] = await Promise.all([
    getLastBackupAt(),
    getLatestBackup(),
  ]);

  console.log(
    JSON.stringify(
      {
        beforeLastBackupAt: before?.toISOString() ?? null,
        afterLastBackupAt: after?.toISOString() ?? null,
        latestBackupFile: latestBackup?.file ?? null,
        latestBackupCreatedAt: latestBackup?.createdAt.toISOString() ?? null,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error("Scheduled backup failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
