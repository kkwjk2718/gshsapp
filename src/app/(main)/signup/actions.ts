"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { InviteRedemptionError, preflightInviteRedemption, redeemInvite } from "@/lib/invite-redemption";
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";
import { validatePassword } from "@/lib/security/password-policy";
import { hashInviteSecret } from "@/lib/security/invite-token";
import { validateSignupInviteIdentity } from "@/lib/security/signup-identity";
import { isSensitiveClientAddressTrusted, parseTrustedProxyHops, resolveTrustedClientAddress } from "@/lib/security/client-address";
import { getApplicationSecuritySecret, hashSecurityPrincipal } from "@/lib/security/principal-key";
import { signupAttemptLimiter } from "@/lib/signup-rate-limit";

const LOGIN_ID = /^[A-Za-z0-9._-]{3,64}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;

function genericInviteError() {
  return { error: "The invitation is invalid, expired, used, or not issued for this identity." };
}

async function getSignupAttemptKeys(userId: string) {
  const requestHeaders = await headers();
  const trustedProxyHops = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
  const address = resolveTrustedClientAddress({
    forwardedFor: requestHeaders.get("x-forwarded-for"),
  }, { trustedProxyHops });
  const secret = getApplicationSecuritySecret();
  return {
    identifierKey: hashSecurityPrincipal("signup-identifier", userId.toLowerCase(), secret),
    networkKey: address === null ? null : hashSecurityPrincipal("signup-network", address, secret),
    trustedClient: isSensitiveClientAddressTrusted(address, trustedProxyHops),
  };
}

export async function signup(formData: FormData) {
  if (MEMBER_SERVICE_SUSPENDED) return { error: "Member signup is temporarily unavailable." };

  const token = String(formData.get("token") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const name = String(formData.get("name") ?? "").trim().normalize("NFC");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const studentId = String(formData.get("studentId") ?? "").trim();

  if (!token || token.length > 128 || CONTROLS.test(token) || !LOGIN_ID.test(userId) || !name || [...name].length > 80 ||
      new TextEncoder().encode(name).byteLength > 240 || CONTROLS.test(name) || !EMAIL.test(email) || email.length > 254 ||
      new TextEncoder().encode(email).byteLength > 254 || CONTROLS.test(email) || studentId.length > 16 || CONTROLS.test(studentId)) {
    return { error: "Please check the signup fields." };
  }
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  const passwordPolicy = validatePassword(password);
  if (!passwordPolicy.ok) return { error: passwordPolicy.message };

  const attemptKeys = await getSignupAttemptKeys(userId);
  if (!attemptKeys.trustedClient) return { error: "Unable to verify the signup network path." };
  if (signupAttemptLimiter.check(attemptKeys.identifierKey, attemptKeys.networkKey).locked) {
    return { error: "Too many signup attempts. Please wait before trying again." };
  }
  signupAttemptLimiter.recordAttempt(attemptKeys.identifierKey, attemptKeys.networkKey);

  const inviteInput = {
    tokenHash: hashInviteSecret(token),
    legacyToken: token.length <= 64 ? token : null,
    now: new Date(),
    claimedIdentity: { email, studentId: studentId || null },
    validateInvite: (invite: Readonly<{ targetRole: string }>) => validateSignupInviteIdentity(invite, studentId || null),
  } as const;

  try {
    await preflightInviteRedemption(prisma, inviteInput);
  } catch (error) {
    if (error instanceof InviteRedemptionError) return genericInviteError();
    return { error: "Unable to validate the invitation." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await redeemInvite(prisma, {
      presentedSecret: token,
      ...inviteInput,
      now: new Date(),
      userData: {
        userId,
        passwordHash,
        name,
        email,
        studentId: studentId || null,
        isOnboarded: true,
      },
    });
  } catch (error) {
    if (error instanceof InviteRedemptionError) return genericInviteError();
    return { error: "Unable to create the account. The login ID or email may already exist." };
  }

  redirect("/login");
}
