# Production Launch Runbook

This document is the decision-complete runbook for the first production release of `gshs.app`.

## What Is Already In Place

- `main` pushes run CI and deploy automatically to `test.gshs.app`
- `Preproduction Rehearsal` validates a candidate immutable `sha-<commit>` on the test server
- `deploy/restore-drill.sh` verifies backup restore and admin login without touching the live DB
- `/api/health` and `/admin/test` are the primary go/no-go checks

## Required Production Setup

Before the first production deployment, make sure all of the following are true:

- the production VM has a self-hosted runner with the `gshs-prod` label
- `/opt/gshsapp/{data,backup,.env}` exists on the production VM
- the production `.env` uses `https://gshs.app` for `AUTH_URL`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL=file:/app/data/dev.db`
- the reverse proxy forwards `gshs.app` to the production VM on port `1234`
- the GitHub `production` environment has approval enabled
- the GitHub `production` environment contains:
  - `DOCKERHUB_USERNAME`
  - `DOCKERHUB_TOKEN`
  - `E2E_ADMIN_USER`
  - `E2E_ADMIN_PASSWORD`
- the repository secrets contain `MONITOR_ALERT_WEBHOOK_URL` if webhook alerts are desired

## Mandatory Pre-Deploy Safety Steps

Run these in order for the exact `sha-<commit>` you plan to release:

1. confirm `Publish And Deploy Test` is green for that SHA
2. run `Preproduction Rehearsal` for the same SHA and wait for green
3. open `/admin/test` on `test.gshs.app` and confirm all checks are `PASS`
4. confirm the latest backup timestamp is fresh
5. verify these manual paths on `test.gshs.app`
   - login
   - admin settings
   - notice create/read
   - meals
   - calendar
6. create an off-host backup copy or a Proxmox snapshot

## Off-Host Backup Export

Use the latest backup file if one exists. If not, export a fresh copy of the live SQLite file.

```bash
cd /opt/gshsapp
OFFSITE_TARGET=/mnt/backups/gshsapp ./offsite-backup.sh
```

Remote storage example:

```bash
cd /opt/gshsapp
OFFSITE_TARGET=backup-user@backup-host:/srv/backups/gshsapp/ ./offsite-backup.sh
```

## Production Deployment Flow

1. open GitHub Actions and run `Deploy Production`
2. enter the same immutable `sha-<commit>` that already passed rehearsal
3. approve the `production` environment when prompted
4. wait for the workflow to finish `deploy -> smoke -> e2e`
5. confirm `https://gshs.app/api/health` returns the deployed SHA
6. log in as admin on `gshs.app`
7. open `/admin/test` and confirm all checks are `PASS`

## Rollback Rules

If the release fails, do not deploy a new untested SHA. Roll back in this order:

1. redeploy the last known-good immutable `sha-<commit>`
2. re-check `https://gshs.app/api/health`
3. only restore the latest `dev.db.*.bak` if the failure is data-related
4. if the issue is routing or TLS, fix the reverse proxy and re-run smoke checks before touching the DB

## Production Monitoring Baseline

The repository now includes `.github/workflows/production-health-monitor.yml`.

- it checks `https://gshs.app/api/health` and `/`
- it fails loudly in GitHub Actions if production becomes unhealthy
- if `MONITOR_ALERT_WEBHOOK_URL` is configured, it also posts an alert message to the webhook

Minimum manual commands for the first production week:

```bash
cd /opt/gshsapp
docker compose ps
docker compose logs --tail=200
```
