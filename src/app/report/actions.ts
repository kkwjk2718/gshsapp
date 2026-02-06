"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function submitErrorReport(title: string, content: string) {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error("User not authenticated");
    }

    const report = await prisma.errorReport.create({
        data: {
            title,
            content,
            userId: user.id!,
        }
    });

    revalidatePath("/report");
    return { success: true, id: report.id };
}
