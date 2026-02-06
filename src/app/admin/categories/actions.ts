"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";

export async function createCategory(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

  const label = formData.get("label") as string;
  const value = formData.get("value") as string;

  await prisma.noticeCategory.create({
    data: { label, value: value.toUpperCase() }
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/notices/new"); // Update notice creation form as well
}

export async function deleteCategory(id: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

  await prisma.noticeCategory.delete({ where: { id } });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/notices/new");
}
