"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { InviteRedemptionError, redeemInvite } from "@/lib/invite-redemption";
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";
import { validatePassword } from "@/lib/security/password-policy";
import { hashInviteSecret } from "@/lib/security/invite-token";
import { isValidStudentId } from "@/lib/student-id";

const LOGIN_ID = /^[A-Za-z0-9._-]{3,64}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;

function genericInviteError() {
  return { error: "The invitation is invalid, expired, used, or not issued for this identity." };
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

  if (!token || token.length > 128 || !LOGIN_ID.test(userId) || !name || [...name].length > 80 || CONTROLS.test(name) ||
      !EMAIL.test(email) || email.length > 254 || CONTROLS.test(email)) {
    return { error: "Please check the signup fields." };
  }
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  const passwordPolicy = validatePassword(password);
  if (!passwordPolicy.ok) return { error: passwordPolicy.message };

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await redeemInvite(prisma, {
      presentedSecret: token,
      tokenHash: hashInviteSecret(token),
      legacyToken: token.length <= 64 ? token : null,
      now: new Date(),
      claimedIdentity: { email, studentId: studentId || null },
      validateInvite(invite) {
        if (invite.targetRole === "STUDENT" && (!studentId || !isValidStudentId(studentId))) {
          throw new InviteRedemptionError("INVALID_ROLE_DATA");
        }
      },
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
