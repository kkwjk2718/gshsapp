import { NextResponse } from "next/server";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await logAction("MEAL_VIEW", "Meal viewed via tracker", "/meals");
  } catch {
    // Logging must stay non-blocking for the UI path.
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
