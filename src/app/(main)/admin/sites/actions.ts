"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function createRelatedSite(formData: FormData) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    const name = formData.get("name") as string;
    let url = formData.get("url") as string;
    const description = formData.get("description") as string;
    const category = formData.get("category") as string;

    if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
    }

    await prisma.relatedSite.create({
        data: {
            name,
            url,
            description,
            category,
        },
    });

    revalidatePath("/sites");
    revalidatePath("/admin/sites");
}

export async function deleteRelatedSite(formData: FormData) {
    const id = formData.get("id") as string;
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
        throw new Error("Unauthorized");
    }

    await prisma.relatedSite.delete({ where: { id } });
    revalidatePath("/sites");
    revalidatePath("/admin/sites");
}
