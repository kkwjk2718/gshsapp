import { handleTelemetryRequest } from "@/lib/telemetry-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleTelemetryRequest(request, "MEAL_VIEW");
}
