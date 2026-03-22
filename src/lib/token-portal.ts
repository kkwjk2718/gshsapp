import { logAction } from "@/lib/logger";
import {
  getPortalClientKey,
  getPortalCooldownRemainingSeconds,
  setPortalCooldownCookie,
} from "@/lib/token-portal-session";
import {
  getDistributionQuotaSummary,
  recordBlockedTokenDistribution,
  resolveStudentTargetGisu,
  sendInviteTokenEmail,
} from "@/lib/token-distribution";
import { isValidStudentId } from "@/lib/student-id";
import { getTokenPortalSettings } from "@/lib/system-settings";

export async function getPublicPortalState() {
  const settings = await getTokenPortalSettings();
  const cooldownSeconds = await getPortalCooldownRemainingSeconds();
  const quota = await getDistributionQuotaSummary();

  return {
    settings,
    cooldownSeconds,
    quota,
  };
}

export async function sendPortalStudentInvite({
  name,
  studentId,
  email,
}: {
  name: string;
  studentId: string;
  email: string;
}) {
  const portalState = await getPublicPortalState();
  const clientKey = await getPortalClientKey();
  if (!portalState.settings.enabled) {
    await recordBlockedTokenDistribution({
      source: "PORTAL_AUTO",
      recipientEmail: email,
      requesterName: name,
      studentId,
      targetRole: "STUDENT",
      errorMessage: "Portal disabled.",
      clientKey,
      createdBy: "system:distribution-portal",
    });

    await logAction("token_portal_blocked", {
      reason: "disabled",
      email,
      studentId,
    });

    return { error: "현재 토큰 배부 포털이 비활성화되어 있습니다." };
  }

  if (portalState.cooldownSeconds > 0) {
    await recordBlockedTokenDistribution({
      source: "PORTAL_AUTO",
      recipientEmail: email,
      requesterName: name,
      studentId,
      targetRole: "STUDENT",
      errorMessage: `Cooldown active (${portalState.cooldownSeconds}s remaining).`,
      clientKey,
      createdBy: "system:distribution-portal",
    });

    return {
      error: `너무 빠르게 요청하고 있습니다. ${portalState.cooldownSeconds}초 후 다시 시도해주세요.`,
    };
  }

  if (!isValidStudentId(studentId)) {
    return { error: "학번은 4자리 형식으로 입력해주세요. 예: 1304" };
  }

  const targetGisu = await resolveStudentTargetGisu(studentId);
  if (!targetGisu) {
    return { error: "학번에 맞는 기수를 계산할 수 없습니다. 관리자에게 문의해주세요." };
  }

  const result = await sendInviteTokenEmail({
    source: "PORTAL_AUTO",
    createdBy: "system:distribution-portal",
    clientKey,
    target: {
      email,
      name,
      studentId,
      targetRole: "STUDENT",
      targetGisu,
    },
  });

  if (result.success) {
    await setPortalCooldownCookie();
  }

  return result;
}
