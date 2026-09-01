"use server";

import type { Prisma, PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { moderateSongRequest } from "@/lib/song-moderation";

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
  if (
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 1 ||
    dayOfWeek > 5 ||
    (normalized !== "ALL" && !/^(?:[123])(?:,[123]){0,2}$/.test(normalized))
  ) {
    throw new Error("Invalid song rule");
  }
  const existingRule = await db.songRule.findFirst({ where: { dayOfWeek } });
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
  const user = await checkPermission();
  await moderateSongRequest(prisma, {
    actorId: user.id,
    id,
    status,
    rejectionReason,
  });
  revalidatePath("/music");
  revalidatePath("/admin/songs");
  revalidatePath("/songs");
}

export async function updateSongRule(dayOfWeek: number, allowedGrade: string) {
  const user = await checkPermission();
  await prisma.$transaction(async (tx) => {
    await upsertSongRuleRecord(tx, dayOfWeek, allowedGrade);
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "SONG_RULES_CHANGED",
      target: { type: "SYSTEM_SETTING", id: `song-rule:${dayOfWeek}` },
    });
  });
  revalidatePath("/music");
  revalidatePath("/songs");
}

export async function updateSongRulesBulk(rules: Array<{ dayOfWeek: number; allowedGrade: string }>) {
  const user = await checkPermission();
  if (
    !Array.isArray(rules) ||
    rules.length < 1 ||
    rules.length > 5 ||
    new Set(rules.map((rule) => rule.dayOfWeek)).size !== rules.length
  ) {
    throw new Error("Invalid song rule set");
  }

  await prisma.$transaction(async (tx) => {
    for (const rule of rules) await upsertSongRuleRecord(tx, rule.dayOfWeek, rule.allowedGrade);
    await writeAuditLog(tx, {
      actorId: user.id,
      action: "SONG_RULES_CHANGED",
      target: { type: "SYSTEM_SETTING", id: "song-rules" },
    });
  });
  revalidatePath("/music");
  revalidatePath("/songs");
}
