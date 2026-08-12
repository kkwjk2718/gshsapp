import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  noticeFindMany: vi.fn(),
  scheduleFindFirst: vi.fn(),
  scheduleFindMany: vi.fn(),
  siteFindMany: vi.fn(),
  settingFindUnique: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/google-calendar", () => ({ getEventsFromICal: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/neis", () => ({ getSchoolSchedule: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/db", () => ({ prisma: {
  notice: { findMany: mocks.noticeFindMany },
  schedule: { findFirst: mocks.scheduleFindFirst, findMany: mocks.scheduleFindMany },
  relatedSite: { findMany: mocks.siteFindMany },
  systemSetting: { findUnique: mocks.settingFindUnique },
  user: { findMany: mocks.userFindMany },
} }));

import { getNextAcademicSchedule, getRelatedSites, getVisibleNotices } from "./public-content";

describe("public content database boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.noticeFindMany.mockResolvedValue([]);
    mocks.scheduleFindFirst.mockResolvedValue(null);
    mocks.siteFindMany.mockResolvedValue([]);
  });

  it("caps notices and selects only the public DTO", async () => {
    await getVisibleNotices();
    expect(mocks.noticeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 100,
      select: {
        id: true, category: true, title: true, content: true, expiresAt: true, createdAt: true,
        writer: { select: { name: true, role: true } },
      },
    }));
  });

  it("selects only home schedule fields", async () => {
    await getNextAcademicSchedule();
    expect(mocks.scheduleFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: { title: true, startDate: true },
    }));
  });

  it("caps related sites and omits internal timestamps", async () => {
    await getRelatedSites();
    expect(mocks.siteFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true, url: true, category: true, description: true },
    });
  });
});
