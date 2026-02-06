"use server";

import { logAction } from "@/lib/logger";

export async function logMealView() {
    // "MEAL_VIEW" action logging
    // path is optional, ip/user-agent handled by logAction
    await logAction("MEAL_VIEW", "Meal viewed via tracker");
}
