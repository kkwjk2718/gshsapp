import { describe, expect, it } from "vitest";
import {
  isCanonicalUuid,
  normalizeRelatedSiteInput,
  normalizeLinkItemInput,
  normalizeNotificationLink,
  normalizeNoticeCategoryInput,
} from "./public-input";

describe("public content input policy", () => {
  it.each([
    ["/notices/123?from=notification", "/notices/123?from=notification"],
    [" /me#security ", "/me#security"],
    ["", null],
    [null, null],
    ["javascript:alert(1)", null],
    ["data:text/html,attack", null],
    ["https://evil.example/phish", null],
    ["//evil.example/phish", null],
    ["/\\evil.example", null],
    ["/safe\r\nLocation:https://evil.example", null],
  ])("normalizes notification link %j", (value, expected) => {
    expect(normalizeNotificationLink(value)).toBe(expected);
  });

  it("accepts only canonical UUID notice keys", () => {
    expect(isCanonicalUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isCanonicalUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(false);
    expect(isCanonicalUuid("not-a-notice")).toBe(false);
    expect(isCanonicalUuid("550e8400-e29b-41d4-a716-446655440000/extra")).toBe(false);
  });

  it("normalizes bounded HTTPS link records", () => {
    expect(normalizeLinkItemInput({
      title: " School portal ",
      url: "https://school.example/path",
      description: " Official resource ",
      category: "SCHOOL",
    })).toEqual({
      title: "School portal",
      url: "https://school.example/path",
      description: "Official resource",
      category: "SCHOOL",
    });
  });

  it.each([
    { title: "x", url: "http://school.example", description: "", category: "SCHOOL" },
    { title: "x", url: "https://user:pass@school.example", description: "", category: "SCHOOL" },
    { title: "x", url: "https://127.0.0.1", description: "", category: "SCHOOL" },
    { title: "x", url: "javascript:alert(1)", description: "", category: "SCHOOL" },
    { title: "x", url: "https://school.example", description: "", category: "ARBITRARY" },
    { title: "x".repeat(121), url: "https://school.example", description: "", category: "SCHOOL" },
  ])("rejects unsafe or unbounded link input", (input) => {
    expect(() => normalizeLinkItemInput(input)).toThrow();
  });

  it("normalizes bounded related-site fields", () => {
    expect(normalizeRelatedSiteInput({
      name: " School site ",
      url: "https://school.example/",
      description: " Official ",
      category: "OFFICIAL",
    })).toEqual({
      name: "School site",
      url: "https://school.example/",
      description: "Official",
      category: "OFFICIAL",
    });
  });

  it.each(["javascript:alert(1)", "http://school.example", "https://127.0.0.1"])(
    "rejects unsafe related site URL %s",
    (url) => expect(() => normalizeRelatedSiteInput({ name: "Site", url, description: "", category: "OFFICIAL" })).toThrow(),
  );

  it("normalizes a bounded notice category", () => {
    expect(normalizeNoticeCategoryInput(" School event ", " school_event ")).toEqual({
      label: "School event",
      value: "SCHOOL_EVENT",
    });
  });

  it.each(["", "A B", "../ADMIN", "A".repeat(41)])("rejects unsafe category value %j", (value) => {
    expect(() => normalizeNoticeCategoryInput("Label", value)).toThrow();
  });
});
