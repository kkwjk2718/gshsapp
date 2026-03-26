"use server";

import type { Prisma, PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { recalculatePendingSongAssignments } from "@/lib/song-queue";
import { getCurrentUser } from "@/lib/session";

async function checkPermission() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "BROADCAST" && user.role !== "ADMIN")) {
    throw new Error("Unauthorized");
  }

  return user;
}

async function upsertSongRuleRecord(
  db: PrismaClient | Prisma.TransactionClient,
  dayOfWeek: number,
  allowedGrade: string,
) {
  const normalized = allowedGrade.trim().toUpperCase();
  const existingRule = await db.songRule.findFirst({
    where: { dayOfWeek },
  });

  if (existingRule) {
    await db.songRule.update({
      where: { id: existingRule.id },
      data: { allowedGrade: normalized },
    });
    return;
  }

  await db.songRule.create({
    data: {
      dayOfWeek,
      allowedGrade: normalized,
      description: "Created via Music Manager",
    },
  });
}

export async function updateSongStatus(id: string, status: string, rejectionReason?: string) {
  await checkPermission();

  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw new Error("이 화면에서는 승인 또는 반려 처리만 지원합니다.");
  }

  const song = await prisma.songRequest.findUnique({ where: { id } });
  if (!song) {
    return;
  }

  const normalizedReason = status === "REJECTED" ? rejectionReason?.trim() || null : null;

  await prisma.songRequest.update({
    where: { id },
    data: {
      status,
      rejectionReason: normalizedReason,
      assignedSlot: status === "REJECTED" ? null : song.assignedSlot,
    },
  });

  if (status === "APPROVED") {
    await createNotification(
      song.requesterId,
      "SONG",
      "기상곡 신청 승인됨",
      `신청하신 '${song.videoTitle}' 곡이 승인되었습니다.`,
      "/songs",
    );
  } else {
    await createNotification(
      song.requesterId,
      "SONG",
      "기상곡 신청 반려됨",
      normalizedReason
        ? `신청하신 '${song.videoTitle}' 곡이 반려되었습니다.\n사유: ${normalizedReason}`
        : `신청하신 '${song.videoTitle}' 곡이 반려되었습니다.`,
      "/songs",
    );
  }

  await recalculatePendingSongAssignments(song.cycleDateKey);

  revalidatePath("/music");
  revalidatePath("/songs");
}

export async function updateSongRule(dayOfWeek: number, allowedGrade: string) {
  await checkPermission();
  await upsertSongRuleRecord(prisma, dayOfWeek, allowedGrade);

  revalidatePath("/music");
  revalidatePath("/songs");
}

export async function updateSongRulesBulk(rules: Array<{ dayOfWeek: number; allowedGrade: string }>) {
  await checkPermission();

  await prisma.$transaction(async (tx) => {
    for (const rule of rules) {
      await upsertSongRuleRecord(tx, rule.dayOfWeek, rule.allowedGrade);
    }
  });

  revalidatePath("/music");
  revalidatePath("/songs");
}
