"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function createLink(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw new Error("Unauthorized");
  }

  const title = formData.get("title") as string;
  let url = formData.get("url") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;

  if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  await prisma.linkItem.create({
    data: {
      title,
      url,
      description,
      category,
    },
  });

  revalidatePath("/links");
}

export async function updateLink(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw new Error("Unauthorized");
  }

  const id = formData.get("id") as string;
  const title = formData.get("title") as string;
  let url = formData.get("url") as string;
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;

  if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  await prisma.linkItem.update({
    where: { id },
    data: {
      title,
      url,
      description,
      category,
    },
  });

  revalidatePath("/links");
}

export async function deleteLink(formData: FormData) {
  const id = formData.get("id") as string;
  const user = await getCurrentUser();
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw new Error("Unauthorized");
  }

  await prisma.linkItem.delete({ where: { id } });
  revalidatePath("/links");
}