import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gshs.app'; 

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/me/', '/notifications/', '/music/'], 
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
