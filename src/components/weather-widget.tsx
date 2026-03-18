import { getWeather } from "@/lib/weather";
import { Cloud } from "lucide-react";
import { WeatherDetailModal } from "@/components/weather-detail-modal";

export async function WeatherWidget() {
    const weather = await getWeather();

    if (!weather) return (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 glass px-3 py-2 rounded-xl h-[40px]">
            <div className="w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700/50" />
            <span className="text-xs">Unavailable</span>
        </div>
    );

    return <WeatherDetailModal weather={weather} />;
}
