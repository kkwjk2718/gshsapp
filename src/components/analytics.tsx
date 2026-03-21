"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pageview } from "@/lib/ga";
import { sendNonBlockingJson } from "@/lib/client-event";

export function Analytics() {
  const pathname = usePathname();
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState<string | null>(null);
  const [isGoogleAnalyticsReady, setIsGoogleAnalyticsReady] = useState(false);

  useEffect(() => {
    sendNonBlockingJson("/api/log/page-view", { pathname });
  }, [pathname]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPublicSettings() {
      try {
        const response = await fetch("/api/public-settings", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { googleAnalyticsId: string | null };
        setGoogleAnalyticsId(data.googleAnalyticsId);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setGoogleAnalyticsId(null);
        }
      }
    }

    void loadPublicSettings();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleGoogleAnalyticsUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ googleAnalyticsId: string | null }>;
      const nextGoogleAnalyticsId = customEvent.detail?.googleAnalyticsId ?? null;

      setGoogleAnalyticsId(nextGoogleAnalyticsId);
      setIsGoogleAnalyticsReady(Boolean(nextGoogleAnalyticsId && typeof window.gtag === "function"));
    };

    window.addEventListener("google-analytics-setting-updated", handleGoogleAnalyticsUpdate);

    return () => {
      window.removeEventListener("google-analytics-setting-updated", handleGoogleAnalyticsUpdate);
    };
  }, []);

  useEffect(() => {
    if (googleAnalyticsId && typeof window.gtag === "function") {
      setIsGoogleAnalyticsReady(true);
      return;
    }

    if (!googleAnalyticsId) {
      delete window.__gaMeasurementId;
    }

    setIsGoogleAnalyticsReady(false);
  }, [googleAnalyticsId]);

  useEffect(() => {
    if (!googleAnalyticsId || !isGoogleAnalyticsReady) {
      return;
    }

    pageview(pathname, googleAnalyticsId);
  }, [pathname, googleAnalyticsId, isGoogleAnalyticsReady]);

  return (
    <>
      {googleAnalyticsId && (
        <>
          <Script
            key={`ga-src-${googleAnalyticsId}`}
            id={`ga-src-${googleAnalyticsId}`}
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            onReady={() => setIsGoogleAnalyticsReady(true)}
          />
          <Script
            key={`ga-init-${googleAnalyticsId}`}
            id={`ga-init-${googleAnalyticsId}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = window.gtag || gtag;
                window.__gaMeasurementId = '${googleAnalyticsId}';
                gtag('js', new Date());
                gtag('config', '${googleAnalyticsId}', { send_page_view: false });
              `,
            }}
          />
        </>
      )}
    </>
  );
}
