import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const MAX_PERSONAL_EVENTS = 3;
export const PERSONAL_EVENT_TITLE_MAX_CHARS = 100;
export const PERSONAL_EVENT_TITLE_MAX_BYTES = 200;

const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type PersonalEventInsertDb = Pick<PrismaClient, "$executeRaw">;

export function normalizePersonalEventInput(titleValue: unknown, dateValue: unknown) {
  if (typeof titleValue !== "string" || typeof dateValue !== "string") {
    throw new Error("Invalid personal event");
  }
  const title = titleValue.trim();
  const match = DATE_PATTERN.exec(dateValue);
  if (
    !title ||
    [...title].length > PERSONAL_EVENT_TITLE_MAX_CHARS ||
    new TextEncoder().encode(title).byteLength > PERSONAL_EVENT_TITLE_MAX_BYTES ||
    CONTROL.test(title) ||
    !match
  ) {
    throw new Error("Invalid personal event");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 2000 ||
    year > 2100 ||
    targetDate.getUTCFullYear() !== year ||
    targetDate.getUTCMonth() !== month - 1 ||
    targetDate.getUTCDate() !== day
  ) {
    throw new Error("Invalid personal event");
  }
  return { title, targetDate };
}

export async function createPersonalEventWithinLimit(
  db: PersonalEventInsertDb,
  userId: string,
  input: Readonly<{ title: string; targetDate: Date }>,
) {
  if (!userId || userId.length > 128 || CONTROL.test(userId)) throw new Error("Invalid personal event owner");
  const id = randomUUID();
  const inserted = await db.$executeRaw`
    INSERT INTO "PersonalEvent" ("id", "userId", "title", "targetDate", "isPrimary")
    SELECT ${id}, ${userId}, ${input.title}, ${input.targetDate},
      CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
    FROM "PersonalEvent"
    WHERE "userId" = ${userId}
    HAVING COUNT(*) < ${MAX_PERSONAL_EVENTS}
  `;
  return { created: inserted === 1 };
}
