import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(file: string) {
  return fs.readFile(file, "utf8");
}

describe("deployment workflow provenance boundaries", () => {
  it.each([
    ".github/workflows/preproduction-rehearsal.yml",
    ".github/workflows/deploy-prod.yml",
  ])("verifies candidate provenance on GitHub-hosted infrastructure before self-hosted jobs in %s", async (file) => {
    const workflow = await source(file);

    expect(workflow).toMatch(/prepare:\r?\n(?:\s+if:[^\r\n]+\r?\n)?\s+runs-on: ubuntu-latest/u);
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("attestations: read");
    expect(workflow).toContain("TRUSTED_CONTROL_SHA: ${{ github.sha }}");
    expect(workflow).toContain("./deploy/verify-image-provenance.sh");
    expect(workflow).toContain("image_digest: ${{ steps.provenance.outputs.image_digest }}");
    expect(workflow).toContain("control_sha: ${{ steps.provenance.outputs.control_sha }}");
    expect(workflow).toContain("ref: ${{ needs.prepare.outputs.control_sha }}");
    expect(workflow).not.toContain("ref: ${{ needs.prepare.outputs.source_sha }}");

    const firstSelfHosted = workflow.indexOf("- self-hosted");
    const provenance = workflow.indexOf("./deploy/verify-image-provenance.sh");
    expect(firstSelfHosted).toBeGreaterThan(provenance);
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

  it("attests the exact image digest published from main on a GitHub-hosted runner", async () => {
    const workflow = await source(".github/workflows/publish-and-deploy-test.yml");

    expect(workflow).toMatch(/publish:\r?\n\s+runs-on: ubuntu-latest/u);
    expect(workflow).toMatch(/uses: actions\/attest@[a-f0-9]{40}\b/u);
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("subject-digest: ${{ steps.build.outputs.digest }}");
    expect(workflow).toContain("subject-name: docker.io/kkwjk2718git/gshsapp");
  });

  it("binds production preflight and all deploys to the verified runtime digest", async () => {
    const production = await source(".github/workflows/deploy-prod.yml");
    const rehearsal = await source(".github/workflows/preproduction-rehearsal.yml");
    const automaticTest = await source(".github/workflows/publish-and-deploy-test.yml");
    const compose = await source("deploy/compose.yml");

    expect(production).toContain("EXPECTED_IMAGE_DIGEST: ${{ needs.prepare.outputs.image_digest }}");
    expect(production).toContain('payload.get("imageDigest") != os.environ["EXPECTED_IMAGE_DIGEST"]');
    expect(production).toContain("IMAGE_DIGEST: ${{ needs.prepare.outputs.image_digest }}");
    expect(rehearsal).toContain("EXPECTED_IMAGE_DIGEST: ${{ needs.prepare.outputs.image_digest }}");
    expect(automaticTest).toContain("EXPECTED_IMAGE_DIGEST: ${{ needs.publish.outputs.image_digest }}");
    expect(compose).toContain("APP_IMAGE_DIGEST: ${IMAGE_DIGEST:?IMAGE_DIGEST is required}");
  });

  it("requires a successful rehearsal proof for the exact candidate and digest", async () => {
    const production = await source(".github/workflows/deploy-prod.yml");
    const rehearsal = await source(".github/workflows/preproduction-rehearsal.yml");

    expect(production).toContain("rehearsal_run_id:");
    expect(production).toContain("actions: read");
    expect(production).toContain("./deploy/verify-rehearsal-proof.sh");
    expect(production).toContain("REHEARSAL_RUN_ID: ${{ inputs.rehearsal_run_id }}");
    expect(production).toContain("CONTROL_SHA: ${{ steps.provenance.outputs.control_sha }}");
    expect(rehearsal).toMatch(/proof:\r?\n\s+runs-on: ubuntu-latest/u);
    expect(rehearsal).toMatch(/proof:[\s\S]*?needs:[\s\S]*?- report[\s\S]*?actions\/upload-artifact@[a-f0-9]{40}\b/u);
    expect(rehearsal).toContain("preproduction-rehearsal-proof-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(rehearsal).toContain("candidateSha");
    expect(rehearsal).toContain("imageDigest");
    expect(rehearsal).toContain("controlSha");
  });

  it("passes each environment's canonical application origin to deployment policy", async () => {
    const production = await source(".github/workflows/deploy-prod.yml");
    const rehearsal = await source(".github/workflows/preproduction-rehearsal.yml");
    const automaticTest = await source(".github/workflows/publish-and-deploy-test.yml");

    expect(production).toContain("EXPECTED_APP_ORIGIN: https://gshs.app");
    expect(production).toContain('export EXPECTED_APP_ORIGIN="$EXPECTED_APP_ORIGIN"');
    for (const workflow of [rehearsal, automaticTest]) {
      expect(workflow).toContain("EXPECTED_APP_ORIGIN: https://test.gshs.app");
      expect(workflow).toContain('export EXPECTED_APP_ORIGIN="$EXPECTED_APP_ORIGIN"');
    }
  });

  it("keeps the trusted-container backup path while isolating the first-deployment bootstrap", async () => {
    const deploy = await source("deploy/deploy.sh");
    const backup = await source("deploy/predeployment-backup.sh");

    expect(deploy).toContain("predeployment-backup.sh");
    expect(backup).toContain('docker exec "$CONTAINER_NAME"');
    expect(backup).toContain("--network none");
    expect(backup).toContain("/input/bootstrap.tar.gz,readonly");
    expect(backup).not.toContain("dst=/app/data");
  });
});
