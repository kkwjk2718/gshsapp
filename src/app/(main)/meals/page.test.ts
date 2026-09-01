import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMonthlyMeals: vi.fn() }));

vi.mock("@/lib/neis", () => ({
  ALLERGY_MAP: {},
  getMeals: vi.fn(),
  getMonthlyMeals: mocks.getMonthlyMeals,
}));
vi.mock("@/lib/date-utils", () => ({
  getKSTDate: () => new Date(2026, 7, 13, 12, 0, 0),
  getKSTDateKey: () => "20260813",
}));

import MealsPage from "./page";

describe("MealsPage date and cache boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMonthlyMeals.mockResolvedValue([]);
  });

  it("fetches only the selected canonical month", async () => {
    await MealsPage({ searchParams: Promise.resolve({ date: "20260901" }) });
    expect(mocks.getMonthlyMeals).toHaveBeenCalledTimes(1);
    expect(mocks.getMonthlyMeals).toHaveBeenCalledWith("2026", "09");
  });

  it("falls back before constructing an outbound cache key", async () => {
    await MealsPage({ searchParams: Promise.resolve({ date: "99999999" }) });
    expect(mocks.getMonthlyMeals).toHaveBeenCalledTimes(1);
    expect(mocks.getMonthlyMeals).toHaveBeenCalledWith("2026", "08");
  });
});
