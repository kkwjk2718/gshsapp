// web/src/lib/ga.ts
"use client";

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export function pageview(url: string) {
  if (GA_ID && window.gtag) {
    window.gtag("config", GA_ID, {
      page_path: url,
    });
  }
}

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export function event(
  action: Gtag.EventNames | string,
  category: string,
  label: string,
  value?: number
) {
  if (GA_ID && window.gtag) {
    window.gtag("event", action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
}
