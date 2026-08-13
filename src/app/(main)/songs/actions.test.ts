import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSongRequest: vi.fn(),
  findSongRule: vi.fn(),
  findUser: vi.fn(),
  getCurrentUser: vi.fn(),
  getUserGrade: vi.fn(),
  getHeader: vi.fn(),
  logAction: vi.fn(),
  revalidatePath: vi.fn(),
  countSongRequests: vi.fn(),
  transaction: vi.fn(),
  consumeSongQuota: vi.fn(),
  validateSongTitle: vi.fn((value: unknown) => String(value).trim()),
  lifecycle: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: mocks.getHeader }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    songRequest: { create: mocks.createSongRequest, count: mocks.countSongRequests },
    songRule: { findFirst: mocks.findSongRule },
    user: { findUnique: mocks.findUser },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/date-utils", () => ({
  getKSTDate: () => new Date("2026-08-13T00:00:00.000Z"),
  isBreakTime: () => false,
}));
vi.mock("@/lib/grade-utils", () => ({ getUserGrade: mocks.getUserGrade }));
vi.mock("@/lib/logger", () => ({ logAction: mocks.logAction }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/security/submission-controls", () => ({
  SONG_DAILY_CAP: 3,
  SONG_PENDING_CAP: 2,
  consumeSongSubmissionQuota: mocks.consumeSongQuota,
  validateSongTitle: mocks.validateSongTitle,
}));
vi.mock("@/lib/submission-lifecycle", () => ({ enforceSongRequestLifecycle: mocks.lifecycle }));

import { requestSong } from "./actions";

function makeUser(id = "user-1") {
  return {
    id,
    userId: id,
    name: "Test User",
    email: `${id}@example.com`,
    role: "ADMIN",
    studentId: null,
    gisu: null,
    banExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function makeForm(url = "https://youtu.be/dQw4w9WgXcQ", title = "Known title") {
  const formData = new FormData();
  formData.set("youtubeUrl", url);
  formData.set("videoTitle", title);
  return formData;
}

describe("requestSong", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    mocks.getHeader.mockReturnValue(null);
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "203.0.113.10" : null,
    );
    mocks.createSongRequest.mockResolvedValue({ id: "song-1" });
    mocks.countSongRequests.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      songRequest: { create: mocks.createSongRequest, count: mocks.countSongRequests },
    }));
    mocks.logAction.mockResolvedValue(undefined);
    mocks.revalidatePath.mockReturnValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ title: "Resolved title" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("authenticates before reading untrusted form data or making an outbound request", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const get = vi.fn(() => {
      throw new Error("form data was read");
    });

    await expect(requestSong({ get } as unknown as FormData)).rejects.toThrow("Unauthorized");

    expect(get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stores only the canonical HTTPS YouTube URL", async () => {
    const user = makeUser();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);

    await requestSong(makeForm());

    expect(mocks.createSongRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    });
  });

  it("consumes submission quota even when the caller supplies a title", async () => {
    const user = makeUser("known-title-user");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    await requestSong(makeForm());
    expect(mocks.consumeSongQuota).toHaveBeenCalledWith(user.id);
  });

  it("rejects a banned user before outbound title resolution", async () => {
    const user = {
      ...makeUser("banned-user"),
      banExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    };
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);

    await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.createSongRequest).not.toHaveBeenCalled();
  });

  it("rejects a disallowed grade before outbound title resolution", async () => {
    const user = {
      ...makeUser("disallowed-grade-user"),
      role: "STUDENT",
      studentId: "1101",
      gisu: 40,
    };
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    mocks.findSongRule.mockResolvedValue({ allowedGrade: "2" });
    mocks.getUserGrade.mockResolvedValue("1");

    await expect(
      requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", "")),
    ).rejects.toThrow("오늘은 2학년만 신청할 수 있습니다.");

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.createSongRequest).not.toHaveBeenCalled();
  });

  it("rejects an exhausted database quota before outbound title resolution", async () => {
    const user = makeUser("db-quota-user");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    mocks.countSongRequests.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    await expect(
      requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", "")),
    ).rejects.toThrow("quota exceeded");

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.createSongRequest).not.toHaveBeenCalled();
  });

  it("ignores oEmbed JSON served with a non-JSON content type", async () => {
    const user = makeUser("oembed-content-type-user");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "203.0.113.211" : null,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ title: "Untrusted title" }), {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));

    expect(mocks.createSongRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({ videoTitle: "신청곡" }),
    });
  });

  it("does not accept an inherited oEmbed title as response data", async () => {
    const user = makeUser("oembed-inherited-title-user");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "203.0.113.214" : null,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const originalTitle = Object.getOwnPropertyDescriptor(Object.prototype, "title");
    Object.defineProperty(Object.prototype, "title", {
      value: "Inherited untrusted title",
      configurable: true,
      writable: true,
    });

    try {
      await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));
      expect(mocks.createSongRequest).toHaveBeenCalledWith({
        data: expect.objectContaining({ videoTitle: "신청곡" }),
      });
    } finally {
      if (originalTitle) Object.defineProperty(Object.prototype, "title", originalTitle);
      else delete (Object.prototype as Record<string, unknown>).title;
    }
  });

  it("stops reading an oEmbed response after 32 KiB without trusting Content-Length", async () => {
    const user = makeUser("oembed-size-user");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "203.0.113.212" : null,
    );
    const oversizedTitle = "T".repeat(33 * 1024);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(`{"title":"${oversizedTitle.slice(0, 17_000)}`));
              controller.enqueue(new TextEncoder().encode(`${oversizedTitle.slice(17_000)}"}`));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));

    expect(mocks.createSongRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({ videoTitle: "신청곡" }),
    });
  });

  it("cancels a failed oEmbed response instead of leaving its body streaming", async () => {
    const user = makeUser("oembed-error-body-user");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "203.0.113.213" : null,
    );
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            pull() {},
            cancel() {
              cancelled = true;
            },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));

    expect(cancelled).toBe(true);
    expect(mocks.createSongRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({ videoTitle: "신청곡" }),
    });
  });

  it("bounds outbound title resolution attempts for one principal across IP changes", async () => {
    const user = makeUser("principal-limited");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    let ipSuffix = 20;
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? `203.0.113.${ipSuffix++}` : null,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));
    }

    await expect(requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""))).rejects.toThrow(
      "Too many YouTube title resolution attempts",
    );
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("bounds outbound title resolution attempts shared by one IP", async () => {
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "203.0.113.200" : null,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const user = makeUser(`ip-user-${attempt}`);
      mocks.getCurrentUser.mockResolvedValueOnce(user);
      mocks.findUser.mockResolvedValueOnce(user);
      await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));
    }

    const blockedUser = makeUser("ip-user-blocked");
    mocks.getCurrentUser.mockResolvedValueOnce(blockedUser);
    mocks.findUser.mockResolvedValueOnce(blockedUser);
    await expect(requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""))).rejects.toThrow(
      "Too many YouTube title resolution attempts",
    );
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("shares the unknown bucket when forwarding headers are not explicitly trusted", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    let spoofedIpSuffix = 30;
    mocks.getHeader.mockImplementation((name: string) => {
      if (name === "x-real-ip") return `203.0.113.${spoofedIpSuffix++}`;
      if (name === "x-forwarded-for") return `198.51.100.${spoofedIpSuffix++}`;
      return null;
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const user = makeUser(`unknown-ip-user-${attempt}`);
      mocks.getCurrentUser.mockResolvedValueOnce(user);
      mocks.findUser.mockResolvedValueOnce(user);
      await requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""));
    }

    const blockedUser = makeUser("unknown-ip-user-blocked");
    mocks.getCurrentUser.mockResolvedValueOnce(blockedUser);
    mocks.findUser.mockResolvedValueOnce(blockedUser);
    await expect(requestSong(makeForm("https://youtu.be/dQw4w9WgXcQ", ""))).rejects.toThrow(
      "Too many YouTube title resolution attempts",
    );
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
