import { NextResponse } from "next/server";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

function normalizePathname(pathname: unknown) {
  if (typeof pathname !== "string") {
    return null;
  }

  const trimmed = pathname.trim();

  if (!trimmed.startsWith("/") || trimmed.length > 2048) {
    return null;
  }

  return trimmed;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { pathname?: unknown };
    const pathname = normalizePathname(payload.pathname);

    await logAction("PAGE_VIEW", undefined, pathname ?? "/");
  } catch {
    // Logging must stay non-blocking for the UI path.
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
