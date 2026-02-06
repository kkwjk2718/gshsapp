"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { getUserGrade } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";

export async function requestSong(formData: FormData) {
  const youtubeUrl = formData.get("youtubeUrl") as string;
  const videoTitle = formData.get("videoTitle") as string || "신청곡"; 
  
  const user = await getCurrentUser();
  if (!user || !user.id) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) throw new Error("User not found");

  // 1. Blacklist Check
  if (dbUser.banExpiresAt && dbUser.banExpiresAt > new Date()) {
      return;
  }

  // 2. Quota Check (Skip for Admin)
  if (dbUser.role !== 'ADMIN') {
      const todayDay = new Date().getDay();
      const rule = await prisma.songRule.findFirst({
          where: { dayOfWeek: todayDay }
      });

      if (rule && rule.allowedGrade !== 'ALL') {
           let grade = await getUserGrade(dbUser.gisu);
           if (!grade && dbUser.studentId && dbUser.studentId.length >= 3) {
               grade = dbUser.studentId.substring(0, 1);
           }
           
           const allowedGrades = rule.allowedGrade.split(",");
           if (!grade || !allowedGrades.includes(grade)) {
               return;
           }
      } 
  }

  // 3. Calculate Priority Score
  let priorityScore = 10;
  if (dbUser.role === 'ADMIN') priorityScore = 999;
  else if (dbUser.role === 'BROADCAST') priorityScore = 50; // Need to add BROADCAST to role enum logically or just string check

  await prisma.songRequest.create({
    data: {
      requesterId: user.id,
      youtubeUrl,
      videoTitle,
      status: "PENDING", 
      priorityScore
    },
  });

  await logAction("SONG_REQUEST", { title: videoTitle, url: youtubeUrl });

  revalidatePath("/songs");
}

export async function getSongs() {
  return await prisma.songRequest.findMany({
    orderBy: [
        { priorityScore: 'desc' },
        { createdAt: 'asc' } // Same score -> First come first serve
    ],
    include: { requester: true },
  });
}