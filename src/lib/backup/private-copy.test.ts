import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { copyRegularFileExclusive } from "./private-copy";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-private-copy-test-"));
  roots.push(root);
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  await fs.writeFile(source, "copy-me");
  return { root, source, destination };
}

describe("exclusive private file copy", () => {
  it("copies and syncs without leaving an unsettled FileHandle stream", async () => {
    const item = await fixture();
    await expect(copyRegularFileExclusive(item.source, item.destination, { maxBytes: 64 })).resolves.toBe(7);
    expect(await fs.readFile(item.destination, "utf8")).toBe("copy-me");
  });

  it("rejects a byte-limit overflow and an existing destination", async () => {
    const item = await fixture();
    await expect(copyRegularFileExclusive(item.source, item.destination, { maxBytes: 3 })).rejects.toThrow();
    await fs.writeFile(item.destination, "existing");
    await expect(copyRegularFileExclusive(item.source, item.destination)).rejects.toThrow();
    expect(await fs.readFile(item.destination, "utf8")).toBe("existing");
  });

  it("rejects a linked source", async (context) => {
    const item = await fixture();
    const link = path.join(item.root, "link");
    try {
      await fs.symlink(item.source, link, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return context.skip();
      throw error;
    }
    await expect(copyRegularFileExclusive(link, item.destination)).rejects.toThrow();
  });
});
