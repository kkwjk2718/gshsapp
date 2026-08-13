import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const outputDirectory = path.resolve(".next", "standalone", ".next", "ops");
await fs.mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: {
    "run-scheduled-backup": path.resolve("scripts", "run-scheduled-backup.ts"),
    "validate-backup": path.resolve("scripts", "validate-backup.ts"),
  },
  outdir: outputDirectory,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  packages: "bundle",
  external: ["@prisma/client", ".prisma/client"],
  logLevel: "info",
});
