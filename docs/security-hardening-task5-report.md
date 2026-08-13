# Task 5 backup, restore, and secret-hygiene report

Date: 2026-08-13

Branch: `security/backup-hardening-2026-08-13`

Base: `dbae412ad4f178dfee1c8f497f2d59f131d87b94`

## Implemented boundary

- New backups use a SQLite-consistent `VACUUM INTO` snapshot, a canonical version 2 layout, per-file SHA-256 manifest entries, private staging, self-validation, and atomic final-file publication.
- Archive validation rejects unsafe path forms, Windows aliases/ADS/device names, Unicode/case collisions, duplicates, unexpected roots, links and special files, malformed metadata, excessive paths/depth/entries/sizes, truncation, and checksum mismatches. Extraction occurs only in a new private directory and is compared with the validated entry set.
- The administrator restore endpoint performs fresh database authorization and same-origin/Fetch-Metadata checks before reading the body, enforces a streaming byte cap, validates file magic and SQLite/archive contents, and creates only an opaque pending descriptor. It never replaces a live database. Automatic restore application remains disabled pending separate review of a crash-recoverable offline installer.
- Stored downloads require fresh administrator authorization, exact generated names, regular-file/no-follow opens, descriptor rechecks, streaming responses, audit logging, and `private, no-store`.
- Runtime data paths are fixed below `DATA_ROOT`; database, backup, restore staging, content-root, and weather-cache overrides cannot escape it. This also removes dynamic whole-repository output tracing.
- Scheduled and pre-deployment backups use the same compiled engine. Restore drill uses the image's shared validator in a locked-down container. Offsite export requires the generated archive plus matching metadata/checksum. Neither path falls back to copying the live SQLite file or host `tar` extraction.
- Credential-bearing repair/debug/capture helpers and predictable administrator seeds were removed. Administrator bootstrap is explicit, environment-only, strong-password checked, create-only, and never prints credentials or hashes.
- Gitleaks configuration and a SHA-pinned workflow scan both full Git history and the checked-out directory in redacted mode. `SECURITY.md` documents mandatory rotation, session invalidation, coordinated history cleanup, cache/release cleanup, and fresh-clone verification.
- Standalone output tracing and Docker copy boundaries exclude repository sources, databases, documentation, test/debug/repair/seed inputs, and credentials. A build assertion checks copied files and every NFT manifest and requires the exact backup/restore runtime dependencies.

## Verification evidence

- TDD archive, extraction, SQLite, staging, route, download, path, deploy, bootstrap, secret-hygiene, and standalone tests: passing.
- Full Vitest: 58 files, 376 tests passing and one Windows symlink-permission test skipped.
- ESLint: zero warnings (`--max-warnings=0`).
- Next production build and TypeScript check: passing, 39 static pages generated.
- Operations bundles: generated successfully.
- Standalone assertion: passing, 2,260 files inspected.
- Shell syntax: deployment, scheduled backup, restore drill, offsite backup, and entrypoint scripts pass `bash -n`.
- Real operations-bundle smoke: a file-backed SQLite fixture completed snapshot creation, canonical archive validation, and isolated restore preparation.
- Gitleaks 8.24.3 checksum-verified local scan: tracked source (excluding generated build output) has zero findings. Full history still has four redacted findings for the same exposed legacy API credential in two removed test files across two commits and intentionally fails closed.
- This isolated branch still inherits the base dependency audit findings (12 total); the separate dependency/browser hardening task owns their upgrades and must reconcile `package-lock.json` while retaining exact `tar` and operations-bundler versions.
- Docker image execution was not available in this Windows verification environment; the Dockerfile and Compose behavior still require CI/server validation.

## Required rollout coordination

1. Rotate/revoke exposed values and invalidate affected sessions before publishing or deploying. The full-history secret workflow will remain red until the operator-only cleanup in `SECURITY.md` is completed; do not suppress those findings.
2. Integrate the deployment-hardening work that performs one controlled schema synchronization before the container starts. The entrypoint intentionally no longer runs `prisma db push`.
3. Configure `DATA_ROOT=/app/data`, mount host `backup/` at `/app/data/backup`, and use only logical values (`uploads`, `user-content`, `storage`, `logs`) in `BACKUP_EXTRA_PATHS`.
   Align the host backup operator with container UID `1001` (or use a separately approved root-operated job), because archives are intentionally mode `0600`.
4. Generate a fresh canonical backup before relying on restore drill or offsite export. Legacy arbitrary backup filenames are intentionally not selectable.
5. Treat a web-staged restore as quarantined input only. A restart does not apply it; actual recovery requires a separately reviewed, stopped-service procedure with rollback protection.
6. Keep `MEMBER_SERVICE_SUSPENDED=true` until the parent hardening rollout explicitly changes that policy.
