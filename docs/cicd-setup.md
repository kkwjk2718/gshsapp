# GitHub Actions CI/CD 설정 가이드

이 문서는 현재 저장소 구조를 기준으로 GitHub Actions, Docker Hub, 테스트 서버, 운영 서버를 연결하는 방법을 설명합니다.

## 목표 구조

- PR / push: CI 실행
- `main` push: Docker 이미지 빌드 및 Docker Hub 푸시
- `main` push: 테스트 서버 self-hosted runner 자동 배포
- 수동 실행: 운영 서버 self-hosted runner 배포

## 워크플로우 파일

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/publish-and-deploy-test.yml`](../.github/workflows/publish-and-deploy-test.yml)
- [`.github/workflows/preproduction-rehearsal.yml`](../.github/workflows/preproduction-rehearsal.yml)
- [`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml)
- [`.github/workflows/production-health-monitor.yml`](../.github/workflows/production-health-monitor.yml)
- [`.github/workflows/scheduled-backup-test.yml`](../.github/workflows/scheduled-backup-test.yml)

## 1. Docker Hub 준비

필요한 것:

- Docker Hub 계정
- `gshsapp` 이미지 저장소
- push 가능한 access token

GitHub repository secrets에는 아래 값을 넣습니다.

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## 2. GitHub Environments 생성

기본적으로 두 개의 environment를 사용합니다.

- `test`
- `production`

권장 설정:

- `production`에 Required reviewers 활성화
- `test`, `production` 각각 URL 설정

권장 URL:

- `test`: `https://test.gshs.app`
- `production`: `https://gshs.app`

## 3. Self-hosted runner 준비

배포 대상 VM이 사설망(`172.16.x.x`)에 있는 경우가 많기 때문에 GitHub-hosted runner가 직접 SSH로 접근하는 방식은 사용하지 않습니다.

현재 구조:

- 빌드 / 테스트 / Docker Hub 푸시: GitHub-hosted runner
- 테스트 서버 배포 및 smoke check: 테스트 서버 self-hosted runner
- 운영 서버 배포 및 smoke check: 운영 서버 self-hosted runner

권장 runner label:

- 테스트 서버: `gshs-test`
- 운영 서버: `gshs-prod`

테스트 서버 runner 설치 예시:

```bash
mkdir -p /home/deploy/actions-runner
cd /home/deploy/actions-runner
curl -fsSL -o actions-runner.tar.gz https://github.com/actions/runner/releases/download/v2.333.0/actions-runner-linux-x64-2.333.0.tar.gz
tar xzf actions-runner.tar.gz
./config.sh --unattended --url https://github.com/kkwjk2718/gshsapp --token <registration-token> --name gshs-test-vm --labels gshs-test
sudo ./svc.sh install deploy
sudo ./svc.sh start
```

확인 방법:

- GitHub repository settings > Actions > Runners에서 `Online` 또는 `Idle`
- 서버에서 `sudo ./svc.sh status`

## 4. 브랜치 보호 규칙 권장값

`main`에는 아래 보호 규칙을 유지합니다.

- direct push 제한
- PR 필수
- status checks required
- 필수 체크:
  - `lint`
  - `test`
  - `build`
- 미해결 리뷰 대화가 있으면 머지 금지
- force push 금지
- branch deletion 금지

상세 정책은 [docs/repository-governance.md](./repository-governance.md)를 기준으로 유지합니다.

## 5. 이미지 태그 정책

GitHub Actions는 아래 태그를 푸시합니다.

- `sha-<commit>`
- `main`
- `latest`

실제 배포 기준:

- 테스트 서버: `sha-<commit>`
- 운영 서버: `sha-<commit>`

금지 사항:

- 운영 배포 판단 기준으로 `latest` 사용 금지

## 6. 테스트 서버 자동 배포 흐름

`main`에 push하면 아래 순서로 진행됩니다.

1. `lint`
2. `test`
3. `build`
4. Docker Hub 푸시
5. `gshs-test` self-hosted runner가 테스트 서버 배포 수행
6. `/opt/gshsapp`에 `compose.yml`, `deploy.sh` 등 최신 자산 반영
7. `deploy.sh` 실행
8. 서버 내부 smoke check 실행
9. `test.gshs.app` 기준 Playwright E2E 실행

## 7. 운영 서버 수동 배포 흐름

GitHub Actions에서 `Deploy Production` 워크플로우를 직접 실행합니다.

입력값:

- `image_tag=sha-<commit>`

진행 순서:

1. `production` environment 승인
2. `gshs-prod` self-hosted runner가 배포 작업 수행
3. `/opt/gshsapp`에 배포 자산 반영
4. 지정한 SHA 이미지 pull
5. DB 백업
6. 컨테이너 갱신
7. smoke check 및 운영 확인

## 8. 테스트 / 운영 environment 시크릿

### 공통 repository secrets

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

### `test` environment secrets

- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

### `production` environment secrets

- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

선택 사항:

- `MONITOR_ALERT_WEBHOOK_URL`

## 9. 프리프로덕션 리허설

운영 승격 전에는 `Preproduction Rehearsal` 워크플로우를 사용합니다.

역할:

- 후보 SHA를 테스트 서버에 다시 배포
- smoke check 실행
- Playwright E2E 실행
- restore drill 실행

기본 환경값:

- `E2E_BASE_URL=https://test.gshs.app`
- `BACKUP_MAX_AGE_HOURS=24`
- `RESTORE_DRILL_PORT=1235`

운영 승격 기준:

- 같은 SHA가 테스트 서버 배포에서 초록
- 같은 SHA가 `Preproduction Rehearsal`에서도 초록
- `/admin/test`가 모두 `PASS`

## 10. 운영 모니터링 활성화 규칙

운영 모니터링 워크플로우는 현재 저장소 변수 `PRODUCTION_MONITOR_ENABLED`가 `true`일 때만 실제 헬스 체크를 수행합니다.

이 변수를 켜기 전 조건:

- `gshs.app`이 실제 앱으로 연결됨
- `https://gshs.app/api/health`가 JSON을 반환함
- 운영 서버 배포 구조가 최종 확정됨

즉, 현재처럼 점검 페이지가 운영 도메인에 걸려 있을 때는 모니터링을 활성화하지 않습니다.

## 11. 정기 백업 자동화

정기 백업은 더 이상 웹 요청 경로에서 실행되지 않습니다.

현재 구조:

- 워크플로우: [`.github/workflows/scheduled-backup-test.yml`](../.github/workflows/scheduled-backup-test.yml)
- 호스트 스크립트: [`deploy/run-scheduled-backup.sh`](../deploy/run-scheduled-backup.sh)
- 컨테이너 내부 진입점: [`scripts/run-scheduled-backup.mjs`](../scripts/run-scheduled-backup.mjs)

실행 흐름:

1. GitHub Actions scheduler가 `gshs-test` runner를 깨움
2. runner가 `/opt/gshsapp`로 이동
3. `run-scheduled-backup.sh`가 Docker와 컨테이너 상태를 확인
4. 실행 중인 앱 컨테이너 안에서 백업 스크립트를 실행
5. 실제로 백업이 필요한 경우에만 `LAST_BACKUP_AT` 갱신

## 12. 실패 시 확인 순서

우선순위:

1. workflow 로그
2. Docker Hub push 로그
3. self-hosted runner online 상태
4. 서버 `.env` 누락 여부
5. 서버 `docker compose logs`
6. `/api/health` 응답

## 13. 새 테스트 서버를 붙이는 순서

1. Ubuntu VM 준비
2. [docs/server-bootstrap.md](./server-bootstrap.md)를 기준으로 서버 부트스트랩
3. 테스트 서버 `.env` 작성
4. self-hosted runner를 `gshs-test` label로 등록
5. GitHub `test` environment URL 확인
6. `main` push 또는 workflow 재실행으로 자동 배포 검증

## 14. 운영상 메모

- 서버 접속 계정은 개인 계정보다 배포 전용 사용자를 권장합니다.
- 배포 구조가 바뀌면 `README`, `DEPLOY`, `docs/`, `deploy/README`를 같이 수정합니다.
- 운영 배포 직전에는 `Preproduction Rehearsal`을 통과한 SHA만 사용합니다.
- 운영 모니터링 활성화 여부도 문서와 GitHub 변수 상태를 함께 맞춰둡니다.
