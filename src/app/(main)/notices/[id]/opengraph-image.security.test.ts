import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { notice: { findUnique: mocks.findUnique } } }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import Image from "./opengraph-image";

describe("notice Open Graph image boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
  });

  it("rejects a non-canonical UUID before querying or rendering", async () => {
    await expect(Image({ params: Promise.resolve({ id: "cache-bypass-key" }) })).rejects.toThrow("not-found");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns not found for an absent canonical notice", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(Image({ params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }) })).rejects.toThrow("not-found");
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, title: true, content: true, category: true, writer: { select: { name: true } } },
    }));
  });
});
