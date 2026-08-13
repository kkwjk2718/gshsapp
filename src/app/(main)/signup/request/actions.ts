"use server";

import bcrypt from "bcryptjs";
import { logAction } from "@/lib/logger";
import { getPortalClientKey, hasValidPortalSession, setPortalSessionCookie } from "@/lib/token-portal-session";
import { sendPortalStudentInvite } from "@/lib/token-portal";
import { getTokenPortalSettings } from "@/lib/system-settings";
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";
import { getApplicationSecuritySecret, hashSecurityPrincipal } from "@/lib/security/principal-key";
import { PortalUnlockLimiter } from "@/lib/security/portal-unlock-limit";
import { headers } from "next/headers";
import { isSensitiveClientAddressTrusted, parseTrustedProxyHops, resolveTrustedClientAddress } from "@/lib/security/client-address";
import { parsePortalInviteInput, validatePortalPasswordInput } from "@/lib/security/portal-input";
import { prisma } from "@/lib/db";
import { validatePortalRosterIdentity } from "@/lib/student-roster";

export type PortalActionResult = {
  success?: string;
  error?: string;
};

const portalUnlockLimiter = new PortalUnlockLimiter();

async function getPortalUnlockKeys() {
  const [rawClientKey, requestHeaders] = await Promise.all([getPortalClientKey(), headers()]);
  const secret = getApplicationSecuritySecret();
  const trustedProxyHops = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
  const address = resolveTrustedClientAddress({ forwardedFor: requestHeaders.get("x-forwarded-for") }, {
    trustedProxyHops,
  });
  return {
    clientKey: hashSecurityPrincipal("portal-client", rawClientKey, secret),
    networkKey: address === null ? null : hashSecurityPrincipal("portal-network", address, secret),
    trustedClient: isSensitiveClientAddressTrusted(address, trustedProxyHops),
  };
}

export async function unlockTokenPortal(
  prevState: PortalActionResult,
  formData: FormData,
): Promise<PortalActionResult> {
  if (MEMBER_SERVICE_SUSPENDED) {
    return { error: "현재 회원 기능이 일시적으로 비활성화되어 있습니다." };
  }

  const password = validatePortalPasswordInput(formData.get("password"));
  if (!password) return { error: "Please enter a valid portal password." };

  const settings = await getTokenPortalSettings();
  if (!settings.enabled) {
    return { error: "현재 토큰 배부 포털이 비활성화되어 있습니다." };
  }

  if (!settings.passwordHash) {
    return { error: "접근 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해주세요." };
  }

  const unlockKeys = await getPortalUnlockKeys();
  if (!unlockKeys.trustedClient) return { error: "Unable to verify the portal network path." };
  const limiterDecision = portalUnlockLimiter.check(unlockKeys.clientKey, unlockKeys.networkKey);
  if (!limiterDecision.allowed) {
    return { error: "Too many failed attempts. Please wait before trying again." };
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

  const input = parsePortalInviteInput({
    name: formData.get("name"), studentId: formData.get("studentId"), email: formData.get("email"),
  });
  if (!input) return { error: "Please check the name, student ID, and email address." };

  const settings = await getTokenPortalSettings();
  if (!settings.enabled) {
    return { error: "현재 토큰 배부 포털이 비활성화되어 있습니다." };
  }

  const hasSession = await hasValidPortalSession(settings.sessionVersion);
  if (!hasSession) {
    return { error: "포털 인증이 만료되었습니다. 다시 비밀번호를 입력해주세요." };
  }

  const rosterEntry = await validatePortalRosterIdentity(prisma, input);
  if (!rosterEntry) {
    return { error: "The supplied student identity is not eligible for self-service enrollment." };
  }

  return sendPortalStudentInvite({ ...input, rosterEntryId: rosterEntry.id, rosterGisu: rosterEntry.gisu });
}
