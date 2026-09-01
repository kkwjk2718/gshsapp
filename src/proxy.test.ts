import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ shortCircuit: false }));

vi.mock("next-auth", () => ({
  default: () => ({
    auth: (handler: (request: NextRequest) => Response | Promise<Response>) =>
      async (request: NextRequest) => {
        if (mocks.shortCircuit) {
          return NextResponse.redirect(new URL("/login", request.url));
        }
        return handler(request);
      },
  }),
}));

describe("document proxy security headers", () => {
  beforeEach(() => {
    mocks.shortCircuit = false;
  });

  it("forwards a per-request nonce and sets a strict script policy", async () => {
    const { proxy } = await import("../proxy");
    const response = await proxy(new NextRequest("https://gshs.app/meals"), {} as never);
    const policy = response.headers.get("content-security-policy") ?? "";
    const scriptDirective = policy.split("; ").find((part) => part.startsWith("script-src ")) ?? "";

    expect(policy).toMatch(/'nonce-[A-Za-z0-9_-]{32}'/);
    expect(scriptDirective).toContain("'strict-dynamic'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("marks private pages noindex", async () => {
    const { proxy } = await import("../proxy");
    const response = await proxy(new NextRequest("https://gshs.app/admin/users"), {} as never);

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  it("adds CSP even when Auth.js short-circuits with a redirect", async () => {
    mocks.shortCircuit = true;
    const { proxy } = await import("../proxy");
    const response = await proxy(new NextRequest("https://gshs.app/admin"), {} as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("content-security-policy")).toMatch(/'nonce-[A-Za-z0-9_-]{32}'/);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });
});
