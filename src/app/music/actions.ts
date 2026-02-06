"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function checkPermission() {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'BROADCAST' && user.role !== 'ADMIN')) {
        throw new Error("Unauthorized");
    }
    return user;
}

export async function updateSongStatus(id: string, status: string) {
  await checkPermission();
  await prisma.songRequest.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/music");
  revalidatePath("/songs");
}

export async function updateSongRule(dayOfWeek: number, allowedGrade: string) {
    await checkPermission();
    
    // Upsert rule
    const existingRule = await prisma.songRule.findFirst({
        where: { dayOfWeek }
    });

    if (existingRule) {
        await prisma.songRule.update({
            where: { id: existingRule.id },
            data: { allowedGrade }
        });
    } else {
        await prisma.songRule.create({
            data: {
                dayOfWeek,
                allowedGrade,
                description: "Created via Music Manager"
            }
        });
    }

    revalidatePath("/music");
}
