"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/current-user";
import { formatKST } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { serializeCsv } from "@/lib/security/csv";
import { enforceSystemLogBounds, parseSystemLogRetentionDays } from "@/lib/system-log-store";
import { SYSTEM_SETTING_KEYS } from "@/lib/system-settings";
import { USER_ROLES } from "@/lib/user-roles";

const LOG_ACTIONS = ["ALL", "LOGIN", "LOGOUT", "LOGIN_FAILED", "LOGIN_BLOCKED", "LOGIN_BLOCKED_MEMBER_SERVICE_SUSPENDED", "PAGE_VIEW", "MEAL_VIEW", "SONG_REQUEST", "ADMIN_ACTION", "ERROR", "SYSTEM_TEST"] as const;
const LOG_ROLES = ["ALL", ...USER_ROLES] as const;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;

export type SystemLogQuery = Readonly<{ page?: number; limit?: number; action?: string; search?: string; role?: string }>;

function validateQuery(input: SystemLogQuery) {
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const action = input.action ?? "ALL";
  const search = input.search ?? "";
  const role = input.role ?? "ALL";
  if (!Number.isInteger(page) || page < 1 || page > 10_000 || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !LOG_ACTIONS.includes(action as (typeof LOG_ACTIONS)[number]) || !LOG_ROLES.includes(role as (typeof LOG_ROLES)[number]) ||
      typeof search !== "string" || new TextEncoder().encode(search).byteLength > 100 || CONTROL.test(search)) {
    throw new Error("Invalid log query");
  }
  return { page, limit, action, search, role };
}

export async function saveRetentionSettings(days: number) {
  const actor = await requireAdmin();
  const retentionDays = parseSystemLogRetentionDays(days);
  if (retentionDays === null) throw new Error("Retention days must be an integer from 1 through 90");
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.systemLogRetentionDays },
      update: { value: String(retentionDays) },
      create: { key: SYSTEM_SETTING_KEYS.systemLogRetentionDays, value: String(retentionDays), description: "System log retention period in days" },
    });
    const result = await enforceSystemLogBounds(tx, new Date(), retentionDays);
    await writeAuditLog(tx, { actorId: actor.id, action: "SYSTEM_LOG_RETENTION_CHANGED", target: { type: "SYSTEM_SETTING", id: `days:${retentionDays}` } });
    await writeAuditLog(tx, { actorId: actor.id, action: "SYSTEM_LOG_CLEANED", target: { type: "SYSTEM_LOG", id: `rows:${result.expired + result.telemetryOverflow + result.totalOverflow}` } });
  });
  revalidatePath("/admin/logs");
}

export async function getLogsForExport() {
  const actor = await requireAdmin();
  const logs = await prisma.systemLog.findMany({
    orderBy: { createdAt: "desc" }, take: 10_000,
    select: { id: true, createdAt: true, action: true, ip: true, path: true, details: true, user: { select: { name: true, studentId: true } } },
  });
  const csv = serializeCsv([
    ["Time", "Action", "User", "StudentId", "IP", "Path", "Details"],
    ...logs.map((log) => [formatKST(log.createdAt, "yyyy-MM-dd HH:mm:ss"), log.action, log.user?.name ?? "Guest", log.user?.studentId ?? "-", log.ip, log.path ?? "", log.details ?? ""]),
  ], { includeUtf8Bom: true });
  await writeAuditLog(prisma, { actorId: actor.id, action: "SYSTEM_LOG_EXPORTED", target: { type: "SYSTEM_LOG", id: `rows:${logs.length}` } });
  return csv;
}

export async function getSystemLogs(input: SystemLogQuery = {}) {
  await requireAdmin();
  const { page, limit, action, search, role } = validateQuery(input);
  const where: Prisma.SystemLogWhereInput = {};
  if (action !== "ALL") where.action = action;
  if (search) where.user = { OR: [{ name: { contains: search } }, { studentId: { contains: search } }, { userId: { contains: search } }] };
  if (role !== "ALL") where.user = where.user ? { AND: [where.user, { role }] } : { role };
  const [logs, total] = await Promise.all([
    prisma.systemLog.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      select: { id: true, action: true, ip: true, path: true, details: true, createdAt: true, user: { select: { name: true, studentId: true, role: true, userId: true } } },
    }),
    prisma.systemLog.count({ where }),
  ]);
  return { logs, total, totalPages: Math.ceil(total / limit), currentPage: page };
}
