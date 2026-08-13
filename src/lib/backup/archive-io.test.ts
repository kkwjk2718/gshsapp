import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  BackupArchiveError,
  extractAndVerifyBackupArchive,
  inspectBackupArchive,
} from "./archive-io";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

function writeString(target: Buffer, offset: number, length: number, value: string) {
  Buffer.from(value).copy(target, offset, 0, length);
}

function writeOctal(target: Buffer, offset: number, length: number, value: number) {
  writeString(target, offset, length, value.toString(8).padStart(length - 1, "0") + "\0");
}

type TarFixtureEntry = Readonly<{
  name: string;
  type?: string;
  body?: Buffer;
  linkName?: string;
}>;

function tarEntry(entry: TarFixtureEntry): Buffer {
  const body = entry.body ?? Buffer.alloc(0);
  const header = Buffer.alloc(512);
  writeString(header, 0, 100, entry.name);
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, body.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, entry.type ?? "0");
  if (entry.linkName) writeString(header, 157, 100, entry.linkName);
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeOctal(header, 148, 8, [...header].reduce((sum, byte) => sum + byte, 0));
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function paxRecord(key: string, value: string): Buffer {
  let length = key.length + value.length + 4;
  for (;;) {
    const record = `${length} ${key}=${value}\n`;
    if (Buffer.byteLength(record) === length) return Buffer.from(record);
    length = Buffer.byteLength(record);
  }
}

function buildTar(entries: readonly TarFixtureEntry[]): Buffer {
  return gzipSync(Buffer.concat([...entries.map(tarEntry), Buffer.alloc(1024)]));
}

async function writeArchive(bytes: Buffer) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-backup-io-test-"));
  temporaryDirectories.push(root);
  const file = path.join(root, "fixture.tar.gz");
  await fs.writeFile(file, bytes);
  return { root, file };
}

function canonicalFixture(database = Buffer.from("SQLite format 3\0fixture")) {
  const databaseHash = createHash("sha256").update(database).digest("hex");
  const manifest = Buffer.from(JSON.stringify({
    format: "gshsapp-backup",
    version: 2,
    createdAt: "2026-08-13T00:00:00.000Z",
    database: "database/dev.db",
    contentRoots: [],
    files: [{ path: "database/dev.db", size: database.length, sha256: databaseHash }],
  }));
  return buildTar([
    { name: "manifest.json", body: manifest },
    { name: "database/", type: "5" },
    { name: "database/dev.db", body: database },
  ]);
}

describe("backup archive I/O", () => {
  it.each([
    { type: "2", label: "symbolic link", linkName: "../../outside" },
    { type: "1", label: "hard link", linkName: "/etc/passwd" },
    { type: "3", label: "character device" },
    { type: "4", label: "block device" },
    { type: "6", label: "FIFO" },
  ])("rejects a safe-named $label before extraction", async ({ type, linkName }) => {
    const fixture = await writeArchive(buildTar([
      { name: "dev.db", body: Buffer.from("db") },
      { name: "uploads/item", type, linkName },
    ]));
    await expect(inspectBackupArchive(fixture.file)).rejects.toBeInstanceOf(BackupArchiveError);
  });

  it("rejects a PAX path override that escapes the staging root", async () => {
    const fixture = await writeArchive(buildTar([
      { name: "pax", type: "x", body: paxRecord("path", "../../outside") },
      { name: "uploads/safe", body: Buffer.from("x") },
      { name: "dev.db", body: Buffer.from("db") },
    ]));
    await expect(inspectBackupArchive(fixture.file)).rejects.toBeInstanceOf(BackupArchiveError);
  });

  it("rejects duplicate names and unexpected roots", async () => {
    const duplicate = await writeArchive(buildTar([
      { name: "dev.db", body: Buffer.from("a") },
      { name: "dev.db", body: Buffer.from("b") },
    ]));
    await expect(inspectBackupArchive(duplicate.file)).rejects.toBeInstanceOf(BackupArchiveError);

    const unexpected = await writeArchive(buildTar([
      { name: "dev.db", body: Buffer.from("a") },
      { name: "package.json", body: Buffer.from("{}") },
    ]));
    await expect(inspectBackupArchive(unexpected.file)).rejects.toBeInstanceOf(BackupArchiveError);
  });

  it("rejects truncated input", async () => {
    const bytes = canonicalFixture();
    const fixture = await writeArchive(bytes.subarray(0, Math.floor(bytes.length / 2)));
    await expect(inspectBackupArchive(fixture.file)).rejects.toBeInstanceOf(BackupArchiveError);
  });

  it("extracts a validated canonical archive into the supplied private directory", async () => {
    const fixture = await writeArchive(canonicalFixture());
    const destination = path.join(fixture.root, "extract");
    const result = await extractAndVerifyBackupArchive(fixture.file, destination);
    expect(result.layout.layout).toBe("canonical-v2");
    expect(await fs.readFile(path.join(destination, "database", "dev.db"), "utf8")).toContain("SQLite format 3");
  });

  it("rejects a manifest checksum mismatch and removes extracted files", async () => {
    const database = Buffer.from("SQLite format 3\0changed");
    const wrongHash = "0".repeat(64);
    const manifest = Buffer.from(JSON.stringify({
      format: "gshsapp-backup",
      version: 2,
      createdAt: "2026-08-13T00:00:00.000Z",
      database: "database/dev.db",
      contentRoots: [],
      files: [{ path: "database/dev.db", size: database.length, sha256: wrongHash }],
    }));
    const fixture = await writeArchive(buildTar([
      { name: "manifest.json", body: manifest },
      { name: "database/dev.db", body: database },
    ]));
    const destination = path.join(fixture.root, "extract");
    await expect(extractAndVerifyBackupArchive(fixture.file, destination)).rejects.toBeInstanceOf(BackupArchiveError);
    await expect(fs.access(destination)).rejects.toThrow();
  });
});
