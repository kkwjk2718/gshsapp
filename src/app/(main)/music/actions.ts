"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";

async function checkPermission() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "BROADCAST" && user.role !== "ADMIN")) {
    throw new Error("Unauthorized");
  }

  return user;
}

function buildSongStatusMessage(videoTitle: string, status: string, rejectionReason: string | null) {
  let title = "기상곡 신청 상태 변경";
  let content = `신청하신 '${videoTitle}' 곡의 상태가 변경되었습니다.`;

  if (status === "APPROVED") {
    title = "기상곡 신청 승인됨";
    content = `신청하신 '${videoTitle}' 곡이 승인되었습니다. 곧 재생될 예정입니다.`;
  } else if (status === "REJECTED") {
    title = "기상곡 신청 반려됨";
    content = rejectionReason
      ? `신청하신 '${videoTitle}' 곡이 반려되었습니다.\n사유: ${rejectionReason}`
      : `신청하신 '${videoTitle}' 곡이 반려되었습니다.`;
  } else if (status === "PLAYED") {
    title = "기상곡 재생 완료";
    content = `신청하신 '${videoTitle}' 곡이 재생되었습니다.`;
  }

  return { title, content };
}

export async function updateSongStatus(id: string, status: string, rejectionReason?: string) {
  await checkPermission();

  const song = await prisma.songRequest.findUnique({ where: { id } });
  if (!song) return;

  const normalizedReason = rejectionReason?.trim() || null;

  await prisma.songRequest.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? normalizedReason : null,
    },
  });

  const { title, content } = buildSongStatusMessage(song.videoTitle, status, normalizedReason);
  await createNotification(song.requesterId, "SONG", title, content, "/songs");

  revalidatePath("/music");
  revalidatePath("/songs");
}

export async function updateSongRule(dayOfWeek: number, allowedGrade: string) {
  await checkPermission();

  const existingRule = await prisma.songRule.findFirst({
    where: { dayOfWeek },
  });

  if (existingRule) {
    await prisma.songRule.update({
      where: { id: existingRule.id },
      data: { allowedGrade },
    });
  } else {
    await prisma.songRule.create({
      data: {
        dayOfWeek,
        allowedGrade,
        description: "Created via Music Manager",
      },
    });
  }

  revalidatePath("/music");
}
