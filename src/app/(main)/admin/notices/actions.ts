"use server"

import { prisma } from "@/lib/db";
import { resolveNoticeCategoryValue } from "@/lib/notice-categories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/current-user";
import { addDays } from "date-fns";

export async function createNotice(formData: FormData) {
  const user = await requireAdmin();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const category = await resolveNoticeCategoryValue(formData.get("category"));
  const durationStr = formData.get("duration") as string;
  const unlimited = formData.get("unlimited") === "on";
  
  if (!title?.trim() || [...title].length > 200 || new TextEncoder().encode(title).byteLength > 512 ||
      !content?.trim() || [...content].length > 20_000 || new TextEncoder().encode(content).byteLength > 40_000) throw new Error("Invalid notice");

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
    await requireAdmin();
    const id = formData.get("id") as string;

    await prisma.notice.delete({ where: { id } });
    revalidatePath("/notices");
    revalidatePath("/admin/notices");
}

export async function updateNotice(formData: FormData) {
    await requireAdmin();
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const category = await resolveNoticeCategoryValue(formData.get("category"));
    const durationStr = formData.get("duration") as string;
    const unlimited = formData.get("unlimited") === "on";

    if (!id || !title?.trim() || [...title].length > 200 || new TextEncoder().encode(title).byteLength > 512 ||
        !content?.trim() || [...content].length > 20_000 || new TextEncoder().encode(content).byteLength > 40_000) throw new Error("Invalid notice");

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
