import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  safeUrl: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/network-safety", () => ({ assertSafeExternalHttpsUrl: mocks.safeUrl }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/db", () => ({
  prisma: {
    systemSetting: { upsert: vi.fn(), findUnique: vi.fn() },
    $transaction: mocks.transaction,
  },
}));

import { updateGoogleAnalyticsId, updateGradeMapping, updateICalUrl } from "./actions";

describe("security-sensitive settings audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.safeUrl.mockImplementation(async (value: string) => value);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      systemSetting: { upsert: mocks.upsert },
      auditLog: { create: vi.fn() },
    }));
  });

  it("couples grade mapping mutation with a durable audit", async () => {
    const form = new FormData();
    form.set("grade1", "40");
    form.set("grade2", "39");
    form.set("grade3", "38");
    await updateGradeMapping(form);

    expect(mocks.upsert).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "admin-1", action: "GRADE_MAPPING_CHANGED",
    }));
  });

  it("couples iCal feed mutation with a durable audit", async () => {
    const form = new FormData();
    form.set("icalUrl", "https://calendar.google.com/calendar.ics");
    await updateICalUrl({}, form);

    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "admin-1", action: "ICAL_FEED_CHANGED",
    }));
  });

  it("couples analytics setting mutation with a durable audit", async () => {
    const form = new FormData();
    form.set("googleAnalyticsId", "G-ABC12345");
    await updateGoogleAnalyticsId({}, form);

    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "admin-1", action: "ANALYTICS_SETTING_CHANGED",
    }));
  });
});
