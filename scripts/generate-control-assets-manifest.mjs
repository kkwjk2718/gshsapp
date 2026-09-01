import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "deploy", "control-assets.sha256");
const bootstrapManifestPath = path.join(root, "deploy", "root-bootstrap.sha256");
const workflowManifestPath = path.join(root, "deploy", "workflow-policy.sha256");
const files = [
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
const workflowFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-prod.yml",
  ".github/workflows/preproduction-rehearsal.yml",
  ".github/workflows/production-health-monitor.yml",
  ".github/workflows/publish-and-deploy-test.yml",
  ".github/workflows/publish-production-release.yml",
  ".github/workflows/secret-scan.yml",
];
const bootstrapFiles = [
  "deploy/control-assets.sha256",
  "deploy/install-backup-timer.sh",
  "deploy/install-deploy-service.sh",
  "deploy/install-root-operations.sh",
];

const readCanonical = async (relative) => {
  const contents = await readFile(path.join(root, relative));
  const canonical = Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  if (canonical.includes(13)) {
    throw new Error(`${relative} contains a non-canonical carriage return`);
  }
  return canonical;
};

const renderManifest = async (paths, replacements = new Map()) => {
  const lines = [];
  for (const relative of paths) {
    const contents = replacements.get(relative) ?? (await readCanonical(relative));
    lines.push(`${createHash("sha256").update(contents).digest("hex")}  ${relative}`);
  }
  return `${lines.join("\n")}\n`;
};

const workflowRendered = await renderManifest(workflowFiles);
const rendered = await renderManifest(
  files,
  new Map([["deploy/workflow-policy.sha256", Buffer.from(workflowRendered, "utf8")]]),
);
const bootstrapRendered = await renderManifest(
  bootstrapFiles,
  new Map([["deploy/control-assets.sha256", Buffer.from(rendered, "utf8")]]),
);

if (process.argv.includes("--check")) {
  const [current, bootstrapCurrent, workflowCurrent] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(bootstrapManifestPath, "utf8"),
    readFile(workflowManifestPath, "utf8"),
  ]);
  if (current !== rendered) {
    throw new Error("deploy/control-assets.sha256 is stale; regenerate it from reviewed controls");
  }
  if (bootstrapCurrent !== bootstrapRendered) {
    throw new Error("deploy/root-bootstrap.sha256 is stale; regenerate it from reviewed bootstrap assets");
  }
  if (workflowCurrent !== workflowRendered) {
    throw new Error("deploy/workflow-policy.sha256 is stale; regenerate it from reviewed hosted workflows");
  }
} else {
  await writeFile(manifestPath, rendered, "utf8");
  await writeFile(bootstrapManifestPath, bootstrapRendered, "utf8");
  await writeFile(workflowManifestPath, workflowRendered, "utf8");
}
