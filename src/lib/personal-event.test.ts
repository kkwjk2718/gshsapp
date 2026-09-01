import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PERSONAL_EVENTS,
  createPersonalEventWithinLimit,
  normalizePersonalEventInput,
} from "@/lib/personal-event";

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>();
  return { ...original, randomUUID: () => "11111111-1111-4111-8111-111111111111" };
});

const temporaryDatabases: string[] = [];

afterEach(async () => {
  const fs = await import("node:fs/promises");
  for (const path of temporaryDatabases.splice(0)) await fs.rm(path, { force: true });
});

describe("personal event boundaries", () => {
  it("accepts a strict calendar date and bounded title", () => {
    expect(normalizePersonalEventInput("  Graduation  ", "2028-02-29")).toEqual({
      title: "Graduation",
      targetDate: new Date("2028-02-29T00:00:00.000Z"),
    });
  });

  it.each([
    ["", "2028-01-01"],
    ["x".repeat(101), "2028-01-01"],
    ["ok", "2028-02-30"],
    ["ok", "2028-1-1"],
    ["ok", "1999-12-31"],
    ["ok", "2101-01-01"],
  ])("rejects invalid title/date %#", (title, date) => {
    expect(() => normalizePersonalEventInput(title, date)).toThrow("Invalid personal event");
  });

  it("uses one conditional insert and reports a full collection", async () => {
    const executeRaw = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const db = { $executeRaw: executeRaw };
    const input = { title: "Exam", targetDate: new Date("2028-03-01T00:00:00.000Z") };

    await expect(createPersonalEventWithinLimit(db, "user-1", input)).resolves.toEqual({ created: true });
    await expect(createPersonalEventWithinLimit(db, "user-1", input)).resolves.toEqual({ created: false });
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(MAX_PERSONAL_EVENTS).toBe(3);
  });

  it("enforces the cap against a real SQLite table", async () => {
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DatabaseSync } = await import("node:sqlite");
    const databasePath = join(tmpdir(), `gshsapp-personal-event-${Date.now()}.db`);
    temporaryDatabases.push(databasePath);
    const database = new DatabaseSync(databasePath);
    database.exec(`CREATE TABLE "PersonalEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "targetDate" DATETIME NOT NULL,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false
    )`);
    let sequence = 0;
    const db = {
      $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
        const statement = parts.reduce((sql, part, index) => sql + part + (index < values.length ? "?" : ""), "");
        const params = values.map((value) => value instanceof Date ? value.getTime() : value);
        params[0] = `11111111-1111-4111-8111-${String(++sequence).padStart(12, "0")}`;
        return Number(database.prepare(statement).run(...(params as Array<string | number | null>)).changes);
      },
    };

    const results = [];
    for (let index = 0; index < 4; index += 1) {
      results.push(await createPersonalEventWithinLimit(db as never, "user-1", {
        title: `Event ${index}`,
        targetDate: new Date("2028-03-01T00:00:00.000Z"),
      }));
    }
    expect(results).toEqual([{ created: true }, { created: true }, { created: true }, { created: false }]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM "PersonalEvent"').get()).toEqual({ count: 3 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM "PersonalEvent" WHERE "isPrimary" = 1').get()).toEqual({ count: 1 });
    database.close();
  });
});
