import { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

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

  let noticeRoutes: MetadataRoute.Sitemap = [];
  try {
    const notices = await prisma.notice.findMany({
      where: {
        OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
      },
      select: { id: true, createdAt: true },
      take: 1000,
      orderBy: { createdAt: "desc" },
    });

    noticeRoutes = notices.map((notice) => ({
      url: `${baseUrl}/notices/${notice.id}`,
      lastModified: notice.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error("Sitemap generation error (notices):", error);
  }

  return [...publicRoutes, ...noticeRoutes];
}
