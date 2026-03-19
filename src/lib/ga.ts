// web/src/lib/ga.ts
"use client";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    __gaMeasurementId?: string;
  }
}

function resolveGoogleAnalyticsId(googleAnalyticsId?: string | null) {
  if (googleAnalyticsId !== undefined) {
    const trimmedGoogleAnalyticsId = googleAnalyticsId?.trim();

    if (trimmedGoogleAnalyticsId) {
      return trimmedGoogleAnalyticsId;
    }

    return null;
  }

  return window.__gaMeasurementId ?? null;
}

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export function pageview(url: string, googleAnalyticsId?: string | null) {
  const measurementId = resolveGoogleAnalyticsId(googleAnalyticsId);

  if (measurementId && window.gtag) {
    window.gtag("config", measurementId, {
      page_path: url,
    });
  }
}

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export function event(
  action: Gtag.EventNames | string,
  category: string,
  label: string,
  value?: number,
  googleAnalyticsId?: string | null
) {
  const measurementId = resolveGoogleAnalyticsId(googleAnalyticsId);

  if (measurementId && window.gtag) {
    window.gtag("event", action, {
      send_to: measurementId,
      event_category: category,
      event_label: label,
      value: value,
    });
  }
}
