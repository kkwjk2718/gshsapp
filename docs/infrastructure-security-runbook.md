# Infrastructure security runbook

Repository hardening cannot safely infer the reverse-proxy source address, rotate credentials, rewrite public Git history, or mutate DNS. Complete this checklist before setting the protected production environment variables to `true`.

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

6. Only after rotation, session revocation, history cleanup, and clean scans set production environment variable `SECURITY_ROTATION_COMPLETE=true`.

Before the first hardened deployment, delete every historic GitHub Actions artifact containing `playwright-report` or `test-results` and confirm none remain downloadable. Treat every test and production E2E administrator credential previously supplied to Playwright as compromised, rotate it, and revoke its sessions. Future remote E2E must use a dedicated short-lived, least-privilege account and must never enable trace, screenshots, video, or raw Playwright artifact uploads.

## 2. Origin and SSH restriction

The supplied address `172.15.10.34` is **not** RFC1918 private space (`172.16.0.0/12` is private). Confirm the intended subnet with the network owner before applying firewall rules. If it is intentionally routed as internal space, the explicit exception below documents that decision.

Dry-run first:

```bash
cd /opt/gshsapp
PROXY_SOURCE_CIDR=REPLACE_WITH_PROXY_CIDR \
SSH_SOURCE_CIDR=REPLACE_WITH_ADMIN_CIDR \
SSH_ADMIN_USER=REPLACE_WITH_NON_ROOT_USER \
SSH_AUTHORIZED_KEY_FINGERPRINT=SHA256:REPLACE_WITH_REVIEWED_FINGERPRINT \
HOST_BIND_IP=172.15.10.34 \
ALLOW_NON_RFC1918_INTERNAL=true \
./host-hardening.sh --dry-run
```

Before `--apply`, verify console/out-of-band access and install a reviewed administrator public key. Record its exact `ssh-keygen -l -E sha256 -f authorized_keys` fingerprint in `SSH_AUTHORIZED_KEY_FINGERPRINT`. The script resolves the account's real home, enforces StrictModes-compatible ownership/permissions and a valid login shell, verifies the exact fingerprint, and checks the effective `sshd -T` policy before reloading. Keep the current SSH session open while opening a second key-only session. The script then permits port 1234 only from the named reverse-proxy CIDR, SSH only from the named admin CIDR, disables password/root SSH, and denies all other inbound and routed traffic.

The apply step is deliberately fail-closed. `ufw show added` must contain either no rules or exactly those two source/destination/port/TCP rules. A broad `Anywhere` rule, route rule, IPv6 rule, duplicate, stale port, or any other rule stops the script before it changes SSH or UFW. The script never resets or bulk-deletes firewall rules. If it refuses an existing host, use console access to review and migrate each unexpected rule individually, then repeat the dry run and apply procedure. After enabling UFW, the script verifies active status, default policies, and the complete two-rule managed set before reloading SSH.

Set the test/production GitHub Environment values:

- `HOST_BIND_IP`: exact proxy-facing host interface, never `0.0.0.0`.
- `ALLOW_PUBLIC_BIND=true` only for reviewed non-RFC1918 topology with the source-restricted UFW rule above.
- `ORIGIN_FIREWALL_READY=true` only after rules and second SSH session are verified.
- `TRUSTED_PROXY_HOPS`: exact number (1-3) of controlled proxies that overwrite, rather than append, untrusted forwarding headers. Production startup and deployment fail closed when it is absent or zero. Verify the edge removes any client-supplied `Forwarded`, `X-Forwarded-For`, and `X-Real-IP` values before writing its own chain.

Install `/opt/gshsapp/.env` as a non-symlink file owned by root or the dedicated deploy account with mode `0600`; every directory below the trusted deployment root must reject group/other writes. Deployment refuses weaker ownership or permissions. Rotate `AUTH_SECRET` only in a planned maintenance window because doing so invalidates every active session.

## 2a. Student roster gate

Before re-enabling membership or the token portal, resolve the known legacy duplicate student-ID group and export an authoritative CSV with the exact header `academicYear,gisu,studentId,name,email`. One file must contain one academic year. In `/admin/settings`, use **Authoritative student roster** and type `REPLACE ROSTER`. Import is capped at 256 KiB/500 rows, validates all rows before one atomic transaction, revokes outstanding self-service invites, keeps prior generations inactive, safely supports annual student-number reuse, seeds exact existing accounts as enrolled, and rejects ambiguous or conflicting identities. The portal cannot be enabled with an empty roster. Never source this CSV from self-declared profile data.

## 3. Backup and recovery

Configure a private off-host destination, run the backup workflow, and complete the isolated restore drill for the exact image digest. Confirm backup directories are `0700`, files are `0600`, and restoration only creates a staged pending restore. Never automatically replace the live database from an uploaded archive.

Local pair-aware retention runs only after a new archive and metadata are validated and durable; it does not attest that `offsite-backup.sh` succeeded. Run the off-host export immediately after scheduled creation, keep remote immutable/versioned retention independent, never mirror local deletion with `rsync --delete`, and verify the remote checksum. Expired staged restores and stale upload locks are reclaimed automatically, while an administrator cancellation requires the exact opaque restore ID and creates audit records; neither path applies data to the live database.

Set `OFFSITE_BACKUP_READY=true` only after a fresh off-host copy and successful restore drill.

The first hardened deployment may start from an older trusted container that does not contain `.next/ops/run-scheduled-backup.mjs`. In that one compatibility case, `predeployment-backup.sh` uses Python's SQLite online-backup API on the host to publish a DB-only v2 archive/metadata pair. The digest-pinned candidate then receives only that archive read-only, with no network, runtime secrets, live database, data root, or backup-directory mount, and must migrate and validate an isolated copy before deployment continues. Later deployments return to the running trusted container's normal backup engine.

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
- `SECURITY_ROTATION_COMPLETE=true`, `ORIGIN_FIREWALL_READY=true`, and `OFFSITE_BACKUP_READY=true` in the protected production environment;
- a reviewed SQLite backup and migration, followed by container health and public smoke checks.
- an imported authoritative roster and resolved legacy duplicate student identity before member services are re-enabled.

Membership remains suspended until this entire gate and the post-deploy security verification are complete.
