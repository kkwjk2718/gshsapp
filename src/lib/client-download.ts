"use client";

export type DownloadTextFileOptions = Readonly<{ filename: string; mimeType: string }>;
export type DownloadEnvironment = Readonly<{
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  createAnchor(): HTMLAnchorElement;
  appendAnchor(anchor: HTMLAnchorElement): void;
  scheduleCleanup(callback: () => void): void;
}>;

const INVALID_FILENAME = /[\u0000-\u001f\u007f<>:"/\\|?*]/gu;

function sanitizeCandidate(value: string): string {
  const trimmed = value.trim().replace(INVALID_FILENAME, "_");
  const points = [...trimmed];
  if (/\.csv$/iu.test(trimmed) && points.length > 120) {
    return `${points.slice(0, 116).join("")}.csv`;
  }
  return points.slice(0, 120).join("");
}

export function sanitizeDownloadFilename(value: string, fallback: string): string {
  const sanitized = sanitizeCandidate(value);
  if (sanitized && sanitized !== "." && sanitized !== "..") return sanitized;
  const safeFallback = sanitizeCandidate(fallback);
  return safeFallback && safeFallback !== "." && safeFallback !== ".." ? safeFallback : "download.txt";
}

function defaultEnvironment(): DownloadEnvironment {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    appendAnchor: (anchor) => document.body.appendChild(anchor),
    scheduleCleanup: (callback) => { setTimeout(callback, 0); },
  };
}

export function downloadTextFile(
  content: string,
  options: DownloadTextFileOptions,
  environment: DownloadEnvironment = defaultEnvironment(),
): void {
  const blob = new Blob([content], { type: options.mimeType });
  const url = environment.createObjectUrl(blob);
  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = environment.createAnchor();
    anchor.href = url;
    anchor.download = sanitizeDownloadFilename(options.filename, "download.txt");
    environment.appendAnchor(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    environment.scheduleCleanup(() => environment.revokeObjectUrl(url));
  }
}
