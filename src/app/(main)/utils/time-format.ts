export function padTime(value: number) {
  return String(value).padStart(2, "0");
}

export function formatClock(totalMs: number, includeCentiseconds = false) {
  const safeMs = Math.max(0, totalMs);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((safeMs % 1000) / 10);

  const base = `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;

  if (!includeCentiseconds) {
    return base;
  }

  return `${base}.${padTime(centiseconds)}`;
}
