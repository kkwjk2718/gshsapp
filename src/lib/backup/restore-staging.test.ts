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
