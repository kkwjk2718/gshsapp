"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { buildPasswordCredentialUpdate } from "@/lib/security/user-auth-mutations";
import { isValidBcryptInput, validatePassword } from "@/lib/security/password-policy";
import { validateSelfProfileInput } from "@/lib/security/profile-input";
import { writeAuditLog } from "@/lib/audit";
import {
  createPersonalEventWithinLimit,
  normalizePersonalEventInput,
} from "@/lib/personal-event";
import { isCanonicalUuid } from "@/lib/security/public-input";
import { headers } from "next/headers";
import { isSensitiveClientAddressTrusted, parseTrustedProxyHops, resolveTrustedClientAddress } from "@/lib/security/client-address";
import { getApplicationSecuritySecret, hashSecurityPrincipal } from "@/lib/security/principal-key";
import { passwordChangeLimiter } from "@/lib/security/password-change-limit";

export async function createDDay(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !user.id) throw new Error("Unauthorized");
  const input = normalizePersonalEventInput(formData.get("title"), formData.get("date"));
  const result = await createPersonalEventWithinLimit(prisma, user.id, input);
  if (!result.created) throw new Error("D-Day는 최대 3개까지 등록 가능합니다.");

  revalidatePath("/me");
}

export async function deleteDDay(formData: FormData) {
  const id = formData.get("id") as string;
  const user = await getCurrentUser();
  if (!user || !user.id) throw new Error("Unauthorized");
  if (!isCanonicalUuid(id)) throw new Error("Invalid personal event");

  await prisma.personalEvent.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/me");
}

export async function setPrimaryDDay(formData: FormData) {
    const id = formData.get("id") as string;
    const user = await getCurrentUser();
    if (!user || !user.id) throw new Error("Unauthorized");
    if (!isCanonicalUuid(id)) throw new Error("Invalid personal event");

    await prisma.$transaction(async (tx) => {
        await tx.personalEvent.updateMany({ where: { userId: user.id }, data: { isPrimary: false } });
        const result = await tx.personalEvent.updateMany({ where: { id, userId: user.id }, data: { isPrimary: true } });
        if (result.count !== 1) throw new Error("Personal event not found");
    });

    revalidatePath("/me");
    revalidatePath("/");
}

export async function updateProfile(formData: FormData) {
    const user = await getCurrentUser();
    if (!user || !user.id) return { error: "Unauthorized" };

    const validated = validateSelfProfileInput({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
    });
    if (!validated.ok) return { error: validated.error };

    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({
          where: { id: user.id },
          select: { email: true },
        });
        if (!current || current.email?.trim().toLowerCase() !== validated.data.email) {
          throw new Error("PROFILE_EMAIL_IMMUTABLE");
        }
        if (user.role === "STUDENT" || user.role === "BROADCAST") {
          const rosterIdentity = await tx.studentRosterEntry.findFirst({
            where: { claimedUserId: user.id, active: true },
            select: { name: true, email: true },
          });
          if (!rosterIdentity || rosterIdentity.name !== validated.data.name ||
              rosterIdentity.email.toLowerCase() !== validated.data.email) {
            throw new Error("ROSTER_PROFILE_IMMUTABLE");
          }
        }
        await tx.user.update({ where: { id: user.id }, data: validated.data });
        await writeAuditLog(tx, { actorId: user.id, action: "USER_PROFILE_CHANGED", target: { type: "USER", id: user.id } });
      });
      revalidatePath("/me");
      return { success: "Profile updated." };
    } catch (error) {
      if (error instanceof Error && error.message === "PROFILE_EMAIL_IMMUTABLE") {
        return { error: "Email changes require an administrator-verified identity update." };
      }
      if (error instanceof Error && error.message === "ROSTER_PROFILE_IMMUTABLE") {
        return { error: "Student name and email are managed by the authoritative roster." };
      }
      return { error: "Unable to update profile." };
    }
}

export async function changePassword(formData: FormData) {
    const user = await getCurrentUser({ allowPasswordChangeRequired: true });
    if (!user || !user.id) return { error: "Unauthorized" };

    const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, passwordHash: true, sessionVersion: true },
    });

    if (!dbUser) return { error: "User not found" };

    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
        return { error: "모든 필드를 입력해주세요." };
    }
    if (!isValidBcryptInput(currentPassword)) return { error: "Please check the current password." };
    if (newPassword !== confirmPassword) {
        return { error: "새 비밀번호가 일치하지 않습니다." };
    }
    const passwordPolicy = validatePassword(newPassword);
    if (!passwordPolicy.ok) return { error: passwordPolicy.message };

    const requestHeaders = await headers();
    const trustedProxyHops = parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
    const address = resolveTrustedClientAddress({ forwardedFor: requestHeaders.get("x-forwarded-for") }, { trustedProxyHops });
    if (!isSensitiveClientAddressTrusted(address, trustedProxyHops)) {
      return { error: "Unable to verify the password-change network path." };
    }
    const securitySecret = getApplicationSecuritySecret();
    const userKey = hashSecurityPrincipal("password-change-user", user.id, securitySecret);
    const networkKey = address === null ? null : hashSecurityPrincipal("password-change-network", address, securitySecret);
    if (passwordChangeLimiter.check(userKey, networkKey).locked) {
      return { error: "Too many password attempts. Please wait before trying again." };
    }
    passwordChangeLimiter.recordFailure(userKey, networkKey);

    const isValid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!isValid) {
        return { error: "현재 비밀번호가 일치하지 않습니다." };
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({
          where: { id: user.id, passwordHash: dbUser.passwordHash, sessionVersion: dbUser.sessionVersion },
          data: buildPasswordCredentialUpdate(newPasswordHash),
        });
        if (updated.count !== 1) throw new Error("PASSWORD_STATE_CHANGED");
        await writeAuditLog(tx, { actorId: user.id, action: "USER_PASSWORD_CHANGED", target: { type: "USER", id: user.id } });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PASSWORD_STATE_CHANGED") {
        return { error: "The password changed during this request. Please sign in again." };
      }
      throw error;
    }
    passwordChangeLimiter.clearUser(userKey);
    await signOut({ redirectTo: "/login" });
    return { success: "비밀번호가 성공적으로 변경되었습니다." };
}

export async function deleteSongRequest(formData: FormData) {
    const id = formData.get("id") as string;
    const user = await getCurrentUser();
    if (!user || !user.id) throw new Error("Unauthorized");
    if (!isCanonicalUuid(id)) throw new Error("Invalid song request");

    await prisma.songRequest.deleteMany({
        where: { 
            id: id,
            requesterId: user.id,
            status: "PENDING",
        }
    });

    revalidatePath("/me");
}
