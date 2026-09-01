import type { MetadataRoute } from "next";
import { privateRobotsDisallowPaths } from "@/lib/security/browser-policy";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gshs.app";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...privateRobotsDisallowPaths(), "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
