import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const BACKUP_DIR = path.resolve(ROOT, "..", "data_backup");
const DB_URL = process.env.DATABASE_URL || "file:./prisma/dev.db";
const DB_FILE = DB_URL.replace(/^file:/, "");
const DB_PATH = path.resolve(ROOT, DB_FILE);

const DEFAULT_EXTRA_PATHS = [
  "public/uploads",
  "uploads",
  "storage",
  "public/user-content",
  "logs",
];

function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
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

function relFromRoot(p: string) {
  return path.relative(ROOT, p).replace(/^\.\//, "");
}

async function getExtraPaths() {
  const s = await prisma.systemSetting.findUnique({ where: { key: "BACKUP_EXTRA_PATHS" } });
  const custom = (s?.value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const merged = [...new Set([...DEFAULT_EXTRA_PATHS, ...custom])];
  const abs = merged
    .map((p) => path.resolve(ROOT, p))
    .filter((p) => fssync.existsSync(p));
  return abs;
}

export async function createBackup(reason = "manual") {
  await ensureDir();
  await checkpoint();

  const stamp = nowStamp();
  const file = `backup-${stamp}.tar.gz`;
  const target = path.join(BACKUP_DIR, file);

  const extraPaths = await getExtraPaths();
  const dbExists = fssync.existsSync(DB_PATH);
  const includeRel = [...(dbExists ? [relFromRoot(DB_PATH)] : []), ...extraPaths.map(relFromRoot)].filter(Boolean);

  // macOS/Linux tar
  await execFileAsync("tar", ["-czf", target, ...includeRel], { cwd: ROOT });

  const meta = {
    file,
    createdAt: new Date().toISOString(),
    reason,
    included: includeRel,
    size: (await fs.stat(target)).size,
  };
  await fs.writeFile(path.join(BACKUP_DIR, `${file}.json`), JSON.stringify(meta, null, 2));
  return meta;
}

export async function listBackups() {
  await ensureDir();
  const items = await fs.readdir(BACKUP_DIR);
  const files = items.filter((n) => n.endsWith(".tar.gz") || n.endsWith(".db"));
  const out: Array<{ file: string; size: number; createdAt: Date; hasMeta: boolean }> = [];
  for (const file of files) {
    const st = await fs.stat(path.join(BACKUP_DIR, file));
    const hasMeta = items.includes(`${file}.json`);
    out.push({ file, size: st.size, createdAt: st.mtime, hasMeta });
  }
  out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return out;
}

async function restoreFromTarGz(src: string) {
  await checkpoint();
  // Extract into app root, overwrite existing files
  await execFileAsync("tar", ["-xzf", src, "-C", ROOT]);
}

export async function restoreBackupFile(file: string) {
  await ensureDir();
  const src = path.join(BACKUP_DIR, path.basename(file));
  if (!fssync.existsSync(src)) throw new Error("백업 파일을 찾을 수 없습니다.");

  if (src.endsWith(".tar.gz")) {
    await restoreFromTarGz(src);
    return true;
  }

  if (src.endsWith(".db")) {
    await checkpoint();
    await fs.copyFile(src, DB_PATH);
    return true;
  }

  throw new Error("지원하지 않는 백업 형식입니다.");
}

export async function restoreUploadedFile(tempPath: string, originalName: string) {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".tar.gz")) {
    await restoreFromTarGz(tempPath);
    return true;
  }
  if (lower.endsWith(".db")) {
    await checkpoint();
    await fs.copyFile(tempPath, DB_PATH);
    return true;
  }
  throw new Error(".db 또는 .tar.gz 파일만 복원 가능합니다.");
}

export function getBackupDir() {
  return BACKUP_DIR;
}

export async function getBackupIntervalDays() {
  const s = await prisma.systemSetting.findUnique({ where: { key: "BACKUP_INTERVAL_DAYS" } });
  const d = Number(s?.value || "1");
  return Number.isFinite(d) && d > 0 ? d : 1;
}

export async function setBackupIntervalDays(days: number) {
  await prisma.systemSetting.upsert({
    where: { key: "BACKUP_INTERVAL_DAYS" },
    update: { value: String(days), description: "자동 백업 주기(일)" },
    create: { key: "BACKUP_INTERVAL_DAYS", value: String(days), description: "자동 백업 주기(일)" },
  });
}

export async function getLastBackupAt() {
  const s = await prisma.systemSetting.findUnique({ where: { key: "LAST_BACKUP_AT" } });
  return s?.value ? new Date(s.value) : null;
}

export async function setLastBackupAt(d: Date) {
  await prisma.systemSetting.upsert({
    where: { key: "LAST_BACKUP_AT" },
    update: { value: d.toISOString(), description: "마지막 자동 백업 시각" },
    create: { key: "LAST_BACKUP_AT", value: d.toISOString(), description: "마지막 자동 백업 시각" },
  });
}

let running = false;
export async function maybeRunScheduledBackup() {
  if (running) return;
  running = true;
  try {
    const [days, last] = await Promise.all([getBackupIntervalDays(), getLastBackupAt()]);
    const due = !last || Date.now() - last.getTime() >= days * 24 * 60 * 60 * 1000;
    if (!due) return;
    await createBackup("scheduled");
    await setLastBackupAt(new Date());
  } finally {
    running = false;
  }
}
