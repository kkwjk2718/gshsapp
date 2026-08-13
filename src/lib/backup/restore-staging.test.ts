import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RestoreStagingError,
  getPendingRestorePath,
  stageRestoreUpload,
} from "./restore-staging";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function temporaryRestoreRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-restore-stage-test-"));
  temporaryDirectories.push(root);
  return root;
}

function bodyFrom(chunks: readonly Uint8Array[], onPull = () => undefined) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull();
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
}

async function directoryEntriesOrEmpty(directory: string) {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

describe("restore upload staging", () => {
  it("rejects an oversized Content-Length without reading the body", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    const getReader = vi.fn();
    await expect(stageRestoreUpload({
      body: { getReader } as unknown as ReadableStream<Uint8Array>,
      contentLength: 101,
      originalName: "backup.db",
      restoreRoot,
      maxBytes: 100,
      validateDatabase: vi.fn(),
    })).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    expect(getReader).not.toHaveBeenCalled();
    expect(await directoryEntriesOrEmpty(path.join(restoreRoot, "staged"))).toEqual([]);
  });

  it("aborts a chunked stream at limit + 1 and leaves no partial artifact", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    await expect(stageRestoreUpload({
      body: bodyFrom([Buffer.alloc(70, 1), Buffer.alloc(31, 2)]),
      contentLength: null,
      originalName: "backup.db",
      restoreRoot,
      maxBytes: 100,
      validateDatabase: vi.fn(),
    })).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    expect(await directoryEntriesOrEmpty(path.join(restoreRoot, "staged"))).toEqual([]);
    await expect(fs.access(getPendingRestorePath(restoreRoot))).rejects.toThrow();
  });

  it.each([
    { name: "backup.db", bytes: Buffer.from([0x1f, 0x8b, 0x00]), code: "FORMAT_MISMATCH" },
    { name: "backup.tar.gz", bytes: Buffer.from("SQLite format 3\0payload"), code: "FORMAT_MISMATCH" },
    { name: "backup.zip", bytes: Buffer.from("payload"), code: "INVALID_FILENAME" },
  ])("rejects extension and magic mismatch for $name", async ({ name, bytes, code }) => {
    const restoreRoot = await temporaryRestoreRoot();
    await expect(stageRestoreUpload({
      body: bodyFrom([bytes]),
      contentLength: bytes.length,
      originalName: name,
      restoreRoot,
      validateDatabase: vi.fn(),
      validateArchive: vi.fn(),
    })).rejects.toMatchObject({ code });
  });

  it("stages a validated opaque pending restore without changing the live database", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    const liveDatabase = path.join(restoreRoot, "live.db");
    await fs.writeFile(liveDatabase, "live-bytes");
    const bytes = Buffer.from("SQLite format 3\0candidate");
    const validateDatabase = vi.fn().mockResolvedValue(undefined);

    const result = await stageRestoreUpload({
      body: bodyFrom([bytes.subarray(0, 10), bytes.subarray(10)]),
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      createId: () => "AbCdEfGhIjKlMnOpQrStUvWx",
    });

    expect(result).toEqual(expect.objectContaining({ id: "AbCdEfGhIjKlMnOpQrStUvWx", format: "db", bytes: bytes.length }));
    expect(await fs.readFile(liveDatabase, "utf8")).toBe("live-bytes");
    expect(validateDatabase).toHaveBeenCalledTimes(1);

    const descriptorText = await fs.readFile(getPendingRestorePath(restoreRoot), "utf8");
    expect(descriptorText).not.toContain("backup.db");
    expect(descriptorText).not.toContain(restoreRoot);
    expect(JSON.parse(descriptorText)).toEqual(expect.objectContaining({
      id: "AbCdEfGhIjKlMnOpQrStUvWx",
      format: "db",
      roots: ["database"],
      expiresAt: "2026-08-14T00:00:00.000Z",
    }));
  });

  it("validates the SQLite database extracted from a tar archive before staging", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    const gzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
    const validateDatabase = vi.fn().mockResolvedValue(undefined);
    const validateArchive = vi.fn(async (_artifact: string, destination: string) => {
      const database = path.join(destination, "database", "dev.db");
      await fs.mkdir(path.dirname(database), { recursive: true });
      await fs.writeFile(database, Buffer.from("SQLite format 3\0candidate"));
      return {
        artifactSha256: "a".repeat(64),
        layout: { layout: "canonical-v2" as const, databasePath: "database/dev.db", contentRoots: [], entries: [], totalBytes: 0 },
      };
    });

    await stageRestoreUpload({
      body: bodyFrom([gzip]),
      contentLength: gzip.length,
      originalName: "backup.tar.gz",
      restoreRoot,
      validateDatabase,
      validateArchive,
    });

    expect(validateDatabase).toHaveBeenCalledWith(expect.stringMatching(/[\\/]validation[\\/]database[\\/]dev\.db$/u));
  });

  it("refuses a second pending restore before reading its body", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    const bytes = Buffer.from("SQLite format 3\0candidate");
    const common = {
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn().mockResolvedValue(undefined),
    };
    await stageRestoreUpload({ ...common, body: bodyFrom([bytes]), contentLength: bytes.length });
    const getReader = vi.fn();
    await expect(stageRestoreUpload({
      ...common,
      body: { getReader } as unknown as ReadableStream<Uint8Array>,
      contentLength: bytes.length,
    })).rejects.toBeInstanceOf(RestoreStagingError);
    expect(getReader).not.toHaveBeenCalled();
  });

  it("consumes an expired strictly valid descriptor and only removes its opaque staged directory", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    const expiredId = "ExpiredRestoreId1234567890";
    const nextId = "NextRestoreOpaqueId123456789";
    const expiredDirectory = path.join(restoreRoot, "staged", expiredId);
    await fs.mkdir(expiredDirectory, { recursive: true });
    await fs.writeFile(path.join(expiredDirectory, "artifact.db"), Buffer.from("SQLite format 3\0expired"));
    await fs.writeFile(getPendingRestorePath(restoreRoot), JSON.stringify({
      version: 1,
      id: expiredId,
      sha256: "a".repeat(64),
      format: "db",
      createdAt: "2026-08-11T00:00:00.000Z",
      expiresAt: "2026-08-12T00:00:00.000Z",
      roots: ["database"],
    }));
    const unrelated = path.join(restoreRoot, "staged", "UnrelatedOpaqueId1234567890");
    await fs.mkdir(unrelated);
    await fs.writeFile(path.join(unrelated, "keep"), "valuable");
    const bytes = Buffer.from("SQLite format 3\0candidate");

    const result = await stageRestoreUpload({
      body: bodyFrom([bytes]),
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn().mockResolvedValue(undefined),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      createId: () => nextId,
    });

    expect(result.id).toBe(nextId);
    await expect(fs.access(expiredDirectory)).rejects.toThrow();
    expect(await fs.readFile(path.join(unrelated, "keep"), "utf8")).toBe("valuable");
    expect(JSON.parse(await fs.readFile(getPendingRestorePath(restoreRoot), "utf8"))).toEqual(
      expect.objectContaining({ id: nextId }),
    );
  });

  it("fails closed on a malformed expired descriptor without reading the body or escaping staged root", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    await fs.mkdir(path.join(restoreRoot, "staged"), { recursive: true });
    const outside = path.join(restoreRoot, "outside-marker");
    await fs.writeFile(outside, "keep");
    await fs.writeFile(getPendingRestorePath(restoreRoot), JSON.stringify({
      version: 1,
      id: "../../outside-marker",
      sha256: "a".repeat(64),
      format: "db",
      createdAt: "2026-08-11T00:00:00.000Z",
      expiresAt: "2026-08-12T00:00:00.000Z",
      roots: ["database"],
    }));
    const getReader = vi.fn();

    await expect(stageRestoreUpload({
      body: { getReader } as unknown as ReadableStream<Uint8Array>,
      contentLength: 32,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn(),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    })).rejects.toMatchObject({ code: "STAGING_FAILED" });
    expect(getReader).not.toHaveBeenCalled();
    expect(await fs.readFile(outside, "utf8")).toBe("keep");
  });

  it("atomically reclaims a stale heartbeat lock directory left by a crashed uploader", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    await fs.mkdir(path.join(restoreRoot, "staged"), { recursive: true });
    const lock = path.join(restoreRoot, "pending.lock");
    await fs.mkdir(lock);
    const stale = new Date(Date.now() - 31 * 60 * 1000);
    await fs.utimes(lock, stale, stale);
    const bytes = Buffer.from("SQLite format 3\0candidate");

    await expect(stageRestoreUpload({
      body: bodyFrom([bytes]),
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn().mockResolvedValue(undefined),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      createId: () => "RecoveredRestoreId1234567890",
    })).resolves.toEqual(expect.objectContaining({ id: "RecoveredRestoreId1234567890" }));
    await expect(fs.access(path.join(restoreRoot, "pending.lock"))).rejects.toThrow();
  });

  it("keeps a fresh heartbeat lock and rejects before reading the upload body", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    await fs.mkdir(path.join(restoreRoot, "staged"), { recursive: true });
    await fs.mkdir(path.join(restoreRoot, "pending.lock"));
    const getReader = vi.fn();

    await expect(stageRestoreUpload({
      body: { getReader } as unknown as ReadableStream<Uint8Array>,
      contentLength: 32,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn(),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    })).rejects.toMatchObject({ code: "RESTORE_PENDING" });
    expect(getReader).not.toHaveBeenCalled();
  });

  it("keeps an actively held upload lock exclusive while the first stream is slow", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    const bytes = Buffer.from("SQLite format 3\0candidate");
    let allowRead!: () => void;
    let signalReadStarted!: () => void;
    const readAllowed = new Promise<void>((resolve) => { allowRead = resolve; });
    const readStarted = new Promise<void>((resolve) => { signalReadStarted = resolve; });
    let reads = 0;
    const firstBody = {
      getReader: () => ({
        async read() {
          if (reads++ > 0) return { done: true, value: undefined };
          signalReadStarted();
          await readAllowed;
          return { done: false, value: bytes };
        },
        cancel: vi.fn(),
        releaseLock: vi.fn(),
      }),
    } as unknown as ReadableStream<Uint8Array>;
    const first = stageRestoreUpload({
      body: firstBody,
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn().mockResolvedValue(undefined),
      createId: () => "SlowActiveRestoreId1234567890",
    });
    await readStarted;
    const secondGetReader = vi.fn();

    await expect(stageRestoreUpload({
      body: { getReader: secondGetReader } as unknown as ReadableStream<Uint8Array>,
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn(),
    })).rejects.toMatchObject({ code: "RESTORE_PENDING" });
    expect(secondGetReader).not.toHaveBeenCalled();
    allowRead();
    await expect(first).resolves.toEqual(expect.objectContaining({ id: "SlowActiveRestoreId1234567890" }));
  });

  it("migrates a stale regular-file lock from the previous implementation", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    await fs.mkdir(path.join(restoreRoot, "staged"), { recursive: true });
    const lock = path.join(restoreRoot, "pending.lock");
    await fs.writeFile(lock, "");
    const stale = new Date(Date.now() - 31 * 60 * 1000);
    await fs.utimes(lock, stale, stale);
    const bytes = Buffer.from("SQLite format 3\0candidate");

    await expect(stageRestoreUpload({
      body: bodyFrom([bytes]),
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn().mockResolvedValue(undefined),
      createId: () => "LegacyRecoveredId12345678901",
    })).resolves.toEqual(expect.objectContaining({ id: "LegacyRecoveredId12345678901" }));
  });

  it("cancels only the expected pending restore and removes its private staged directory", async () => {
    const restoreRoot = await temporaryRestoreRoot();
    const id = "CancelableRestoreId1234567890";
    const bytes = Buffer.from("SQLite format 3\0candidate");
    await stageRestoreUpload({
      body: bodyFrom([bytes]),
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot,
      validateDatabase: vi.fn().mockResolvedValue(undefined),
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      createId: () => id,
    });
    const lifecycle = await import("./restore-staging") as typeof import("./restore-staging") & {
      cancelPendingRestore: (options: { restoreRoot: string; expectedId: string; now: () => Date }) => Promise<{ id: string }>;
    };

    await expect(lifecycle.cancelPendingRestore({
      restoreRoot,
      expectedId: "DifferentRestoreId1234567890",
      now: () => new Date("2026-08-13T00:01:00.000Z"),
    })).rejects.toMatchObject({ code: "RESTORE_ID_MISMATCH" });
    expect(JSON.parse(await fs.readFile(getPendingRestorePath(restoreRoot), "utf8"))).toEqual(expect.objectContaining({ id }));

    await expect(lifecycle.cancelPendingRestore({
      restoreRoot,
      expectedId: id,
      now: () => new Date("2026-08-13T00:01:00.000Z"),
    })).resolves.toEqual(expect.objectContaining({ id }));
    await expect(fs.access(getPendingRestorePath(restoreRoot))).rejects.toThrow();
    await expect(fs.access(path.join(restoreRoot, "staged", id))).rejects.toThrow();
  });

  it("rejects a restore root that is itself a filesystem link", async (context) => {
    const root = await temporaryRestoreRoot();
    const real = path.join(root, "real");
    const linked = path.join(root, "linked");
    await fs.mkdir(real);
    try {
      await fs.symlink(real, linked, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return context.skip();
      throw error;
    }
    const bytes = Buffer.from("SQLite format 3\0candidate");
    await expect(stageRestoreUpload({
      body: bodyFrom([bytes]),
      contentLength: bytes.length,
      originalName: "backup.db",
      restoreRoot: linked,
      validateDatabase: vi.fn(),
    })).rejects.toMatchObject({ code: "STAGING_FAILED" });
  });
});
