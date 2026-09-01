import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { normalizeIpAddress } from "@/lib/security/client-address";
import { normalizeTelemetryPathname } from "@/lib/security/telemetry-request";
import { SYSTEM_SETTING_KEYS } from "@/lib/system-settings";

export const DEFAULT_SYSTEM_LOG_RETENTION_DAYS = 30;
export const MIN_SYSTEM_LOG_RETENTION_DAYS = 1;
export const MAX_SYSTEM_LOG_RETENTION_DAYS = 90;
export const MAX_TELEMETRY_LOG_ROWS = 50_000;
export const MAX_SYSTEM_LOG_ROWS = 100_000;
export const AUDIT_LOG_RETENTION_DAYS = 365;
export const MAX_AUDIT_LOG_ROWS = 50_000;
const BATCH_SIZE = 1_000;
const TELEMETRY_ACTIONS = ["PAGE_VIEW", "MEAL_VIEW"];

export type SystemLogWrite = Readonly<{
  action: string;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  path?: string | null;
  details?: string | null;
  createdAt?: Date;
}>;
export type BoundedWriteResult = "STORED" | "DROPPED";
export type LogMaintenanceResult = Readonly<{ expired: number; telemetryOverflow: number; totalOverflow: number }>;
export type SystemLogDb = Pick<Prisma.TransactionClient, "systemLog">;

export function parseSystemLogRetentionDays(value: unknown): number | null {
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= MIN_SYSTEM_LOG_RETENTION_DAYS && parsed <= MAX_SYSTEM_LOG_RETENTION_DAYS ? parsed : null;
}

export function retentionCutoff(now: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 1) throw new Error("Invalid retention days");
  return new Date(now.getTime() - days * 86_400_000);
}

export function overflowCount(currentRows: number, maximumRows: number): number {
  if (!Number.isSafeInteger(currentRows) || !Number.isSafeInteger(maximumRows) || currentRows < 0 || maximumRows < 0) throw new Error("Invalid row count");
  return Math.max(0, currentRows - maximumRows);
}

const SECRET_KEY = /password|token|secret|authorization|cookie/i;
function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, seen));
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    result[key] = SECRET_KEY.test(key) ? "[REDACTED]" : sanitize(child, seen);
  }
  return result;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (new TextEncoder().encode(value).byteLength <= maxBytes) return value;
  let result = "";
  for (const point of value) {
    if (new TextEncoder().encode(result + point).byteLength > maxBytes) break;
    result += point;
  }
  return result;
}

export function serializeSystemLogDetails(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return truncateUtf8(value, 2_048);
  let serialized: string;
  try { serialized = JSON.stringify(sanitize(value, new WeakSet())); } catch { serialized = JSON.stringify({ error: "unserializable" }); }
  if (new TextEncoder().encode(serialized).byteLength <= 2_048) return serialized;
  const points = [...serialized];
  let low = 0;
  let high = points.length;
  let bounded = JSON.stringify({ preview: "", truncated: true });
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = JSON.stringify({ preview: points.slice(0, middle).join(""), truncated: true });
    if (new TextEncoder().encode(candidate).byteLength <= 2_048) {
      bounded = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return bounded;
}

export function normalizeSystemLogWrite(input: SystemLogWrite): SystemLogWrite {
  const action = truncateUtf8(typeof input.action === "string" ? input.action.trim() : "", 64);
  if (!action) throw new Error("Invalid log action");
  return {
    action,
    userId: typeof input.userId === "string" && input.userId ? input.userId : null,
    ip: normalizeIpAddress(input.ip) ?? null,
    userAgent: input.userAgent == null ? null : truncateUtf8(input.userAgent, 256),
    path: input.path == null ? null : normalizeTelemetryPathname(input.path),
    details: serializeSystemLogDetails(input.details),
    createdAt: input.createdAt,
  };
}

async function deleteOldest(
  db: SystemLogDb,
  count: number,
  where: Prisma.SystemLogWhereInput,
): Promise<number> {
  let remaining = count;
  let deleted = 0;
  while (remaining > 0) {
    const rows = await db.systemLog.findMany({
      where, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.min(BATCH_SIZE, remaining),
    });
    if (rows.length === 0) break;
    const result = await db.systemLog.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    if (result.count === 0) break;
    deleted += result.count;
    remaining -= result.count;
  }
  return deleted;
}

export async function enforceSystemLogBounds(db: SystemLogDb, now: Date, retentionDays: number): Promise<LogMaintenanceResult> {
  const expiredCount = await db.systemLog.count({ where: { createdAt: { lt: retentionCutoff(now, retentionDays) } } });
  const expired = await deleteOldest(db, expiredCount, { createdAt: { lt: retentionCutoff(now, retentionDays) } });
  const telemetryCount = await db.systemLog.count({ where: { action: { in: TELEMETRY_ACTIONS } } });
  const telemetryOverflow = await deleteOldest(db, overflowCount(telemetryCount, MAX_TELEMETRY_LOG_ROWS), { action: { in: TELEMETRY_ACTIONS } });
  let remainingOverflow = overflowCount(await db.systemLog.count(), MAX_SYSTEM_LOG_ROWS);
  const telemetryDeleted = await deleteOldest(db, remainingOverflow, { action: { in: TELEMETRY_ACTIONS } });
  remainingOverflow -= telemetryDeleted;
  const otherDeleted = await deleteOldest(db, remainingOverflow, {});
  return { expired, telemetryOverflow, totalOverflow: telemetryDeleted + otherDeleted };
}

async function readRetentionDays() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.systemLogRetentionDays }, select: { value: true } });
  return parseSystemLogRetentionDays(setting?.value) ?? DEFAULT_SYSTEM_LOG_RETENTION_DAYS;
}

export async function appendBoundedSystemLog(input: SystemLogWrite): Promise<BoundedWriteResult> {
  const normalized = normalizeSystemLogWrite(input);
  const write = async (data: SystemLogWrite) => prisma.systemLog.create({ data });
  try {
    try {
      await write(normalized);
    } catch (error) {
      if ((error as { code?: string }).code !== "P2003" || !normalized.userId) throw error;
      await write({
        ...normalized,
        userId: null,
        details: serializeSystemLogDetails(normalized.details ? `${normalized.details} (Original UserID Invalid)` : "(Original UserID Invalid)"),
      });
    }
    return "STORED";
  } catch {
    return "DROPPED";
  }
}

export async function pruneSystemLogs(now = new Date()): Promise<LogMaintenanceResult> {
  const retentionDays = await readRetentionDays();
  return prisma.$transaction((tx) => enforceSystemLogBounds(tx, now, retentionDays));
}

export async function pruneAuditLogs(now = new Date()): Promise<{ expired: number; overflow: number }> {
  return prisma.$transaction(async (tx) => {
    const cutoff = retentionCutoff(now, AUDIT_LOG_RETENTION_DAYS);
    const expiredRows = await tx.auditLog.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const expired = (await tx.auditLog.deleteMany({ where: { id: { in: expiredRows.slice(0, BATCH_SIZE).map((row) => row.id) } } })).count;
    const count = await tx.auditLog.count();
    const overflowRows = await tx.auditLog.findMany({ select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: Math.min(BATCH_SIZE, overflowCount(count, MAX_AUDIT_LOG_ROWS)) });
    const overflow = (await tx.auditLog.deleteMany({ where: { id: { in: overflowRows.map((row) => row.id) } } })).count;
    return { expired, overflow };
  });
}
