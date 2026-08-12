"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { sendInviteTokenEmail } from "@/lib/token-distribution";
import { writeAuditLog } from "@/lib/audit";
import { generateInviteSecret, hashInviteSecret } from "@/lib/security/invite-token";
import { DistributionReservationError, reserveDistribution } from "@/lib/distribution-reservation";
import { serializeTokenCsv } from "@/lib/token-csv";

function parseBoundedInteger(raw: string, minimum: number, maximum: number): number | null {
  if (!/^\d+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

export async function createTokens(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !user.id || user.role !== 'ADMIN') throw new Error("Unauthorized");

  const countRaw = String(formData.get("count") ?? "").trim();
  const count = parseBoundedInteger(countRaw, 1, 100);
  const targetRole = String(formData.get("targetRole") ?? "").trim();
  const targetGisuRaw = String(formData.get("targetGisu") ?? "").trim();
  const targetGisu = targetGisuRaw ? parseBoundedInteger(targetGisuRaw, 1, 200) : null;
  const title = String(formData.get("title") ?? "").trim();
  const memo = String(formData.get("memo") ?? "").trim();
  if (count === null || !["STUDENT", "TEACHER", "BROADCAST", "ADMIN"].includes(targetRole) ||
      !title || [...title].length > 120 || new TextEncoder().encode(title).byteLength > 240 ||
      [...memo].length > 500 || new TextEncoder().encode(memo).byteLength > 1_000 ||
      (targetGisuRaw !== "" && targetGisu === null) || (targetRole === "STUDENT" && targetGisu === null)) {
    throw new Error("Invalid token batch input");
  }
  const issuedGisu = targetRole === "STUDENT" ? targetGisu : null;

  const issuedSecrets = Array.from({ length: count }, () => generateInviteSecret());

  await prisma.$transaction(async (tx) => {
    const batch = await tx.tokenBatch.create({
        data: {
            title: title || `${count} tokens for ${targetRole}`,
            memo,
            createdBy: user.id
        }
    });

    const tokens = [];
    for (let i = 0; i < count; i++) {
        const token = issuedSecrets[i];
        tokens.push({
            token: null,
            tokenHash: hashInviteSecret(token),
            targetRole,
            targetGisu: issuedGisu,
            createdBy: user.id,
            isUsed: false,
            batchId: batch.id
        });
    }

    await tx.inviteToken.createMany({ data: tokens });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "TOKEN_BATCH_CREATED",
      target: { type: "TOKEN_BATCH", id: batch.id },
    });
  });

  revalidatePath("/admin/tokens");
  return {
    csv: serializeTokenCsv(issuedSecrets.map((token) => ({
      token, targetRole, targetGisu: issuedGisu, isUsed: false, usedBy: null,
    }))),
  };
}

export type TokenMailActionResult = {
  success?: string;
  error?: string;
};

export async function sendTokenByEmail(
  prevState: TokenMailActionResult,
  formData: FormData,
): Promise<TokenMailActionResult> {
  const user = await getCurrentUser();
  if (!user || !user.id || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const email = (formData.get("email") as string | null)?.trim().toLowerCase() || "";
  const targetRole = (formData.get("targetRole") as string | null)?.trim() || "";
  const targetGisuValue = (formData.get("targetGisu") as string | null)?.trim() || "";
  const targetGisu = targetGisuValue ? parseBoundedInteger(targetGisuValue, 1, 200) : null;

  if (!email) {
    return { error: "이메일 주소를 입력해주세요." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254 ||
      new TextEncoder().encode(email).byteLength > 254 || /[\u0000-\u001f\u007f-\u009f\ufeff]/u.test(email)) {
    return { error: "이메일 주소 형식이 올바르지 않습니다." };
  }

  if (!["STUDENT", "TEACHER", "BROADCAST", "ADMIN"].includes(targetRole)) {
    return { error: "허용되지 않은 토큰 권한입니다." };
  }

  if ((targetGisuValue !== "" && targetGisu === null) || (targetRole === "STUDENT" && targetGisu === null)) {
    return { error: "학생용 토큰은 기수를 함께 입력해주세요." };
  }

  let reservation;
  try {
    reservation = await reserveDistribution(prisma, {
      source: "ADMIN_MANUAL", createdBy: user.id, actorId: user.id, clientKey: null,
      target: { email, targetRole, targetGisu: targetRole === "STUDENT" ? targetGisu : null },
    });
  } catch (error) {
    if (error instanceof DistributionReservationError) {
      return { error: error.code === "QUOTA" ? "The daily invitation email limit has been reached." : "An equivalent invitation is pending or was recently sent." };
    }
    throw error;
  }

  const result = await sendInviteTokenEmail({
    source: "ADMIN_MANUAL",
    createdBy: user.id,
    target: {
      email,
      targetRole,
      targetGisu: targetRole === "STUDENT" ? targetGisu : null,
    },
    reservation,
  });

  revalidatePath("/admin/tokens");

  if (result.error) {
    return { error: result.error };
  }

  return { success: result.success };
}

export async function deleteToken(id: string) {
    const user = await getCurrentUser();
    if (!user?.id || user.role !== 'ADMIN') throw new Error("Unauthorized");

    await prisma.$transaction(async (tx) => {
      await tx.inviteToken.delete({ where: { id } });
      await writeAuditLog(tx, { actorId: user.id, action: "TOKEN_DELETED", target: { type: "INVITE_TOKEN", id } });
    });
    // We assume revalidation happens on the page where this is called
    // But path is dynamic, so we rely on router.refresh or path revalidation
    // Revalidate all token pages just in case
    revalidatePath("/admin/tokens");
}

export async function deleteTokenBatch(batchId: string) {
    const user = await getCurrentUser();
    if (!user?.id || user.role !== 'ADMIN') throw new Error("Unauthorized");

    await prisma.$transaction(async (tx) => {
      await tx.inviteToken.deleteMany({ where: { batchId } });
      await tx.tokenBatch.delete({ where: { id: batchId } });
      await writeAuditLog(tx, { actorId: user.id, action: "TOKEN_BATCH_DELETED", target: { type: "TOKEN_BATCH", id: batchId } });
    });

    revalidatePath("/admin/tokens");
    redirect("/admin/tokens");
}
