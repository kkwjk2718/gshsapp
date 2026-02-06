"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";

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