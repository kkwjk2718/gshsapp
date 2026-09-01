import "server-only";

import { prisma } from "@/lib/db";

export const ME_PAGE_USER_SELECT = {
  name: true,
  email: true,
  studentId: true,
  gisu: true,
  personalEvents: {
    orderBy: { targetDate: "asc" },
    select: { id: true, title: true, targetDate: true, isPrimary: true },
  },
  songRequests: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, videoTitle: true, status: true, createdAt: true },
  },
} as const;

export async function loadMePageData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: ME_PAGE_USER_SELECT,
  });
  if (!user) return null;

  return {
    profile: {
      name: user.name,
      email: user.email,
      studentId: user.studentId,
      gisu: user.gisu,
    },
    personalEvents: user.personalEvents,
    songRequests: user.songRequests,
  };
}
