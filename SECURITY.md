# Security policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, personal data, or server information. Use GitHub's private vulnerability reporting form for this repository:

<https://github.com/kkwjk2718/gshsapp/security/advisories/new>

If private reporting is unavailable, contact the repository owner through a previously verified private school channel and share only the minimum reproduction details. Never send a live credential in chat, an issue, or a pull request.

## Mandatory response to a suspected secret exposure

Removing a file or deleting a repository does not revoke a credential and does not erase existing clones, caches, releases, logs, or forks. An operator must complete this sequence before deploying or publishing a hardening branch that follows a confirmed exposure:

1. Revoke or rotate every affected credential at its issuing system first. Include authentication/session signing secrets, administrator and SSH credentials, API keys, mail-provider keys, runner credentials, registry tokens, and database-derived credentials where applicable.
2. Invalidate affected sessions and require password rotation for accounts whose password material may have been exposed.
3. Record only redacted fingerprints and rotation timestamps. Never copy a secret value into a ticket, commit, log, shell history, or scan exception.
4. Coordinate a `git filter-repo` history and tag cleanup with every maintainer. Back up the repository metadata, remove the sensitive blobs from all refs, verify the rewritten object graph, and force-push only during an announced maintenance window.
5. Delete or replace affected GitHub Releases, Actions artifacts/caches, package images, deployment bundles, and backup exports. Purge CDN or object-store copies where used.
6. Notify known clone and fork owners that the old history is compromised. Require a fresh clone after the rewrite; do not merge old branches back into cleaned history.
7. Run a redacted full-history scan and a working-tree scan with `.gitleaks.toml`. Resolve every finding by rotation and cleanup, not by broad path allowlisting.
8. Re-issue deployment approval only after runtime health, fresh-session invalidation, and backup/restore checks pass.

History rewriting and credential rotation are intentionally operator-only operations. Automated agents must not perform them without explicit authorization and a coordinated outage/recovery plan.

## Backup and restore boundary

The web UI may validate and stage a restore artifact, but it does not replace the live SQLite database. Automatic pending-restore application is disabled until a crash-recoverable, offline, journaled installer has been separately reviewed and approved. Use an isolated restore drill for recovery validation; never extract an uploaded archive into the application source tree or copy over a database used by a running process.
