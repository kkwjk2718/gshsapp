import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { extractAndVerifyBackupArchive } from "../src/lib/backup/archive-io";
import { copyRegularFileExclusive } from "../src/lib/backup/private-copy";
import { syncDirectory } from "../src/lib/backup/fs-durability";
import { validateSqliteDatabase } from "../src/lib/backup/sqlite-snapshot";

type PrepareRestoreDrillOptions = Readonly<{
  migrateReviewedInput?: boolean;
}>;

function migrateReviewedInput(database: string, dataRoot: string) {
  const migrationScript = path.resolve("scripts", "migrate-production.mjs");
  const result = spawnSync(process.execPath, [migrationScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATA_ROOT: dataRoot,
      DATABASE_URL: `file:${database.replace(/\\/gu, "/")}`,
    },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr.trim() || `status ${result.status}`;
    throw new Error(`Reviewed migration validation failed: ${detail}`);
  }
}

export async function prepareRestoreDrill(
  sourceArgument: string,
  outputArgument: string,
  options: PrepareRestoreDrillOptions = {},
) {
  const source = path.resolve(sourceArgument);
  const output = path.resolve(outputArgument);
  const sourceStats = await fs.lstat(source);
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) throw new Error("Invalid restore source");
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  const outputEntries = await fs.readdir(output);
  if (outputEntries.length !== 0) throw new Error("Restore drill destination must be empty");

  // Keep canonical extraction and final data on one bounded output filesystem.
  // Moving verified files avoids holding a second full generation in memory or
  // on disk while the candidate migration runs.
  const privateRoot = await fs.mkdtemp(path.join(output, ".reviewed-input-"));
  try {
    let databaseSource: string;
    let contentSources = new Map<string, string>();
    let extractedCanonical = false;
    if (source.toLocaleLowerCase("en-US").endsWith(".tar.gz")) {
      const extraction = path.join(privateRoot, "extract");
      const inspected = await extractAndVerifyBackupArchive(source, extraction);
      databaseSource = path.join(extraction, ...inspected.layout.databasePath.split("/"));
      contentSources = new Map(inspected.layout.contentRoots.map((root) => [root, path.join(extraction, "content", root)]));
      extractedCanonical = true;
    } else if (/\.(?:db|bak)$/iu.test(source)) {
      if (!options.migrateReviewedInput) await validateSqliteDatabase(source);
      databaseSource = source;
    } else {
      throw new Error("Unsupported restore source");
    }

    const dataDirectory = path.join(output, "data");
    await fs.mkdir(dataDirectory, { mode: 0o700 });
    const destination = path.join(dataDirectory, "dev.db");
    if (extractedCanonical) await fs.rename(databaseSource, destination);
    else await copyRegularFileExclusive(databaseSource, destination, { maxBytes: 512 * 1024 * 1024 });

    async function copyContentDirectory(sourceRoot: string, destinationRoot: string) {
      const sourceStats = await fs.lstat(sourceRoot);
      if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) throw new Error("Invalid restore content root");
      await fs.mkdir(destinationRoot, { mode: 0o700 });
      const children = await fs.readdir(sourceRoot, { withFileTypes: true });
      for (const child of children) {
        const sourcePath = path.join(sourceRoot, child.name);
        const destinationPath = path.join(destinationRoot, child.name);
        const stats = await fs.lstat(sourcePath);
        if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) throw new Error("Invalid restore content entry");
        if (stats.isDirectory()) await copyContentDirectory(sourcePath, destinationPath);
        else {
          await copyRegularFileExclusive(sourcePath, destinationPath, { expected: stats, maxBytes: 512 * 1024 * 1024 });
          await fs.chmod(destinationPath, 0o600);
        }
      }
      await syncDirectory(destinationRoot);
    }

    for (const [root, contentSource] of contentSources) {
      if (!["logs", "storage", "uploads", "user-content"].includes(root)) throw new Error("Invalid restore content root");
      const contentDestination = path.join(dataDirectory, root);
      if (extractedCanonical) await fs.rename(contentSource, contentDestination);
      else await copyContentDirectory(contentSource, contentDestination);
    }

    async function normalizeModes(directory: string) {
      await fs.chmod(directory, 0o700);
      for (const child of await fs.readdir(directory, { withFileTypes: true })) {
        const childPath = path.join(directory, child.name);
        if (child.isDirectory()) await normalizeModes(childPath);
        else if (child.isFile()) await fs.chmod(childPath, 0o600);
        else throw new Error("Invalid restore output entry");
      }
      await syncDirectory(directory);
    }
    await normalizeModes(dataDirectory);
    if (options.migrateReviewedInput) migrateReviewedInput(destination, dataDirectory);
    await validateSqliteDatabase(destination);
    await fs.chmod(destination, 0o640);
    await fs.chmod(dataDirectory, 0o770);
    await syncDirectory(dataDirectory);
    return destination;
  } catch (error) {
    await fs.rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(privateRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href &&
  process.argv.length >= 4
) {
  try {
    const flags = process.argv.slice(4);
    if (flags.some((flag) => flag !== "--migrate-reviewed-input")) throw new Error("Unsupported validation option");
    await prepareRestoreDrill(process.argv[2], process.argv[3], {
      migrateReviewedInput: flags.includes("--migrate-reviewed-input"),
    });
    console.log("Backup validated for an isolated restore drill.");
  } catch {
    console.error("Backup validation failed.");
    process.exitCode = 1;
  }
}
