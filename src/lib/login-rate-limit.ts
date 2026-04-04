import { subMinutes } from "date-fns";
import { prisma } from "@/lib/db";

export const LOGIN_FAILURE_WINDOW_MINUTES = 10;
export const MAX_LOGIN_FAILURES_PER_WINDOW = 5;

function escapeJsonStringValue(value: string) {
  return JSON.stringify(value).slice(1, -1);
}

function getLoginMarker(loginId: string) {
  return `"loginId":"${escapeJsonStringValue(loginId)}"`;
}

export async function countRecentFailedLogins(loginId: string) {
  const trimmedLoginId = loginId.trim();
  if (!trimmedLoginId) {
    return 0;
  }

  return prisma.systemLog.count({
    where: {
      action: {
        in: ["LOGIN_FAILED", "LOGIN_BLOCKED"],
      },
      createdAt: {
        gte: subMinutes(new Date(), LOGIN_FAILURE_WINDOW_MINUTES),
      },
      details: {
        contains: getLoginMarker(trimmedLoginId),
      },
    },
  });
}

export async function isLoginTemporarilyLocked(loginId: string) {
  const recentFailures = await countRecentFailedLogins(loginId);
  return recentFailures >= MAX_LOGIN_FAILURES_PER_WINDOW;
}
