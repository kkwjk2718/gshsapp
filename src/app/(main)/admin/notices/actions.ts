"use server"

import { prisma } from "@/lib/db";
import { resolveNoticeCategoryValue } from "@/lib/notice-categories";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { addDays } from "date-fns";
import { canCreateNotice, canManageNotice } from "@/lib/notice-permissions";

function getSafeRedirectPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export async function createNotice(formData: FormData) {
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const category = await resolveNoticeCategoryValue(formData.get("category"));
  const durationStr = formData.get("duration") as string;
  const unlimited = formData.get("unlimited") === "on";
  
  const user = await getCurrentUser();
  if (!user || !user.id || !canCreateNotice(user)) {
      throw new Error("Unauthorized");
  }

  let expiresAt: Date | null = null;

  if (!unlimited) {
      const duration = parseInt(durationStr) || 7; // Default 7 days if parsing fails
      expiresAt = addDays(new Date(), duration);
  }

  const notice = await prisma.notice.create({
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
  redirect(`/notices/${notice.id}`);
}

export async function deleteNotice(formData: FormData) {
    const id = formData.get("id") as string;
    const user = await getCurrentUser();
    const redirectTo = getSafeRedirectPath(formData.get("redirectTo"));

    if (!user) throw new Error("Unauthorized");

    const notice = await prisma.notice.findUnique({
      where: { id },
      select: { writerId: true },
    });

    if (!notice) {
      throw new Error("Notice not found");
    }

    if (!canManageNotice(user, notice.writerId)) throw new Error("Unauthorized");

    await prisma.notice.delete({ where: { id } });
    revalidatePath("/notices");
    revalidatePath(`/notices/${id}`);
    revalidatePath("/admin/notices");

    if (redirectTo) {
      redirect(redirectTo);
    }
}

export async function updateNotice(formData: FormData) {
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const category = await resolveNoticeCategoryValue(formData.get("category"));

    const user = await getCurrentUser();
    if (!user || !user.id) {
        throw new Error("Unauthorized");
    }

    const existingNotice = await prisma.notice.findUnique({
      where: { id },
      select: { writerId: true },
    });

    if (!existingNotice) {
      throw new Error("Notice not found");
    }

    if (!canManageNotice(user, existingNotice.writerId)) {
      throw new Error("Unauthorized");
    }

    await prisma.notice.update({
        where: { id },
        data: { title, content, category },
    });

    revalidatePath("/notices");
    revalidatePath(`/notices/${id}`);
    revalidatePath("/admin/notices");
    redirect(`/notices/${id}`);
}
