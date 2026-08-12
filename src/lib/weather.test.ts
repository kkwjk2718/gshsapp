import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherProviderPayload, parseOpenMeteoPayload, parseWttrPayload } from "@/lib/weather";

describe("weather provider schema boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets a timeout and stops streaming provider bodies at the byte limit", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(200_000));
            controller.enqueue(new Uint8Array(60_001));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWeatherProviderPayload("https://weather.example/data")).rejects.toThrow("too large");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts a small valid wttr payload", () => {
    expect(
      parseWttrPayload({
        current_condition: [{ temp_C: "25", weatherCode: "113" }],
        weather: [
          { maxtempC: "29", mintempC: "20", daily_chance_of_rain: "10" },
          { maxtempC: "30", mintempC: "21", daily_chance_of_rain: "40" },
        ],
      }),
    ).toMatchObject({ temp: 25, minTemp: 20, maxTemp: 29, tomorrowRainProb: 40, source: "wttr.in" });
  });

  it("rejects oversized arrays and implausible numbers", () => {
    expect(parseWttrPayload({ current_condition: Array(11).fill({ temp_C: "25", weatherCode: "113" }), weather: [] })).toBeNull();
    expect(
      parseOpenMeteoPayload({
        current_weather: { temperature: 500, weathercode: 0 },
        daily: { temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [10, 20] },
      }),
    ).toBeNull();
  });

  it("rejects daily arrays beyond the schema bound", () => {
    expect(
      parseOpenMeteoPayload({
        current_weather: { temperature: 20, weathercode: 0 },
        daily: {
          temperature_2m_max: Array(11).fill(20),
          temperature_2m_min: [10],
          precipitation_probability_max: [10, 20],
        },
      }),
    ).toBeNull();
  });

  it("rejects malformed present daily values instead of replacing them with the current temperature", () => {
    expect(
      parseOpenMeteoPayload({
        current_weather: { temperature: 20, weathercode: 0 },
        daily: {
          temperature_2m_max: ["not-a-number"],
          temperature_2m_min: [10],
          precipitation_probability_max: [10, 20],
        },
      }),
    ).toBeNull();
  });
});
