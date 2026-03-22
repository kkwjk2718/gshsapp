"use server";

import bcrypt from "bcryptjs";
import { logAction } from "@/lib/logger";
import { hasValidPortalSession, setPortalSessionCookie } from "@/lib/token-portal-session";
import { sendPortalStudentInvite } from "@/lib/token-portal";
import { getTokenPortalSettings } from "@/lib/system-settings";

export type PortalActionResult = {
  success?: string;
  error?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function unlockTokenPortal(
  prevState: PortalActionResult,
  formData: FormData,
): Promise<PortalActionResult> {
  const settings = await getTokenPortalSettings();
  if (!settings.enabled) {
    return { error: "현재 토큰 배부 포털이 비활성화되어 있습니다." };
  }

  if (!settings.passwordHash) {
    return { error: "접근 비밀번호가 아직 설정되지 않았습니다. 관리자에게 문의해주세요." };
  }

  const password = (formData.get("password") as string | null)?.trim() || "";
  if (!password) {
    return { error: "포털 비밀번호를 입력해주세요." };
  }

  const isMatch = await bcrypt.compare(password, settings.passwordHash);
  if (!isMatch) {
    await logAction("token_portal_password_failed", { provided: true });
    return { error: "비밀번호가 올바르지 않습니다." };
  }

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
