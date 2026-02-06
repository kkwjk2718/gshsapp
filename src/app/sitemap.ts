import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gshs.app';

  const routes = [
    '',
    '/meals',
    '/timetable',
    '/songs',
    '/calendar',
    '/notices',
    '/links',
    '/login',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  let noticeRoutes: MetadataRoute.Sitemap = [];
  try {
      const notices = await prisma.notice.findMany({
        select: { id: true, createdAt: true },
        take: 1000, 
      });
    
      noticeRoutes = notices.map((notice) => ({
        url: `${baseUrl}/notices/${notice.id}`,
        lastModified: notice.createdAt,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      }));
  } catch (error) {
      console.error("Sitemap generation error (notices):", error);
  }

  return [...routes, ...noticeRoutes];
}
