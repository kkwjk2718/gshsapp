"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { isCanonicalUuid, normalizeNoticeCategoryInput } from "@/lib/security/public-input";

const MAX_NOTICE_CATEGORIES = 100;

export async function createCategory(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");

  const data = normalizeNoticeCategoryInput(formData.get("label"), formData.get("value"));

  await prisma.$transaction(async (tx) => {
    const created = await tx.noticeCategory.create({ data });
    if (await tx.noticeCategory.count() > MAX_NOTICE_CATEGORIES) throw new Error("Category limit reached");
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "NOTICE_CATEGORY_CREATED",
      target: { type: "NOTICE_CATEGORY", id: created.id },
    });
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/notices/new"); // Update notice creation form as well
}

export async function deleteCategory(id: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error("Unauthorized");
  if (!isCanonicalUuid(id)) throw new Error("Invalid category identifier");

  await prisma.$transaction(async (tx) => {
    await tx.noticeCategory.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "NOTICE_CATEGORY_DELETED",
      target: { type: "NOTICE_CATEGORY", id },
    });
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/notices/new");
}
