import { getWeather } from "@/lib/weather";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Moon } from "lucide-react";

export async function WeatherWidget() {
    const weather = await getWeather();

    if (!weather) return (
        <div className="flex items-center gap-2 text-slate-400 glass px-3 py-2 rounded-xl h-[40px]">
            <div className="w-4 h-4 rounded-full bg-slate-700/50" />
            <span className="text-xs">Unavailable</span>
        </div>
    );

    // WMO Weather interpretation codes
    const getWeatherIcon = (code: number) => {
        if (code <= 1) return <Sun className="w-5 h-5 text-orange-500" />;
        if (code <= 3) return <Cloud className="w-5 h-5 text-slate-500" />;
        if (code <= 48) return <Cloud className="w-5 h-5 text-slate-500 dark:text-slate-400" />; // Fog
        if (code <= 67) return <CloudRain className="w-5 h-5 text-blue-500" />;
        if (code <= 77) return <CloudSnow className="w-5 h-5 text-sky-400 dark:text-sky-200" />;
        if (code <= 82) return <CloudRain className="w-5 h-5 text-blue-600" />;
        if (code <= 86) return <CloudSnow className="w-5 h-5 text-sky-500 dark:text-sky-300" />;
        if (code <= 99) return <CloudLightning className="w-5 h-5 text-amber-400" />;
        return <Sun className="w-5 h-5 text-orange-500" />;
    };

    return (
        <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl">
            {getWeatherIcon(weather.code)}
            <div className="text-sm font-bold text-slate-200">{weather.temp}°</div>
        </div>
    );
}
