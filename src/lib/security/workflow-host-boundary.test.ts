import fs from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type WorkflowJob = {
  "runs-on"?: unknown;
  environment?: string | { name?: string };
  if?: string;
  permissions?: Record<string, string>;
  steps?: Array<Record<string, unknown>>;
};

type Workflow = {
  name?: string;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
};

const workflowsDirectory = path.resolve(".github/workflows");

async function readWorkflow(fileName: string) {
  const source = await fs.readFile(path.join(workflowsDirectory, fileName), "utf8");
  return { source, workflow: load(source) as Workflow };
}

async function readAllWorkflows() {
  const files = (await fs.readdir(workflowsDirectory))
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort();
  return Promise.all(files.map(async (file) => ({ file, ...(await readWorkflow(file)) })));
}

function environmentName(job: WorkflowJob) {
  return typeof job.environment === "string" ? job.environment : job.environment?.name;
}

function stepCommands(job: WorkflowJob) {
  return (job.steps ?? [])
    .map((step) => (typeof step.run === "string" ? step.run : ""))
    .filter(Boolean)
    .join("\n");
}

describe("GitHub-hosted workflow trust boundary", () => {
  it("requires independent owners for every security-critical application boundary", async () => {
    const codeowners = await fs.readFile(path.resolve(".github/CODEOWNERS"), "utf8");
    const owners = "@kkwjk2718 @kkwjk9534";

    for (const protectedPath of [
      "/.github/workflows/",
      "/deploy/",
      "/package.json",
      "/package-lock.json",
      "/next.config.mjs",
      "/eslint.config.mjs",
      "/vitest.config.mjs",
      "/playwright.config.ts",
      "/tsconfig.json",
      "/scripts/",
      "/prisma/migrations/",
      "/prisma/schema.prisma",
      "/scripts/migrate-production.mjs",
      "/src/auth.ts",
      "/src/auth.config.ts",
      "/proxy.ts",
      "/src/app/",
      "/src/lib/",
    ]) {
      expect(codeowners, protectedPath).toContain(`${protectedPath} ${owners}`);
    }
  });

  it("keeps every job on a GitHub-hosted runner without host mutation commands", async () => {
    const workflows = await readAllWorkflows();

    for (const { file, workflow } of workflows) {
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        expect(job["runs-on"], `${file}:${jobName}`).toBe("ubuntu-latest");
        const commands = stepCommands(job).replace(
          /^\s*sudo -n bash deploy\/(?:control-update-recovery|offsite-mount-pin)\.test\.sh\s*$/gmu,
          "",
        );
        expect(commands, `${file}:${jobName}`).not.toMatch(
          /(?:^|\s)(?:sudo|ssh|scp)(?:\s|$)|\/opt\/gshsapp|(?:^|\s)\.\/(?:deploy|restore-drill|run-scheduled-backup)\.sh(?:\s|$)|\bdocker\s+(?:compose|exec|run)\b|(?:install-runner|runner-(?:job-policy|trust-hook))/u,
        );
      }
    }
  });

  it("permits root only for the exact disposable mount-namespace recovery test", async () => {
    const sudoCommands: string[] = [];
    for (const { file, workflow } of await readAllWorkflows()) {
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        for (const command of stepCommands(job).split("\n").map((line) => line.trim())) {
          if (command.startsWith("sudo ")) sudoCommands.push(`${file}:${jobName}:${command}`);
        }
      }
    }
    expect(sudoCommands).toEqual([
      "ci.yml:test:sudo -n bash deploy/control-update-recovery.test.sh",
      "ci.yml:test:sudo -n bash deploy/offsite-mount-pin.test.sh",
    ]);
  });

  it("has no Actions entrypoint for host-owned scheduled backups", async () => {
    const files = await fs.readdir(workflowsDirectory);
    expect(files).not.toContain("scheduled-backup-prod.yml");
    expect(files).not.toContain("scheduled-backup-test.yml");

    for (const { file, source } of await readAllWorkflows()) {
      expect(source, file).not.toMatch(/run-scheduled-backup|Scheduled Backup/u);
    }
  });

  it("grants registry and OIDC credentials only to protected push-main publishing", async () => {
    const { workflow: publisher } = await readWorkflow("publish-and-deploy-test.yml");
    expect(publisher.on).toEqual({ push: { branches: ["main"] } });

    const publishJob = publisher.jobs?.publish;
    expect(publishJob).toBeDefined();
    expect(environmentName(publishJob!)).toBe("publish");
    expect(publishJob?.if).toContain("github.event_name == 'push'");
    expect(publishJob?.if).toContain("github.ref == 'refs/heads/main'");
    expect(publishJob?.permissions?.["id-token"]).toBe("write");
    expect(publishJob?.permissions?.attestations).toBe("write");

    const registryCredentialJobs: string[] = [];
    const oidcJobs: string[] = [];
    for (const { file, workflow } of await readAllWorkflows()) {
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        const serialized = JSON.stringify(job);
        if (/secrets\.DOCKERHUB_(?:USERNAME|TOKEN)/u.test(serialized)) {
          registryCredentialJobs.push(`${file}:${jobName}`);
        }
        if (job.permissions?.["id-token"] === "write") oidcJobs.push(`${file}:${jobName}`);
      }
    }

    expect(registryCredentialJobs).toEqual(["publish-and-deploy-test.yml:publish"]);
    expect(oidcJobs).toEqual(["publish-and-deploy-test.yml:publish"]);
  });

  it("never exposes a custom secret to an arbitrary workflow_dispatch ref", async () => {
    for (const { file, source, workflow } of await readAllWorkflows()) {
      const customSecrets = [...source.matchAll(/secrets\.([A-Z0-9_]+)/gu)]
        .map((match) => match[1])
        .filter((name) => name !== "GITHUB_TOKEN");
      if (customSecrets.length === 0) continue;

      expect(workflow.on?.workflow_dispatch, `${file}: ${customSecrets.join(", ")}`).toBeUndefined();
    }
  });

  it.each([
    ["preproduction-rehearsal.yml", "preproduction-verification"],
    ["deploy-prod.yml", "production-verification"],
  ])("makes %s a protected public verification workflow, not a host operation", async (file, environment) => {
    const { source, workflow } = await readWorkflow(file);
    const jobs = workflow.jobs ?? {};

    expect(Object.keys(jobs)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/deploy|restore|backup/u)]),
    );
    expect(source).not.toMatch(/\$\{\{\s*secrets\./u);
    if (file === "deploy-prod.yml") {
      expect(source).not.toContain("contents: write");
      expect(source).toContain("gshsapp-production-public-proof");
    } else {
      expect(source).not.toContain("contents: write");
    }
    expect(source).not.toContain("E2E_ADMIN_");
    expect(source).toContain("npx playwright test e2e/public.spec.ts");
    expect(Object.values(jobs).some((job) => environmentName(job) === environment)).toBe(true);
  });

  it("never persists browser recordings or broad credential-bearing E2E output", async () => {
    for (const file of [
      "publish-and-deploy-test.yml",
      "preproduction-rehearsal.yml",
      "deploy-prod.yml",
    ]) {
      const { source } = await readWorkflow(file);
      if (file === "preproduction-rehearsal.yml") {
        expect(source, file).toContain("actions/upload-artifact@");
        expect(source, file).toContain("preproduction-proof-");
      } else if (file === "deploy-prod.yml") {
        expect(source, file).toContain("actions/upload-artifact@");
        expect(source, file).toContain("production-proof-");
      } else {
        expect(source, file).not.toContain("actions/upload-artifact@");
      }
      expect(source, file).not.toContain("E2E_ADMIN_");
      expect(source, file).not.toMatch(/npm run test:e2e(?::smoke)?/u);
      expect(source, file).not.toMatch(/playwright-report|test-results/u);
    }
  });

  it("keeps write-capable release publication on a default-branch workflow_run boundary", async () => {
    const { source, workflow } = await readWorkflow("publish-production-release.yml");
    expect(workflow.on?.workflow_run).toBeDefined();
    expect(workflow.on?.workflow_dispatch).toBeUndefined();
    expect(source).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(source).toContain("github.event.workflow_run.path == '.github/workflows/deploy-prod.yml'");
    expect(source).toContain('run.get("conclusion") == "success"');
    expect(source).toContain('main.get("object", {}).get("sha") == control_sha');
    expect(workflow.jobs?.verify?.permissions?.contents).toBe("read");
    expect(workflow.jobs?.verify?.permissions?.attestations).toBe("read");
    expect(workflow.jobs?.release?.permissions?.contents).toBe("write");
    expect(workflow.jobs?.release?.permissions?.attestations).toBeUndefined();
    expect(environmentName(workflow.jobs!.release!)).toBe("production-verification");
  });

  it("never executes checked-out repository code in a contents-write job", async () => {
    for (const { file, workflow } of await readAllWorkflows()) {
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        const contentsPermission = job.permissions?.contents ?? workflow.permissions?.contents;
        if (contentsPermission !== "write") continue;

        for (const [stepIndex, step] of (job.steps ?? []).entries()) {
          const label = `${file}:${jobName}:step-${stepIndex + 1}`;
          const uses = typeof step.uses === "string" ? step.uses : "";
          const run = typeof step.run === "string" ? step.run : "";

          expect(uses, label).not.toMatch(/^actions\/checkout@/u);
          expect(uses, label).not.toMatch(/^\.\//u);
          expect(step["working-directory"], label).toBeUndefined();
          expect(run, label).not.toMatch(
            /(?:^|\s)(?:bash|sh|node|npm|npx|python3?)\s+(?:\.\/)?(?:deploy|scripts|src)\//u,
          );
        }
      }
    }
  });

  it("reads the production monitor webhook only inside a protected environment", async () => {
    const { source, workflow } = await readWorkflow("production-health-monitor.yml");
    expect(source).toContain("secrets.MONITOR_ALERT_WEBHOOK_URL");
    expect(environmentName(workflow.jobs!.monitor!)).toBe("production-monitor");
    expect(workflow.on?.workflow_dispatch).toBeUndefined();
  });
});
