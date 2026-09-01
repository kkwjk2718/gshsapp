import NextAuth, { type NextAuthRequest } from "next-auth";
import {
  NextResponse,
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
} from "next/server";
import { authConfig } from "@/auth.config";
import {
  buildContentSecurityPolicy,
  createRequestNonce,
  isPrivateDocumentPath,
} from "@/lib/security/browser-policy";

const CONTENT_SECURITY_POLICY = "Content-Security-Policy";

function withResponsePolicy(response: Response, pathname: string) {
  if (isPrivateDocumentPath(pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

const browserMiddleware = (request: NextAuthRequest, _event: NextFetchEvent) => {
  const nonce = createRequestNonce();
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CONTENT_SECURITY_POLICY, policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CONTENT_SECURITY_POLICY, policy);
  return withResponsePolicy(response, request.nextUrl.pathname);
};

const authenticatedProxy: NextMiddleware = NextAuth(authConfig).auth(browserMiddleware);

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const authResponse = await authenticatedProxy(request, event);
  const response = authResponse instanceof Response ? authResponse : NextResponse.next();

  // Auth.js can return before invoking the wrapped callback for redirects and
  // denied requests. Those responses still receive the document policy.
  if (!response.headers.has(CONTENT_SECURITY_POLICY)) {
    response.headers.set(
      CONTENT_SECURITY_POLICY,
      buildContentSecurityPolicy(createRequestNonce(), process.env.NODE_ENV === "development"),
    );
  }

  return withResponsePolicy(response, request.nextUrl.pathname);
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|\\.well-known/security\\.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
