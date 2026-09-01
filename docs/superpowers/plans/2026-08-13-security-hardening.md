# GSHS App Full Security Hardening Implementation Plan

> **Execution:** apply `superpowers:test-driven-development`, use isolated branch `security/full-hardening-2026-08-13`, review every task, and do not push or deploy.

**Goal:** eliminate all confirmed repository-level vulnerabilities from the 2026-08-13 audit and prepare explicit, safe operator controls for external infrastructure actions that cannot be performed in code.

**Architecture:** public endpoint authorization is enforced in handlers; browser-facing data is explicit DTOs; reusable validation, rate-limit, CSV, archive and audit primitives own security policy; deployment uses immutable identity, least privilege and fail-closed origin defaults.

**Tech stack:** Next.js App Router, Auth.js v5, Prisma/SQLite, Vitest, Docker Compose, GitHub Actions, Bash/PowerShell operator checks.

## Global constraints

- No GitHub push/PR, production deployment, DNS/firewall/SSH mutation, credential use, or destructive history rewrite.
- Preserve `MEMBER_SERVICE_SUSPENDED = true`.
- Every exported Server Action and sensitive route self-authorizes with current database state before expensive work.
- Never serialize `passwordHash`, anonymous requester identity, or complete Prisma `User` records to clients.
- New invite values have 256 bits of CSPRNG entropy and redemption has a conditional single-use claim.
- Uploaded archives never extract into the application root and never install links/special files/unexpected paths.
- Public write endpoints are schema-bounded, retention-bounded and application-rate-limited.
- Production image/runtime uses supported Node 24 and patched framework/auth/image packages.
- Tests follow RED-GREEN-REFACTOR; final claims require fresh lint, tests, build, audit and artifact inspection.

### Task 1: Authorization, session freshness and sensitive data boundaries

**Files:** `src/lib/current-user.ts`, `src/lib/security/password-policy.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/types/next-auth.d.ts`, `prisma/schema.prisma`, privileged admin routes/actions, `src/app/logout/*`, `src/app/(main)/teachers/page.tsx`, `src/lib/public-content.ts`, matching tests.

1. Add failing tests proving same-origin redirect normalization, password policy, and current-role/session-version enforcement.
2. Add central database-backed `requireCurrentUser`/`requireAdmin` helpers and session-version fields/claims; increment on role/password/account changes.
3. Replace JWT-only checks on backup download and user export and add `no-store`; remove password hashes from user export.
4. Require member access for teachers and select only approved fields.
5. Replace state-changing GET logout with a POST flow and normalized local redirect.
6. Remove the ineffective “keep me logged in” control or implement it end-to-end; choose removal unless a secure per-session cookie design is already supported.
7. Run focused tests, then the authentication/admin test set; commit.

### Task 2: Song Server Actions and React Flight data minimization

**Files:** `src/app/(main)/songs/actions.ts`, `page.tsx`, `song-list.tsx`, `request-form.tsx`, new `src/lib/security/youtube-url.ts` and tests.

1. Add failing tests for approved YouTube URL canonicalization and rejection of non-HTTPS/non-YouTube destinations.
2. Authenticate before parsing or outbound requests and apply a bounded principal/IP rate limit to resolution.
3. Move read queries out of publicly exported Server Actions where possible; otherwise self-authorize every export.
4. Use explicit Prisma selections and a client DTO that contains no password/email/role fields and removes anonymous requester identity server-side.
5. Query only publishable song states and revoke any generated object URLs if this flow creates them.
6. Run focused tests and inspect the generated action manifest/Flight output shape; commit.

### Task 3: Logging, CSV export, audit records and abuse controls

**Files:** `src/lib/security/rate-limit.ts`, `src/lib/security/csv.ts`, `src/lib/audit.ts`, `src/app/api/log/**`, `src/app/(main)/admin/logs/**`, token CSV client, logger/settings code, matching tests.

1. Add failing tests for formula-neutralizing RFC-style CSV cells, pathname/control validation and deterministic limiter boundaries.
2. Add a capped/pruned in-process limiter with trusted-proxy parsing policy; protect telemetry by origin/fetch metadata, content type, schema and size.
3. Enforce database row caps/retention so public writes cannot grow SQLite without bound.
4. Add a fresh DB-admin check to every exported admin log action; ensure cleanup cannot be called anonymously.
5. Encode every CSV field and neutralize formulas; revoke browser blob URLs.
6. Use `AuditLog` for privileged security events (cleanup, export, reset, role/account changes, tokens, backup create/restore/download) with bounded metadata.
7. Run focused tests plus all logging/admin tests; commit.

### Task 4: Invite, login, portal and password hardening

**Files:** `src/lib/token-distribution.ts`, `src/lib/token-portal-session.ts`, `src/lib/login-rate-limit.ts`, signup/request/admin token/admin user actions, `prisma/schema.prisma`, matching tests.

1. Add failing tests proving 256-bit token shape/uniqueness, conditional one-use claim, non-extending login lock, portal attempt throttling and CSPRNG temporary password policy.
2. Generate invite values with `randomBytes(32)` and hash at rest when compatible; never regenerate displayable secrets from storage.
3. Redeem within one transaction using `updateMany`/conditional claim count exactly one before account creation completes.
4. Add atomic server-side portal daily reservation and cooldown checks; require a strong portal secret and rate-limit unlock by principal/IP.
5. Count only genuine login failures, cap identifier/IP keys and do not extend active lockouts.
6. Apply the central password policy to signup/change/reset; CSPRNG temporary passwords must trigger session invalidation and forced rotation where supported.
7. Run focused concurrency tests and authentication/token tests; commit.

### Task 5: Safe backup/restore and repository secret hygiene

**Files:** `src/lib/backup.ts`, backup actions/routes, entrypoint, seed/debug scripts, `.github/workflows/secret-scan.yml`, `.gitleaks.toml`, `SECURITY.md`, tests.

1. Add failing tests for archive path traversal, absolute paths, alternate separators, symlink/hardlink/device types, unexpected entries and safe allowlisted layouts.
2. Extract to a fresh private temporary directory, validate entries and filesystem types, and atomically install only approved data files; never extract to `process.cwd()`.
3. Limit upload size and type, authorize with current DB state before file reads/writes, and audit backup events.
4. Remove tracked credentials and predictable seed credentials; require strong environment-provided bootstrap values.
5. Add CI secret scanning and a policy/checklist covering public-history cleanup and mandatory rotation without embedding secret values.
6. Ensure Next output tracing cannot include repository sources/debug/credential scripts; add a build-artifact assertion.
7. Run archive/security tests and a production build artifact inspection; commit.

### Task 6: Browser, dependencies and public surface

**Files:** `package.json`, `package-lock.json`, `next.config.mjs`, `middleware.ts`, root layout/analytics scripts, `public/**`, `SECURITY.md`, tests.

1. Upgrade Next.js/Auth.js/Sharp/Vite and related packages to currently patched compatible releases; upgrade Node typings/engines to 24.
2. Add CSP nonce generation and propagation, remove broad inline-script permission, and retain existing HSTS/frame/referrer/permissions/COOP/CORP controls.
3. Exclude static metadata/assets from auth middleware so they do not set session cookies.
4. Add `/.well-known/security.txt`, remove tracked public debug captures, add `robots`/noindex protection for private directories, and retain generic error handling.
5. Run framework tests, lint, production audit and production build; commit.

### Task 7: Container, CI/CD, backup and host-origin hardening

**Files:** `Dockerfile`, `docker-entrypoint.sh`, `deploy/**`, `.github/workflows/**`, `.env.example`, deployment/security docs and validation scripts.

1. Use supported Node 24, digest-pinnable image references, non-root read-only runtime, dropped capabilities, `no-new-privileges`, bounded resources, tmpfs/cache and a real healthcheck.
2. Remove schema push from every restart; deployment performs a private backup, fully quiesces the old web writer, applies one controlled schema sync and verifies health. After migration starts, failure stays offline instead of running an old binary against the new schema.
3. Scope workflow permissions by job, validate exact 40-hex commit identity, propagate/verify image digest, avoid mutable-tag trust and keep deploy secrets out of untrusted jobs.
4. Default bind to loopback; reject wildcard binds unless an explicit unsafe override is set. Add an idempotent dry-run host-hardening script that requires proxy source, SSH key user and private/interface addresses before applying UFW/SSH restrictions.
5. Enforce private backup permissions, freshness monitoring, restore drills and offsite configuration. Add exact DMARC enforcement, SPF hard-fail, CAA and DNSSEC runbook records.
6. Add deployment preflight checks for the stale/broken test endpoint, production health provenance and pending operator secret/session rotations.
7. Validate shell syntax, Compose config, workflow YAML, smoke tests and image metadata where Docker is available; commit.

### Task 8: Integrated verification and final review

**Files:** branch-wide diff, test reports and SDD ledger only unless review findings require code changes.

1. Run all focused security tests, full Vitest suite, zero-warning ESLint and production build from a clean generated-output state.
2. Run production and full dependency audits; classify any residual advisory by reachable code and fixed-version availability. No critical/high reachable advisory may remain.
3. Inspect standalone output and Docker image for source/Git/debug/secret artifacts, root user, capabilities, healthcheck, exposed bind and immutable version label.
4. Run a final whole-branch security/code-quality review; send all findings through one fix wave and scoped re-review.
5. Commit final corrections, verify the worktree is clean, and report branch/commit/test evidence plus mandatory pre-deploy operator actions. Do not push.
