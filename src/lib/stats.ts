import { unstable_cache } from "next/cache";
import { endOfDay, startOfDay, subDays, subMinutes } from "date-fns";
import { prisma } from "@/lib/db";

const getCachedPublicStats = unstable_cache(
  async () => {
    const totalPageViews = await prisma.systemLog.count({
      where: { action: "PAGE_VIEW" },
    });

    const visitorsGroup = await prisma.systemLog.groupBy({
      by: ["ip"],
      _count: { ip: true },
    });
    const totalVisitors = visitorsGroup.length;

    const totalSongRequests = await prisma.songRequest.count();

    const firstLog = await prisma.systemLog.findFirst({
      orderBy: { createdAt: "asc" },
    });
    const sinceDate = firstLog?.createdAt || new Date();

    const dailyTrafficPromises = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      return prisma.systemLog
        .count({
          where: {
            createdAt: {
              gte: startOfDay(date),
              lte: endOfDay(date),
            },
          },
        })
        .then((count) => ({ date, count }));
    });

    const dailyTraffic = await Promise.all(dailyTrafficPromises);
    const maxDailyTraffic = Math.max(...dailyTraffic.map((d) => d.count)) || 1;

    const recentRequestCount = await prisma.systemLog.count({
      where: {
        createdAt: { gte: subMinutes(new Date(), 10) },
      },
    });

    let loadStatus = "여유";
    let loadColor = "text-emerald-500";

    if (recentRequestCount > 500) {
      loadStatus = "혼잡";
      loadColor = "text-rose-500";
    } else if (recentRequestCount > 100) {
      loadStatus = "보통";
      loadColor = "text-amber-500";
    }

    const totalMealViews = await prisma.systemLog.count({
      where: { action: "MEAL_VIEW" },
    });

    return {
      totalPageViews,
      totalVisitors,
      totalSongRequests,
      totalMealViews,
      sinceDate,
      dailyTraffic,
      maxDailyTraffic,
      currentLoad: {
        rpm: (recentRequestCount / 10).toFixed(1),
        status: loadStatus,
        color: loadColor,
      },
    };
  },
  ["public-stats"],
  { revalidate: 300 },
);

export async function getPublicStats() {
  try {
    return await getCachedPublicStats();
  } catch (error) {
    console.warn(
      "[stats] Falling back to empty public stats:",
      error instanceof Error ? error.message : error,
    );

    return {
      totalPageViews: 0,
      totalVisitors: 0,
      totalSongRequests: 0,
      totalMealViews: 0,
      sinceDate: new Date(),
      dailyTraffic: Array.from({ length: 7 }, (_, i) => ({
        date: subDays(new Date(), 6 - i),
        count: 0,
      })),
      maxDailyTraffic: 1,
      currentLoad: {
        rpm: "0.0",
        status: "여유",
        color: "text-emerald-500",
      },
    };
  }
}
