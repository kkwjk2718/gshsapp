# Self-hosted runner trust anchor

Repository self-hosted runners stay offline until this procedure succeeds. A runner label only selects a host; it does not prove the workflow, runner executable, service definition, or previously persisted credentials are trustworthy.

GitHub invokes `ACTIONS_RUNNER_HOOK_JOB_STARTED` before workflow steps. GSHS.app combines that fail-closed hook with a clean runner reinstall, root-owned executable manifests, a root-owned systemd boundary, and a single approved protected-`main` SHA per runner role.

Official references:

- [Run scripts before or after a self-hosted runner job](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts)
- [Self-hosted runner software updates](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#runner-software-updates-on-self-hosted-runners)
- [Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)

## Mandatory clean bootstrap

Treat every existing runner, repository checkout, registration credential, and runner binary as compromised. Do not hash the existing installation and call it trusted.

1. Stop the runner and remove its repository assignment. Rotate the registration credential.
2. Reimage the runner host, or reinstall the runner into a new empty root-owned application directory from an official GitHub runner release archive.
3. On a separate trusted administration workstation, verify the vendor-published archive checksum. Extract and register with a fresh one-time token, `--disableupdate`, the exact `_work` directory, and the dedicated role account (`gshs-runner-test` or `gshs-runner-prod`). Never reuse `.runner`, `.credentials`, `.credentials_rsaparams`, or `.service` from the old runner. The account must not have broad `sudo`, Docker socket/group, LXD/libvirt/KVM, disk, journal, ambient capability, or any other root-equivalent/host-sensitive access. The verifier checks both group membership and actual Docker-socket access and rejects broad/root-equivalent sudo listings. Deployment and backups must cross a separately audited root-owned broker boundary; never give the workflow runner direct Docker daemon access.

   If a sudo transport is used for that broker, the only sudoers entry may name `/usr/local/sbin/gshsapp-runner-broker`, root-owned mode `0755`, with fixed/no caller-controlled command selection. It must not grant a shell, `SETENV`, wildcards, Docker/Compose, interpreters, editors, file-copy tools, arbitrary arguments, or environment preservation. The root-owned broker independently authenticates the approved SHA/digest and trusted asset digests, accepts only closed deployment/backup operations, and is the only component allowed to write root-owned `/opt/gshsapp` or reach the Docker daemon. After auditing it, root creates `/etc/gshsapp-runner-trust/broker-enabled` mode `0444`. The installer/verifier require both artifacts and reject runner write access to `/opt/gshsapp`; until the broker is installed and audited, activation is blocked.
4. From that clean, stopped installation, create two canonical manifests. Paths are relative to the runner root and use two spaces after the lowercase digest:

   ```bash
   install -d -m 0700 /media/trusted/manifests
   cd /srv/gshs-runner-test
   find . \
     -path './_work' -prune -o \
     -path './_diag' -prune -o \
     -type f \
     ! -name '.runner' \
     ! -name '.credentials' \
     ! -name '.credentials_rsaparams' \
     ! -name '.service' \
     ! -name '.env' \
     ! -name '.path' \
     -printf '%P\0' \
     | sort -z \
     | xargs -0 sha256sum > /media/trusted/manifests/runner-app.sha256

   sha256sum .runner .credentials .credentials_rsaparams .service \
     | sed 's/ \*/  /' > /media/trusted/manifests/runner-registration.sha256
   ```

   `runner-app.sha256` must include `runsvc.sh`, `bin/Runner.Listener`, and `bin/Runner.Worker`. It must cover the complete immutable application tree and contain no symlink. `runner-registration.sha256` must contain exactly the four named files.
5. Still offline, make the application tree root-owned and non-writable by the service account. Keep only `_work` and `_diag` owned by the dedicated runner account. The installer intentionally refuses to bless an application tree that is still writable by the account which executes workflows:

   ```bash
   while read -r _digest relative_path; do
     sudo chown root:root -- "$relative_path"
     sudo chmod go-w -- "$relative_path"
   done < /media/trusted/manifests/runner-app.sha256

   sudo find "$PWD" \
     -path "$PWD/_work" -prune -o \
     -path "$PWD/_diag" -prune -o \
     -type d -exec chown root:root -- {} + -exec chmod go-w -- {} +
   sudo chown -R gshs-runner-test:<runner-group> _work _diag
   sudo chmod 0700 _work _diag
   ```

   Substitute the production account on the production runner. The runner root and every ancestor must also be root-owned and not group/world writable.
6. Put `install-runner-trust-hook.sh`, `verify-runner-trust-hook.sh`, and `runner-job-policy.sh` from the reviewed protected-main commit on read-only trusted media. Create `bootstrap.sha256` over exactly those three files.
7. Transfer the three manifests over the trusted media. Independently record the SHA256 of each manifest in a separate trusted channel. A digest copied from the same untrusted server or repository checkout is not an out-of-band check.

The installer rejects a bootstrap file unless it matches the externally supplied bootstrap-manifest digest. It also rejects a runner or registration tree unless it matches the independently supplied manifest digest and content.

## Installation

Example for the test runner:

```bash
sudo /media/trusted/install-runner-trust-hook.sh \
  --runner-root /srv/gshs-runner-test \
  --runner-service actions.runner.kkwjk2718-gshsapp.gshs-test.service \
  --role test \
  --runner-manifest /media/trusted/manifests/runner-app.sha256 \
  --runner-manifest-sha256 <OUT_OF_BAND_SHA256> \
  --registration-manifest /media/trusted/manifests/runner-registration.sha256 \
  --registration-manifest-sha256 <OUT_OF_BAND_SHA256> \
  --bootstrap-manifest /media/trusted/bootstrap.sha256 \
  --bootstrap-manifest-sha256 <OUT_OF_BAND_SHA256>
```

Use the production unit, `/srv/gshs-runner-prod`, and `--role prod` for production. The exact systemd service must use the corresponding dedicated account, execute `<runner-root>/runsvc.sh`, and set `WorkingDirectory` to the runner root. Its unit fragment must be `/etc/systemd/system/<unit>` and root-owned mode `0644`.

The installer verifies all inputs before stopping the service. It then:

- installs the hook, policy, application manifest, clean-registration manifest, and activation marker as root-owned files;
- verifies the already root-owned immutable application, root-owns the clean registration state, sets a fixed `.path`, and replaces `.env` with only the job-started hook;
- makes the whole runner root read-only in the service namespace, allowing writes only in canonical, non-symlink `_work` and `_diag` directories owned by the dedicated runner account at mode `0700`;
- sets `KillMode=control-group` and verifies that the effective service has only the fixed `PATH`, no environment files, and kills every workflow child process when stopped;
- verifies the runner account has no root-equivalent groups or service capabilities, plus effective service user, fragment, exact start command with no pre/post commands, working directory, absence of root/image/bind namespace remapping, path sets, file ownership/modes, complete application hashes, clean-registration hashes, and `--disableupdate` registration;
- starts the runner only after the activation marker exists.

Before the first stop, the installer persistently installs and loads the root-owned `ConditionPathExists` drop-in. It then removes the activation marker and stops the service before any post-stop verification or mutation. The drop-in also runs the root-owned verifier as a systemd `+`-prefixed `ExecStartPre`, so every boot/restart re-attests the trust chain with root privileges before the unprivileged runner process is created. Thus an interruption after marker creation cannot start an unverified runner. If any later operation fails, the installer also removes the marker, runtime-masks the service, reloads systemd, stops it, and confirms it is inactive. If a normal stop fails, it sends `SIGKILL` to the entire service control group and checks again. An incomplete quarantine is reported as a critical failure requiring immediate host isolation.

Automatic runner updates are disabled because a self-update would replace root-verified binaries. GitHub requires operators to install runner updates promptly (normally within 30 days). Every update is a new clean offline bootstrap: stop, verify the new vendor archive and manifests out of band, rotate/re-register if trust may have been lost, reinstall the trust anchor, and verify before reconnecting.

## Exact protected-main approval

The hook accepts only the one lowercase 40-hex SHA stored in `/etc/gshsapp-runner-trust/approved-main-test.sha` or `approved-main-prod.sha`. This blocks reruns of older `main` commits, even when their ref was protected. Test deployment is deliberately `workflow_dispatch`; a push does not deploy automatically.

After a reviewed change lands on protected `main`:

1. On a separate trusted workstation, confirm the exact `main` commit in GitHub, fetch it into a clean repository, and create a self-contained bundle whose `refs/heads/main` tip is that exact commit. Record the bundle SHA256 through a separate trusted channel. Keep the full commit SHA in the filename:

   ```bash
   git fetch --force origin main:refs/heads/main
   MAIN_SHA="$(git rev-parse --verify refs/heads/main^{commit})"
   git bundle create "gshsapp-$MAIN_SHA.bundle" refs/heads/main
   sha256sum "gshsapp-$MAIN_SHA.bundle"
   ```

2. Transfer the bundle and `approve-runner-main-sha.sh` from trusted media to the runner host. The approver clones the bundle without network access, runs strict Git object verification, and requires its `refs/heads/main` tip to equal the requested SHA.
3. Atomically approve it for each required role:

   ```bash
   sudo /media/trusted/approve-runner-main-sha.sh \
     --role test \
     --sha <40-hex-protected-main-sha> \
     --commit-bundle /media/trusted/gshsapp-<40hex>.bundle \
     --commit-bundle-sha256 <OUT_OF_BAND_SHA256>
   ```

4. Manually dispatch `publish-and-deploy-test.yml` for that current commit. Approve production separately only after rehearsal and review.

The update is an atomic rename in the root-owned trust directory. There is no allowlist history: approving a new SHA immediately invalidates the old SHA. Scheduled backups also fail closed until their current `main` SHA is explicitly approved for that role; operators must update approval after each protected-main change before the next scheduled run.

## Enforced job policy

Every accepted job must be from `kkwjk2718/gshsapp`, `refs/heads/main`, have `GITHUB_REF_PROTECTED=true`, no pull-request refs, matching `GITHUB_WORKFLOW_SHA` and `GITHUB_SHA`, Linux self-hosted context, and the exact currently approved SHA.

Test runner workflows:

| Workflow | Events |
| --- | --- |
| `publish-and-deploy-test.yml` | `workflow_dispatch` |
| `preproduction-rehearsal.yml` | `workflow_dispatch` |
| `scheduled-backup-test.yml` | `schedule`, `workflow_dispatch` |

Production runner workflows:

| Workflow | Events |
| --- | --- |
| `deploy-prod.yml` | `workflow_dispatch` |
| `scheduled-backup-prod.yml` | `schedule`, `workflow_dispatch` |

Branches, tags, pull-request refs, forks, renamed workflows, missing context, unprotected `main`, stale SHA, and every unlisted event fail before checkout or workflow commands.

## Verification and recovery

Run after installation, runner updates, systemd changes, host maintenance, and before deployment:

```bash
sudo /media/trusted/verify-runner-trust-hook.sh \
  --runner-root /srv/gshs-runner-test \
  --runner-service actions.runner.kkwjk2718-gshsapp.gshs-test.service \
  --role test
```

If verification fails, keep the service stopped and remove its repository assignment. Never regenerate a manifest from the suspect host. Rebuild from a newly verified official package and rotate the runner registration credential. Do not restore the old `.env`, application files, runner credentials, or activation marker.
