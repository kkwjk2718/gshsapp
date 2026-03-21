# Contributing

This document explains how to work safely in the `gshsapp` repository.

Use this together with:

- [README.md](./README.md)
- [AGENTS.md](./AGENTS.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/repository-governance.md](./docs/repository-governance.md)

## Default Workflow

Use this flow for almost every change:

1. Create a branch from `main`.
2. Make the change in the branch.
3. Run the required local checks.
4. Open a pull request.
5. Resolve review comments.
6. Merge only after the required checks are green.

Do not work directly on `main` for normal changes.

## Branch Naming

Recommended branch names:

- `feat/<short-description>`
- `fix/<short-description>`
- `chore/<short-description>`
- `docs/<short-description>`

Examples:

- `feat/admin-notice-tools`
- `fix/menu-auth-guard`
- `docs/release-runbook`

## Commit Messages

Keep commit messages short and explicit.

Recommended formats:

```text
type: summary
```

or

```text
type(scope): summary
```

Examples:

- `fix: stop redirecting menu to login`
- `feat(settings): manage analytics from admin`
- `docs: expand repository governance guide`

## Required Local Checks

Run these before opening or updating a PR:

```bash
npm run lint
npm test
npm run build
```

When the change affects deployment safety or critical user flows, also verify:

```bash
npm run test:e2e:smoke
```

## Pull Request Expectations

A PR description should explain:

1. what changed
2. why it changed
3. how it was verified
4. whether deployment behavior changes
5. whether test or production environment changes are required

Use the PR template and keep it accurate.

## Documentation Rules

Update docs in the same PR when a change affects:

- deployment behavior
- GitHub Actions behavior
- branch protection or merge policy
- authentication or authorization behavior
- environment variables
- backup, restore, or rollback behavior
- test or production domains
- AI agent instructions

Relevant docs include:

- [README.md](./README.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- [docs/repository-governance.md](./docs/repository-governance.md)
- [AGENTS.md](./AGENTS.md)

## Secrets And Sensitive Data

Never commit:

- `.env`
- `.env.local`
- API keys
- passwords
- Docker Hub tokens
- SSH private keys
- copied server secret backups
- raw server database files unless explicitly needed for a controlled recovery task

If a change requires secret updates, document:

- which secret changed
- where it is stored
- whether test and production both need updates

## Branch Protection And Merge Policy

Detailed repository rules live here:

- [docs/repository-governance.md](./docs/repository-governance.md)
- [docs/repository-governance.ko.md](./docs/repository-governance.ko.md)

Current team baseline:

- `main` is protected
- required checks are `lint`, `test`, and `build`
- unresolved review conversations block merge
- force push and branch deletion on `main` are blocked
- emergency admin bypass exists but is for incident response only

## Review Priorities

Reviews should prioritize operational risk over style.

Focus on:

- auth and role regressions
- database write safety
- backup and restore safety
- test vs production domain mixups
- deployment regressions
- silent feature regressions
- missing docs

## For AI Agents

AI agents must follow the same process as human contributors.

Before large or infra-related changes, agents should read:

- [AGENTS.md](./AGENTS.md)
- [docs/repository-governance.md](./docs/repository-governance.md)

If an agent changes workflow names, branch protection assumptions, or release gates, it must update the related docs in the same change.
