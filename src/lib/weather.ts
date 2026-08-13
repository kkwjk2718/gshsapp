import { unstable_cache } from "next/cache";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cancelResponseBody, formatOutboundError, readBoundedJsonResponse } from "@/lib/outbound-response";
import { getWeatherCachePath } from "@/lib/backup/paths";

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

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=35.1805&longitude=128.1087&current_weather=true" +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
  "&timezone=Asia%2FSeoul";
const WTTR_URL = "https://wttr.in/Jinju?format=j1";
const WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const WEATHER_MAX_RESPONSE_BYTES = 256_000;
const WEATHER_MAX_ARRAY_LENGTH = 10;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedArray(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length <= WEATHER_MAX_ARRAY_LENGTH ? value : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function optionalArrayNumber(array: unknown[] | null, index: number, min: number, max: number) {
  if (!array || array[index] === undefined) return null;
  return boundedNumber(array[index], min, max);
}

export function parseWttrPayload(payload: unknown, now = new Date()): WeatherData | null {
  if (!isRecord(payload)) return null;
  const currentConditions = boundedArray(payload.current_condition);
  const weatherDays = boundedArray(payload.weather);
  if (!currentConditions || !weatherDays || !isRecord(currentConditions[0])) return null;

  const current = currentConditions[0];
  const today = isRecord(weatherDays[0]) ? weatherDays[0] : null;
  const tomorrow = isRecord(weatherDays[1]) ? weatherDays[1] : null;
  const temp = boundedNumber(current.temp_C, -80, 60);
  const code = boundedNumber(current.weatherCode, 0, 999);
  if (temp === null || code === null || !Number.isInteger(code)) return null;

  const minTemp = today?.mintempC === undefined ? temp : boundedNumber(today.mintempC, -80, 60);
  const maxTemp = today?.maxtempC === undefined ? temp : boundedNumber(today.maxtempC, -80, 60);
  const tomorrowRainProb = tomorrow?.daily_chance_of_rain === undefined
    ? null
    : boundedNumber(tomorrow.daily_chance_of_rain, 0, 100);
  if (minTemp === null || maxTemp === null || minTemp > maxTemp) return null;
  if (tomorrow?.daily_chance_of_rain !== undefined && tomorrowRainProb === null) return null;

  const condition = normalizeWttrCode(code);
  return {
    temp,
    minTemp,
    maxTemp,
    tomorrowRainProb,
    condition,
    description: getWeatherDescription(condition),
    source: "wttr.in",
    fetchedAt: now.toISOString(),
  };
}

export function parseOpenMeteoPayload(payload: unknown, now = new Date()): WeatherData | null {
  if (!isRecord(payload) || !isRecord(payload.current_weather)) return null;
  const current = payload.current_weather;
  const daily = payload.daily === undefined ? null : isRecord(payload.daily) ? payload.daily : null;
  if (payload.daily !== undefined && !daily) return null;

  const maxTemps = daily ? boundedArray(daily.temperature_2m_max) : [];
  const minTemps = daily ? boundedArray(daily.temperature_2m_min) : [];
  const rainProbabilities = daily ? boundedArray(daily.precipitation_probability_max) : [];
  if (daily && (!maxTemps || !minTemps || !rainProbabilities)) return null;

  if (
    maxTemps?.some((value) => boundedNumber(value, -80, 60) === null) ||
    minTemps?.some((value) => boundedNumber(value, -80, 60) === null) ||
    rainProbabilities?.some((value) => boundedNumber(value, 0, 100) === null)
  ) {
    return null;
  }

  const temp = boundedNumber(current.temperature, -80, 60);
  const code = boundedNumber(current.weathercode, 0, 999);
  if (temp === null || code === null || !Number.isInteger(code)) return null;

  const minTemp = optionalArrayNumber(minTemps, 0, -80, 60) ?? temp;
  const maxTemp = optionalArrayNumber(maxTemps, 0, -80, 60) ?? temp;
  const tomorrowRainProb = optionalArrayNumber(rainProbabilities, 1, 0, 100);
  if (minTemp > maxTemp) return null;

  const condition = normalizeOpenMeteoCode(code);
  return {
    temp,
    minTemp,
    maxTemp,
    tomorrowRainProb,
    condition,
    description: getWeatherDescription(condition),
    source: "open-meteo",
    fetchedAt: now.toISOString(),
  };
}

async function readCachedWeather(): Promise<WeatherData | null> {
  try {
    const raw = await readFile(getWeatherCachePath(), "utf8");
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
  const cachePath = getWeatherCachePath();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(weather, null, 2), "utf8");
}

export async function fetchWeatherProviderPayload(
  url: string,
  allowedContentTypes?: readonly string[],
): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "gshsapp-weather/1.0 (admin@gshs.app)",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    await cancelResponseBody(response, "weather provider request failed");
    throw new Error(`Weather fetch failed: ${response.status}`);
  }

  return await readBoundedJsonResponse(response, {
    maxBytes: WEATHER_MAX_RESPONSE_BYTES,
    allowedContentTypes,
  });
}

async function fetchFromWttr(): Promise<WeatherData | null> {
  return parseWttrPayload(
    await fetchWeatherProviderPayload(WTTR_URL, ["application/json", "text/plain"]),
  );
}

async function fetchFromOpenMeteo(): Promise<WeatherData | null> {
  return parseOpenMeteoPayload(await fetchWeatherProviderPayload(OPEN_METEO_URL));
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
      console.error("Weather fetch error:", formatOutboundError(error));
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
