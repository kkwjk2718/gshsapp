import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));

  for (const name of COOKIE_NAMES) {
    // delete helper
    res.cookies.delete(name);
    // explicit expiry fallback for some browsers/proxy behaviors
    res.cookies.set(name, "", {
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    res.cookies.set(name, "", {
      expires: new Date(0),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
  }

  return res;
}
