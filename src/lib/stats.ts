import { unstable_cache } from "next/cache";
import { subDays, startOfDay, endOfDay, subMinutes } from "date-fns";
import { prisma } from "@/lib/db";

const getCachedPublicStats = unstable_cache(
  async () => {
    // 1. 珥??섏씠吏 酉?
    const totalPageViews = await prisma.systemLog.count({
      where: { action: "PAGE_VIEW" },
    });

    // 2. 珥?諛⑸Ц????
    const visitorsGroup = await prisma.systemLog.groupBy({
      by: ["ip"],
      _count: { ip: true },
    });
    const totalVisitors = visitorsGroup.length;

    // 3. 珥?湲곗긽怨??좎껌 ??
    const totalSongRequests = await prisma.songRequest.count();

    // 4. ?쒕퉬???쒖옉??
    const firstLog = await prisma.systemLog.findFirst({
      orderBy: { createdAt: "asc" },
    });
    const sinceDate = firstLog?.createdAt || new Date();

    // 5. 理쒓렐 7?쇨컙 ?쇰퀎 ?몃옒??(蹂묐젹 泥섎━濡??깅뒫 理쒖쟻??
    const dailyTrafficPromises = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i); // 6?쇱쟾 ~ ?ㅻ뒛
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

    // 6. ?꾩옱 ?쒕쾭 遺??(理쒓렐 10遺꾧컙 ?붿껌 ??
    const recentRequestCount = await prisma.systemLog.count({
      where: {
        createdAt: { gte: subMinutes(new Date(), 10) },
      },
    });

    // 遺???곹깭 怨꾩궛
    let loadStatus = "?먰솢";
    let loadColor = "text-emerald-500";

    if (recentRequestCount > 500) {
      loadStatus = "?쇱옟";
      loadColor = "text-rose-500";
    } else if (recentRequestCount > 100) {
      loadStatus = "蹂댄넻";
      loadColor = "text-amber-500";
    }

    // 7. 珥?湲됱떇 ?뺤씤 ?잛닔
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
        rpm: (recentRequestCount / 10).toFixed(1), // Requests Per Minute
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
        status: "?먰솢",
        color: "text-emerald-500",
      },
    };
  }
}
