import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export const REQUIRED_APPLICATION_TABLES = [
  "User",
  "TokenBatch",
  "InviteToken",
  "TokenDistributionLog",
  "NoticeCategory",
  "Notice",
  "Schedule",
  "TeacherProfile",
  "SongRequest",
  "SongRule",
  "LinkItem",
  "RelatedSite",
  "PersonalEvent",
  "Notification",
  "AuditLog",
  "SystemSetting",
  "SystemLog",
  "ErrorReport",
] as const;

export type BackupDatabaseErrorCode =
  | "INVALID_HEADER"
  | "QUICK_CHECK_FAILED"
  | "FOREIGN_KEY_CHECK_FAILED"
  | "MISSING_TABLES"
  | "DESTINATION_EXISTS"
  | "SNAPSHOT_FAILED";

export class BackupDatabaseError extends Error {
  constructor(readonly code: BackupDatabaseErrorCode) {
    super(code);
    this.name = "BackupDatabaseError";
  }
}

export type SqliteValidationClient = Readonly<{
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $disconnect: () => Promise<unknown>;
}>;

export type SqliteSnapshotClient = Readonly<{
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
}>;

export type SqliteValidationClientFactory = (file: string) => Promise<SqliteValidationClient>;

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");

async function defaultClientFactory(file: string): Promise<SqliteValidationClient> {
  const datasourceUrl = `file:${path.resolve(file).replace(/\\/gu, "/")}`;
  return new PrismaClient({ datasourceUrl });
}

async function assertSqliteHeader(file: string) {
  let handle: fs.FileHandle | undefined;
  try {
    const stats = await fs.lstat(file);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new BackupDatabaseError("INVALID_HEADER");
    handle = await fs.open(file, "r");
    const bytes = Buffer.alloc(SQLITE_HEADER.length);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== SQLITE_HEADER.length || !bytes.equals(SQLITE_HEADER)) {
      throw new BackupDatabaseError("INVALID_HEADER");
    }
  } catch (error) {
    if (error instanceof BackupDatabaseError) throw error;
    throw new BackupDatabaseError("INVALID_HEADER");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function queryRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((row) => row === null || typeof row !== "object" || Array.isArray(row))) {
    throw new BackupDatabaseError("QUICK_CHECK_FAILED");
  }
  return value as Record<string, unknown>[];
}

export async function validateSqliteDatabase(
  file: string,
  clientFactory: SqliteValidationClientFactory = defaultClientFactory,
): Promise<void> {
  await assertSqliteHeader(file);
  const client = await clientFactory(file);
  try {
    await client.$executeRawUnsafe("PRAGMA query_only = ON");
    await client.$executeRawUnsafe("PRAGMA trusted_schema = OFF");

    const quickRows = queryRows(await client.$queryRawUnsafe("PRAGMA quick_check"));
    if (quickRows.length !== 1 || !Object.values(quickRows[0]).some((value) => value === "ok")) {
      throw new BackupDatabaseError("QUICK_CHECK_FAILED");
    }

    const foreignKeyRows = queryRows(await client.$queryRawUnsafe("PRAGMA foreign_key_check"));
    if (foreignKeyRows.length !== 0) throw new BackupDatabaseError("FOREIGN_KEY_CHECK_FAILED");

    const tableRows = queryRows(
      await client.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"),
    );
    const tables = new Set(tableRows.map((row) => row.name).filter((name): name is string => typeof name === "string"));
    if (REQUIRED_APPLICATION_TABLES.some((table) => !tables.has(table))) {
      throw new BackupDatabaseError("MISSING_TABLES");
    }
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

export async function createSqliteSnapshot(
  sourceClient: SqliteSnapshotClient,
  destination: string,
  clientFactory: SqliteValidationClientFactory = defaultClientFactory,
): Promise<void> {
  try {
    await fs.lstat(destination);
    throw new BackupDatabaseError("DESTINATION_EXISTS");
  } catch (error) {
    if (error instanceof BackupDatabaseError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new BackupDatabaseError("SNAPSHOT_FAILED");
  }

  try {
    await sourceClient.$executeRawUnsafe("VACUUM INTO ?", path.resolve(destination));
    await validateSqliteDatabase(destination, clientFactory);
    await fs.chmod(destination, 0o600);
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    if (error instanceof BackupDatabaseError) throw error;
    throw new BackupDatabaseError("SNAPSHOT_FAILED");
  }
}
