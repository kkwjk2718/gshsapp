# GitHub Actions CI/CD 설정 가이드

이 문서는 현재 저장소 구조를 기준으로 GitHub Actions, Docker Hub, 테스트 서버, 운영 서버를 연결하는 방법을 설명합니다.

이 문서가 다루는 것:

- repository secrets와 environments
- Docker Hub 연동
- self-hosted runner 구성
- 테스트/운영 배포 workflow 구조
- semver 릴리스와 SHA 배포의 관계

이 문서가 다루지 않는 것:

- 새 서버 OS 부트스트랩 절차
- 운영 직전 수동 체크리스트

위 두 항목은 각각 [docs/server-bootstrap.md](./server-bootstrap.md), [docs/production-launch-runbook.md](./production-launch-runbook.md)를 봅니다.

## 1. 목표 구조

- PR / push: CI 실행
- `main` push: Docker 이미지 빌드 및 Docker Hub 푸시
- `main` push: 테스트 서버 self-hosted runner 자동 배포
- 수동 실행: 운영 서버 self-hosted runner 배포
- 운영 배포 성공 후 `vX.Y.Z` GitHub Release 생성

## 2. 워크플로우 파일

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/publish-and-deploy-test.yml`](../.github/workflows/publish-and-deploy-test.yml)
- [`.github/workflows/preproduction-rehearsal.yml`](../.github/workflows/preproduction-rehearsal.yml)
- [`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml)
- [`.github/workflows/production-health-monitor.yml`](../.github/workflows/production-health-monitor.yml)
- [`.github/workflows/scheduled-backup-test.yml`](../.github/workflows/scheduled-backup-test.yml)

## 3. Docker Hub 준비

필요한 것:

- Docker Hub 계정
- `gshsapp` 이미지 저장소
- push 가능한 access token

Repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

이미지 태그 정책:

- `sha-<commit>`
- `main`
- `latest`

실제 배포 기준:

- 테스트 서버: `sha-<commit>`
- 운영 서버: `sha-<commit>`

## 4. GitHub Environments

기본 environment:

- `test`
- `production`

권장 설정:

- `production`에 Required reviewers 활성화
- `test`, `production`에 URL 설정

권장 URL:

- `test`: `https://test.gshs.app`
- `production`: `https://gshs.app`

## 5. Self-hosted runner 구조

현재 구조:

- 빌드/테스트/Docker Hub 푸시: GitHub-hosted runner
- 테스트 서버 배포와 smoke check: 테스트 서버 self-hosted runner
- 운영 서버 배포와 smoke check: 운영 서버 self-hosted runner

권장 label:

- 테스트 서버: `gshs-test`
- 운영 서버: `gshs-prod`

runner가 필요한 이유:

- 테스트/운영 서버가 사설망 VM일 수 있음
- GitHub-hosted runner가 직접 SSH 배포하기 어려움
- 서버 안의 runner가 배포 스크립트를 실행하는 모델이 더 안정적임

## 6. 테스트 서버 자동 배포 흐름

`main`에 push하면 아래 순서로 진행됩니다.

1. `lint`
2. `test`
3. `build`
4. Docker Hub 푸시
5. `gshs-test` runner가 테스트 서버 배포 수행
6. `/opt/gshsapp`에 `compose.yml`, `deploy.sh` 등 최신 자산 반영
7. `deploy.sh` 실행
8. 서버 내부 smoke check
9. `test.gshs.app` 기준 Playwright E2E 실행

## 7. 운영 서버 수동 배포 흐름

`Deploy Production` workflow를 수동 실행합니다.

입력값:

- `image_tag=sha-<commit>`

진행 순서:

1. `production` environment 승인
2. `gshs-prod` runner가 배포 수행
3. 지정한 SHA 이미지 pull
4. DB 백업
5. 컨테이너 갱신
6. 서버 내부 smoke check
7. 공개 도메인 기준 Playwright smoke
8. semver GitHub Release 생성 또는 갱신

## 8. semver 릴리스 정책

버전 소스:

- `package.json`

릴리스 규칙:

- 운영 배포 성공 시 `vX.Y.Z` 태그 기준 GitHub Release 생성
- 릴리스 본문에는 서비스 버전, 배포 SHA, 헬스 버전, 실행 기록을 함께 남김
- 같은 `vX.Y.Z`가 이미 다른 SHA에 사용되었으면 운영 배포는 실패
- 이 경우 `package.json` 버전을 먼저 올린 뒤 다시 배포해야 함

중요:

- semver 릴리스는 사용자에게 보이는 버전 추적용
- 실제 서버 배포 이미지는 계속 `sha-<commit>`를 사용

## 9. Environment secrets

### 공통 repository secrets

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

### `test` environment secrets

- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

### `production` environment secrets

- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

선택:

- `MONITOR_ALERT_WEBHOOK_URL`

## 10. 프리프로덕션 리허설

`Preproduction Rehearsal`의 역할:

- 후보 SHA를 테스트 서버에 재배포
- smoke check 실행
- Playwright E2E 실행
- restore drill 실행

운영 승격 조건:

- 테스트 자동 배포 초록
- 같은 SHA의 `Preproduction Rehearsal` 초록
- `/admin/test`가 PASS

## 11. 운영 모니터링과 정기 백업

운영 모니터링:

- `PRODUCTION_MONITOR_ENABLED=true`일 때만 실제 헬스 체크 수행
- `gshs.app`이 아직 점검 페이지면 활성화하지 않음

정기 백업:

- 더 이상 웹 요청 경로에서 실행되지 않음
- `scheduled-backup-test.yml` + `run-scheduled-backup.sh` + `run-scheduled-backup.mjs` 구조 사용

## 12. 문제 발생 시 우선 확인 순서

1. workflow 로그
2. Docker Hub push 로그
3. self-hosted runner online 상태
4. 서버 `.env` 누락 여부
5. 서버 `docker compose logs`
6. `/api/health` 응답

## 13. 관련 문서

- [DEPLOY.md](../DEPLOY.md)
- [docs/server-bootstrap.md](./server-bootstrap.md)
- [docs/production-launch-runbook.md](./production-launch-runbook.md)
- [deploy/README.md](../deploy/README.md)
