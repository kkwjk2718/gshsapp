import { getWeather } from "@/lib/weather";
import { Cloud } from "lucide-react";
import { WeatherDetailModal } from "@/components/weather-detail-modal";

export async function WeatherWidget() {
    const weather = await getWeather();

    if (!weather) return (
        <div
            className="flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs"
            style={{
                backgroundColor: "color-mix(in srgb, var(--surface-2) 68%, var(--surface) 32%)",
                borderColor: "color-mix(in srgb, var(--border) 78%, var(--accent) 22%)",
                color: "var(--muted)",
            }}
        >
            <Cloud className="h-4 w-4" />
            <span>Unavailable</span>
        </div>
    );

    return <WeatherDetailModal weather={weather} />;
}
