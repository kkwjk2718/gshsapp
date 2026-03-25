"use client";

import { useEffect } from "react";

const LEGACY_CACHE_KEYS = ["api-cache", "pages"];
const RESET_MARKER_KEY = "gshs-prod-sw-cache-reset-20260325";

export function ProductionServiceWorkerCacheCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;

    try {
      if (window.localStorage.getItem(RESET_MARKER_KEY) === "1") {
        return;
      }
    } catch {
      // Ignore storage failures and still attempt cleanup.
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        registration?.update().catch(() => {});
      });
    }

    if (!("caches" in window)) {
      return;
    }

    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => LEGACY_CACHE_KEYS.includes(key))
            .map((key) => caches.delete(key).catch(() => false)),
        ),
      )
      .finally(() => {
        try {
          window.localStorage.setItem(RESET_MARKER_KEY, "1");
        } catch {
          // Ignore storage failures.
        }
      });
  }, []);

  return null;
}
