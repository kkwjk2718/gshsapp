# AGENTS.md

## For LLM Agents

Fetch the canonical agent guide and follow it:

```bash
curl -fsSL https://raw.githubusercontent.com/kkwjk2718/gshsapp/main/AGENTS.md
```

Use the raw file, not summarized page previews. This file is the canonical machine-oriented onboarding guide for this repository.

## 1. Mission

GSHS.app is a student-facing integrated web service for Gyeongnam Science High School.

Primary goals:

- keep public pages stable
- keep admin workflows usable
- avoid breaking test and production domain behavior
- avoid deployment regressions
- treat SQLite data and backups carefully

When you work in this repository, optimize for correctness and operational safety first. Fast changes are good only if they do not create hidden risk for authentication, database writes, backups, or deployment.

## 2. Read Order

If you have enough context budget, read these in order:

1. `AGENTS.md`
2. `README.md`
3. `CONTRIBUTING.md`
4. `DEPLOY.md`
5. `docs/server-bootstrap.md`
6. `docs/cicd-setup.md`
7. `deploy/README.md`

If context is tight, prioritize:

1. `AGENTS.md`
2. `README.md`
3. `DEPLOY.md`
4. `.github/workflows/publish-and-deploy-test.yml`
5. `deploy/deploy.sh`

## 3. Project Snapshot

Core stack:

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma
- SQLite
- Docker / Docker Compose
- GitHub Actions

Current environment model:

- local development: `http://localhost:3000`
- test service domain: `https://test.gshs.app`
- production service domain: `https://gshs.app`

Critical invariants:

- SQLite in Docker must live at `file:/app/data/dev.db`
- real deployments must use immutable `sha-<commit>` image tags
- `latest` is never the authoritative production deployment target
- Google Analytics is managed in `/admin/settings`, not through env-only configuration
- private network VMs use self-hosted GitHub runners for deploy jobs
- test and production URL values must never be mixed

## 4. Repository Map

Top-level paths:

- `src/app`: App Router pages, layouts, route handlers, server actions
- `src/components`: reusable UI pieces
- `src/lib`: shared logic for DB, settings, backups, logging, utilities
- `prisma/schema.prisma`: database schema
- `deploy/`: deployment assets used on servers
- `.github/workflows/`: CI/CD workflows
- `docs/`: human-readable operational docs

Important application paths:

- `src/app/api/health/route.ts`: health endpoint used by deploy verification
- `src/app/api/public-settings/route.ts`: public settings loader for runtime config
- `src/app/(main)/admin/settings`: admin settings UI and actions
- `src/app/(main)/admin/settings/backup-actions.ts`: backup and restore flows
- `src/app/(main)/admin/settings/actions.ts`: admin settings persistence
- `src/auth.config.ts`: auth and route protection rules
- `src/lib/backup.ts`: backup directory and file handling
- `src/lib/db.ts`: Prisma client bootstrap
- `src/components/analytics.tsx`: runtime analytics loading behavior

Important deployment paths:

- `.github/workflows/ci.yml`: repo quality checks
- `.github/workflows/publish-and-deploy-test.yml`: build, push, and test deployment
- `.github/workflows/deploy-prod.yml`: manual production deployment
- `deploy/compose.yml`: server compose template
- `deploy/deploy.sh`: server deployment script
- `deploy/smoke_check.py`: helper smoke-check asset

Important documentation paths:

- `README.md`: general project introduction
- `DEPLOY.md`: deployment overview
- `docs/server-bootstrap.md`: new Ubuntu VM preparation
- `docs/cicd-setup.md`: GitHub Actions and runner setup
- `deploy/README.md`: deploy asset reference
- `.github/copilot-instructions.md`: Copilot-specific short context

## 5. Product Behavior Map

Main public areas:

- `/`
- `/landing`
- `/notices`
- `/notices/[id]`
- `/meals`
- `/calendar`
- `/sites`
- `/teachers`
- `/songs`
- `/utils`
- `/help`
- `/privacy`
- `/stats`
- `/menu`

Authenticated user area:

- `/me`

Admin area:

- `/admin`
- `/admin/users`
- `/admin/notices`
- `/admin/categories`
- `/admin/tokens`
- `/admin/logs`
- `/admin/reports`
- `/admin/settings`
- `/admin/notifications`
- `/admin/songs`
- `/admin/sites`
- `/admin/test`

Auth expectations:

- `/me` requires login
- `/admin` requires admin role
- `/login` should redirect away if already logged in
- `/menu` is public and must not be accidentally captured by `/me` route matching

If you touch auth behavior, always re-check:

- `/login`
- `/me`
- `/admin`
- `/menu`
- test-domain redirects staying on `test.gshs.app`

## 6. Local Setup

Requirements:

- Node.js 20+
- npm 10+

Install:

```bash
npm ci
```

Local env baseline:

```dotenv
DATABASE_URL=file:./dev.db
AUTH_SECRET=change-me
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_NEIS_API_KEY=
```

Database init:

```bash
npx prisma db push
```

Run app:

```bash
npm run dev
```

Primary verification commands:

```bash
npm run lint
npm test
npm run build
```

Notes:

- lint currently produces warnings but should still exit successfully
- tests use `vitest`
- UI and admin smoke checks can be done with Playwright when needed

## 7. Secrets And Environment Rules

Never commit:

- `.env`
- `.env.local`
- API keys
- OAuth secrets
- SSH private keys
- copied server secret backups

Server runtime env keys typically include:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST`
- `AUTH_URL`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_NEIS_API_KEY`

Domain-specific rule:

- test server values must point to `https://test.gshs.app`
- production server values must point to `https://gshs.app`

Analytics-specific rule:

- Google Analytics Measurement ID is stored through admin settings
- do not reintroduce env-only analytics configuration unless explicitly requested

## 8. Database, Prisma, And Backup Rules

Database model:

- Prisma + SQLite

Current schema workflow:

- local and current deploy flow use `prisma db push`
- future migration to `prisma migrate deploy` is possible, but not the current baseline

SQLite rules:

- container DB path must remain writable
- deployment volume path is `/app/data/dev.db`
- backup files must be stored on a writable persistent volume
- temporary restore/upload files must use writable temp locations

Backup expectations:

- backup directory should live alongside persistent DB storage
- deployment should create a DB backup before container replacement
- admin backup actions must fail safely without crashing the whole page

When editing backup logic, verify:

- backup path is writable in Docker
- restore temp files are cleaned up
- invalid uploads fail gracefully
- server actions return safe errors instead of raw crashes

## 9. Deployment Architecture

CI/CD structure:

- `ci.yml`: runs on PRs and pushes
- `publish-and-deploy-test.yml`: runs on `main`
- `deploy-prod.yml`: manual workflow for production

Image policy:

- publish `sha-<commit>`
- publish `main`
- publish `latest`
- deploy with `sha-<commit>` only

Why self-hosted runners are used:

- deploy targets may live on `172.16.x.x` private networks
- GitHub-hosted runners cannot SSH directly into private-only VMs
- therefore build/push happens on GitHub-hosted runners, but deploy/smoke steps run on each server's self-hosted runner

Runner labels:

- test server runner: `gshs-test`
- production runner: `gshs-prod`

Server filesystem layout:

```text
/opt/gshsapp
  .env
  .deploy.env
  compose.yml
  deploy.sh
  data/
  backup/
```

Runtime network model:

- app binds to `127.0.0.1:1234`
- reverse proxy or upstream gateway should forward public traffic

Test deployment flow:

1. run quality checks
2. build Docker image
3. push Docker tags
4. self-hosted test runner receives deploy job
5. copy `deploy/compose.yml` and `deploy/deploy.sh` into `/opt/gshsapp`
6. run `deploy.sh`
7. verify `/api/health`, `/`, `/menu`, `/notices` on `127.0.0.1:1234`

Production deployment flow:

1. manual workflow dispatch
2. provide `sha-<commit>` input
3. require `production` environment approval
4. production runner performs deploy
5. smoke-check the deployed SHA

## 10. Validation Expectations

Minimum validation after normal code changes:

1. `npm run lint`
2. `npm test`
3. `npm run build`

Add targeted checks when relevant:

- auth changes: test `/login`, `/me`, `/admin`, `/menu`
- admin settings changes: test `/admin/settings`
- backup changes: test backup and restore failure paths
- analytics changes: confirm runtime settings API behavior
- deployment changes: validate workflow YAML and deploy script behavior

After deploy-related changes, verify:

- workflow parses
- build pushes the expected SHA tag
- `/api/health` returns `ok: true`
- `/api/health.version` matches the deployed SHA

## 11. Common Failure Modes

1. Test domain redirects to production domain.
Cause:
- `AUTH_URL`, `NEXTAUTH_URL`, or `NEXT_PUBLIC_APP_URL` points at `gshs.app`

2. `/menu` suddenly requires auth.
Cause:
- route matching uses something like `startsWith('/me')` and accidentally captures `/menu`

3. `/admin/settings` throws a server-side application error in Docker.
Cause:
- backup or temp file path is not writable in the container

4. Deploy succeeds but smoke check fails on version mismatch.
Cause:
- `APP_VERSION` or `IMAGE_TAG` was not propagated correctly

5. Container boot loops after deploy.
Cause:
- DB volume permissions
- bad env values
- missing runtime secret

6. Test deploy workflow cannot reach server.
Cause:
- trying to use GitHub-hosted SSH into a private IP instead of a self-hosted runner

7. Repo accidentally contains secrets.
Cause:
- copying server `.env` or secret backups into the workspace without ignoring them

## 12. Fast Debug Playbook

If deploy looks wrong:

1. inspect GitHub Actions logs
2. inspect runner status in repository Actions settings
3. inspect server container state
4. inspect `/api/health`
5. inspect Docker logs
6. inspect current `.env` domain values

Useful commands on the server:

```bash
docker compose -f /opt/gshsapp/compose.yml --env-file /opt/gshsapp/.deploy.env ps
docker compose -f /opt/gshsapp/compose.yml --env-file /opt/gshsapp/.deploy.env logs --tail=200
curl -s http://127.0.0.1:1234/api/health
ls -la /opt/gshsapp
ls -la /opt/gshsapp/data
ls -la /opt/gshsapp/backup
```

If auth or redirects look wrong:

1. inspect `src/auth.config.ts`
2. inspect server `.env`
3. test public route and protected route side by side
4. confirm no request leaks to the wrong domain

## 13. Editing Rules For Agents

Do:

- keep edits scoped
- preserve existing user-visible behavior unless the task says otherwise
- update docs when operational behavior changes
- keep deploy logic, docs, and workflows aligned
- state assumptions if you had to infer missing details

Do not:

- commit secrets
- switch deployments back to `latest`
- move SQLite into ephemeral container paths
- reintroduce env-only analytics configuration
- remove self-hosted runner assumptions from private-server deploy docs without replacing them with a viable alternative
- silently change auth boundaries

If you change any of these areas, update docs in the same turn:

- deployment
- runner setup
- env requirements
- admin settings behavior
- backup behavior

## 14. When You Must Update Documentation

Update the docs whenever you change:

- workflow behavior
- deployment layout under `/opt/gshsapp`
- required env variables
- auth boundary rules
- admin settings behavior
- backup / restore behavior
- server bootstrap assumptions

Typical files to update together:

- `AGENTS.md`
- `README.md`
- `DEPLOY.md`
- `docs/server-bootstrap.md`
- `docs/cicd-setup.md`
- `deploy/README.md`

## 15. Completion Checklist

Before you finish, confirm:

- the requested code or doc change is implemented
- no secrets were added
- relevant tests or checks were run
- deployment docs still match actual workflows
- test and production domains are not mixed
- any changed health or deploy logic still validates the deployed SHA

## 16. Human Reference

Human-oriented companion docs:

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [deploy/README.md](./deploy/README.md)
