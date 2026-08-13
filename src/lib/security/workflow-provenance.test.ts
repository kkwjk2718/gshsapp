import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(file: string) {
  return fs.readFile(file, "utf8");
}

describe("workflow provenance boundaries", () => {
  it.each([
    [".github/workflows/preproduction-rehearsal.yml", "public_health:"],
    [".github/workflows/deploy-prod.yml", "preproduction_health:"],
  ])("verifies candidate provenance from trusted main controls before public checks in %s", async (file, publicCheck) => {
    const workflow = await source(file);

    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("attestations: read");
    expect(workflow).toContain("TRUSTED_CONTROL_SHA: ${{ github.sha }}");
    expect(workflow).toContain("bash ./deploy/verify-image-provenance.sh");
    expect(workflow).toContain("image_digest: ${{ steps.provenance.outputs.image_digest }}");
    expect(workflow).toContain("control_sha: ${{ steps.provenance.outputs.control_sha }}");
    const verificationPrefix = workflow.slice(0, workflow.indexOf(publicCheck));
    expect(verificationPrefix).not.toContain("ref: ${{ needs.candidate.outputs.source_sha }}");

    expect(workflow.indexOf("bash ./deploy/verify-image-provenance.sh")).toBeLessThan(
      workflow.indexOf(publicCheck),
    );
  });

  it("verifies the exact Docker Hub manifest bytes against GitHub's attestation API", async () => {
    const verifier = await source("deploy/verify-image-provenance.sh");
    const publisher = await source(".github/workflows/publish-and-deploy-test.yml");

    expect(verifier).toContain("registry-1.docker.io/v2/${docker_repository}/manifests/${image_tag}");
    expect(verifier).toContain('gh attestation verify "$manifest_file"');
    expect(verifier).not.toContain("--bundle-from-oci");
    expect(verifier).not.toMatch(/gh attestation verify "oci:\/\//u);
    expect(publisher).not.toContain("push-to-registry: true");
    expect(publisher).not.toContain("create-storage-record:");
  });

  it("attests the exact digest published from protected main", async () => {
    const workflow = await source(".github/workflows/publish-and-deploy-test.yml");

    expect(workflow).toMatch(/publish:\r?\n[\s\S]*?environment:\r?\n\s+name: publish/u);
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toMatch(/uses: actions\/attest@[a-f0-9]{40}\b/u);
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("subject-digest: ${{ steps.build.outputs.digest }}");
    expect(workflow).toContain("subject-name: docker.io/kkwjk2718git/gshsapp");
  });

  it("binds public verification to the requested runtime version and digest", async () => {
    const production = await source(".github/workflows/deploy-prod.yml");
    const preproduction = await source(".github/workflows/preproduction-rehearsal.yml");

    for (const workflow of [production, preproduction]) {
      expect(workflow).toContain("EXPECTED_VERSION: ${{ needs.candidate.outputs.image_tag }}");
      expect(workflow).toContain("EXPECTED_IMAGE_DIGEST: ${{ needs.candidate.outputs.image_digest }}");
      expect(workflow).toContain('health.get("version") != os.environ["EXPECTED_VERSION"]');
      expect(workflow).toContain('health.get("imageDigest") != os.environ["EXPECTED_IMAGE_DIGEST"]');
    }
  });

  it("fails public verification when a request leaves the canonical origin", async () => {
    const production = await source(".github/workflows/deploy-prod.yml");
    const preproduction = await source(".github/workflows/preproduction-rehearsal.yml");

    for (const workflow of [production, preproduction]) {
      expect(workflow).toContain("urllib.parse.urlsplit(response.geturl())");
      expect(workflow).toContain("expected_origin.hostname");
      expect(workflow).toContain("escaped the expected origin");
    }
  });

  it("uses only anonymous public browser checks after exact health verification", async () => {
    const production = await source(".github/workflows/deploy-prod.yml");
    const preproduction = await source(".github/workflows/preproduction-rehearsal.yml");

    for (const [workflow, publicCheck] of [
      [production, "production_health:"],
      [preproduction, "public_health:"],
    ] as const) {
      expect(workflow).toContain("npx playwright test e2e/public.spec.ts");
      expect(workflow).not.toContain("E2E_ADMIN_");
      expect(workflow.indexOf("public_e2e:")).toBeGreaterThan(workflow.indexOf(publicCheck));
    }
  });

  it("binds the production semver release to the exact publicly verified commit", async () => {
    const production = await source(".github/workflows/deploy-prod.yml");
    const publisher = await source(".github/workflows/publish-production-release.yml");

    expect(production).not.toContain("contents: write");
    expect(production).toContain("gshsapp-production-public-proof");
    expect(production.indexOf("proof:")).toBeGreaterThan(production.indexOf("public_e2e:"));
    expect(publisher).toContain("workflow_run:");
    expect(publisher).toContain("github.event.workflow_run.path == '.github/workflows/deploy-prod.yml'");
    expect(publisher).toContain("main.get(\"object\", {}).get(\"sha\") == control_sha");
    expect(publisher).toContain("verify:\n");
    expect(publisher).toContain("permissions:\n      actions: read\n      attestations: read\n      contents: read");
    expect(publisher).toContain("permissions:\n      actions: read\n      contents: write");
    expect(publisher).toContain("gshsapp-production-release-authorization");
    expect(publisher).toContain("/contents/package.json?ref=");
    expect(publisher).not.toContain("ref: ${{ steps.proof.outputs.candidate_sha }}");
    expect(publisher).toContain("target_commitish=\"$CANDIDATE_SHA\"");
    expect(publisher).toContain("is already bound to another commit");
    expect(publisher).toContain('if error.code==404: return None');
    expect(publisher).toContain("check_release_state true >/dev/null");
    expect(publisher).toContain("verify_live_production() {");
    expect(publisher).toContain("class RejectRedirects");
    expect(publisher).toContain('response.read(65537)');
    const finalLiveCheck = publisher.lastIndexOf("verify_live_production\n");
    const releaseMutation = Math.min(
      ...["gh api --method PATCH", "gh api --method POST"]
        .map((needle) => publisher.indexOf(needle))
        .filter((index) => index >= 0),
    );
    expect(finalLiveCheck).toBeGreaterThan(releaseMutation);
    expect(publisher.indexOf("verify_live_production\n", publisher.indexOf('notes="$(printf'))).toBeLessThan(releaseMutation);
    expect(publisher).not.toMatch(/git\/ref\/tags\/\$release_tag[^\n]*\|\| true/u);
  });

  it("uses only the reviewed host snapshot while isolating candidate validation", async () => {
    const deploy = await source("deploy/deploy.sh");
    const backup = await source("deploy/predeployment-backup.sh");

    expect(deploy).toContain("predeployment-backup.sh");
    expect(deploy).toContain("quiesce_web_container");
    expect(deploy).toContain("remove_preserved_web_container");
    expect(backup).not.toContain("TRUSTED_BACKUP_IMAGE_ID");
    expect(backup).toContain("--network none");
    expect(backup).toContain("/input/bootstrap.tar.gz,readonly");
    const candidateValidation = backup.slice(backup.indexOf("# The candidate receives only"));
    expect(candidateValidation).not.toContain("dst=/app/data");
  });
});
