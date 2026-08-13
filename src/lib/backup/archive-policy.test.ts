import { describe, expect, it } from "vitest";

import {
  BackupArchivePolicyError,
  validateArchiveEntries,
  type ArchiveEntryInput,
  type ArchivePolicyLimits,
} from "./archive-policy";

const canonicalEntries = (): ArchiveEntryInput[] => [
  { path: "manifest.json", type: "File", size: 128 },
  { path: "database/dev.db", type: "File", size: 4096 },
];

function expectRejected(entries: ArchiveEntryInput[], code?: string, limits?: Partial<ArchivePolicyLimits>) {
  try {
    validateArchiveEntries(entries, limits);
    throw new Error("archive unexpectedly accepted");
  } catch (error) {
    expect(error).toBeInstanceOf(BackupArchivePolicyError);
    if (code) expect((error as BackupArchivePolicyError).code).toBe(code);
  }
}

describe("backup archive policy", () => {
  it.each([
    "../dev.db",
    "a/../../dev.db",
    "/etc/passwd",
    "//server/share",
    "C:/temp/x",
    "C:temp",
    "\\\\server\\share",
    "\\\\?\\C:\\x",
    "a\\..\\x",
    "./database/dev.db",
    "database//dev.db",
    "content/uploads/file:stream",
    "content/uploads/NUL.txt",
    "content/uploads/name. ",
    "content/uploads/name.",
    "content/uploads/\u0000bad",
    "content/uploads/e\u0301.txt",
  ])("rejects non-portable path %j", (unsafePath) => {
    expectRejected([...canonicalEntries(), { path: unsafePath, type: "File", size: 1 }], "INVALID_PATH");
  });

  it.each(["SymbolicLink", "Link", "CharacterDevice", "BlockDevice", "FIFO", "Socket", "GNUDumpDir"])(
    "rejects %s entries",
    (type) => {
      expectRejected(
        [...canonicalEntries(), { path: "content/uploads/item", type, size: 0 }],
        "UNSUPPORTED_TYPE",
      );
    },
  );

  it("rejects unexpected roots instead of skipping them", () => {
    expectRejected([...canonicalEntries(), { path: "package.json", type: "File", size: 1 }], "UNEXPECTED_PATH");
  });

  it.each([
    { extras: [{ path: "content/uploads/A.txt", type: "File", size: 1 }] },
    { extras: [{ path: "content/uploads/a", type: "File", size: 1 }, { path: "content/uploads/a/child", type: "File", size: 1 }] },
    { extras: [{ path: "database/dev.db", type: "File", size: 1 }] },
  ] satisfies { extras: ArchiveEntryInput[] }[])("rejects duplicate and portable-collision entries", ({ extras }) => {
    const entries = [
      ...canonicalEntries(),
      { path: "content/uploads/a.txt", type: "File", size: 1 } as const,
      ...extras,
    ];
    expectRejected(entries, "PATH_COLLISION");
  });

  it("rejects canonical and legacy layouts mixed together", () => {
    expectRejected([...canonicalEntries(), { path: "uploads/file.txt", type: "File", size: 1 }], "MIXED_LAYOUT");
  });

  it("rejects two legacy roots that map to the same destination", () => {
    expectRejected(
      [
        { path: "dev.db", type: "File", size: 4096 },
        { path: "uploads/a.txt", type: "File", size: 1 },
        { path: "public/uploads/b.txt", type: "File", size: 1 },
      ],
      "DESTINATION_COLLISION",
    );
  });

  it("enforces entry, depth, per-file and total-size limits", () => {
    expectRejected(canonicalEntries(), "ENTRY_LIMIT", { maxEntries: 1 });
    expectRejected(
      [...canonicalEntries(), { path: "content/uploads/a/b/c", type: "File", size: 1 }],
      "DEPTH_LIMIT",
      { maxDepth: 3 },
    );
    expectRejected(canonicalEntries(), "FILE_SIZE_LIMIT", { maxFileBytes: 1024 });
    expectRejected(canonicalEntries(), "TOTAL_SIZE_LIMIT", { maxTotalBytes: 4200, maxFileBytes: 8192 });
  });

  it("rejects a canonical manifest larger than 64 KiB before extraction", () => {
    const entries = canonicalEntries().map((entry) => entry.path === "manifest.json"
      ? { ...entry, size: 64 * 1024 + 1 }
      : entry);
    expectRejected(entries, "FILE_SIZE_LIMIT");
  });

  it("accepts canonical v2 and maps approved roots", () => {
    const result = validateArchiveEntries([
      { path: "manifest.json", type: "File", size: 128 },
      { path: "database", type: "Directory", size: 0 },
      { path: "database/dev.db", type: "File", size: 4096 },
      { path: "content/uploads/photo.png", type: "File", size: 10 },
      { path: "content/storage", type: "Directory", size: 0 },
    ]);

    expect(result.layout).toBe("canonical-v2");
    expect(result.databasePath).toBe("database/dev.db");
    expect(result.contentRoots).toEqual(["storage", "uploads"]);
  });

  it.each(["dev.db", "data/dev.db", "prisma/dev.db"])("accepts the documented legacy database alias %s", (databasePath) => {
    const result = validateArchiveEntries([{ path: databasePath, type: "File", size: 4096 }]);
    expect(result.layout).toBe("legacy");
    expect(result.databasePath).toBe(databasePath);
  });
});
