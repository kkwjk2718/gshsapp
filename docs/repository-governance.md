# Repository Governance

This document is the source of truth for repository operating rules, merge policy, branch protection behavior, and emergency exceptions.

Use this together with:

- `CONTRIBUTING.md`
- `docs/cicd-setup.md`
- `docs/production-launch-runbook.md`
- `AGENTS.md`

## 1. Why This Exists

This repository already has CI/CD, automatic test deployment, Playwright E2E, restore drills, and production release workflows.

That only stays safe if the repository itself is operated consistently. The rules below exist to prevent:

- unreviewed changes landing on `main`
- force-push or branch deletion accidents
- merges that skip CI
- production promotion of an unverified SHA
- undocumented infra or secret handling changes

## 2. Current `main` Branch Protection

The `main` branch is protected with the following baseline:

- direct changes are expected to go through pull requests
- required status checks must pass before merge
- required checks are:
  - `lint`
  - `test`
  - `build`
- strict status checks are enabled
  - this means the PR branch must be up to date with the latest `main` before merge
- unresolved review conversations block merge
- force pushing to `main` is blocked
- deleting `main` is blocked

Current exception model:

- admin enforcement is disabled
- required approving review count is `0`

What that means in practice:

- normal team flow should use PRs and green CI
- the repository owner can still bypass protection in emergencies
- bypass is allowed only for real incidents, not convenience

## 3. Normal Development Flow

Every normal change should follow this path:

1. Create a feature branch.
2. Make the change in the branch.
3. Run the local checks that match the change.
4. Open a pull request into `main`.
5. Wait for required checks to pass.
6. Resolve review comments and conversations.
7. Merge only after the branch is current with `main`.

Expected branch naming:

- `feat/<short-description>`
- `fix/<short-description>`
- `chore/<short-description>`
- `docs/<short-description>`

Examples:

- `feat/song-request-admin-tools`
- `fix/menu-auth-guard`
- `docs/production-runbook`

## 4. Merge Rules

A pull request is merge-ready only when all of the following are true:

- `lint` is green
- `test` is green
- `build` is green
- no unresolved review conversation remains
- the PR branch is updated against the latest `main`
- the change description explains user-facing impact and deployment impact when relevant
- required docs were updated if behavior, infra, or process changed

Do not merge if any of the following are true:

- CI is red
- the PR fixes one thing but silently removes another behavior
- auth, env, deploy, or backup changes are undocumented
- a change introduces secrets, passwords, tokens, or copied `.env` content
- the reviewer found a production-risk regression that is still open

## 5. Required Local Checks Before Opening Or Updating A PR

Default local verification:

```bash
npm run lint
npm test
npm run build
```

When the change touches deploy or high-risk user flows, also run or verify:

```bash
npm run test:e2e:smoke
```

When the change materially affects UI flows or admin workflows, perform a targeted manual verification on the affected pages.

## 6. Review Expectations

Review should prioritize risk over style.

Primary review questions:

- Can this break login, admin access, redirects, or role checks?
- Can this break writes to SQLite or backup/restore flows?
- Can this break test or production domain behavior?
- Can this break Docker deployment or health checks?
- Does this change remove an existing user feedback path such as notifications or validation?
- Are docs still correct after this change?

When leaving review feedback, prefer concrete findings:

- what breaks
- where it breaks
- how it was verified
- what minimum fix is required before merge

## 7. Documentation Update Rules

Docs must be updated in the same PR when a change affects:

- environment variables
- GitHub Actions behavior
- deploy scripts or deploy asset layout
- server bootstrap steps
- branch protection or merge policy
- test or production domains
- backup, restore, or rollback steps
- admin operational workflows
- AI agent instructions

At minimum, update the most relevant document among:

- `README.md`
- `CONTRIBUTING.md`
- `DEPLOY.md`
- `docs/cicd-setup.md`
- `docs/server-bootstrap.md`
- `docs/production-launch-runbook.md`
- `AGENTS.md`

## 8. Secrets And Sensitive Data Rules

Never commit:

- `.env`
- `.env.local`
- copied server secret backups
- API keys
- Docker Hub tokens
- SSH private keys
- passwords
- raw database files from production or test unless explicitly approved for a controlled recovery task

If a PR includes secret handling changes, the PR description must say:

- which runtime secret changed
- where it is stored
- whether GitHub secret or server `.env` changes are required
- whether test and production both need updates

## 9. Test-To-Production Promotion Rule

Production releases must follow immutable SHA promotion.

Required promotion path:

1. candidate change lands on `main`
2. test deployment succeeds
3. `Preproduction Rehearsal` succeeds for the same `sha-<commit>`
4. human checks pass on `test.gshs.app`
5. production deployment uses that same `sha-<commit>`

Never promote to production using `latest` as the decision source.

Always verify:

- `/api/health` returns the expected SHA
- `/admin/test` is green
- recent backup exists

## 10. Emergency Exception Rule

Because admin enforcement is currently disabled, the repository owner can bypass the normal PR path if the service is down or a release must be stopped immediately.

This is allowed only when:

- production is broken
- login or admin access is broken
- deploy automation is blocking recovery
- secret rotation or infra repair must happen immediately

If an emergency bypass happens, follow up immediately with:

1. a written summary in the related PR, issue, or incident note
2. a normal follow-up PR if code changed outside the standard review flow
3. documentation updates if the incident revealed a missing rule or missing runbook step

Emergency bypass is not a substitute for review.

## 11. Rules For AI Agents

AI agents working in this repository must follow the same repository rules as human contributors.

Additional AI-specific requirements:

- read `AGENTS.md` before making non-trivial changes
- do not bypass documented deploy or backup rules
- do not invent environment values
- do not push production-facing changes without preserving the documented SHA-based release flow
- update docs when changing repo process or infra behavior

If an AI agent changes branch protection assumptions, workflow names, required checks, or release gates, it must update this document in the same change.

## 12. Recommended Future Tightening

The current baseline is intentionally practical.

If the team wants stricter protection later, the next recommended upgrades are:

1. require at least 1 approving review
2. enforce branch protection for admins too
3. require review from a second maintainer for auth, deploy, or DB-risk changes

Do these only when the team is comfortable with the added friction.
