import { NextResponse } from "next/server";
import { loadPublicSettings } from "@/lib/public-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicSettings = await loadPublicSettings();

  return NextResponse.json(
    publicSettings,
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
