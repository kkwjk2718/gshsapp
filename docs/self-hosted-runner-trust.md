# Self-hosted runner trust anchor

Repository-level self-hosted runners must not be enabled for GSHS.app until this trust anchor is installed and verified. A runner label such as `gshs-test` or `gshs-prod` selects a machine, but does not by itself prove that the assigned job came from the trusted `main` workflow definition.

GitHub runs `ACTIONS_RUNNER_HOOK_JOB_STARTED` synchronously before workflow steps. A non-zero hook exit prevents the job from running. GSHS.app uses that host-side hook as a fail-closed boundary outside the checked-out repository.

Official references:

- [Run scripts before or after a self-hosted runner job](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts)
- [GitHub Actions default variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
- [Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)

## Enforced policy

Every accepted job must have all of the following trusted context:

- repository: `kkwjk2718/gshsapp`
- ref: `refs/heads/main`
- protected ref: `GITHUB_REF_PROTECTED=true`
- workflow ref: an allowlisted `.github/workflows/*.yml@refs/heads/main`
- workflow SHA: the same 40-hex SHA as `GITHUB_SHA`
- runner: Linux self-hosted
- no pull-request head or base ref
- an event allowed for that exact workflow

Allowlisted test-runner jobs:

| Workflow | Events |
| --- | --- |
| `publish-and-deploy-test.yml` | `push` |
| `preproduction-rehearsal.yml` | `workflow_dispatch` |
| `scheduled-backup-test.yml` | `schedule`, `workflow_dispatch` |

Allowlisted production-runner jobs:

| Workflow | Events |
| --- | --- |
| `deploy-prod.yml` | `workflow_dispatch` |
| `scheduled-backup-prod.yml` | `schedule`, `workflow_dispatch` |

Branches, tags, pull-request refs, forks, renamed workflows, missing context, unprotected `main`, and every unlisted event fail before checkout or any workflow command runs.

## Prerequisites

1. Configure branch protection or a repository ruleset that applies to `main`; otherwise the hook intentionally rejects `GITHUB_REF_PROTECTED=false`.
2. Use a dedicated non-root service account for each runner.
3. Identify the canonical runner application directory and exact systemd service unit.
4. Review the installer and policy from the exact audited commit. Never run a root installer from an unreviewed branch or tag.

Useful read-only discovery commands:

```bash
systemctl list-units --type=service 'actions.runner.kkwjk2718-gshsapp.*'
systemctl show actions.runner.kkwjk2718-gshsapp.gshs-test.service --property=User,FragmentPath,LoadState,ActiveState
readlink -f /home/actions/actions-runner
```

Adjust the unit and runner directory to the actual host. The installer rejects non-canonical paths, symlinked runner roots, unrelated service names, root-runner services, and unsafe existing trust-anchor paths.

## Installation

Test runner example:

```bash
sudo ./deploy/install-runner-trust-hook.sh \
  --runner-root /home/actions/actions-runner \
  --runner-service actions.runner.kkwjk2718-gshsapp.gshs-test.service \
  --role test
```

Production runner example:

```bash
sudo ./deploy/install-runner-trust-hook.sh \
  --runner-root /home/actions/actions-runner \
  --runner-service actions.runner.kkwjk2718-gshsapp.gshs-prod.service \
  --role prod
```

The installer stops the runner before changing its trust boundary, then:

- installs the hook and policy below `/usr/local/lib/gshsapp-actions-runner` as `root:root` mode `0755`;
- backs up the pre-existing runner `.env` once below `/var/lib/gshsapp-runner-trust/<unit>/` as `root:root` mode `0600`;
- replaces the runner `.env` with only the absolute `ACTIONS_RUNNER_HOOK_JOB_STARTED` path as `root:<runner-group>` mode `0640`;
- installs a root-owned systemd drop-in that fixes a safe `PATH` and makes both the hook directory and runner `.env` read-only inside the service namespace;
- reloads systemd, starts the service, and performs the same strict verification used for ongoing checks.

The old `.env` is not preserved in the active runner because an earlier untrusted job may have inserted environment overrides. If audited proxy or CA settings are still required, copy only those reviewed values into a separate root-owned systemd drop-in. Never restore `PATH`, `ACTIONS_RUNNER_HOOK_*`, `BASH_ENV`, or other execution controls from the backup.

## Required verification

Run after installation, runner upgrades, systemd changes, host maintenance, and before any test or production deployment:

```bash
sudo ./deploy/verify-runner-trust-hook.sh \
  --runner-root /home/actions/actions-runner \
  --runner-service actions.runner.kkwjk2718-gshsapp.gshs-test.service \
  --role test
```

Use `--role prod` and the production unit on the production host. Verification fails unless:

- hook, policy, `.env`, and systemd drop-in are regular non-symlink files with exact owner/group/mode;
- installed content exactly matches the reviewed templates and selected role;
- the service is loaded, active, and non-root;
- systemd's effective `ReadOnlyPaths` still protects the hook directory and `.env`.

Also inspect the effective service definition:

```bash
systemctl cat actions.runner.kkwjk2718-gshsapp.gshs-test.service
systemctl show actions.runner.kkwjk2718-gshsapp.gshs-test.service --property=User,ActiveState,ReadOnlyPaths
```

The deployment gate is closed unless verification prints `runner trust hook verification: ok` on both required runner hosts. An attempted job from a branch, tag, pull request, or non-allowlisted workflow must fail in the workflow log under `Set up runner`, before repository steps execute.

## Policy updates and recovery

The installed policy is deliberately not updated by a workflow. Adding or renaming a self-hosted workflow requires security review, tests, merge to protected `main`, and a new manual root installation on the affected host.

If verification fails:

1. Keep the runner service stopped or remove its repository assignment.
2. Inspect the root-owned files and effective systemd properties; do not weaken the verifier.
3. Reinstall only from a reviewed protected-main commit.
4. Re-run verification before returning the runner online.

The backup under `/var/lib/gshsapp-runner-trust` is for forensic review and recovery of individually audited network settings. It must never be copied wholesale back to the active runner `.env`.
