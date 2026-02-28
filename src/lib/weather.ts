import { unstable_cache } from "next/cache";
import { request } from "node:https";

interface WeatherData {
    temp: number;
    code: number;
}

const WEATHER_URL = "/v1/forecast?latitude=35.1805&longitude=128.1087&current_weather=true";

async function fetchWeatherByIPv4(): Promise<WeatherData | null> {
    return new Promise((resolve, reject) => {
        const req = request(
            {
                hostname: "api.open-meteo.com",
                path: WEATHER_URL,
                method: "GET",
                family: 4,
                timeout: 10000,
                headers: { Accept: "application/json" }
            },
            (res) => {
                if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                    res.resume();
                    reject(new Error(`Weather fetch failed: ${res.statusCode ?? "unknown"}`));
                    return;
                }

                let raw = "";
                res.setEncoding("utf8");
                res.on("data", (chunk: string) => {
                    raw += chunk;
                });
                res.on("end", () => {
                    try {
                        const data = JSON.parse(raw) as {
                            current_weather?: {
                                temperature?: number;
                                weathercode?: number;
                            };
                        };

                        const current = data.current_weather;
                        if (
                            current &&
                            typeof current.temperature === "number" &&
                            typeof current.weathercode === "number"
                        ) {
                            resolve({ temp: current.temperature, code: current.weathercode });
                            return;
                        }

                        resolve(null);
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy(new Error("Weather fetch timeout"));
        });
        req.end();
    });
}

export const getWeather = unstable_cache(
    async (): Promise<WeatherData | null> => {
        try {
            return await fetchWeatherByIPv4();
        } catch (e) {
            console.error("Weather fetch error:", e);
            return null;
        }
    },
    ["weather-data"],
    { revalidate: 900 }
);
