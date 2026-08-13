import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_FILES = [
  "server.js",
  "node_modules/@prisma/client/package.json",
  "node_modules/.prisma/client/schema.prisma",
  "node_modules/tar/package.json",
  ".next/ops/run-scheduled-backup.mjs",
  ".next/ops/validate-backup.mjs",
  ".next/ops/bootstrap-student-roster.mjs",
];

function normalize(relative) {
  return relative.split(path.sep).join("/").replace(/^\.\//u, "");
}

function forbiddenReason(relative) {
  const normalized = normalize(relative);
  const lower = normalized.toLocaleLowerCase("en-US");
  const basename = path.posix.basename(lower);
  const dependencyPath = /(?:^|\/)node_modules\//u.test(lower);
  if (/(?:^|\/)\.(?:git|github|worktrees|superpowers)(?:\/|$)/u.test(lower)) return "repository metadata";
  if (/(?:^|\/)public\/debug(?:\/|$)/u.test(lower)) return "public debug capture";
  if (/\.(?:db|sqlite|sqlite3)(?:-|$)/u.test(basename)) return "database";
  if (/^\.env(?:\.|$)/u.test(basename)) return "environment file";
  if (/\.(?:pem|key|p12|pfx|crt|cer)$/u.test(basename)) return "key or certificate";
  if (dependencyPath) return null;
  if (/(?:^|\/)(?:docs|e2e|mobile-audit)(?:\/|$)/u.test(lower)) return "non-runtime documentation/test input";
  if (/(?:^|\/)src\//u.test(lower) || /\.(?:ts|tsx)$/u.test(lower)) return "raw source";
  if (/(?:seed|repair|debug[_-]?user|test-neis|capture)/u.test(basename)) return "debug/repair/seed tool";
  if (!lower.startsWith("node_modules/") && /\.md$/u.test(lower)) return "documentation";
  return null;
}

async function walk(root) {
  const files = [];
  async function visit(directory, relative) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      const stats = await fs.lstat(absolute);
      if (stats.isSymbolicLink()) {
        const normalizedLink = normalize(childRelative);
        const target = await fs.realpath(absolute);
        const dependencyLink = normalizedLink.includes("node_modules/") &&
          target.split(path.sep).includes("node_modules");
        if (process.platform !== "win32" || !dependencyLink) {
          throw new Error(`Standalone output contains a link: ${normalizedLink}`);
        }
        files.push(normalizedLink);
        continue;
      }
      if (stats.isDirectory()) await visit(absolute, childRelative);
      else if (stats.isFile()) files.push(normalize(childRelative));
      else throw new Error(`Standalone output contains a special file: ${normalize(childRelative)}`);
    }
  }
  await visit(root, "");
  return files;
}

function checkNftPath(value, nftFile) {
  if (typeof value !== "string") throw new Error(`Invalid NFT path in ${nftFile}`);
  const normalized = value.replace(/\\/gu, "/");
  const reason = forbiddenReason(normalized);
  if (reason) throw new Error(`NFT trace includes ${reason}: ${nftFile}`);
}

export async function assertStandaloneBoundary(root = path.resolve(".next", "standalone")) {
  const absoluteRoot = path.resolve(root);
  const rootStats = await fs.lstat(absoluteRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("Standalone output is not a regular directory");
  const files = await walk(absoluteRoot);
  const fileSet = new Set(files);

  for (const file of files) {
    const reason = forbiddenReason(file);
    if (reason) throw new Error(`Standalone output includes ${reason}: ${file}`);
    if (file.endsWith(".nft.json")) {
      let parsed;
      try {
        parsed = JSON.parse(await fs.readFile(path.join(absoluteRoot, ...file.split("/")), "utf8"));
      } catch {
        throw new Error(`Invalid NFT manifest: ${file}`);
      }
      if (!parsed || !Array.isArray(parsed.files)) throw new Error(`Invalid NFT manifest: ${file}`);
      for (const traced of parsed.files) checkNftPath(traced, file);
    }
  }

  for (const required of REQUIRED_FILES) {
    if (!fileSet.has(required)) throw new Error(`Standalone output is missing required runtime artifact: ${required}`);
  }
  return { filesChecked: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await assertStandaloneBoundary(process.argv[2]);
    console.log(`Standalone boundary verified (${result.filesChecked} files).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Standalone boundary verification failed.");
    process.exitCode = 1;
  }
}
