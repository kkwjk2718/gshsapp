import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// The runtime assertion is plain ESM so CI and the Docker builder can execute it without TypeScript.
import { assertStandaloneBoundary } from "../../../scripts/assert-standalone-boundary.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function fixture(files: Readonly<Record<string, string>>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-standalone-test-"));
  temporaryDirectories.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

const minimalAllowed = {
  "server.js": "server",
  "node_modules/@prisma/client/package.json": "{}",
  "node_modules/.prisma/client/schema.prisma": "schema",
  "node_modules/tar/package.json": "{}",
  ".next/ops/run-scheduled-backup.mjs": "runtime",
  ".next/ops/validate-backup.mjs": "runtime",
};

describe("standalone artifact boundary", () => {
  it.each([
    "src/lib/secret.ts",
    "prisma/dev.db",
    "scripts/repair_user.js",
    "prisma/seed_admin.js",
    "public/debug/capture.png",
    ".env.production",
    "private/server.key",
    "docs/runbook.md",
  ])("rejects forbidden artifact %s", async (forbidden) => {
    const root = await fixture({ ...minimalAllowed, [forbidden]: "forbidden" });
    await expect(assertStandaloneBoundary(root)).rejects.toThrow();
  });

  it("rejects NFT traces that point at repository sources even when the copied tree is clean", async () => {
    const root = await fixture({
      ...minimalAllowed,
      ".next/server/app/page.js.nft.json": JSON.stringify({ version: 1, files: ["../../../../src/lib/weather.ts"] }),
    });
    await expect(assertStandaloneBoundary(root)).rejects.toThrow();
  });

  it("accepts the minimal runtime boundary", async () => {
    const root = await fixture(minimalAllowed);
    await expect(assertStandaloneBoundary(root)).resolves.toEqual(expect.objectContaining({ filesChecked: 6 }));
  });
});
