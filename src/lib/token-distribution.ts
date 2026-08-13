import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { sendBrevoEmail } from "@/lib/brevo";
import { getGradeMapping } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";
import { getGradeFromStudentId, isValidStudentId } from "@/lib/student-id";
import { DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE, TOKEN_DISTRIBUTION_DAILY_LIMIT } from "@/lib/token-portal-config";
import { getSystemSettingValue, SYSTEM_SETTING_KEYS } from "@/lib/system-settings";
import { generateInviteSecret, hashInviteSecret } from "@/lib/security/invite-token";
import { enforceDistributionLogBounds, normalizeDistributionLogText } from "@/lib/distribution-log-store";

const SEOUL_TZ = "Asia/Seoul";

export type TokenDistributionSource = "PORTAL_AUTO" | "ADMIN_MANUAL";
export type TokenDistributionStatus = "PENDING" | "SENT" | "FAILED" | "BLOCKED";

type DistributionTarget = {
  email: string;
  name?: string | null;
  studentId?: string | null;
  targetRole: string;
  targetGisu?: number | null;
};

type SendDistributionEmailInput = {
  source: TokenDistributionSource;
  createdBy: string;
  clientKey?: string | null;
  target: DistributionTarget;
  reservation?: Readonly<{
    distributionLogId: string;
    inviteToken: Readonly<{ id: string; token: string; targetRole: string; targetGisu: number | null }>;
  }>;
};

export type SendDistributionEmailResult = {
  success?: string;
  error?: string;
  reusedToken?: boolean;
  quotaUsed?: number;
};

function getKstDayRange(baseDate = new Date()) {
  const zonedDate = toZonedTime(baseDate, SEOUL_TZ);
  const dayStart = startOfDay(zonedDate);
  const nextDayStart = addDays(dayStart, 1);

  return {
    start: fromZonedTime(dayStart, SEOUL_TZ),
    end: fromZonedTime(nextDayStart, SEOUL_TZ),
  };
}

export async function getTodayDistributionUsage() {
  const { start, end } = getKstDayRange();
  return prisma.tokenDistributionLog.count({
    where: {
      status: { in: ["PENDING", "SENT", "FAILED"] },
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  });
}

export async function getDistributionQuotaSummary() {
  const used = await getTodayDistributionUsage();
  return {
    used,
    remaining: Math.max(0, TOKEN_DISTRIBUTION_DAILY_LIMIT - used),
    isLimitReached: used >= TOKEN_DISTRIBUTION_DAILY_LIMIT,
  };
}

function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://gshs.app";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildInviteEmail({
  name,
  token,
  guidance,
}: {
  name?: string | null;
  token: string;
  guidance: string;
}) {
  const signupUrl = `${getAppBaseUrl()}/signup#token=${encodeURIComponent(token)}`;
  const greeting = name ? `${name}님` : "안녕하세요";
  const safeGreeting = escapeHtml(greeting);
  const safeToken = escapeHtml(token);
  const normalizedGuidance = guidance.trim() || DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE;
  const guidanceParagraphs = normalizedGuidance
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const htmlGuidance = guidanceParagraphs.length
    ? `<ul>${guidanceParagraphs.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : "";

  const textGuidance = guidanceParagraphs.length
    ? `\n\n추가 안내\n${guidanceParagraphs.map((line) => `- ${line}`).join("\n")}`
    : "";

  return {
    subject: "[GSHS.app] 회원가입 초대 토큰 안내",
    htmlContent: [
      `<p>${safeGreeting}, GSHS.app 회원가입을 위한 초대 토큰을 안내드립니다.</p>`,
      `<p><strong>초대 토큰:</strong> <code>${safeToken}</code></p>`,
      `<p><a href="${signupUrl}">회원가입 페이지 바로가기</a></p>`,
      `<p>토큰은 발급 후 7일 동안 유효합니다.</p>`,
      htmlGuidance,
      `<p>문의: <a href="mailto:admin@gshs.app">admin@gshs.app</a></p>`,
    ].join(""),
    textContent: [
      `${greeting}, GSHS.app 회원가입을 위한 초대 토큰을 안내드립니다.`,
      "",
      `초대 토큰: ${token}`,
      `회원가입 페이지: ${signupUrl}`,
      "토큰은 발급 후 7일 동안 유효합니다.",
      textGuidance,
      "",
      "문의: admin@gshs.app",
    ].join("\n"),
  };
}

async function createDistributionLog({
  source,
  recipientEmail,
  requesterName,
  studentId,
  targetRole,
  targetGisu,
  inviteTokenId,
  status,
  brevoMessageId,
  errorMessage,
  clientKey,
  createdBy,
}: {
  source: TokenDistributionSource;
  recipientEmail: string;
  requesterName?: string | null;
  studentId?: string | null;
  targetRole: string;
  targetGisu?: number | null;
  inviteTokenId?: string | null;
  status: TokenDistributionStatus;
  brevoMessageId?: string | null;
  errorMessage?: string | null;
  clientKey?: string | null;
  createdBy: string;
}) {
  return prisma.tokenDistributionLog.create({
    data: {
      source,
      recipientEmail,
      requesterName: requesterName || null,
      studentId: studentId || null,
      targetRole,
      targetGisu: targetGisu ?? null,
      inviteTokenId: inviteTokenId ?? null,
      status,
      brevoMessageId: brevoMessageId ?? null,
      errorMessage: errorMessage ?? null,
      clientKey: clientKey ?? null,
      createdBy,
    },
  });
}

export async function recordBlockedTokenDistribution({
  source,
  recipientEmail,
  requesterName,
  studentId,
  targetRole,
  targetGisu,
  errorMessage,
  clientKey,
  createdBy,
}: {
  source: TokenDistributionSource;
  recipientEmail: string;
  requesterName?: string | null;
  studentId?: string | null;
  targetRole: string;
  targetGisu?: number | null;
  errorMessage: string;
  clientKey?: string | null;
  createdBy: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.tokenDistributionLog.create({ data: {
      source,
      recipientEmail: normalizeDistributionLogText(recipientEmail.toLowerCase(), 254) ?? "invalid",
      requesterName: normalizeDistributionLogText(requesterName, 240),
      studentId: normalizeDistributionLogText(studentId, 16),
      targetRole: normalizeDistributionLogText(targetRole, 32) ?? "UNKNOWN",
      targetGisu: targetGisu ?? null,
      status: "BLOCKED",
      errorMessage: normalizeDistributionLogText(errorMessage, 512),
      clientKey: normalizeDistributionLogText(clientKey, 128),
      createdBy: normalizeDistributionLogText(createdBy, 128) ?? "system",
    } });
    await enforceDistributionLogBounds(tx);
  });
}

async function enforceDailyQuota({
  source,
  createdBy,
  clientKey,
  target,
  reservation,
}: SendDistributionEmailInput) {
  const quota = await getDistributionQuotaSummary();
  const isLimitReached = reservation ? quota.used > TOKEN_DISTRIBUTION_DAILY_LIMIT : quota.isLimitReached;
  if (!isLimitReached) {
    return { ...quota, isLimitReached: false };
  }

  if (reservation) {
    await prisma.$transaction(async (tx) => {
      const transition = await tx.tokenDistributionLog.updateMany({
        where: { id: reservation.distributionLogId, status: "PENDING" },
        data: { status: "BLOCKED", inviteTokenId: null, errorMessage: "Daily send limit reached." },
      });
      if (transition.count !== 1) throw new Error("Distribution reservation is no longer pending");
      if (source === "PORTAL_AUTO" && target.studentId) {
        await tx.studentRosterEntry.updateMany({
          where: {
            studentId: target.studentId,
            email: target.email.trim().toLowerCase(),
            claimedInviteTokenId: reservation.inviteToken.id,
            claimedUserId: null,
          },
          data: { claimedAt: null, claimedEmail: null, claimedInviteTokenId: null },
        });
      }
      await tx.inviteToken.delete({ where: { id: reservation.inviteToken.id } });
    });
  } else await createDistributionLog({
    source,
    recipientEmail: target.email,
    requesterName: target.name,
    studentId: target.studentId,
    targetRole: target.targetRole,
    targetGisu: target.targetGisu,
    status: "BLOCKED",
    errorMessage: "Daily Brevo send limit reached.",
    clientKey,
    createdBy,
  });

  await logAction("token_distribution_blocked", {
    reason: "daily-limit",
    source,
    recipientEmail: target.email,
    targetRole: target.targetRole,
  });

  return { ...quota, isLimitReached: true };
}

async function createInviteTokenRecord({
  createdBy,
  targetRole,
  targetGisu,
  boundEmail,
  boundStudentId,
}: {
  createdBy: string;
  targetRole: string;
  targetGisu?: number | null;
  boundEmail: string;
  boundStudentId?: string | null;
}) {
  const token = generateInviteSecret();
  const inviteToken = await prisma.inviteToken.create({
    data: {
      token: null,
      tokenHash: hashInviteSecret(token),
      boundEmail: boundEmail.trim().toLowerCase(),
      boundStudentId: boundStudentId?.trim() || null,
      targetRole,
      targetGisu: targetGisu ?? null,
      createdBy,
      isUsed: false,
      batchId: null,
    },
    select: { id: true, targetRole: true, targetGisu: true },
  });
  return { ...inviteToken, token };
}

export async function resolveStudentTargetGisu(studentId: string) {
  if (!isValidStudentId(studentId)) {
    return null;
  }

  const grade = getGradeFromStudentId(studentId);
  if (!grade) {
    return null;
  }

  const mapping = await getGradeMapping();
  return mapping[grade] ?? null;
}

export async function sendInviteTokenEmail(input: SendDistributionEmailInput): Promise<SendDistributionEmailResult> {
  const quota = await enforceDailyQuota(input);
  if (quota.isLimitReached) {
    return {
      error: `일일 메일 발송 한도(${TOKEN_DISTRIBUTION_DAILY_LIMIT}건)에 도달했습니다. 내일 다시 시도해주세요.`,
      quotaUsed: quota.used,
    };
  }

  const guidance =
    (await getSystemSettingValue(SYSTEM_SETTING_KEYS.tokenPortalEmailGuidance)) ||
    DEFAULT_TOKEN_PORTAL_EMAIL_GUIDANCE;

  let inviteToken: { id: string; token: string; targetRole: string; targetGisu: number | null } | null =
    input.reservation?.inviteToken ?? null;
  let createdWithoutReservation = false;

  if (!inviteToken) {
    inviteToken = await createInviteTokenRecord({
      createdBy: input.createdBy,
      targetRole: input.target.targetRole,
      targetGisu: input.target.targetGisu,
      boundEmail: input.target.email,
      boundStudentId: input.target.studentId,
    });
    createdWithoutReservation = true;
  }

  let providerAccepted = false;
  try {
    const emailPayload = buildInviteEmail({
      name: input.target.name,
      token: inviteToken.token,
      guidance,
    });

    const response = await sendBrevoEmail({
      to: {
        email: input.target.email,
        name: input.target.name,
      },
      subject: emailPayload.subject,
      htmlContent: emailPayload.htmlContent,
      textContent: emailPayload.textContent,
    });
    providerAccepted = true;

    if (input.reservation) {
      const messageId = typeof response.messageId === "string" ? response.messageId.replace(/[\u0000-\u001f\u007f-\u009f\ufeff]/gu, "").slice(0, 256) : null;
      const transition = await prisma.tokenDistributionLog.updateMany({
        where: { id: input.reservation.distributionLogId, status: "PENDING" },
        data: { status: "SENT", inviteTokenId: inviteToken.id, brevoMessageId: messageId, errorMessage: null },
      });
      if (transition.count !== 1) throw new Error("Distribution reservation is no longer pending");
    } else await createDistributionLog({
      source: input.source,
      recipientEmail: input.target.email,
      requesterName: input.target.name,
      studentId: input.target.studentId,
      targetRole: input.target.targetRole,
      targetGisu: input.target.targetGisu,
      inviteTokenId: inviteToken.id,
      status: "SENT",
      brevoMessageId: response.messageId,
      clientKey: input.clientKey ?? null,
      createdBy: input.createdBy,
    });
    await logAction("token_distribution_sent", {
      source: input.source,
      recipientEmail: input.target.email,
      targetRole: input.target.targetRole,
      targetGisu: input.target.targetGisu ?? null,
      reusedToken: false,
    });

    return {
      success: `${input.target.email}로 초대 메일을 발송했습니다.`,
      reusedToken: false,
      quotaUsed: input.reservation ? quota.used : quota.used + 1,
    };
  } catch (error) {
    if (providerAccepted) throw error;
    if (createdWithoutReservation) {
      await prisma.inviteToken
        .delete({
          where: {
            id: inviteToken.id,
          },
        })
        .catch(() => undefined);
    }

    const rawError = error instanceof Error ? error.message : "Unknown email delivery failure";
    const errorMessage = [...rawError.replace(/[\u0000-\u001f\u007f-\u009f\ufeff]/gu, " ")].slice(0, 512).join("");

    if (input.reservation) {
      await prisma.$transaction(async (tx) => {
        const transition = await tx.tokenDistributionLog.updateMany({
          where: { id: input.reservation!.distributionLogId, status: "PENDING" },
          data: { status: "FAILED", inviteTokenId: null, brevoMessageId: null, errorMessage },
        });
        if (transition.count !== 1) throw new Error("Distribution reservation is no longer pending");
        await tx.inviteToken.delete({ where: { id: inviteToken.id } });
        if (input.source === "PORTAL_AUTO" && input.target.studentId) {
          await tx.studentRosterEntry.updateMany({
            where: {
              studentId: input.target.studentId,
              email: input.target.email.trim().toLowerCase(),
              claimedInviteTokenId: inviteToken.id,
              claimedUserId: null,
            },
            data: { claimedAt: null, claimedEmail: null, claimedInviteTokenId: null },
          });
        }
      });
    } else await createDistributionLog({
      source: input.source,
      recipientEmail: input.target.email,
      requesterName: input.target.name,
      studentId: input.target.studentId,
      targetRole: input.target.targetRole,
      targetGisu: input.target.targetGisu,
      status: "FAILED",
      errorMessage,
      clientKey: input.clientKey ?? null,
      createdBy: input.createdBy,
    });

    await logAction("token_distribution_failed", {
      source: input.source,
      recipientEmail: input.target.email,
      targetRole: input.target.targetRole,
      errorMessage,
    });

    return {
      error: "메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      quotaUsed: input.reservation ? quota.used : quota.used + 1,
    };
  }
}
