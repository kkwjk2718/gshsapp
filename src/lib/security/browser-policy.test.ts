import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  createRequestNonce,
  isPrivateDocumentPath,
  privateRobotsDisallowPaths,
  securityTxt,
} from "./browser-policy";

describe("browser security policy", () => {
  it("creates an unpredictable CSP-safe nonce for every request", () => {
    const first = createRequestNonce();
    const second = createRequestNonce();

    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first).not.toBe(second);
  });

  it("allows scripts only through the request nonce in production", () => {
    const policy = buildContentSecurityPolicy("abc_DEF-123", false);

    expect(policy).toContain("script-src 'self' 'nonce-abc_DEF-123' 'strict-dynamic'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    const scriptDirective = policy.split("; ").find((directive) => directive.startsWith("script-src "));
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/[\r\n]/);
  });

  it("allows unsafe-eval only for the development toolchain", () => {
    expect(buildContentSecurityPolicy("nonce", true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("nonce", false)).not.toContain("'unsafe-eval'");
  });

  it.each([
    "/admin",
    "/admin/users",
    "/me",
    "/notifications",
    "/music",
    "/songs",
    "/timetable",
    "/links",
    "/sites",
    "/teachers",
    "/signup",
    "/signup/request",
    "/login",
    "/logout",
    "/report",
  ])("marks private document %s as noindex", (pathname) => {
    expect(isPrivateDocumentPath(pathname)).toBe(true);
  });

  it.each(["/", "/meals", "/calendar", "/notices", "/privacy", "/landing"])(
    "leaves public document %s indexable",
    (pathname) => {
      expect(isPrivateDocumentPath(pathname)).toBe(false);
    },
  );

  it("does not let the private /me robots rule hide the public /meals page", () => {
    const paths = privateRobotsDisallowPaths();
    expect(paths).toContain("/me$");
    expect(paths).toContain("/me/");
    expect(paths).not.toContain("/me");
  });

  it("publishes a canonical private disclosure contact without secrets", () => {
    const body = securityTxt(new Date("2026-08-13T00:00:00.000Z"));

    expect(body).toContain("Contact: https://github.com/kkwjk2718/gshsapp/security/advisories/new");
    expect(body).toContain("Canonical: https://gshs.app/.well-known/security.txt");
    expect(body).toContain("Preferred-Languages: ko, en");
    expect(body).toContain("Expires: 2027-08-13T00:00:00.000Z");
    expect(body).not.toMatch(/password|token|secret\s*=/i);
  });
});
