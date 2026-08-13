const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;

export function parseInviteTokenFragment(hash: string): string | null {
  if (!hash.startsWith("#")) return null;
  const token = new URLSearchParams(hash.slice(1)).get("token")?.trim() ?? "";
  return token && token.length <= 128 && !FORBIDDEN.test(token) ? token : null;
}

export function stripInviteTokenFromLocation(pathname: string, search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("token");
  const remaining = params.toString();
  return `${pathname}${remaining ? `?${remaining}` : ""}`;
}
