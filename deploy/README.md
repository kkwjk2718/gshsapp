# CI/CD deployment assets

This directory contains the repo-tracked files used by GitHub Actions to deploy the app over SSH.

## Remote server layout

Prepare each server with this layout:

```text
/opt/gshsapp
  .env
  compose.yml
  deploy.sh
  data/
  backup/
```

`compose.yml` and `deploy.sh` are copied from this repo by GitHub Actions. `.env`, `data/`, and `backup/` stay on the server.

## Required runtime env on the server

Keep these values only on the server-side `.env` file:

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-me
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

Update the three URL values to `https://gshs.app` on the production VM.

## GitHub secrets and environments

Repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Environment secrets for both `test` and `production`:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`
- `KNOWN_HOSTS`

Recommended environment URLs:

- `test`: `https://test.gshs.app`
- `production`: `https://gshs.app`

Configure the `production` environment in GitHub to require manual approval.

## One-time server prep

1. Install Docker Engine and the Docker Compose plugin.
2. Create a dedicated deploy user with Docker access.
3. Create `/opt/gshsapp`, then add the server `.env` file.
4. Add the deploy user's public key to `~/.ssh/authorized_keys`.
5. Keep reverse proxy and TLS outside the app container.

## Deployment flow

- Pull request and push CI runs `lint`, `test`, and `build`.
- Push to `main` builds and pushes Docker tags: `sha-<commit>`, `main`, `latest`.
- Test deploy automatically pulls `sha-<commit>` and runs smoke checks.
- Production deploy is started manually with a `sha-<commit>` tag and GitHub environment approval.
