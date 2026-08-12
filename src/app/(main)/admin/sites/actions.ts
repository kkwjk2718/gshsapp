"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { isCanonicalUuid, normalizeRelatedSiteInput } from "@/lib/security/public-input";

const MAX_RELATED_SITES = 100;

export async function createRelatedSite(formData: FormData) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    const data = normalizeRelatedSiteInput({
      name: formData.get("name"),
      url: formData.get("url"),
      description: formData.get("description"),
      category: formData.get("category"),
    });

    await prisma.$transaction(async (tx) => {
      const created = await tx.relatedSite.create({ data });
      if (await tx.relatedSite.count() > MAX_RELATED_SITES) throw new Error("Related site limit reached");
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "RELATED_SITE_CREATED",
        target: { type: "RELATED_SITE", id: created.id },
      });
    });

    revalidatePath("/sites");
    revalidatePath("/admin/sites");
}

export async function deleteRelatedSite(formData: FormData) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    const id = formData.get("id");
    if (!isCanonicalUuid(id)) throw new Error("Invalid related site identifier");
    await prisma.$transaction(async (tx) => {
      await tx.relatedSite.delete({ where: { id } });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "RELATED_SITE_DELETED",
        target: { type: "RELATED_SITE", id },
      });
    });
    revalidatePath("/sites");
    revalidatePath("/admin/sites");
}
