const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function getVideoId(url: URL) {
  if (url.hostname === "youtu.be") {
    const pathParts = url.pathname.split("/").filter(Boolean);
    return pathParts.length === 1 ? pathParts[0] : null;
  }

  if (!YOUTUBE_HOSTNAMES.has(url.hostname)) {
    return null;
  }

  if (url.pathname === "/watch") {
    return url.searchParams.get("v");
  }

  const pathMatch = url.pathname.match(/^\/(?:embed|live|shorts)\/([^/]+)\/?$/);
  return pathMatch?.[1] ?? null;
}

export function canonicalizeYouTubeUrl(rawUrl: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid YouTube URL.");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.port
  ) {
    throw new Error("Invalid YouTube URL.");
  }

  const videoId = getVideoId(parsedUrl);
  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error("Invalid YouTube URL.");
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}
