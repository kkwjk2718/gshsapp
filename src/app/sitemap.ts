import { MetadataRoute } from "next";
import { getNoticeVisibilityWhere } from "@/lib/notice-window";

async function getNoticeRoutes(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  try {
    const { prisma } = await import("@/lib/db");
    const notices = await prisma.notice.findMany({
      where: getNoticeVisibilityWhere(),
      select: { id: true, createdAt: true },
      take: 1000,
      orderBy: { createdAt: "desc" },
    });

    return notices.map((notice) => ({
      url: `${baseUrl}/notices/${notice.id}`,
      lastModified: notice.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gshs.app";

  const now = new Date();
  const publicRoutes = [
    { route: "", changeFrequency: "daily" as const, priority: 1 },
    { route: "/landing", changeFrequency: "weekly" as const, priority: 0.9 },
    { route: "/notices", changeFrequency: "daily" as const, priority: 0.8 },
    { route: "/privacy", changeFrequency: "monthly" as const, priority: 0.4 },
    { route: "/help", changeFrequency: "monthly" as const, priority: 0.4 },
  ].map((r) => ({
    url: `${baseUrl}${r.route}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const noticeRoutes = await getNoticeRoutes(baseUrl);

  return [...publicRoutes, ...noticeRoutes];
}
