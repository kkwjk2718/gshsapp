# Security audit and hardening report

Date: 2026-08-13

Scope: application code, authentication and authorization, public data boundaries, outbound requests, SQLite persistence, backup and restore, dependency supply chain, browser policy, container image, CI/CD, and origin-host controls.

Change boundary: this branch is local only. It has not been pushed, deployed, or used to mutate the live host, reverse proxy, DNS, GitHub settings, credentials, or public Git history.

## Executive result

The repository has been converted from a set of page-level protections and mutable deployment conventions to explicit handler authorization, narrow DTOs, bounded public inputs and writes, transaction-backed identity claims, authenticated immutable deployment provenance, reviewed SQLite migrations, and fail-closed operational gates.

The source tree is not yet release-authorized. Historic credentials remain in old Git objects, and several controls require operator-owned state that code cannot safely invent: credential rotation, history cleanup, trusted-runner reprovisioning, a reviewed SSH key and firewall source ranges, an authoritative student roster, and a fresh offsite-tested backup. The workflows and deployment scripts deliberately refuse production promotion until those gates are satisfied.

## Fixed repository findings

### Authorization and sensitive data

- Every sensitive Route Handler and exported Server Action now performs a fresh database-backed member or administrator check inside the handler. Middleware is navigation policy only.
- Role, password, account-state, and roster changes revoke stale sessions through `sessionVersion`; password reset and imported credentials force rotation.
- Song, calendar, teacher, notice, user-export, log, and public-setting queries use purpose-built selections and DTOs. Password hashes, anonymous requester identity, internal writer IDs, and full Prisma user objects no longer cross public React/JSON boundaries.
- Admin page data reads, log cleanup/stat actions, backup download/restore, user import/export, token management, and moderation enforce object-level authorization.
- Logout is POST-only and local redirects are normalized; sensitive responses use no-store where appropriate.

### Authentication, invitations, roster, and abuse resistance

- New invitation values contain 256 bits of entropy and are stored as SHA-256 digests. Redemption is a conditional one-time transaction with bounded SQLite contention retry.
- Distributed invitations bind the authoritative recipient identity. Public student enrollment requires an active, versioned academic-year roster entry, exact canonical email/student number/cohort/name, and a transactionally claimed membership.
- Legacy low-entropy unused invitations are revoked during migration. Annual roster replacement preserves history, supports student-number reuse between generations, revokes omitted enrollment, and invalidates affected sessions.
- Login, portal unlock, signup, and password-change bcrypt work is protected by bounded per-principal serialization, exact failure reservations, network admission limits, and a small process-wide concurrency gate. Successful attempts do not consume the long failure window.
- Password rules, strong temporary passwords, dummy comparisons, bounded non-extending lockouts, provider timeouts/body limits, portal quota/cooldown reservations, and generic external error responses are centralized.

### Public endpoints, exports, and persistence

- Anonymous telemetry is same-origin/schema/body/rate bounded. Client and global quotas, retention, row caps, indexed maintenance, and production scheduling prevent SQLite/disk exhaustion.
- CSV generation quotes every field and neutralizes spreadsheet formulas. User-controlled control characters and malformed paths are rejected.
- Privileged security events use a preserved audit trail. Deleting a user no longer deletes the historical actor identity; blocked-request logs are sampled rather than written per request.
- Reports, notifications, token distributions, submissions, and other long-lived tables have explicit lifecycle caps.
- Expired notices are rejected consistently by list, detail, metadata, sitemap, notification, and Open Graph paths.

### Outbound and parser boundaries

- NEIS, weather, YouTube oEmbed, and iCalendar requests use HTTPS/host policy, DNS/IP checks where relevant, timeouts, streaming byte caps, content-type/status/schema limits, and bounded records/fields.
- iCalendar connects to the validated address without pooled-socket reuse, rejects private/special IPs and redirects, limits physical/logical lines and events, and isolates parser-owned fields.
- The vulnerable calendar parser version was replaced and prototype-pollution payloads are rejected before parsing.

### Backup, restore, and SQLite migration

- Backups use a consistent SQLite snapshot and canonical, checksummed archive format with private staging and durable publication.
- Archive validation rejects traversal, alternate path forms, links, devices, collisions, unexpected roots, malformed manifests, and resource-limit violations. Restore upload only produces a validated expiring quarantine; it never applies to the live database.
- Backup count, age, and byte retention preserve minimum/newest generations, clean bounded orphans, check free space, serialize across processes, and sync directory metadata before reporting durability.
- Restore staging has strict leases, expiry cleanup, exact audited cancellation, and crash recovery without automatic live replacement.
- Production migration fingerprints the complete SQLite executable schema, including canonical `sqlite_master` SQL, and rejects unexpected tables, indexes, triggers, views, foreign-key errors, or fingerprints.
- Deployment removes the old writer before the final snapshot and migration. Once schema transition begins, a failed candidate remains offline instead of restarting a pre-hardening binary against the new schema. The first hardened deployment has a reviewed offline bootstrap path for older images without operations bundles.

### Browser, dependencies, build, and container

- Runtime/build moved to supported Node 24. Next.js, Auth.js, Sharp, Vite, node-ical, and transitive packages were upgraded to patched versions and locked.
- CSP uses per-response nonces with strict browser headers; static assets avoid unnecessary auth cookies; security.txt and private-route indexing controls are present.
- Remote privileged Playwright runs disable trace, screenshot, video, and raw test artifact uploads because form-fill traces can contain credentials.
- The standalone build explicitly excludes Git metadata, repository sources, databases, debug/repair/seed files, tests, and credentials while retaining only reviewed operations bundles.
- The container runs non-root with read-only root filesystem, dropped capabilities, no-new-privileges, resource/PID limits, healthcheck, explicit writable mounts/tmpfs, private logs, and an origin bind that rejects wildcard exposure.

### CI/CD and origin controls

- Images are promoted by exact commit and manifest digest, with pinned actions, trusted-main ancestry, GitHub attestation verification, matching test health identity, successful immutable rehearsal proof, and protected environment gates.
- Candidate-controlled scripts never run on a self-hosted runner before the trusted control workflow verifies source and provenance. Docker credentials use temporary configuration or are omitted for public pulls.
- Runtime environment validation checks strong non-placeholder `AUTH_SECRET`, exact canonical origin variables, proxy-hop policy, trusted-host policy, file ownership/mode, and path-component permissions.
- Host hardening validates the complete UFW rule set, proxy-only application access, key-only SSH, exact administrator/key/effective sshd policy, and restores the previous drop-in on validation failure.
- Self-hosted runner policy is designed as a root-owned trust anchor with a reviewed current-main approval and fail-closed workflow/event restrictions. The operator must install it from an independently verified offline bundle after clean runner reprovisioning.

## Read-only live observations

No server configuration or data was changed during the review. Aggregate-only and configuration-only checks found that the live installation still predates this hardening branch. In particular, the origin port is reachable outside the reverse-proxy path, SSH still accepts passwords, the host firewall is inactive, operating-system security updates and a reboot are pending, the running image lacks immutable provenance/runtime limits, and local backups are stale or weakly permissioned. The live database matches the reviewed legacy schema and has no unexpected trigger or view objects. One duplicate student identity group must be resolved before authoritative roster activation.

These observations are deployment blockers, not repository regressions. Apply the operator runbook using console-safe sequencing; do not copy credentials or private network details into issues or commits.

## Verification evidence

- Prisma schema validation and client generation.
- Full Vitest suite, TypeScript no-emit check, zero-warning ESLint, and Next production build.
- Operations bundles and standalone boundary inspection.
- Production-only and complete dependency audits.
- Deployment quiescence, first-deployment backup, migration fingerprint, provenance, rehearsal proof, environment policy, UFW, SSH, runner-policy, and runner-install shell/Python tests.
- Workflow YAML parsing and action pin checks.
- Gitleaks scan of the tracked source tree and redacted full-history scan.

Fresh final counts and the exact head commit are recorded in the handoff after the final runner-trust integration and clean full verification.

## Mandatory pre-push and pre-deploy actions

1. Rotate every credential and password that ever appeared in source, chat, logs, E2E traces, or GitHub artifacts; revoke sessions and remove historic Playwright artifacts.
2. Rewrite all public refs in an isolated mirror with `git filter-repo --sensitive-data-removal`, coordinate the force-push/fork cleanup, and require both tracked-tree and full-history Gitleaks scans to return zero.
3. Clean-reprovision each self-hosted runner from a pinned upstream package; install and verify the root-owned offline trust bundle and current-main approval before allowing any job.
4. Install and verify a passphrase-protected SSH key through a second session/console path, then apply the exact proxy/admin CIDR firewall policy and disable password SSH.
5. Patch/reboot the host, rotate runtime environment secrets, set exact production origins/proxy hops, and verify private file ownership/modes.
6. Resolve the duplicate student identity, import the root-reviewed roster while membership remains suspended, and test active/omitted accounts before a separate unsuspension release.
7. Create a fresh canonical backup, copy it to immutable offsite storage, and complete the isolated restore drill for the exact candidate digest.
8. Publish a fresh image from protected main, deploy to test, produce a successful rehearsal proof, and only then approve production promotion.

Detailed commands and ordering are in `docs/infrastructure-security-runbook.md`, `docs/self-hosted-runner-trust.md`, `docs/cicd-setup.md`, and `docs/production-launch-runbook.md`.
