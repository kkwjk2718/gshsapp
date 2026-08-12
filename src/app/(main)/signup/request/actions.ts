"use server";

import bcrypt from "bcryptjs";
import { logAction } from "@/lib/logger";
import { getPortalClientKey, hasValidPortalSession, setPortalSessionCookie } from "@/lib/token-portal-session";
import { sendPortalStudentInvite } from "@/lib/token-portal";
import { getTokenPortalSettings } from "@/lib/system-settings";
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";
import { getApplicationSecuritySecret, hashSecurityPrincipal, networkPrincipal } from "@/lib/security/principal-key";
import { PortalUnlockLimiter } from "@/lib/security/portal-unlock-limit";
import { headers } from "next/headers";
import { parseTrustedProxyHops, resolveTrustedClientAddress } from "@/lib/security/client-address";

export type PortalActionResult = {
  success?: string;
  error?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const portalUnlockLimiter = new PortalUnlockLimiter();

async function getPortalUnlockKeys() {
  const [rawClientKey, requestHeaders] = await Promise.all([getPortalClientKey(), headers()]);
  const secret = getApplicationSecuritySecret();
  const address = resolveTrustedClientAddress({ forwardedFor: requestHeaders.get("x-forwarded-for") }, {
    trustedProxyHops: parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
  });
  return {
    clientKey: hashSecurityPrincipal("portal-client", rawClientKey, secret),
    networkKey: hashSecurityPrincipal("portal-network", networkPrincipal(address, rawClientKey), secret),
  };
}

export async function unlockTokenPortal(
  prevState: PortalActionResult,
  formData: FormData,
): Promise<PortalActionResult> {
  if (MEMBER_SERVICE_SUSPENDED) {
    return { error: "현재 회원 기능이 일시적으로 비활성화되어 있습니다." };
  }

  const settings = await getTokenPortalSettings();
  if (!settings.enabled) {
    return { error: "현재 토큰 배부 포털이 비활성화되어 있습니다." };
  }

  if (!settings.passwordHash) {
    return { error: "접근 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해주세요." };
  }

  const unlockKeys = await getPortalUnlockKeys();
  const limiterDecision = portalUnlockLimiter.check(unlockKeys.clientKey, unlockKeys.networkKey);
  if (!limiterDecision.allowed) {
    return { error: "Too many failed attempts. Please wait before trying again." };
  }

  const password = (formData.get("password") as string | null)?.trim() || "";
  if (!password) {
    return { error: "포털 비밀번호를 입력해주세요." };
  }

  const isMatch = await bcrypt.compare(password, settings.passwordHash);
  if (!isMatch) {
    portalUnlockLimiter.recordFailure(unlockKeys.clientKey, unlockKeys.networkKey);
    await logAction("token_portal_password_failed", { provided: true });
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  portalUnlockLimiter.clearClient(unlockKeys.clientKey);
  await setPortalSessionCookie(settings.sessionVersion);
  await logAction("token_portal_password_success", {
    sessionVersion: settings.sessionVersion,
  });

  return {
    success: "포털 인증이 완료되었습니다.",
  };
}

export async function requestSignupToken(
  prevState: PortalActionResult,
  formData: FormData,
): Promise<PortalActionResult> {
  if (MEMBER_SERVICE_SUSPENDED) {
    return { error: "현재 회원 기능이 일시적으로 비활성화되어 있습니다." };
  }

  const settings = await getTokenPortalSettings();
  if (!settings.enabled) {
    return { error: "현재 토큰 배부 포털이 비활성화되어 있습니다." };
  }

  const hasSession = await hasValidPortalSession(settings.sessionVersion);
  if (!hasSession) {
    return { error: "포털 인증이 만료되었습니다. 다시 비밀번호를 입력해주세요." };
  }

  const name = (formData.get("name") as string | null)?.trim() || "";
  const studentId = (formData.get("studentId") as string | null)?.trim() || "";
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() || "";

  if (!name || !studentId || !email) {
    return { error: "이름, 학번, 이메일을 모두 입력해주세요." };
  }

  if (!isValidEmail(email)) {
    return { error: "이메일 주소 형식이 올바르지 않습니다." };
  }

  return sendPortalStudentInvite({
    name,
    studentId,
    email,
  });
}
