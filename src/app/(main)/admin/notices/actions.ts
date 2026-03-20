"use server"

import { prisma } from "@/lib/db";
import { resolveNoticeCategoryValue } from "@/lib/notice-categories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { addDays } from "date-fns";

export async function createNotice(formData: FormData) {
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const category = await resolveNoticeCategoryValue(formData.get("category"));
  const durationStr = formData.get("duration") as string;
  const unlimited = formData.get("unlimited") === "on";
  
  const user = await getCurrentUser();
  if (!user || !user.id || user.role !== 'ADMIN') {
      throw new Error("Unauthorized");
  }

  let expiresAt: Date | null = null;

  if (!unlimited) {
      const duration = parseInt(durationStr) || 7; // Default 7 days if parsing fails
      expiresAt = addDays(new Date(), duration);
  }

  await prisma.notice.create({
    data: {
      title,
      content,
      category,
      writerId: user.id,
      expiresAt
    },
  });

  revalidatePath("/notices");
  revalidatePath("/admin/notices");
  redirect("/admin/notices");
}

export async function deleteNotice(formData: FormData) {
    const id = formData.get("id") as string;
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

    await prisma.notice.delete({ where: { id } });
    revalidatePath("/notices");
    revalidatePath("/admin/notices");
}

export async function updateNotice(formData: FormData) {
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const category = await resolveNoticeCategoryValue(formData.get("category"));
    const durationStr = formData.get("duration") as string;
    const unlimited = formData.get("unlimited") === "on";

    const user = await getCurrentUser();
    if (!user || !user.id || user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    let expiresAt: Date | null = null;
    if (!unlimited) {
        const duration = parseInt(durationStr) || 7;
        expiresAt = addDays(new Date(), duration);
    }

    await prisma.notice.update({
        where: { id },
        data: { title, content, category, expiresAt },
    });

    revalidatePath("/notices");
    revalidatePath(`/notices/${id}`);
    revalidatePath("/admin/notices");
    redirect("/admin/notices");
}
