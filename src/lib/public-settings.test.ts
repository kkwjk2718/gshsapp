import { describe, expect, it, vi } from "vitest";
import { loadPublicSettings } from "./public-settings";

describe("loadPublicSettings", () => {
  it("returns the measurement id when loading succeeds", async () => {
    const result = await loadPublicSettings(async () => "G-ABC123");
    expect(result).toEqual({ googleAnalyticsId: "G-ABC123" });
  });

  it("preserves null values from the loader", async () => {
    const result = await loadPublicSettings(async () => null);
    expect(result).toEqual({ googleAnalyticsId: null });
  });

  it("falls back to null when loading throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await loadPublicSettings(async () => {
      throw new Error("boom");
    });

    expect(result).toEqual({ googleAnalyticsId: null });
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });
});
