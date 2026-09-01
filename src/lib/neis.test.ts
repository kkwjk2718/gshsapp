import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeals, getMonthlyMeals, getSchoolSchedule, getTimetable } from "@/lib/neis";

function jsonResponse(payload: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

describe("NEIS outbound boundary", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("puts a timeout signal on every NEIS request", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}));

    await getMeals("20260813");
    await getTimetable("20260813", "1", "1");
    await getSchoolSchedule("20260101", "20261231");
    await getMonthlyMeals("2026", "08");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("rejects invalid monthly cache key inputs without making a request", async () => {
    await expect(getMonthlyMeals("2026", "13")).resolves.toEqual([]);
    await expect(getMonthlyMeals("20x6", "08")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-JSON and oversized responses", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("<html></html>", { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(
        new Response("{}", {
          headers: { "content-type": "application/json", "content-length": "2000000" },
        }),
      );

    await expect(getMeals("20260813")).resolves.toEqual([]);
    await expect(getTimetable("20260813", "1", "1")).resolves.toEqual([]);
  });

  it("cancels a failed provider response instead of leaving its body streaming", async () => {
    let cancelled = false;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull() {},
          cancel() {
            cancelled = true;
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(getMeals("20260813")).resolves.toEqual([]);
    expect(cancelled).toBe(true);
  });

  it("returns only bounded rows matching the expected meal schema", async () => {
    const valid = {
      MMEAL_SC_CODE: "2",
      MMEAL_SC_NM: "중식",
      DDISH_NM: "밥",
      CAL_INFO: "700 Kcal",
      NTR_INFO: "영양",
      MLSV_YMD: "20260813",
    };
    fetchMock.mockResolvedValue(
      jsonResponse({
        mealServiceDietInfo: [{ head: [] }, { row: [valid, { ...valid, MLSV_YMD: "bad" }, ...Array(20).fill(valid)] }],
      }),
    );

    const result = await getMeals("20260813");

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual(valid);
    expect(result).not.toContainEqual(expect.objectContaining({ MLSV_YMD: "bad" }));
  });

  it("rejects meal types outside the documented NEIS enum", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        mealServiceDietInfo: [
          { head: [] },
          {
            row: [{
              MMEAL_SC_CODE: "9",
              MMEAL_SC_NM: "unknown",
              DDISH_NM: "밥",
              CAL_INFO: "700 Kcal",
              NTR_INFO: "영양",
              MLSV_YMD: "20260813",
            }],
          },
        ],
      }),
    );

    await expect(getMeals("20260813")).resolves.toEqual([]);
  });

  it("rejects out-of-range class and period values", async () => {
    await expect(getTimetable("20260813", "1", "99")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      jsonResponse({ hisTimetable: [{ head: [] }, { row: [{ PERIO: "99", ITRT_CNTNT: "Math" }] }] }),
    );
    await expect(getTimetable("20260813", "1", "1")).resolves.toEqual([]);
  });

  it("rejects schedule rows whose academic year conflicts with the event date", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        SchoolSchedule: [
          { head: [] },
          { row: [{ AY: "2025", AA_YMD: "20260813", EVENT_NM: "Event", EVENT_CNTNT: "Description" }] },
        ],
      }),
    );

    await expect(getSchoolSchedule("20260101", "20261231")).resolves.toEqual([]);
  });
});
