"use client";

import { useEffect, useRef } from "react";
import { logMealView } from "@/app/actions/logging";

export function MealViewTracker() {
    const logged = useRef(false);

    useEffect(() => {
        // Prevent double logging in React Strict Mode (dev) if possible, 
        // though strictly Effect runs twice.
        // In production, runs once.
        if (logged.current) return;
        logged.current = true;

        logMealView();
    }, []);

    return null; // Invisible component
}
