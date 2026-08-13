import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { extractAndVerifyBackupArchive } from "../src/lib/backup/archive-io";
import { copyRegularFileExclusive } from "../src/lib/backup/private-copy";
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

  const privateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gshs-restore-drill-"));
  try {
    let databaseSource: string;
    if (source.toLocaleLowerCase("en-US").endsWith(".tar.gz")) {
      const extraction = path.join(privateRoot, "extract");
      const inspected = await extractAndVerifyBackupArchive(source, extraction);
      databaseSource = path.join(extraction, ...inspected.layout.databasePath.split("/"));
    } else if (/\.(?:db|bak)$/iu.test(source)) {
      if (!options.migrateReviewedInput) await validateSqliteDatabase(source);
      databaseSource = source;
    } else {
      throw new Error("Unsupported restore source");
    }

    const dataDirectory = path.join(output, "data");
    await fs.mkdir(dataDirectory, { mode: 0o700 });
    const destination = path.join(dataDirectory, "dev.db");
    await copyRegularFileExclusive(databaseSource, destination, { maxBytes: 512 * 1024 * 1024 });
    if (options.migrateReviewedInput) migrateReviewedInput(destination, dataDirectory);
    await validateSqliteDatabase(destination);
    await fs.chmod(destination, 0o640);
    await fs.chmod(dataDirectory, 0o770);
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
