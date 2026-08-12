import { describe, expect, it } from "vitest";

import { canonicalizeYouTubeUrl } from "./youtube-url";

describe("canonicalizeYouTubeUrl", () => {
  it.each([
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL-test#fragment",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ])("canonicalizes an approved YouTube video URL", (input, expected) => {
    expect(canonicalizeYouTubeUrl(input)).toBe(expected);
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://example.com/?next=https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=too-short",
    "https://www.youtube.com/@school",
  ])("rejects a non-HTTPS or non-video YouTube destination", (input) => {
    expect(() => canonicalizeYouTubeUrl(input)).toThrow("Invalid YouTube URL");
  });
});
