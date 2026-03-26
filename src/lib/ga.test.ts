import { beforeEach, describe, expect, it, vi } from "vitest";
import { event, pageview } from "./ga";

describe("ga helpers", () => {
  beforeEach(() => {
    const gtag = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        gtag,
        __gaMeasurementId: "G-STORED123",
      } as unknown as Window & typeof globalThis,
    });
  });

  it("uses the explicit measurement id for page views", () => {
    pageview("/notices", "G-EXPLICIT1");

    expect(window.gtag).toHaveBeenCalledWith("config", "G-EXPLICIT1", {
      page_path: "/notices",
    });
  });

  it("uses the stored measurement id when no explicit id is provided", () => {
    pageview("/calendar");

    expect(window.gtag).toHaveBeenCalledWith("config", "G-STORED123", {
      page_path: "/calendar",
    });
  });

  it("does not fall back to the stored id when an explicit null disables tracking", () => {
    pageview("/menu", null);

    expect(window.gtag).not.toHaveBeenCalled();
  });

  it("sends events to the explicit measurement id", () => {
    event("submit", "admin", "backup", 1, "G-EVENT999");

    expect(window.gtag).toHaveBeenCalledWith("event", "submit", {
      send_to: "G-EVENT999",
      event_category: "admin",
      event_label: "backup",
      value: 1,
    });
  });
});
