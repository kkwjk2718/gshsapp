import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function source(relative: string) {
  return fs.readFile(path.resolve(relative), "utf8");
}

describe("deployment backup boundaries", () => {
  it("holds the shared lifecycle lock before opening installed sibling controls", async () => {
    const script = await source("deploy/deploy.sh");
    const selfCheck = script.indexOf("Installed deployment control is unsafe.");
    const lock = script.indexOf("exec 9>/run/lock/gshsapp/lifecycle.lock");
    const policy = script.indexOf('source "$CONTROL_ROOT/deploy-policy.sh"');
    const hostHardening = script.indexOf('/bin/bash "$CONTROL_ROOT/host-hardening.sh" --verify-firewall');
    expect(selfCheck).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(selfCheck);
    expect(policy).toBeGreaterThan(lock);
    expect(script.indexOf("exec 9>/run/lock/gshsapp/lifecycle.lock", lock + 1)).toBe(-1);
    expect(script.slice(hostHardening - 500, hostHardening)).toContain("LIFECYCLE_LOCK_HELD=1");
  });

  it("creates the pre-deployment backup through the consistent snapshot engine", async () => {
    const script = await source("deploy/deploy.sh");
    expect(script).toContain("predeployment-backup.sh");
    expect(script).not.toMatch(/\bcp\s+["']?\$DB_FILE/u);
  });

  it("retains the stopped legacy web through migration and never rolls it onto the new schema", async () => {
    const script = await source("deploy/deploy.sh");
    const main = script.slice(script.indexOf("deploy_main()"));
    const transition = script.slice(
      script.indexOf("begin_schema_transition()"),
      script.indexOf("\nassert_control_root()"),
    );
    const quiesce = main.indexOf("quiesce_web_container");
    const backup = main.indexOf("create_predeployment_backup");
    const transitionCall = main.indexOf("begin_schema_transition");
    const durableBoundary = transition.indexOf('write_phase "schema-transition"');
    const clearIntent = transition.indexOf("clear_restart_intent");
    const migration = transition.indexOf("compose run --rm --no-deps migrate");
    const migrated = transition.indexOf('write_phase "migration-complete"');
    const remove = transition.indexOf("remove_preserved_web_container");
    const healthy = main.lastIndexOf('write_phase "healthy"');
    const pendingPromotion = main.lastIndexOf("record_candidate_promotion");
    const promote = main.lastIndexOf("promote_candidate_restart_policy");
    expect(quiesce).toBeGreaterThan(-1);
    expect(backup).toBeGreaterThan(quiesce);
    expect(transitionCall).toBeGreaterThan(backup);
    expect(durableBoundary).toBeGreaterThan(-1);
    expect(clearIntent).toBeGreaterThan(durableBoundary);
    expect(migration).toBeGreaterThan(clearIntent);
    expect(migrated).toBeGreaterThan(migration);
    expect(remove).toBeGreaterThan(migrated);
    expect(pendingPromotion).toBeGreaterThan(transitionCall);
    expect(promote).toBeGreaterThan(pendingPromotion);
    expect(healthy).toBeGreaterThan(promote);
    expect(script).not.toContain("rollback_application");
    expect(script).not.toContain("capture_trusted_backup_runtime");
    expect(script).toContain('docker rm -f "$candidate_id"');
    expect(script).toContain("Pre-migration application rollback is disabled after schema transition begins");
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

  it("runs the production migration without network or inherited code-loader controls", async () => {
    const compose = await source("deploy/compose.yml");
    const migrate = compose.slice(compose.indexOf("  migrate:"), compose.indexOf("\n  web:"));
    expect(migrate).toContain("network_mode: none");
    expect(migrate).toContain('NODE_OPTIONS: ""');
    expect(migrate).toContain('NODE_PATH: ""');
  });

  it("uses bridge publishing with a separately enforced Docker forwarding boundary", async () => {
    const compose = await source("deploy/compose.yml");
    const web = compose.slice(compose.indexOf("  web:"));
    expect(web).toContain('restart: "no"');
    expect(web).not.toContain("network_mode: host");
    expect(web).toContain('"${HOST_BIND_IP:?HOST_BIND_IP is required}:${HOST_PORT:?HOST_PORT is required}:3000"');
    expect(web).toContain("HOSTNAME: 0.0.0.0");
    expect(web).toContain('PORT: "3000"');
    expect(web).toMatch(/^\s+ports:/mu);
  });

  it("never falls back to a live SQLite copy or host tar extraction", async () => {
    const offsite = await source("deploy/offsite-backup.sh");
    const drill = await source("deploy/restore-drill.sh");
    expect(offsite).not.toMatch(/\bcp\b/u);
    expect(drill).not.toMatch(/\btar\s+-/u);
    expect(drill).toContain(".next/ops/validate-backup.mjs");
    expect(drill).toContain("--migrate-reviewed-input");
    expect(drill).toContain('--user "$APP_UID:$APP_GID"');
    expect(drill).not.toContain("SOURCE_ENV_FILE");
    expect(drill).toContain('RESTORE_BASE_URL="http://127.0.0.1:3000"');
    expect(drill).toContain('typeof health.memberServiceSuspended !== "boolean"');
    expect(drill).toContain("verify_container_probe");
  });

  it("binds root approval to exact candidate checks and the matching OOB control manifest", async () => {
    const approval = await source("deploy/approve-release.sh");
    expect(approval).toContain('commits/$CANDIDATE_SHA/check-runs?filter=latest&per_page=100');
    expect(approval).toContain('app.get("id")==15368');
    expect(approval).toContain('app.get("slug")=="github-actions"');
    expect(approval).toContain('"lint":".github/workflows/ci.yml"');
    expect(approval).toContain('"gitleaks":".github/workflows/secret-scan.yml"');
    expect(approval).toContain('run.get("event")=="push"');
    expect(approval).toContain('run.get("head_sha")==os.environ["EXPECTED_SHA"]');
    expect(approval).toContain('contents/deploy/control-assets.sha256?ref=$CANDIDATE_SHA');
    expect(approval).toContain('cmp -s -- "$candidate_controls" "$CONTROL_ROOT/control-assets.sha256"');
  });

  it("reconciles committed and interrupted backups before creating another generation", async () => {
    const scheduled = await source("deploy/run-scheduled-backup.sh");
    const reconcile = scheduled.indexOf('"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" reconcile');
    const create = scheduled.indexOf('"$PYTHON_BIN" "$CONTROL_ROOT/bootstrap-backup.py" create');
    expect(reconcile).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(reconcile);
    const config = await source("deploy/validate-operations-config.py");
    expect(config).not.toContain("ExecCondition=");
  });

  it("keeps root-receipted generations outside the app-writable backup mount", async () => {
    const compose = await source("deploy/compose.yml");
    const scheduled = await source("deploy/run-scheduled-backup.sh");
    const deploy = await source("deploy/deploy.sh");
    expect(compose).not.toContain("root-backup");
    expect(scheduled).toContain('BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/root-backup}"');
    expect(scheduled).toContain('"$(stat -c \'%u:%g:%a\' "$BACKUP_DIR")" == "0:0:700"');
    expect(deploy).toContain('"$(stat -c \'%u:%g:%a\' "$DATA_DIR")" == "61001:61001:700"');
    expect(deploy).toContain('"$(stat -c \'%u:%g:%a\' "$BACKUP_DIR")" == "0:0:700"');
  });

});
