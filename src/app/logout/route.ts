import { NextRequest, NextResponse } from "next/server";

const BASE_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "next-auth.csrf-token",
  "next-auth.callback-url",
];

function shouldClear(name: string) {
  return BASE_COOKIE_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}.`)
  );
}

function expireCookie(res: NextResponse, name: string) {
  res.cookies.delete(name);
  for (const secure of [true, false]) {
    res.cookies.set(name, "", {
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
    });
  }
}

export async function GET(req: NextRequest) {
  const requestedNext = req.nextUrl.searchParams.get("next");
  const nextPath = requestedNext?.startsWith("/") ? requestedNext : "/login";

  const res = new NextResponse(null, {
    status: 302,
    headers: {
      Location: nextPath,
      "Cache-Control": "no-store",
    },
  });

  const allCookieNames = req.cookies.getAll().map((c) => c.name);

  for (const name of allCookieNames) {
    if (shouldClear(name)) {
      expireCookie(res, name);
    }
  }

  for (const base of BASE_COOKIE_PREFIXES) {
    expireCookie(res, base);
  }

  return res;
}
