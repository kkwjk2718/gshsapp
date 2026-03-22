"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { sendInviteTokenEmail } from "@/lib/token-distribution";

export async function createTokens(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !user.id || user.role !== 'ADMIN') throw new Error("Unauthorized");

  const count = parseInt(formData.get("count") as string);
  const targetRole = formData.get("targetRole") as string;
  const targetGisu = parseInt(formData.get("targetGisu") as string) || null;
  const title = formData.get("title") as string;
  const memo = formData.get("memo") as string;

  // Create Batch
  const batch = await prisma.tokenBatch.create({
      data: {
          title: title || `${count} tokens for ${targetRole}`,
          memo,
          createdBy: user.id
      }
  });

  const tokens = [];
  for (let i = 0; i < count; i++) {
      const token = randomUUID().substring(0, 8); 
      tokens.push({
          token,
          targetRole,
          targetGisu,
          createdBy: user.id,
          isUsed: false,
          batchId: batch.id
      });
  }

  await prisma.inviteToken.createMany({
      data: tokens
  });

  revalidatePath("/admin/tokens");
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
  const targetGisu = targetGisuValue ? Number.parseInt(targetGisuValue, 10) : null;

  if (!email) {
    return { error: "이메일 주소를 입력해주세요." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "이메일 주소 형식이 올바르지 않습니다." };
  }

  if (!["STUDENT", "TEACHER", "ADMIN"].includes(targetRole)) {
    return { error: "허용되지 않은 토큰 권한입니다." };
  }

  if (targetRole === "STUDENT" && (!Number.isFinite(targetGisu) || (targetGisu ?? 0) <= 0)) {
    return { error: "학생용 토큰은 기수를 함께 입력해주세요." };
  }

  const result = await sendInviteTokenEmail({
    source: "ADMIN_MANUAL",
    createdBy: user.id,
    target: {
      email,
      targetRole,
      targetGisu: targetRole === "STUDENT" ? targetGisu : null,
    },
  });

  revalidatePath("/admin/tokens");

  if (result.error) {
    return { error: result.error };
  }

  return { success: result.success };
}

export async function deleteToken(id: string) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

    await prisma.inviteToken.delete({ where: { id } });
    // We assume revalidation happens on the page where this is called
    // But path is dynamic, so we rely on router.refresh or path revalidation
    // Revalidate all token pages just in case
    revalidatePath("/admin/tokens");
}

export async function deleteTokenBatch(batchId: string) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

    // Delete tokens first (if no cascade), then batch
    await prisma.$transaction([
        prisma.inviteToken.deleteMany({ where: { batchId } }),
        prisma.tokenBatch.delete({ where: { id: batchId } })
    ]);

    revalidatePath("/admin/tokens");
    redirect("/admin/tokens");
}
