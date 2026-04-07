import { unstable_cache } from "next/cache";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

export interface WeatherData {
  temp: number;
  minTemp: number;
  maxTemp: number;
  tomorrowRainProb: number | null;
  condition: WeatherCondition;
  description: string;
  source: "wttr.in" | "open-meteo" | "cache";
  fetchedAt: string;
  stale?: boolean;
}

type CachedWeatherData = WeatherData;

type OpenMeteoResponse = {
  current_weather?: {
    temperature?: number;
    weathercode?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

type WttrResponse = {
  current_condition?: Array<{
    temp_C?: string;
    weatherCode?: string;
  }>;
  weather?: Array<{
    maxtempC?: string;
    mintempC?: string;
    daily_chance_of_rain?: string;
  }>;
};

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=35.1805&longitude=128.1087&current_weather=true" +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
  "&timezone=Asia%2FSeoul";
const WTTR_URL = "https://wttr.in/Jinju?format=j1";
const WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getWeatherDescription(condition: WeatherCondition): string {
  switch (condition) {
    case "clear":
      return "맑음";
    case "partly-cloudy":
      return "대체로 맑음";
    case "cloudy":
      return "흐림";
    case "fog":
      return "안개";
    case "drizzle":
      return "이슬비";
    case "rain":
      return "비";
    case "snow":
      return "눈";
    case "thunder":
      return "뇌우";
    default:
      return "맑음";
  }
}

function normalizeOpenMeteoCode(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 55) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 86) return "snow";
  return "thunder";
}

function normalizeWttrCode(code: number): WeatherCondition {
  const thunderCodes = new Set([386, 389, 392, 395]);
  const snowCodes = new Set([179, 182, 185, 227, 230, 323, 326, 329, 332, 335, 338, 350, 368, 371, 374, 377, 392, 395]);
  const fogCodes = new Set([143, 248, 260]);
  const drizzleCodes = new Set([176, 263, 266, 281, 293, 296, 353]);
  const rainCodes = new Set([299, 302, 305, 308, 311, 314, 317, 356, 359]);

  if (code === 113) return "clear";
  if (code === 116) return "partly-cloudy";
  if (code === 119 || code === 122) return "cloudy";
  if (thunderCodes.has(code)) return "thunder";
  if (snowCodes.has(code)) return "snow";
  if (rainCodes.has(code)) return "rain";
  if (drizzleCodes.has(code)) return "drizzle";
  if (fogCodes.has(code)) return "fog";
  return "cloudy";
}

function toFiniteNumber(value: number | string | undefined | null): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveWeatherCachePath() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl?.startsWith("file:")) {
    const rawPath = databaseUrl.slice("file:".length);
    const absoluteDbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    return path.join(path.dirname(absoluteDbPath), "weather-cache.json");
  }

  return path.resolve(process.cwd(), ".cache", "weather-cache.json");
}

async function readCachedWeather(): Promise<WeatherData | null> {
  try {
    const raw = await readFile(resolveWeatherCachePath(), "utf8");
    const cached = JSON.parse(raw) as CachedWeatherData;

    if (
      typeof cached?.temp !== "number" ||
      typeof cached?.minTemp !== "number" ||
      typeof cached?.maxTemp !== "number" ||
      typeof cached?.description !== "string" ||
      typeof cached?.fetchedAt !== "string" ||
      typeof cached?.condition !== "string"
    ) {
      return null;
    }

    const fetchedAtMs = Date.parse(cached.fetchedAt);
    if (!Number.isFinite(fetchedAtMs)) {
      return null;
    }

    const isFreshEnough = Date.now() - fetchedAtMs <= WEATHER_CACHE_MAX_AGE_MS;
    if (!isFreshEnough) {
      return null;
    }

    return {
      ...cached,
      source: "cache",
      stale: true,
    };
  } catch {
    return null;
  }
}

async function writeWeatherCache(weather: WeatherData) {
  const cachePath = resolveWeatherCachePath();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(weather, null, 2), "utf8");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "gshsapp-weather/1.0 (admin@gshs.app)",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Weather fetch failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchFromWttr(): Promise<WeatherData | null> {
  const data = await fetchJson<WttrResponse>(WTTR_URL);
  const current = data.current_condition?.[0];
  const today = data.weather?.[0];
  const tomorrow = data.weather?.[1];

  const temp = toFiniteNumber(current?.temp_C);
  const code = toFiniteNumber(current?.weatherCode);
  const minTemp = toFiniteNumber(today?.mintempC);
  const maxTemp = toFiniteNumber(today?.maxtempC);
  const tomorrowRainProb = toFiniteNumber(tomorrow?.daily_chance_of_rain);

  if (temp === null || code === null) {
    return null;
  }

  const condition = normalizeWttrCode(code);
  return {
    temp,
    minTemp: minTemp ?? temp,
    maxTemp: maxTemp ?? temp,
    tomorrowRainProb,
    condition,
    description: getWeatherDescription(condition),
    source: "wttr.in",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchFromOpenMeteo(): Promise<WeatherData | null> {
  const data = await fetchJson<OpenMeteoResponse>(OPEN_METEO_URL);
  const current = data.current_weather;
  const code = current?.weathercode;
  const temp = current?.temperature;

  if (typeof code !== "number" || typeof temp !== "number") {
    return null;
  }

  const condition = normalizeOpenMeteoCode(code);
  return {
    temp,
    minTemp: data.daily?.temperature_2m_min?.[0] ?? temp,
    maxTemp: data.daily?.temperature_2m_max?.[0] ?? temp,
    tomorrowRainProb: data.daily?.precipitation_probability_max?.[1] ?? null,
    condition,
    description: getWeatherDescription(condition),
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchFreshWeather(): Promise<WeatherData | null> {
  const providers: Array<() => Promise<WeatherData | null>> = [fetchFromWttr, fetchFromOpenMeteo];

  for (const provider of providers) {
    try {
      const weather = await provider();
      if (weather) {
        await writeWeatherCache(weather);
        return weather;
      }
    } catch (error) {
      console.error("Weather fetch error:", error);
    }
  }

  return null;
}

export const getWeather = unstable_cache(
  async (): Promise<WeatherData | null> => {
    const freshWeather = await fetchFreshWeather();
    if (freshWeather) {
      return freshWeather;
    }

    return await readCachedWeather();
  },
  ["weather-data"],
  { revalidate: 900 },
);
