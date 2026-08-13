import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function source(relative: string) {
  return fs.readFile(path.resolve(relative), "utf8");
}

describe("deployment backup boundaries", () => {
  it("creates the pre-deployment backup through the consistent snapshot engine", async () => {
    const script = await source("deploy/deploy.sh");
    expect(script).toContain("predeployment-backup.sh");
    expect(script).not.toMatch(/\bcp\s+["']?\$DB_FILE/u);
  });

  it("mounts every mutable backup path below the configured data root", async () => {
    const compose = await source("deploy/compose.yml");
    expect(compose).toContain("DATA_ROOT: /app/data");
    expect(compose).toContain("BACKUP_DIR: /app/data/backup");
    expect(compose).toContain("./backup:/app/data/backup");
    expect(compose).not.toContain("./backup:/app/backup");

    const localCompose = await source("docker-compose.yml");
    expect(localCompose).toContain("DATA_ROOT: /app/data");
    expect(localCompose).toContain("./backup:/app/data/backup");
  });

  it("never falls back to a live SQLite copy or host tar extraction", async () => {
    const offsite = await source("deploy/offsite-backup.sh");
    const drill = await source("deploy/restore-drill.sh");
    expect(offsite).not.toMatch(/\bcp\b/u);
    expect(drill).not.toMatch(/\btar\s+-/u);
    expect(drill).toContain(".next/ops/validate-backup.mjs");
    expect(drill).toContain("--migrate-reviewed-input");
    expect(drill).toContain('--group-add "$(id -g)"');
    expect(drill).not.toContain('--user "$(id -u):$(id -g)"');
  });

  it("schedules bounded maintenance and backup on production as well as test", async () => {
    const production = await source(".github/workflows/scheduled-backup-prod.yml");
    const scheduled = await source("deploy/run-scheduled-backup.sh");
    expect(production).toContain("gshs-prod");
    expect(production).toContain("./run-scheduled-backup.sh");
    expect(production).toContain("schedule:");
    expect(scheduled).toContain(".deploy.lock");
    expect(scheduled).toContain("flock -n 9");
  });

  it.each([
    ".github/workflows/publish-and-deploy-test.yml",
    ".github/workflows/preproduction-rehearsal.yml",
    ".github/workflows/deploy-prod.yml",
  ])("installs the reviewed first-deployment bootstrap controls in %s", async (workflow) => {
    const sourceText = await source(workflow);
    expect(sourceText).toContain('install -m 755 deploy/predeployment-backup.sh "$DEPLOY_PATH/predeployment-backup.sh"');
    expect(sourceText).toContain('install -m 755 deploy/bootstrap-backup.py "$DEPLOY_PATH/bootstrap-backup.py"');
  });
});
