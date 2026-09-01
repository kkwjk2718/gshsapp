import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const expectedControls = [
  "deploy/approve-release.sh",
  "deploy/bootstrap-backup.py",
  "deploy/compose.yml",
  "deploy/deploy-policy.sh",
  "deploy/deploy.sh",
  "deploy/docker-user-firewall.sh",
  "deploy/gshsapp-control-update-recovery.service",
  "deploy/gshsapp-docker-boot-quarantine.service",
  "deploy/gshsapp-docker-user-firewall.service",
  "deploy/gshsapp-docker-user-firewall.timer",
  "deploy/gshsapp-writer-recovery.service",
  "deploy/import-backup.sh",
  "deploy/host-hardening.sh",
  "deploy/install-backup-timer.sh",
  "deploy/install-deploy-service.sh",
  "deploy/install-root-operations.sh",
  "deploy/offsite-backup.sh",
  "deploy/pin-offsite-operation.sh",
  "deploy/predeployment-backup.sh",
  "deploy/recover-backup-writer.sh",
  "deploy/recover-deployment-writer.sh",
  "deploy/recover-writers-at-boot.sh",
  "deploy/restore-drill.sh",
  "deploy/run-scheduled-backup.sh",
  "deploy/validate-ufw-rules.py",
  "deploy/validate-live-database.py",
  "deploy/validate-docker-network.py",
  "deploy/validate-host-routes.py",
  "deploy/validate-operations-config.py",
  "deploy/workflow-policy.sha256",
];

const expectedWorkflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-prod.yml",
  ".github/workflows/preproduction-rehearsal.yml",
  ".github/workflows/production-health-monitor.yml",
  ".github/workflows/publish-and-deploy-test.yml",
  ".github/workflows/publish-production-release.yml",
  ".github/workflows/secret-scan.yml",
];

const expectedBootstrap = [
  "deploy/control-assets.sha256",
  "deploy/install-backup-timer.sh",
  "deploy/install-deploy-service.sh",
  "deploy/install-root-operations.sh",
];

const manifest = await readFile("deploy/control-assets.sha256", "utf8");
const controlLines = manifest.trimEnd().split("\n");
const controlPaths = controlLines.map((line) => line.slice(66));
if (JSON.stringify(controlPaths) !== JSON.stringify(expectedControls)) {
  throw new Error("control manifest does not contain the exact reviewed asset set");
}
for (const line of controlLines) {
  const match = /^([0-9a-f]{64})  (deploy\/[A-Za-z0-9._/-]+)$/.exec(line);
  if (!match) throw new Error("control manifest line is not canonical");
  const [, expected, relative] = match;
  const blob = execFileSync("git", ["hash-object", "--filters", `--path=${relative}`, relative]);
  if (!/^[0-9a-f]{40}\n$/.test(blob.toString("utf8"))) throw new Error("Git filter check failed");
  const working = await readFile(relative, "utf8");
  const canonical = working.replaceAll("\r\n", "\n");
  const actual = createHash("sha256").update(canonical).digest("hex");
  if (actual !== expected) throw new Error(`manifest digest mismatch for ${relative}`);
  if (canonical.includes("\r")) throw new Error(`control contains a non-canonical carriage return: ${relative}`);
}

const workflowManifest = await readFile("deploy/workflow-policy.sha256", "utf8");
const workflowLines = workflowManifest.trimEnd().split("\n");
const workflowPaths = workflowLines.map((line) => line.slice(66));
if (JSON.stringify(workflowPaths) !== JSON.stringify(expectedWorkflows)) {
  throw new Error("workflow policy does not contain the exact reviewed workflow set");
}
for (const line of workflowLines) {
  const match = /^([0-9a-f]{64})  (\.github\/workflows\/[A-Za-z0-9._-]+\.yml)$/.exec(line);
  if (!match) throw new Error("workflow policy line is not canonical");
  const [, expected, relative] = match;
  const working = await readFile(relative, "utf8");
  const canonical = working.replaceAll("\r\n", "\n");
  const actual = createHash("sha256").update(canonical).digest("hex");
  if (actual !== expected) throw new Error(`workflow policy digest mismatch for ${relative}`);
  if (canonical.includes("\r")) throw new Error(`workflow contains a non-canonical carriage return: ${relative}`);
}

const bootstrapManifest = await readFile("deploy/root-bootstrap.sha256", "utf8");
const bootstrapLines = bootstrapManifest.trimEnd().split("\n");
const bootstrapPaths = bootstrapLines.map((line) => line.slice(66));
if (JSON.stringify(bootstrapPaths) !== JSON.stringify(expectedBootstrap)) {
  throw new Error("bootstrap manifest does not contain the exact reviewed bootstrap set");
}
for (const line of bootstrapLines) {
  const match = /^([0-9a-f]{64})  (deploy\/[A-Za-z0-9._/-]+)$/.exec(line);
  if (!match) throw new Error("bootstrap manifest line is not canonical");
  const [, expected, relative] = match;
  const working = await readFile(relative, "utf8");
  const canonical = working.replaceAll("\r\n", "\n");
  const actual = createHash("sha256").update(canonical).digest("hex");
  if (actual !== expected) throw new Error(`bootstrap digest mismatch for ${relative}`);
  if (canonical.includes("\r")) throw new Error(`bootstrap asset contains a non-canonical carriage return: ${relative}`);
}

console.log("control asset manifest tests: ok");
