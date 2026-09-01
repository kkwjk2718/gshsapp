# Infrastructure security runbook

Repository hardening cannot safely infer the reverse-proxy source address, rotate credentials, rewrite public Git history, reimage a host, or mutate DNS. Complete this operator checklist before approving or starting any root deployment transaction; no workflow boolean substitutes for this evidence.

## 1. Mandatory credential incident response

The former public history contained operational credentials and user password material. Treat every value ever committed, pasted into issue/CI logs, or shared during this review as compromised.

1. Rotate the Ubuntu account password immediately and replace password SSH with a newly generated, passphrase-protected administrator key.
2. Rotate `AUTH_SECRET`, Docker Hub token, Brevo API key, NEIS/API credentials, E2E administrator credentials, portal shared secret, webhook URLs, and every affected user/admin password.
3. Increment/revoke sessions for all accounts and require password rotation for affected users.
4. Use `git filter-repo --sensitive-data-removal` in an isolated mirror to purge the identified files/values from every ref. Coordinate the force-push and invalidate existing forks/clones; do not run a history rewrite from a working production checkout.
5. Run both scans until clean:

   ```bash
   gitleaks git --redact --config .gitleaks.toml --log-opts="--all"
   gitleaks dir --redact --config .gitleaks.toml .
   ```

6. Remove every legacy self-hosted runner service/account, registration token, deploy key, broker credential, and cached Actions workspace from the reimaged hosts. Do not register a replacement host runner; current workflows are GitHub-hosted only.
7. Record completion in the operator-controlled incident log. The current workflows do not accept a boolean environment variable as a substitute for rotation, revocation, history cleanup, and clean scans.

Before the first hardened deployment, delete every historic GitHub Actions artifact containing `playwright-report` or `test-results` and confirm none remain downloadable. Treat every test and production E2E administrator credential previously supplied to Playwright as compromised, rotate it, and revoke its sessions. Future remote E2E must use a dedicated short-lived, least-privilege account and must never enable trace, screenshots, video, or raw Playwright artifact uploads.

## 2. Origin and SSH restriction

The supplied address `172.15.10.34` is **not** RFC1918 private space (`172.16.0.0/12` is private). Confirm the intended subnet with the network owner before applying firewall rules. If it is intentionally routed as internal space, the explicit exception below documents that decision.

Dry-run first:

```bash
PROXY_SOURCE_CIDR=REPLACE_WITH_PROXY_CIDR \
SSH_SOURCE_CIDR=REPLACE_WITH_ADMIN_CIDR \
SSH_ADMIN_USER=REPLACE_WITH_NON_ROOT_USER \
SSH_AUTHORIZED_KEY_FINGERPRINT=SHA256:REPLACE_WITH_REVIEWED_FINGERPRINT \
HOST_BIND_IP=172.15.10.34 \
ALLOW_NON_RFC1918_INTERNAL=true \
/bin/bash /usr/local/lib/gshsapp-operations/host-hardening.sh --dry-run
```

Before `--apply`, verify console/out-of-band access and install a reviewed administrator public key. Record its exact `ssh-keygen -l -E sha256 -f authorized_keys` fingerprint in `SSH_AUTHORIZED_KEY_FINGERPRINT`. The script resolves the account's real home, enforces StrictModes-compatible ownership/permissions and a valid login shell, verifies the exact fingerprint, and checks the effective `sshd -T` policy before reloading. Keep the current SSH session open while opening a second key-only session. The script then permits port 1234 only from the named reverse-proxy CIDR, SSH only from the named admin CIDR, disables password/root SSH, and denies all other inbound and routed traffic. Because Compose publishes through a Docker bridge, the installed control must also install and verify an exact `DOCKER-USER` policy that accepts established traffic and the named proxy source to the published application port, then drops every other ingress path to that port; UFW INPUT alone is not a sufficient boundary.

The apply step is deliberately fail-closed. `ufw show added` must contain either no rules or exactly the reviewed host INPUT rules. A broad `Anywhere` rule, route rule, IPv6 rule, duplicate, stale port, unexpected `DOCKER-USER` rule, or any other rule stops the script before it changes SSH or firewall state. The script never resets or bulk-deletes unrelated firewall rules. If it refuses an existing host, use console access to review and migrate each unexpected rule individually, then repeat the dry run and apply procedure. After enabling UFW, the script verifies active status, default policies, the complete managed host rules, and the complete managed Docker forwarding rules before reloading SSH.

Set the corresponding root-owned `/etc/gshsapp-operations/deploy.env` values:

- `HOST_BIND_IP`: exact proxy-facing host interface, never `0.0.0.0`.
- `PROXY_SOURCE_CIDR`: the one reviewed reverse proxy as a canonical IPv4 `/32`; a subnet is rejected.
- `PROTECTED_INTERNAL_CIDRS`: sorted, canonical comma-separated IPv4 CIDRs covering every routed campus/management network and `HOST_BIND_IP` (for example the reviewed `172.15.0.0/16`). The web bridge is denied to these networks, RFC1918, CGNAT, link-local, host INPUT, and exact connected non-public prefixes while public DNS/HTTPS egress remains available.
- `ALLOW_PUBLIC_BIND=true` only for reviewed non-RFC1918 topology with both the source-restricted UFW and `DOCKER-USER` rules above.
- `TRUSTED_PROXY_HOPS`: exact number (1-3) of controlled proxies that overwrite, rather than append, untrusted forwarding headers. Production startup and deployment fail closed when it is absent or zero. Verify the edge removes any client-supplied `Forwarded`, `X-Forwarded-For`, and `X-Real-IP` values before writing its own chain.

The installed deployment unit invokes `host-hardening.sh --verify-firewall` and `docker-user-firewall.sh --verify`, and refuses either policy mismatch on every deployment; no workflow flag bypasses these checks. The deploy installer also enables the static `gshsapp-docker-user-firewall.service` so the exact Docker forwarding policy is restored after Docker daemon or host restart.

On the freshly reimaged host, install `/opt/gshsapp/.env` as a root:root non-symlink file mode `0600`; `/opt/gshsapp` is root-owned and inaccessible to unprivileged accounts. Deployment refuses weaker ownership or permissions. Rotate `AUTH_SECRET` only in a planned maintenance window because doing so invalidates every active session.

## 2a. Student roster gate

Before re-enabling membership or the token portal, resolve the known legacy duplicate student-ID group and export an authoritative CSV with the exact header `academicYear,gisu,studentId,name,email`. One file must contain one academic year. In `/admin/settings`, use **Authoritative student roster** and type `REPLACE ROSTER`. Import is capped at 256 KiB/500 rows, validates all rows before one atomic transaction, revokes outstanding self-service invites, keeps prior generations inactive, safely supports annual student-number reuse, seeds exact existing accounts as enrolled, and rejects ambiguous or conflicting identities. The portal cannot be enabled with an empty roster. Never source this CSV from self-declared profile data.

For the first migration, the member-service suspension intentionally blocks every web login, including administrators. Keep the suspension enabled and stream the reviewed roster through the root-controlled Docker command below; the CLI refuses to run after suspension is removed, requires an existing ADMIN actor, applies the same atomic service as the web action, and writes the same audit event. Do not copy the roster into the image or container filesystem.

```bash
test -f /root/reviewed-roster.csv
test "$(stat -c '%u:%g:%a' /root/reviewed-roster.csv)" = "0:0:600"
docker exec -i gshsapp-web node /app/.next/ops/bootstrap-student-roster.mjs \
  --actor-user-id REPLACE_WITH_ADMIN_LOGIN --confirm REPLACE-ROSTER \
  < /root/reviewed-roster.csv
```

Confirm the row count and audit record, then delete the transient root-only CSV. Re-enable membership only in a separately reviewed build after the duplicate legacy identity is resolved and login checks for a sample of active and omitted users pass.

## 3. Backup and recovery

Configure a root-private mounted offsite filesystem, install `gshsapp-backup.timer`, and complete the isolated restore drill for the exact image digest. GitHub Actions does not run or schedule host backups. Confirm backup directories are `0700`, files are `0600`, and restoration only creates a staged pending restore. Never automatically replace the live database from an uploaded archive.

The root backup service stops the exact writer, creates a complete archive/metadata pair, exports it to the configured `OFFSITE_DIR`, publishes the root-owned checksum receipt to the fixed `$OFFSITE_DIR/.gshsapp-receipts`, verifies that generation, and only then runs pair-aware local retention. Protect the archive, metadata, and receipt together with immutable/versioned offsite retention and never mirror local deletion. Record the receipt SHA-256 through a separate authenticated operator channel because the receipt itself is not a signature. Expired staged restores and stale upload locks are reclaimed automatically, while an administrator cancellation requires the exact opaque restore ID and creates audit records; neither path applies data to the live database.

For a fresh-host import, use the preserved receipt at `$OFFSITE_DIR/.gshsapp-receipts` and compare its SHA-256 with the separately authenticated operator record; never synthesize a new receipt from the archive. `import-backup.sh` accepts only an empty data root, an exact fresh release approval, a matching archive/metadata/receipt generation, and the approved digest-pinned validator. The successful import leaves the application stopped and publishes the durable bootstrap marker.

Every hardened deployment quiesces the writer and uses the reviewed host SQLite backup implementation to publish a DB-only v2 archive/metadata pair. No pre-existing image code is ever executed as part of trust bootstrap. The digest-pinned candidate receives only that archive read-only, with no network, runtime secrets, live database, data root, or backup-directory mount, and must migrate and validate an isolated copy before deployment continues.

Deployment disables the old web container's auto-restart policy and preserves the stopped exact container through backup, offsite verification, candidate validation, and environment staging. Immediately before migration it durably records the schema-transition boundary and clears the pre-schema restart intent. Only after migration succeeds does it remove the old container. A migration, startup, or health failure after that boundary leaves the web service offline and quarantines any unaccepted candidate. Never restart a pre-hardening image against a database whose security migration may have started. Recovery requires either rerunning a reviewed hardened candidate or a separately approved stopped-service restoration of the verified pre-deployment backup; application-only automatic rollback is intentionally forbidden.

## 4. DNS and mail policy

Observed on 2026-08-13:

- apex SPF uses soft fail (`~all`);
- DMARC is monitor-only (`p=none`);
- no CAA answer was present;
- no `gshs.app` DS record was present at the `.app` parent.

After confirming every authorized sender (currently Cloudflare Email Routing/Service and Brevo where still used), publish exactly one apex SPF record and test delivery before tightening it. A likely combined final record is:

```text
@ TXT "v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com -all"
```

Do not copy that record if Brevo uses a delegated bounce domain instead of the apex, or if another legitimate sender exists. Preserve only one SPF TXT record.

Move DMARC from monitoring to enforcement after reviewing aggregate reports:

```text
_dmarc TXT "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; pct=100; rua=mailto:SECURITY_REPORT_MAILBOX"
```

Add a restrictive certificate authority authorization policy for the CA actually used at the edge (the current public certificate was issued by Let's Encrypt):

```text
@ CAA 0 issue "letsencrypt.org"
@ CAA 0 issuewild ";"
@ CAA 0 iodef "mailto:SECURITY_REPORT_MAILBOX"
```

Enable DNSSEC in Cloudflare, add/confirm the generated DS at the registrar, wait through the DS TTL, then verify `AD=true` and the expected DS from multiple validating resolvers. Do not change nameservers while stale DS data exists.

## 5. Release gate

Production deployment now requires:

- an exact `sha-<40 hex>` source identity plus a matching `sha256:<64 hex>` image digest;
- the same candidate version already healthy at `test.gshs.app`;
- a fresh successful preproduction proof, verified by the installed root approval control;
- operator evidence for credential rotation/history cleanup and complete removal of legacy runner credentials;
- an OOB-authenticated installed control tree, exact active UFW policy, reviewed runtime configuration, and root-only systemd units;
- a verified offsite archive/metadata/`$OFFSITE_DIR/.gshsapp-receipts` generation with a separately recorded receipt digest, fresh-host import marker, and candidate-bound restore-drill receipt;
- a reviewed SQLite migration, followed by container health and public smoke checks.
- an imported authoritative roster and resolved legacy duplicate student identity before member services are re-enabled.

Membership remains suspended until this entire gate and the post-deploy security verification are complete.

The executable host order is documented in `docs/root-operations-bootstrap.md` and `docs/production-launch-runbook.md`: OOB bootstrap, root configuration, exact approval, verified offsite import, restore drill, then `systemctl start gshsapp-deploy.service`.
