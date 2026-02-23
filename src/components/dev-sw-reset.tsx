"use client";

import { useEffect } from "react";

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister().catch(() => {});
      });
    });

    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          caches.delete(key).catch(() => {});
        });
      });
    }
  }, []);

  return null;
}
