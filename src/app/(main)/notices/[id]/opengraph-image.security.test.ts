import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findUnique: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { notice: { findFirst: mocks.findFirst, findUnique: mocks.findUnique } } }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import Image from "./opengraph-image";

describe("notice Open Graph image boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a non-canonical UUID before querying or rendering", async () => {
    await expect(Image({ params: Promise.resolve({ id: "cache-bypass-key" }) })).rejects.toThrow("not-found");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("uses a strict expiry boundary before rendering a canonical notice", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.findUnique.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "expired-secret-title",
      content: "expired-secret-content",
      category: "GENERAL",
      writer: { name: "Expired Writer" },
    });
    await expect(Image({ params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) })).rejects.toThrow("not-found");
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date("2026-08-13T00:00:00.000Z") } }],
      },
      select: { id: true, title: true, content: true, category: true, writer: { select: { name: true } } },
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
