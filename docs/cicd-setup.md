# GitHub Actions CI/CD 설정 가이드

이 문서는 저장소 기준으로 GitHub Actions, Docker Hub, 테스트 서버, 운영 서버를 연결하는 방법을 설명합니다.

## 목표 구조

- PR / push: CI 실행
- `main` push: Docker 이미지 빌드 및 Docker Hub 푸시
- `main` push: 테스트 서버 self-hosted runner 자동 배포
- 수동 실행: 운영 서버 self-hosted runner 배포

## 워크플로우 파일

- [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- [.github/workflows/publish-and-deploy-test.yml](../.github/workflows/publish-and-deploy-test.yml)
- [.github/workflows/deploy-prod.yml](../.github/workflows/deploy-prod.yml)

## 1. Docker Hub 준비

필요한 것:

- Docker Hub 계정
- `gshsapp` 저장소
- push 가능한 access token

GitHub repository secrets에 아래를 추가합니다.

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## 2. GitHub Environments 만들기

Environments 두 개를 만듭니다.

- `test`
- `production`

권장 설정:

- `production`은 Required reviewers 켜기
- `test`와 `production` 각각 URL 입력

권장 URL:

- `test`: `https://test.gshs.app`
- `production`: `https://gshs.app`

## 3. Self-hosted runner 준비

이 저장소의 배포 대상 VM이 `172.16.x.x` 같은 사설망에 있기 때문에, GitHub-hosted runner가 직접 SSH로 접속하는 방식은 사용할 수 없습니다.

대신 아래 구조를 기준으로 합니다.

- 품질 검사와 Docker 이미지 푸시: GitHub-hosted runner
- 테스트 배포와 스모크 체크: 테스트 서버 안의 self-hosted runner
- 운영 배포와 스모크 체크: 운영 서버 안의 self-hosted runner

권장 runner label:

- 테스트 서버: `gshs-test`
- 운영 서버: `gshs-prod`

테스트 서버 runner 설치 예시:

1. GitHub에서 repository runner registration token 발급
2. 서버에 runner 압축 해제
3. `deploy` 사용자로 runner 등록
4. systemd 서비스로 상시 실행

```bash
mkdir -p /home/deploy/actions-runner
cd /home/deploy/actions-runner
curl -fsSL -o actions-runner.tar.gz https://github.com/actions/runner/releases/download/v2.333.0/actions-runner-linux-x64-2.333.0.tar.gz
tar xzf actions-runner.tar.gz
./config.sh --unattended --url https://github.com/kkwjk2718/gshsapp --token <registration-token> --name gshs-test-vm --labels gshs-test
sudo ./svc.sh install deploy
sudo ./svc.sh start
```

확인:

- GitHub repository settings > Actions > Runners 에서 runner가 `Idle` 또는 `Online`
- 서버에서 `sudo ./svc.sh status`

## 4. 브랜치 보호 규칙 권장

`main`에는 아래를 권장합니다.

- direct push 제한
- PR required
- status checks required
- required checks:
  - `lint`
  - `test`
  - `build`

## 5. 이미지 태그 정책

GitHub Actions는 아래 태그를 푸시합니다.

- `sha-<commit>`
- `main`
- `latest`

실제 배포에 사용하는 태그:

- 테스트 서버: `sha-<commit>`
- 운영 서버: `sha-<commit>`

사용하지 않는 기준:

- 운영 배포에서 `latest` 직접 사용 금지

## 6. 테스트 서버 자동 배포 흐름

`main`에 push되면:

1. `lint`
2. `test`
3. `build`
4. Docker Hub push
5. `gshs-test` self-hosted runner가 테스트 서버에서 job 수신
6. `/opt/gshsapp`에 `deploy/compose.yml`, `deploy.sh` 반영
7. 서버에서 `deploy.sh` 실행
8. 같은 runner가 `127.0.0.1:1234` 기준 `/api/health`, `/`, `/menu`, `/notices` 확인

## 7. 운영 서버 수동 배포 흐름

GitHub Actions에서 `Deploy Production` 워크플로우를 직접 실행합니다.

입력값:

- `image_tag=sha-<commit>`

진행:

1. `production` environment 승인
2. `gshs-prod` self-hosted runner가 production job 수신
3. `/opt/gshsapp`에 배포 자산 반영
4. 지정한 SHA 이미지 pull
5. DB 백업
6. 컨테이너 갱신
7. 스모크 체크

## 8. 실패 시 확인할 것

GitHub Actions 실패 시 우선순위:

1. workflow 로그
2. Docker Hub 로그인 실패 여부
3. self-hosted runner offline 여부
4. 서버 `.env` 누락 여부
5. 서버 `docker compose logs`
6. `/api/health` 응답 여부

## 9. 새 테스트 서버를 붙일 때 순서

1. 새 Ubuntu VM 준비
2. [docs/server-bootstrap.md](./server-bootstrap.md) 기준으로 서버 세팅
3. 테스트 서버 `.env` 작성
4. self-hosted runner를 `gshs-test` label로 등록
5. GitHub `test` environment URL 확인
6. `main` push 또는 workflow 재실행

## 10. 팀 운영 원칙

- 서버 접속 방법은 개인 계정이 아니라 배포 전용 사용자 기준으로 정리
- 구두 전달보다 문서 우선
- 새 시크릿이 생기면 문서와 GitHub settings를 함께 갱신
- 서버 구조가 바뀌면 `README`, `DEPLOY`, `docs/`, `deploy/README`를 같이 수정
## Additional Test Environment Secrets

The `test` environment now also needs:

- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

Workflow roles:

- `ci.yml`: lint, vitest, build
- `publish-and-deploy-test.yml`: publish image, deploy to test, smoke, Playwright E2E
- `preproduction-rehearsal.yml`: manual candidate SHA deploy + smoke + E2E + restore drill
- `deploy-prod.yml`: approved production deployment

Shared defaults used by the test workflows:

- `E2E_BASE_URL=https://test.gshs.app`
- `BACKUP_MAX_AGE_HOURS=24`
- `RESTORE_DRILL_PORT=1235`

## Production Verification Additions

Production deployment now includes post-deploy Playwright smoke checks in `deploy-prod.yml`.

Additional production environment secrets:

- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

Optional repository secret:

- `MONITOR_ALERT_WEBHOOK_URL`

New workflow:

- `.github/workflows/production-health-monitor.yml`

Recommended usage:

1. run `Preproduction Rehearsal` for the candidate SHA
2. confirm the same SHA is green on `test.gshs.app`
3. run `Deploy Production`
4. confirm `deploy -> smoke -> e2e` is green
5. keep the monitor workflow enabled so production health is checked continuously

## Repository Governance And Branch Protection

Detailed repository policy:

- [docs/repository-governance.md](./repository-governance.md)
- [docs/repository-governance.ko.md](./repository-governance.ko.md)

Current `main` branch protection baseline:

- required checks: `lint`, `test`, `build`
- strict required status checks enabled
- unresolved conversations must be resolved
- force pushes disabled
- branch deletion disabled
- admin enforcement disabled for emergency recovery only

Implications for CI/CD:

- a PR branch must be rebased or updated if `main` moved
- green workflow runs from an outdated branch are not enough
- release candidates should be merged only after required checks are green on the latest base
- emergency admin bypass should be treated as an incident and documented

## Scheduled Backup Automation

Public page requests no longer trigger scheduled backups.

Reason:

- public TTFB should not depend on backup interval checks
- backup timing belongs to infrastructure automation, not the page render path

Current implementation:

- workflow: [`.github/workflows/scheduled-backup-test.yml`](../.github/workflows/scheduled-backup-test.yml)
- host script: [`deploy/run-scheduled-backup.sh`](../deploy/run-scheduled-backup.sh)
- in-container command: [`scripts/run-scheduled-backup.ts`](../scripts/run-scheduled-backup.ts)

Execution flow:

1. GitHub Actions scheduler wakes up on the `gshs-test` self-hosted runner.
2. The runner changes into `/opt/gshsapp`.
3. `run-scheduled-backup.sh` verifies Docker and the running `gshsapp-web` container.
4. The script runs the existing backup logic inside the container.
5. The app updates `LAST_BACKUP_AT` only when a backup is actually due and completes successfully.

Notes:

- the current scheduled workflow targets the test environment
- production can reuse the same pattern later with a `gshs-prod` runner once the production VM is ready
- backup cadence is still controlled in the admin settings UI through `BACKUP_INTERVAL_DAYS`
