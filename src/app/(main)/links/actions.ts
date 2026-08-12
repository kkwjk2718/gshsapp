"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { isCanonicalUuid, normalizeLinkItemInput } from "@/lib/security/public-input";

const MAX_LINK_ITEMS = 250;

export async function createLink(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw new Error("Unauthorized");
  }

  const data = normalizeLinkItemInput({
    title: formData.get("title"),
    url: formData.get("url"),
    description: formData.get("description"),
    category: formData.get("category"),
  });

  await prisma.$transaction(async (tx) => {
    const created = await tx.linkItem.create({ data });
    if (await tx.linkItem.count() > MAX_LINK_ITEMS) {
      throw new Error("Link limit reached");
    }
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "LINK_CREATED",
      target: { type: "LINK", id: created.id },
    });
  });

  revalidatePath("/links");
}

export async function updateLink(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw new Error("Unauthorized");
  }

  const id = formData.get("id");
  if (!isCanonicalUuid(id)) throw new Error("Invalid link identifier");
  const data = normalizeLinkItemInput({
    title: formData.get("title"),
    url: formData.get("url"),
    description: formData.get("description"),
    category: formData.get("category"),
  });

  await prisma.$transaction(async (tx) => {
    await tx.linkItem.update({ where: { id }, data });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "LINK_UPDATED",
      target: { type: "LINK", id },
    });
  });

  revalidatePath("/links");
}

export async function deleteLink(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
      throw new Error("Unauthorized");
  }

  const id = formData.get("id");
  if (!isCanonicalUuid(id)) throw new Error("Invalid link identifier");
  await prisma.$transaction(async (tx) => {
    await tx.linkItem.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "LINK_DELETED",
      target: { type: "LINK", id },
    });
  });
  revalidatePath("/links");
}
