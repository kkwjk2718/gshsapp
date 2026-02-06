import { prisma } from "@/lib/db";
import { subDays, startOfDay, endOfDay, subMinutes } from "date-fns";

export async function getPublicStats() {
  // 1. 총 페이지 뷰
  const totalPageViews = await prisma.systemLog.count({
    where: { action: "PAGE_VIEW" }
  });

  // 2. 총 방문자 수
  const visitorsGroup = await prisma.systemLog.groupBy({
    by: ['ip'],
    _count: { ip: true },
  });
  const totalVisitors = visitorsGroup.length;

  // 3. 총 기상곡 신청 수
  const totalSongRequests = await prisma.songRequest.count();

  // 4. 서비스 시작일
  const firstLog = await prisma.systemLog.findFirst({
    orderBy: { createdAt: 'asc' }
  });
  const sinceDate = firstLog?.createdAt || new Date();

  // 5. 최근 7일간 일별 트래픽 (병렬 처리로 성능 최적화)
  const dailyTrafficPromises = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i); // 6일전 ~ 오늘
      return prisma.systemLog.count({
          where: {
              createdAt: {
                  gte: startOfDay(date),
                  lte: endOfDay(date)
              }
          }
      }).then(count => ({ date, count }));
  });

  const dailyTraffic = await Promise.all(dailyTrafficPromises);
  
  const maxDailyTraffic = Math.max(...dailyTraffic.map(d => d.count)) || 1;

  // 6. 현재 서버 부하 (최근 10분간 요청 수)
  const recentRequestCount = await prisma.systemLog.count({
      where: {
          createdAt: { gte: subMinutes(new Date(), 10) }
      }
  });
  
  // 부하 상태 계산
  let loadStatus = "원활";
  let loadColor = "text-emerald-500";
  
  if (recentRequestCount > 500) {
      loadStatus = "혼잡";
      loadColor = "text-rose-500";
  } else if (recentRequestCount > 100) {
      loadStatus = "보통";
      loadColor = "text-amber-500";
  }

  return {
    totalPageViews,
    totalVisitors,
    totalSongRequests,
    sinceDate,
    dailyTraffic,
    maxDailyTraffic,
    currentLoad: {
        rpm: (recentRequestCount / 10).toFixed(1), // Requests Per Minute
        status: loadStatus,
        color: loadColor
    }
  };
}
