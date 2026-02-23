import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gshs.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/landing", "/notices", "/notices/", "/privacy", "/help"],
        disallow: [
          "/admin/",
          "/me/",
          "/notifications/",
          "/music/",
          "/signup",
          "/login",
          "/report",
          "/api/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
