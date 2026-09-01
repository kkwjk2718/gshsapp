export function normalizeLocalRedirect(value: string | null | undefined, fallback = "/") {
  if (!value || /[\u0000-\u001f\u007f]/u.test(value) || value.includes("\\")) {
    return fallback;
  }

  try {
    const origin = "https://local.invalid";
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin || !value.startsWith("/") || value.startsWith("//")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
