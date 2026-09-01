# GSHS App Full Security Hardening Design

**Date:** 2026-08-13  
**Scope:** repository code, tests, build image, CI/CD and operator runbooks  
**Change boundary:** local branch only; no GitHub push, production deployment, DNS mutation, firewall mutation or credential rotation is performed by this branch.

## Context

The audit found directly exploitable authorization failures, sensitive-data serialization, vulnerable framework versions, weak invite and password controls, unbounded public logging, unsafe backup extraction, CSV injection, committed credentials, and deployment/runtime weaknesses. Production currently also exposes the application port on all host interfaces and reports a non-provenance health version. The edge proxy already supplies useful TLS and security headers, so the design preserves those controls while closing application and origin gaps.

The member service is intentionally suspended in the audited revision. Suspension is not a security control: every latent member/admin path must be safe before the flag is removed, and public APIs/Server Actions must be safe now.

## Options considered

1. **Patch only the demonstrated exploits.** Smallest diff, but leaves inconsistent authorization, new Server Actions easy to expose, and operational drift unresolved.
2. **Centralized security primitives plus narrow call-site migrations.** Add database-backed authorization helpers, explicit DTOs, shared validation/export/rate-limit utilities, safe restore boundaries, and hardened deployment defaults. This is selected because it fixes root causes without a product rewrite.
3. **Replace authentication, logging, backup and deployment platforms.** Strong isolation but excessive migration risk for a school service and not feasible as a reviewable hardening branch.

## Selected architecture

### Trust and authorization boundaries

- Treat every exported Server Action and route handler as a public endpoint.
- Sensitive handlers call a database-backed `requireCurrentUser` or `requireAdmin` guard inside the handler before parsing, fetching or mutating.
- Middleware remains navigation UX only. It must not be the sole authorization check.
- Privileged sessions are invalidated by current database state and a per-user session version. Role, password and account-state changes increment that version.
- Redirects accept only normalized same-origin path/query/hash values. Sign-out is POST-only.

### Data minimization

- Prisma queries crossing React Flight or JSON boundaries use explicit `select` clauses and purpose-built DTOs.
- Anonymous song requester identity is removed on the server, not hidden in the client.
- Teacher information requires an authenticated member and returns only approved display fields.
- User export excludes password hashes and responses containing sensitive data use `Cache-Control: no-store`.

### Tokens, passwords and abuse resistance

- Invite values use at least 256 bits from `crypto.randomBytes`; lookup is rate limited and redemption performs a conditional atomic claim inside one transaction.
- Password validation is centralized, enforces a modern length/byte policy, rejects common values, and administrative temporary credentials use a CSPRNG.
- Login blocking does not extend from already-blocked attempts. Portal unlock, token issuance, telemetry and outbound song resolution receive bounded server-side throttles.
- Public telemetry accepts same-origin browser events with strict schemas, bounded fields and retention/cap controls. It is non-authoritative analytics.

### Backup and audit boundary

- Uploaded archives never extract into the application root. Entries are validated against an allowlist; absolute/traversal paths, links and special files are rejected; extraction occurs in a fresh directory; only validated data is atomically installed.
- Container root filesystem and capabilities are restricted, with explicit writable data, backup, cache and temporary locations.
- Existing `AuditLog` is used for privileged security events and cannot be populated from public telemetry endpoints.

### Browser and framework boundary

- Upgrade Next.js/Auth.js/Sharp and related packages to versions containing the vendor security fixes; upgrade build/runtime to supported Node 24 LTS.
- Replace broad inline-script permission with per-response CSP nonces and add `security.txt`/security policy.
- Remove tracked debug captures and secrets, prevent recurrence with automated secret scanning, and prevent whole-repository Next output tracing.

### Deployment and origin boundary

- Image identity is immutable and tied to a full Git commit/digest; deploy jobs get least-privilege tokens.
- The application bind address is loopback by default. Cross-host proxy deployments must name an interface address and firewall allow only the proxy source; wildcard binds require an explicit unsafe override.
- Deployment backs up first, runs schema synchronization once, verifies a health check, and rolls back on failure. Backups are private, freshness monitored and restore-tested.
- DNS/SSH/firewall changes that require external ownership are delivered as exact runbooks and scripts with safe dry-run/default refusal behavior.

## Compatibility and migration

- Legacy invite tokens remain redeemable only during a short compatibility window if required; new tokens use high entropy. Redemption remains atomic for both.
- Schema additions are nullable/defaulted so existing SQLite data can migrate with the repository's controlled schema-sync step.
- Existing backup archives are accepted only when they contain the documented allowlisted data layout.
- Membership suspension stays enabled; hardening does not silently alter product availability.

## Verification

- Unit tests must first fail for every new security primitive and then pass after implementation.
- Run lint, all Vitest tests, production build, production dependency audit, and targeted route/action tests.
- Inspect `.next/standalone` to prove source, Git metadata, debug files and credential scripts are absent.
- Build and inspect the Docker image when Docker is available; validate Compose configuration and CI workflow syntax regardless.
- Perform safe local HTTP smoke tests only. Do not probe or mutate the production host during implementation.

## Residual operator actions

Repository changes cannot revoke already-public credentials, change DNS records, determine the reverse-proxy source IP, or rotate production cookies. `SECURITY.md` and the deployment runbook therefore contain a mandatory pre-deploy checklist for secret rotation/history cleanup, proxy-only firewall activation, SSH key-only access, DNS policy and forced user session/password reset where hashes may have been exposed.
