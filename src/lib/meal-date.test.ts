import { describe, expect, it } from "vitest";
import { getDistinctMealMonths, resolveMealDateQuery } from "@/lib/meal-date";

const NOW = new Date(2026, 7, 13, 12, 0, 0);

describe("meal date query boundary", () => {
  it.each(["20260230", "2026-08-13", "20260813x", "202400101", "", "２０２６０８１３"])(
    "falls back for malformed or impossible date %j",
    (rawDate) => {
      expect(resolveMealDateQuery(rawDate, NOW)).toMatchObject({
        dateKey: "20260813",
        year: "2026",
        month: "08",
        usedFallback: true,
      });
    },
  );

  it("does not coerce repeated query values into a valid date", () => {
    expect(resolveMealDateQuery(["20260813"], NOW)).toMatchObject({
      dateKey: "20260813",
      usedFallback: true,
    });
  });

  it.each(["20240101", "20281231"])("bounds date cache keys to the current year plus or minus one", (rawDate) => {
    expect(resolveMealDateQuery(rawDate, NOW).dateKey).toBe("20260813");
  });

  it("accepts a real date inside the bounded window", () => {
    expect(resolveMealDateQuery("20270228", NOW)).toMatchObject({
      dateKey: "20270228",
      year: "2027",
      month: "02",
      usedFallback: false,
    });
  });

  it("deduplicates the canonical months that are actually requested", () => {
    expect(
      getDistinctMealMonths([
        new Date(2026, 7, 1),
        new Date(2026, 7, 31),
        new Date(2026, 8, 1),
        new Date(2026, 8, 10),
      ]),
    ).toEqual([
      { year: "2026", month: "08" },
      { year: "2026", month: "09" },
    ]);
  });
});
