"use client";

import { useEffect, useRef } from "react";
import { sendNonBlockingJson } from "@/lib/client-event";

export function MealViewTracker() {
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) {
      return;
    }

    logged.current = true;
    sendNonBlockingJson("/api/log/meal-view", {});
  }, []);

  return null;
}
