# GSHS.app 배포 가이드

이 문서는 저장소 기준의 배포 구조와 운영 원칙을 설명합니다.

대상 독자:

- 테스트 서버 또는 운영 서버를 새로 준비해야 하는 사람
- GitHub Actions와 Docker Hub 연동을 유지보수하는 사람
- 배포 흐름, 롤백 기준, 백업 원칙을 파악해야 하는 사람

## 배포 구조

현재 기본 배포 흐름은 아래와 같습니다.

1. Pull Request 또는 push에서 CI 실행
2. `main` push 시 Docker 이미지 빌드
3. Docker Hub에 `sha-<commit>`, `main`, `latest` 태그 푸시
4. 테스트 서버 self-hosted runner가 `sha-<commit>` 기준 자동 배포
5. 운영 서버는 GitHub Actions 수동 실행 + `production` environment 승인 후 배포

핵심 원칙:

- 실제 배포 기준은 항상 `sha-<commit>`
- 테스트와 운영 서버는 분리
- 서버 시크릿은 GitHub가 아니라 서버 `.env`에서 관리
- SQLite는 컨테이너 내부 임시 경로가 아니라 영속 볼륨에 저장
- 사설망 VM은 GitHub-hosted runner가 직접 SSH 하지 않고, 서버 안의 self-hosted runner가 배포를 수행

## 저장소 안의 주요 배포 파일

- [Dockerfile](./Dockerfile): 앱 이미지 빌드
- [docker-compose.yml](./docker-compose.yml): 로컬 개발 또는 수동 실행용 compose
- [deploy/compose.yml](./deploy/compose.yml): 서버 배포용 compose 템플릿
- [deploy/deploy.sh](./deploy/deploy.sh): 서버에서 실제 배포를 수행하는 스크립트
- [deploy/smoke_check.py](./deploy/smoke_check.py): 배포 후 기본 확인용 스크립트
- [deploy/run-scheduled-backup.sh](./deploy/run-scheduled-backup.sh): self-hosted runner 기반 정기 백업 실행 스크립트
- [deploy/restore-drill.sh](./deploy/restore-drill.sh): 복원 리허설 스크립트
- [deploy/offsite-backup.sh](./deploy/offsite-backup.sh): 오프호스트 백업 내보내기 스크립트
- [scripts/run-scheduled-backup.mjs](./scripts/run-scheduled-backup.mjs): 컨테이너 내부에서 실행되는 정기 백업 진입점
- [.github/workflows/ci.yml](./.github/workflows/ci.yml): CI
- [.github/workflows/publish-and-deploy-test.yml](./.github/workflows/publish-and-deploy-test.yml): 테스트 서버 자동 배포
- [.github/workflows/preproduction-rehearsal.yml](./.github/workflows/preproduction-rehearsal.yml): 후보 SHA 리허설
- [.github/workflows/deploy-prod.yml](./.github/workflows/deploy-prod.yml): 운영 수동 배포
- [.github/workflows/production-health-monitor.yml](./.github/workflows/production-health-monitor.yml): 운영 도메인 헬스 모니터링
- [.github/workflows/scheduled-backup-test.yml](./.github/workflows/scheduled-backup-test.yml): 테스트 서버 정기 백업

## 로컬 Docker 실행

빠르게 로컬에서 앱을 Docker로 확인하려면 루트 compose를 사용할 수 있습니다.

```bash
docker compose up -d --build
docker compose logs -f
```

주의 사항:

- 루트 `docker-compose.yml`은 로컬 또는 수동 확인용입니다.
- GitHub Actions 기반 서버 배포는 `deploy/compose.yml`을 사용합니다.

## 서버 배포에서 중요한 환경 변수

서버 `.env`에는 최소한 아래 값이 있어야 합니다.

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-with-long-random-secret
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버에서는 URL 세 값을 `https://gshs.app`으로 바꿉니다.

추가 메모:

- Google Analytics는 `/admin/settings`에서 관리합니다.
- `APP_VERSION`은 배포 시점에 `deploy.sh` 또는 GitHub Actions가 주입합니다.
- 백업 디렉터리는 영속 볼륨 위에 있어야 합니다.

## SQLite 운영 원칙

이 프로젝트는 현재 SQLite를 사용합니다.

꼭 지켜야 할 규칙:

- DB 파일은 `/app/data/dev.db`처럼 영속 볼륨 경로에 둡니다.
- 배포 전 DB 백업을 먼저 생성합니다.
- 컨테이너 임시 경로에 DB를 두지 않습니다.
- 복원 리허설은 라이브 DB를 직접 덮어쓰지 않습니다.

## 배포 전 체크리스트

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] 시크릿이 커밋되지 않았는지 확인
- [ ] 서버 `.env`가 최신 도메인 기준인지 확인
- [ ] Docker Hub 접근 권한이 정상인지 확인
- [ ] self-hosted runner가 online 상태인지 확인
- [ ] 테스트 후보 SHA가 `Preproduction Rehearsal`까지 통과했는지 확인

## 테스트 서버 자동 배포

트리거:

- `main` 브랜치 push

동작:

1. `lint`, `test`, `build` 실행
2. Docker 이미지 빌드 및 Docker Hub 푸시
3. `gshs-test` self-hosted runner가 테스트 서버에서 배포 수행
4. `/opt/gshsapp`에 최신 배포 자산 반영
5. `deploy.sh` 실행
6. 서버 내부 smoke check 실행
7. Playwright E2E 실행

실패 시 확인 순서:

- GitHub Actions 로그
- 서버 `docker compose logs`
- `/opt/gshsapp/backup`의 최근 백업 파일
- self-hosted runner 상태
- `/api/health` 응답

## 운영 배포

트리거:

- GitHub Actions `Deploy Production`
- 입력값은 `sha-<commit>`
- `production` environment 승인 필요

원칙:

- 운영은 `latest`가 아니라 검증된 `sha-<commit>`만 사용
- 운영 반영 전 테스트 서버에서 같은 SHA가 리허설까지 초록이어야 함
- 운영 서버는 `gshs-prod` self-hosted runner가 준비되어 있어야 함

## 롤백 규칙

자동 롤백은 기본 제공하지 않습니다.

롤백 순서:

1. 이전 정상 SHA 확인
2. `Deploy Production`을 이전 `sha-<commit>`로 다시 실행
3. 필요할 때만 최신 `dev.db.*.bak` 백업에서 DB 복원
4. 라우팅 또는 TLS 문제라면 프록시를 먼저 수정하고 smoke check 재실행

## 프리프로덕션 강화 항목

현재 배포 체계에는 아래 항목이 포함되어 있습니다.

- 테스트 서버 자동 배포 후 Playwright E2E 실행
- `Preproduction Rehearsal` 워크플로우
- `deploy/restore-drill.sh`를 통한 복원 리허설
- `/admin/test`를 이용한 운영 준비 상태 확인

권장 순서:

1. 후보 SHA로 `Preproduction Rehearsal` 실행
2. 워크플로우 초록 확인
3. `/admin/test`에서 모든 항목이 `PASS`인지 확인
4. 최신 백업 시각 확인
5. `test.gshs.app` 수동 확인
6. 같은 SHA를 운영 배포

## 네트워크 바인딩 메모

현재 배포 기본값은 `0.0.0.0:1234` 바인딩입니다.

이유:

- 현재 리버스 프록시가 앱 VM과 별도 호스트에서 접근할 수 있어야 함
- `127.0.0.1` 전용 바인딩이면 외부 프록시가 테스트 VM에 접근하지 못할 수 있음

만약 나중에 프록시를 같은 VM 안으로 옮기면 `HOST_BIND_IP=127.0.0.1`로 재조정할 수 있습니다.

## 운영 모니터링 메모

운영 모니터링 워크플로우는 기본적으로 저장소 변수 `PRODUCTION_MONITOR_ENABLED=true`일 때만 실제 체크를 수행합니다.

이 변수는 아래 조건이 맞을 때만 켭니다.

- `gshs.app`이 실제 앱 트래픽을 받고 있음
- `https://gshs.app/api/health`가 JSON 헬스 응답을 반환함
- 운영 서버 배포 구조가 최종 확정됨

## 관련 문서

- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- [deploy/README.md](./deploy/README.md)
- [docs/repository-governance.md](./docs/repository-governance.md)
