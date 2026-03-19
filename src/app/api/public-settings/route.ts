import { NextResponse } from "next/server";
import { getGoogleAnalyticsId } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const googleAnalyticsId = await getGoogleAnalyticsId();

  return NextResponse.json(
    { googleAnalyticsId },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
