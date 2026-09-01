import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabasePath, getDatabaseUrl, getDataRoot, getWeatherCachePath } from "./paths";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("explicit writable data paths", () => {
  it("uses the Prisma schema directory as the development-only default root", () => {
    delete process.env.DATA_ROOT;
    process.env.DATABASE_URL = "file:./dev.db";
    expect(getDatabasePath()).toBe(path.resolve("prisma", "dev.db"));
  });

  it("resolves relative development database paths only under an explicit DATA_ROOT", () => {
    process.env.DATA_ROOT = path.resolve("C:/safe-data");
    process.env.DATABASE_URL = "file:./dev.db";
    expect(getDatabasePath()).toBe(path.join(process.env.DATA_ROOT, "dev.db"));
    expect(getDatabaseUrl()).toBe(`file:${path.join(process.env.DATA_ROOT, "dev.db").replace(/\\/gu, "/")}`);
    expect(getDataRoot()).toBe(path.resolve(process.env.DATA_ROOT));
  });

  it.each(["file:../outside.db", "file:sub/../outside.db", "file:C:relative.db"])(
    "rejects database path escape %s",
    (databaseUrl) => {
      process.env.DATA_ROOT = path.resolve("C:/safe-data");
      process.env.DATABASE_URL = databaseUrl;
      expect(() => getDatabasePath()).toThrow();
    },
  );

  it("keeps the weather cache inside DATA_ROOT and rejects an escaping override", () => {
    process.env.DATA_ROOT = path.resolve("C:/safe-data");
    delete process.env.WEATHER_CACHE_PATH;
    expect(getWeatherCachePath()).toBe(path.join(process.env.DATA_ROOT, "weather-cache.json"));
    process.env.WEATHER_CACHE_PATH = "../weather.json";
    expect(() => getWeatherCachePath()).toThrow();
  });
});
