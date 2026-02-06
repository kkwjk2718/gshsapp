import { unstable_cache } from "next/cache";

interface WeatherData {
    temp: number;
    code: number;
}

export const getWeather = unstable_cache(
    async (): Promise<WeatherData | null> => {
        try {
            // Jinju-si coordinates
            const res = await fetch(
                "https://api.open-meteo.com/v1/forecast?latitude=35.1805&longitude=128.1087&current_weather=true",
                { next: { revalidate: 900 } } // 15 minutes cache
            );

            if (!res.ok) throw new Error("Weather fetch failed");

            const data = await res.json();

            if (data.current_weather) {
                return {
                    temp: data.current_weather.temperature,
                    code: data.current_weather.weathercode
                };
            }
            return null;
        } catch (e) {
            console.error("Weather fetch error:", e);
            return null;
        }
    },
    ["weather-data"], // Cache key
    { revalidate: 900 } // Revalidate every 15 minutes
);
