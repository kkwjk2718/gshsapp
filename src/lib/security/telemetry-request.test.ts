import { describe, expect, it } from "vitest";

import {
  MAX_TELEMETRY_BODY_BYTES,
  TelemetryBodyError,
  normalizeConfiguredTelemetryOrigin,
  normalizeTelemetryPathname,
  parseMealViewPayload,
  parsePageViewPayload,
  readBoundedJsonBody,
  validateTelemetryRequestMetadata,
} from "./telemetry-request";

describe("telemetry request validation", () => {
  it.each(["cors", "same-origin", "no-cors"])("accepts same-origin %s JSON", (fetchMode) => {
    expect(validateTelemetryRequestMetadata({
      origin: "https://gshs.app",
      contentType: "Application/JSON; charset=UTF-8",
      fetchSite: "same-origin",
      fetchMode,
      fetchDest: "empty",
    }, ["https://gshs.app"])).toEqual({ ok: true, value: null });
  });

  it.each([
    "https://user@gshs.app", "https://gshs.app/path", "https://gshs.app?q=1",
    "https://gshs.app#x", "http://gshs.app",
  ])("rejects unsafe configured origin %s", (value) => {
    expect(normalizeConfiguredTelemetryOrigin(value)).toBeNull();
  });

  it("normalizes the default HTTPS port", () => {
    expect(normalizeConfiguredTelemetryOrigin("https://gshs.app:443/"))
      .toBe("https://gshs.app");
  });

  it.each([
    "//evil.example", "/\\evil", "/%5cevil", "/a/../admin", "/%2e%2e/admin",
    "/x?token=secret", "/x#fragment", "/x%0d%0aInjected", "/%00", "/\ufeffx",
    "/bad%", " /x", "/x ", `/${"한".repeat(171)}`,
  ])("rejects unsafe pathname %j", (value) => {
    expect(normalizeTelemetryPathname(value)).toBeNull();
  });

  it.each(["/", "/meals", "/notices/%ED%95%9C%EA%B8%80"])(
    "accepts safe pathname %s",
    (value) => expect(normalizeTelemetryPathname(value)).toBe(value),
  );

  it("requires exact plain payload shapes", () => {
    expect(parsePageViewPayload({ pathname: "/", extra: true }).ok).toBe(false);
    expect(parsePageViewPayload(Object.create({ pathname: "/" })).ok).toBe(false);
    expect(parseMealViewPayload({ extra: true }).ok).toBe(false);
    expect(parseMealViewPayload({})).toEqual({ ok: true, value: {} });
  });

  it("rejects chunked bodies as soon as they exceed the byte cap", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_TELEMETRY_BODY_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; },
    });
    const request = new Request("https://gshs.app/api/log", { method: "POST", body, duplex: "half" } as RequestInit);

    await expect(readBoundedJsonBody(request)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE", status: 413,
    } satisfies Partial<TelemetryBodyError>);
    expect(cancelled).toBe(true);
  });
});
