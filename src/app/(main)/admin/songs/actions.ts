"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { recalculatePendingSongAssignments } from "@/lib/song-queue";
import { getCurrentUser } from "@/lib/session";

export async function updateSongStatus(id: string, status: string, rejectionReason?: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  if (status !== "REJECTED") {
    throw new Error("관리자 화면에서도 반려 처리만 지원합니다.");
  }

  const song = await prisma.songRequest.findUnique({ where: { id } });
  if (!song) {
    return;
  }

  const normalizedReason = rejectionReason?.trim() || null;

  await prisma.songRequest.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionReason: normalizedReason,
      assignedSlot: null,
    },
  });

  await createNotification(
    song.requesterId,
    "SONG",
    "기상곡 신청 반려됨",
    normalizedReason
      ? `신청하신 '${song.videoTitle}' 곡이 반려되었습니다.\n사유: ${normalizedReason}`
      : `신청하신 '${song.videoTitle}' 곡이 반려되었습니다.`,
    "/songs",
  );

  await recalculatePendingSongAssignments(song.cycleDateKey);

  revalidatePath("/admin/songs");
  revalidatePath("/songs");
  revalidatePath("/music");
}
