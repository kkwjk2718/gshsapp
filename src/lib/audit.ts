import type { Prisma } from "@prisma/client";

import { normalizeIpAddress } from "@/lib/security/client-address";

export const AUDIT_ACTIONS = [
  "SYSTEM_LOG_RETENTION_CHANGED", "SYSTEM_LOG_CLEANED", "SYSTEM_LOG_EXPORTED",
  "USER_EXPORTED", "USER_IMPORTED", "USER_PASSWORD_RESET", "USER_ROLE_CHANGED",
  "USER_GISU_CHANGED", "USER_BANNED", "USER_UNBANNED", "USER_DELETED",
  "TOKEN_BATCH_CREATED", "TOKEN_EXPORTED", "TOKEN_DELETED", "TOKEN_BATCH_DELETED",
  "TOKEN_EMAIL_REQUESTED", "TOKEN_PORTAL_CONFIG_CHANGED", "TOKEN_PORTAL_PASSWORD_ROTATED",
  "BACKUP_INTERVAL_CHANGED", "BACKUP_CREATED", "BACKUP_DOWNLOADED", "BACKUP_RESTORED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditTargetType = "SYSTEM_LOG" | "USER" | "TOKEN_BATCH" | "INVITE_TOKEN" | "TOKEN_DISTRIBUTION" | "SYSTEM_SETTING" | "BACKUP";
export type AuditEvent = Readonly<{
  actorId: string;
  action: AuditAction;
  target?: Readonly<{ type: AuditTargetType; id?: string | null }>;
  ipAddress?: string | null;
}>;
export type AuditLogData = Readonly<{
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType | null;
  targetId: string | null;
  ipAddress: string | null;
}>;
export type AuditDb = Pick<Prisma.TransactionClient, "auditLog">;
const AUDIT_RETENTION_MS = 365 * 86_400_000;
const MAX_AUDIT_ROWS = 50_000;
const AUDIT_PRUNE_BATCH = 1_000;

const TARGET_TYPES = new Set<AuditTargetType>(["SYSTEM_LOG", "USER", "TOKEN_BATCH", "INVITE_TOKEN", "TOKEN_DISTRIBUTION", "SYSTEM_SETTING", "BACKUP"]);
const ACTIONS = new Set<string>(AUDIT_ACTIONS);
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;

export function buildAuditLogData(event: AuditEvent): AuditLogData {
  if (typeof event.actorId !== "string" || !event.actorId.trim() || FORBIDDEN.test(event.actorId) || new TextEncoder().encode(event.actorId).byteLength > 128) throw new Error("Invalid audit actor");
  if (!ACTIONS.has(event.action)) throw new Error("Invalid audit action");
  if (event.target && !TARGET_TYPES.has(event.target.type)) throw new Error("Invalid audit target type");
  const targetId = event.target?.id ?? null;
  if (targetId !== null && (typeof targetId !== "string" || FORBIDDEN.test(targetId) || new TextEncoder().encode(targetId).byteLength > 128)) {
    throw new Error("Invalid audit target identifier");
  }
  const ipAddress = event.ipAddress == null ? null : normalizeIpAddress(event.ipAddress);
  if (event.ipAddress != null && !ipAddress) throw new Error("Invalid audit IP address");
  return {
    actorId: event.actorId,
    action: event.action,
    targetType: event.target?.type ?? null,
    targetId,
    ipAddress,
  };
}

export async function writeAuditLog(db: AuditDb, event: AuditEvent): Promise<void> {
  await db.auditLog.create({ data: buildAuditLogData(event) });
  const delegate = db.auditLog as typeof db.auditLog & {
    findMany?: Prisma.TransactionClient["auditLog"]["findMany"];
    count?: Prisma.TransactionClient["auditLog"]["count"];
    deleteMany?: Prisma.TransactionClient["auditLog"]["deleteMany"];
  };
  if (!delegate.findMany || !delegate.count || !delegate.deleteMany) return;

  const deleteOldest = async (where: Prisma.AuditLogWhereInput, maximum = Number.MAX_SAFE_INTEGER) => {
    let deleted = 0;
    while (deleted < maximum) {
      const rows = await delegate.findMany!({
        where,
        select: { id: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: Math.min(AUDIT_PRUNE_BATCH, maximum - deleted),
      });
      if (rows.length === 0) break;
      const result = await delegate.deleteMany!({ where: { id: { in: rows.map((row) => row.id) } } });
      if (result.count === 0) break;
      deleted += result.count;
    }
  };

  await deleteOldest({ createdAt: { lt: new Date(Date.now() - AUDIT_RETENTION_MS) } });
  const overflow = Math.max(0, await delegate.count() - MAX_AUDIT_ROWS);
  if (overflow > 0) await deleteOldest({}, overflow);
}
