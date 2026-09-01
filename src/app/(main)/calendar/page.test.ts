import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSchedules: vi.fn(),
  CalendarView: vi.fn(),
}));

vi.mock("@/lib/public-content", () => ({ getCalendarSchedules: mocks.getSchedules }));
vi.mock("@/lib/date-utils", () => ({ getKSTDate: () => new Date("2026-08-13T00:00:00.000Z") }));
vi.mock("./calendar-view", () => ({ CalendarView: mocks.CalendarView }));

import CalendarPage from "./page";

function findElement(node: ReactNode, type: unknown): React.ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node;
  return findElement((node.props as { children?: ReactNode }).children, type);
}

describe("CalendarPage Flight payload", () => {
  it("passes only the public calendar DTO to the client component", async () => {
    mocks.getSchedules.mockResolvedValue([
      {
        id: "event-1",
        title: "Event",
        description: null,
        startDate: "2026-08-13T00:00:00.000Z",
        endDate: "2026-08-13T01:00:00.000Z",
        category: "ACADEMIC",
      },
    ]);

    const tree = await CalendarPage();
    const client = findElement(tree, mocks.CalendarView);

    expect(client?.props).toEqual({
      schedules: [
        {
          id: "event-1",
          title: "Event",
          description: null,
          startDate: "2026-08-13T00:00:00.000Z",
          endDate: "2026-08-13T01:00:00.000Z",
          category: "ACADEMIC",
        },
      ],
      initialDateIso: "2026-08-13T00:00:00.000Z",
    });
    expect(JSON.stringify(client?.props)).not.toMatch(/writerId|createdAt|writer|passwordHash/);
  });
});
