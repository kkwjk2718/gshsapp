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
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: mocks.getHeader }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    songRequest: { create: mocks.createSongRequest },
    songRule: { findFirst: mocks.findSongRule },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock("@/lib/date-utils", () => ({
  getKSTDate: () => new Date("2026-08-13T00:00:00.000Z"),
  isBreakTime: () => false,
}));
vi.mock("@/lib/grade-utils", () => ({ getUserGrade: mocks.getUserGrade }));
vi.mock("@/lib/logger", () => ({ logAction: mocks.logAction }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

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
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-gshs-client-ip");
    mocks.getHeader.mockReturnValue(null);
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-gshs-client-ip" ? "203.0.113.10" : null,
    );
    mocks.createSongRequest.mockResolvedValue({ id: "song-1" });
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

  it("bounds outbound title resolution attempts for one principal across IP changes", async () => {
    const user = makeUser("principal-limited");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.findUser.mockResolvedValue(user);
    let ipSuffix = 20;
    mocks.getHeader.mockImplementation((name: string) =>
      name === "x-gshs-client-ip" ? `203.0.113.${ipSuffix++}` : null,
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
      name === "x-gshs-client-ip" ? "203.0.113.200" : null,
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
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
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
