"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

import { createNotification } from "@/lib/notifications";

export async function updateSongStatus(id: string, status: string) {
  const song = await prisma.songRequest.findUnique({ where: { id } });
  if (!song) return;

  await prisma.songRequest.update({
    where: { id },
    data: { status },
  });

  // Notify User
  let title = "기상곡 신청 상태 변경";
  let content = `신청하신 '${song.videoTitle}' 곡의 상태가 변경되었습니다.`;

  if (status === "APPROVED") {
    title = "기상곡 신청 승인됨";
    content = `신청하신 '${song.videoTitle}' 곡이 승인되었습니다. 곧 재생될 예정입니다.`;
  } else if (status === "REJECTED") {
    title = "기상곡 신청 반려됨";
    content = `신청하신 '${song.videoTitle}' 곡이 반려되었습니다. 사유를 확인해주세요.`;
  } else if (status === "PLAYED") {
    title = "기상곡 재생 완료";
    content = `신청하신 '${song.videoTitle}' 곡이 재생되었습니다.`;
  }

  await createNotification(
    song.requesterId,
    "SONG",
    title,
    content,
    "/songs" // Link to songs page
  );

  revalidatePath("/admin/songs");
  revalidatePath("/songs");
}
