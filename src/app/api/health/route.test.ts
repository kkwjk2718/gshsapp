import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

import { GET } from "./route";

describe("GET /api/health deployment identity", () => {
  const originalVersion = process.env.APP_VERSION;
  const originalDigest = process.env.APP_IMAGE_DIGEST;

  beforeEach(() => {
    mocks.queryRaw.mockReset().mockResolvedValue([{ 1: 1 }]);
    process.env.APP_VERSION = `sha-${"a".repeat(40)}`;
    process.env.APP_IMAGE_DIGEST = `sha256:${"b".repeat(64)}`;
  });

  afterEach(() => {
    if (originalVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = originalVersion;
    if (originalDigest === undefined) delete process.env.APP_IMAGE_DIGEST;
    else process.env.APP_IMAGE_DIGEST = originalDigest;
  });

  it("reports the immutable image digest used by the running container", async () => {
    const response = await GET();

    expect(await response.json()).toEqual({
      ok: true,
      service: "gshsapp",
      version: `sha-${"a".repeat(40)}`,
      imageDigest: `sha256:${"b".repeat(64)}`,
    });
  });

  it("does not reflect malformed digest configuration", async () => {
    process.env.APP_IMAGE_DIGEST = "attacker-controlled";

    const response = await GET();

    expect((await response.json()).imageDigest).toBeNull();
  });
});
