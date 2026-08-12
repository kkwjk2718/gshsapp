import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSongRequests: vi.fn(),
  findSongRules: vi.fn(),
  findUser: vi.fn(),
  getCurrentUser: vi.fn(),
  SongList: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    songRequest: { findMany: mocks.findSongRequests },
    songRule: { findMany: mocks.findSongRules, findFirst: vi.fn() },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock("@/lib/date-utils", () => ({
  getKSTDate: () => new Date("2026-08-13T08:00:00.000Z"),
  getSongTimeRanges: () => ({
    todayMorning: {
      start: new Date("2026-08-12T22:00:00.000Z"),
      end: new Date("2026-08-12T23:00:00.000Z"),
    },
    nextMorning: {
      start: new Date("2026-08-13T22:00:00.000Z"),
      end: new Date("2026-08-13T23:00:00.000Z"),
    },
  }),
}));
vi.mock("@/lib/grade-utils", () => ({ getUserGrade: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("./request-form", () => ({ SongRequestForm: vi.fn() }));
vi.mock("./song-list", () => ({ SongList: mocks.SongList }));

import SongsPage from "./page";

const anonymousRow = {
  id: "anonymous-song",
  requesterId: "secret-requester-id",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  videoTitle: "Anonymous song",
  status: "PENDING",
  priorityScore: 10,
  isAnonymous: true,
  rejectionReason: null,
  createdAt: new Date("2026-08-13T01:02:03.000Z"),
  requester: {
    id: "secret-requester-id",
    userId: "secret-login",
    passwordHash: "never-serialize",
    name: "Hidden Student",
    email: "hidden@example.com",
    role: "STUDENT",
    studentId: "3101",
    gisu: 40,
    banExpiresAt: null,
    isOnboarded: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
};

const visibleRow = {
  ...anonymousRow,
  id: "visible-song",
  requesterId: "visible-requester-id",
  videoTitle: "Visible song",
  status: "APPROVED",
  isAnonymous: false,
  requester: {
    ...anonymousRow.requester,
    id: "visible-requester-id",
    name: "Visible Student",
    email: "visible@example.com",
    studentId: "3201",
  },
};

const songRequestSelect = {
  id: true,
  videoTitle: true,
  youtubeUrl: true,
  status: true,
  createdAt: true,
  isAnonymous: true,
  requester: { select: { name: true, studentId: true } },
};

function collectElements(node: ReactNode, type: unknown, result: React.ReactElement[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, type, result);
    return result;
  }

  if (!isValidElement(node)) return result;
  if (node.type === type) result.push(node);
  collectElements((node.props as { children?: ReactNode }).children, type, result);
  return result;
}

describe("SongsPage Flight payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const currentUser = {
      id: "admin-1",
      userId: "admin",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      studentId: null,
      gisu: null,
      banExpiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    mocks.getCurrentUser.mockResolvedValue(currentUser);
    mocks.findUser.mockResolvedValue(currentUser);
    mocks.findSongRules.mockResolvedValue([]);
    mocks.findSongRequests
      .mockResolvedValueOnce([visibleRow])
      .mockResolvedValueOnce([anonymousRow]);
  });

  it("selects publishable fields and removes anonymous identity before rendering clients", async () => {
    const tree = await SongsPage();
    const songLists = collectElements(tree, mocks.SongList);

    expect(mocks.findSongRequests).toHaveBeenCalledTimes(2);
    expect(mocks.findSongRequests.mock.calls[0][0]).toEqual({
      where: {
        createdAt: {
          gte: new Date("2026-08-12T22:00:00.000Z"),
          lt: new Date("2026-08-12T23:00:00.000Z"),
        },
        status: { in: ["APPROVED", "PLAYED"] },
      },
      orderBy: { priorityScore: "desc" },
      take: 100,
      select: songRequestSelect,
    });
    expect(mocks.findSongRequests.mock.calls[1][0]).toEqual({
      where: {
        createdAt: {
          gte: new Date("2026-08-13T22:00:00.000Z"),
          lt: new Date("2026-08-13T23:00:00.000Z"),
        },
        status: { in: ["PENDING", "APPROVED", "PLAYED"] },
      },
      orderBy: [{ priorityScore: "desc" }, { createdAt: "asc" }],
      take: 100,
      select: songRequestSelect,
    });

    expect(songLists).toHaveLength(2);
    expect(songLists[0].props).not.toHaveProperty("currentUser");
    expect(songLists[0].props.songs).toEqual([
      {
        id: "visible-song",
        videoTitle: "Visible song",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        status: "APPROVED",
        createdAt: "2026-08-13T01:02:03.000Z",
        requester: {
          name: "Visible Student",
          studentId: "3201",
        },
      },
    ]);
    expect(songLists[1].props.songs).toEqual([
      {
        id: "anonymous-song",
        videoTitle: "Anonymous song",
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        status: "PENDING",
        createdAt: "2026-08-13T01:02:03.000Z",
        requester: null,
      },
    ]);

    const serializedClientProps = JSON.stringify(songLists.map((element) => element.props));
    for (const forbiddenValue of [
      "secret-requester-id",
      "visible-requester-id",
      "never-serialize",
      "hidden@example.com",
      "visible@example.com",
      "passwordHash",
      "requesterId",
      "isAnonymous",
      '"role"',
    ]) {
      expect(serializedClientProps).not.toContain(forbiddenValue);
    }
  });
});
