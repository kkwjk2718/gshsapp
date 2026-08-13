import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findUnique: vi.fn(), notFound: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { notice: { findFirst: mocks.findFirst, findUnique: mocks.findUnique } },
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import NoticeDetailPage, { generateMetadata } from "./page";

const canonicalId = "550e8400-e29b-41d4-a716-446655440000";
const now = new Date("2026-08-13T00:00:00.000Z");
const expiredNotice = {
  id: canonicalId,
  category: "GENERAL",
  title: "expired-secret-title",
  content: "expired-secret-content",
  expiresAt: now,
  createdAt: new Date("2026-08-12T00:00:00.000Z"),
  writer: { name: "Expired Writer", role: "ADMIN" },
};

describe("public notice detail expiry boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.findFirst.mockResolvedValue(null);
    mocks.findUnique.mockResolvedValue(expiredNotice);
    mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not expose an expired notice through metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ id: canonicalId }) });

    expect(String(metadata.title)).not.toContain("expired-secret-title");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: canonicalId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }));
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns not found instead of rendering an expired notice detail", async () => {
    await expect(NoticeDetailPage({ params: Promise.resolve({ id: canonicalId }) })).rejects.toThrow("not-found");

    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: canonicalId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }));
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
