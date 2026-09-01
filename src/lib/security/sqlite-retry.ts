import { randomInt } from "node:crypto";

type ErrorWithCode = Error & { code?: unknown };

export function isTransientSqliteWriteConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as ErrorWithCode).code;
  if (code === "P2034") return true;
  return /(?:SQLITE_BUSY|database (?:table )?is locked)/iu.test(error.message);
}

type RetryOptions = Readonly<{
  attempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
}>;

const defaultDelay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function withSqliteWriteRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
    throw new Error("SQLite retry attempts must be an integer from 1 through 3");
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts || !isTransientSqliteWriteConflict(error)) throw error;
      await (options.delay ?? defaultDelay)(randomInt(8, 33) * attempt);
    }
  }

  throw new Error("Unreachable SQLite retry state");
}
