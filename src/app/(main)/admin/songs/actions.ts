"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { moderateSongRequest } from "@/lib/song-moderation";

export async function updateSongStatus(id: string, status: string, rejectionReason?: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized");

  await moderateSongRequest(prisma, {
    actorId: user.id,
    id,
    status,
    rejectionReason,
  });

  revalidatePath("/admin/songs");
  revalidatePath("/music");
  revalidatePath("/songs");
}
