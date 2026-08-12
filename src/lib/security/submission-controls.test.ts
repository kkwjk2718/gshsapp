import { describe, expect, it } from "vitest";

import { consumeReportSubmissionQuota, validateReportSubmission, validateSongTitle } from "./submission-controls";

describe("persistent submission bounds", () => {
  it("accepts bounded report content and rejects character or byte overflow", () => {
    expect(validateReportSubmission("Title", "Content")).toEqual({ title: "Title", content: "Content" });
    expect(() => validateReportSubmission("x".repeat(121), "Content")).toThrow();
    expect(() => validateReportSubmission("Title", "x".repeat(4_001))).toThrow();
    expect(() => validateReportSubmission("한".repeat(100), "Content")).toThrow();
  });

  it("bounds caller-supplied and resolved song titles identically", () => {
    expect(validateSongTitle("  Safe title  ")).toBe("Safe title");
    expect(() => validateSongTitle("x".repeat(201))).toThrow();
    expect(() => validateSongTitle("한".repeat(171))).toThrow();
    expect(() => validateSongTitle("\u0000title")).toThrow();
  });

  it("does not charge shared quota for requests already denied by a principal", () => {
    for (let index = 0; index < 3; index += 1) consumeReportSubmissionQuota("principal-a");
    for (let index = 0; index < 200; index += 1) {
      expect(() => consumeReportSubmissionQuota("principal-a")).toThrow("Too many report submissions");
    }
    expect(() => consumeReportSubmissionQuota("principal-b")).not.toThrow();
  });
});
