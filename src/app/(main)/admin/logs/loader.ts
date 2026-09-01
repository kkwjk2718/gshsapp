import "server-only";

import { requireAdmin } from "@/lib/current-user";
import { getKSTStartOfDay } from "@/lib/date-utils";
import { prisma } from "@/lib/db";
import { DEFAULT_SYSTEM_LOG_RETENTION_DAYS, parseSystemLogRetentionDays } from "@/lib/system-log-store";
import { SYSTEM_SETTING_KEYS } from "@/lib/system-settings";

export async function loadLogDashboard() {
  await requireAdmin();
  const [setting, totalCount, todayCount] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.systemLogRetentionDays }, select: { value: true } }),
    prisma.systemLog.count(),
    prisma.systemLog.count({ where: { createdAt: { gte: getKSTStartOfDay() } } }),
  ]);
  return { retentionDays: parseSystemLogRetentionDays(setting?.value) ?? DEFAULT_SYSTEM_LOG_RETENTION_DAYS, stats: { totalCount, todayCount } };
}
