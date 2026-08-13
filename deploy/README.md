# 배포 자산 안내

이 디렉터리는 GitHub Actions 배포 job과 서버의 self-hosted runner가 사용하는 배포 자산을 모아둔 곳입니다.

## 파일 설명

- [compose.yml](./compose.yml): 서버용 Docker Compose 템플릿
- [deploy.sh](./deploy.sh): 실제 배포를 수행하는 메인 스크립트
- [smoke_check.py](./smoke_check.py): 배포 후 헬스 확인 보조 스크립트
- [restore-drill.sh](./restore-drill.sh): 임시 컨테이너 기반 복원 리허설
- [offsite-backup.sh](./offsite-backup.sh): 오프호스트 백업 내보내기
- [run-scheduled-backup.sh](./run-scheduled-backup.sh): self-hosted runner가 실행하는 정기 백업 진입점

## 서버에 최종적으로 필요한 구조

```text
/opt/gshsapp
  .env
  compose.yml
  deploy.sh
  restore-drill.sh
  offsite-backup.sh
  run-scheduled-backup.sh
  data/
  backup/
```

설명:

- `.env`: 서버 런타임 시크릿
- `compose.yml`: runner가 반영하는 서버용 compose 파일
- `deploy.sh`: runner가 실행하는 배포 스크립트
- `restore-drill.sh`: 복원 리허설 실행용 스크립트
- `offsite-backup.sh`: 외부 백업 저장소로 복사하는 스크립트
- `run-scheduled-backup.sh`: 정기 백업용 호스트 스크립트
- `data/`: SQLite DB 보관 디렉터리
- `backup/`: 백업 파일 보관 디렉터리

## `compose.yml` 동작 방식

서버용 compose는 아래 원칙으로 작성되어 있습니다.

- `build:` 대신 `image:` 사용
- `sha-<40-hex commit>` 출처와 `sha256:<64-hex>` 이미지 digest를 함께 검증하여 배포
- `${HOST_BIND_IP}:${HOST_PORT}:3000` 방식 포트 바인딩
- `./data:/app/data`, `./backup:/app/data/backup` 영속 볼륨 사용
- `DATA_ROOT=/app/data` 아래에서 DB, 백업, 복원 스테이징, 날씨 캐시 경로를 고정
- `APP_VERSION`을 컨테이너에 주입

기본 바인딩은 `127.0.0.1:${HOST_PORT}:3000`입니다. 프록시가 별도 서버라면 `HOST_BIND_IP`를 프록시 전용 인터페이스로 명시하고, 호스트 방화벽에서 프록시 source CIDR만 허용해야 합니다. 전체 인터페이스 바인딩은 기본적으로 거부됩니다.

## `deploy.sh` 실행 순서

`deploy.sh`는 아래 순서로 동작합니다.

1. Docker Compose 사용 가능 여부 확인
2. `data/`, `backup/` 디렉터리 준비
3. 임시 `.deploy.env` 생성
4. 필요 시 Docker Hub 로그인
5. digest로 이미지를 pull하고 revision label이 `sha-<commit>`와 일치하는지 검증
6. 기존 SQLite DB의 일관된 사전 백업 생성
7. 검토된 Prisma migration을 일회성 컨테이너에서 적용
8. `docker compose up -d --remove-orphans --wait web`
9. `/api/health` 버전 응답 확인
10. 실패 시 이전 digest의 애플리케이션만 롤백(DB 자동 복원 금지)

## `deploy.sh` 주요 환경 변수

필수:

- `IMAGE_TAG`
- `IMAGE_DIGEST`

선택:

- `DOCKER_IMAGE`
- `APP_VERSION`
- `HOST_BIND_IP`
- `HOST_PORT`
- `HEALTHCHECK_URL`
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

현재 기본값:

- `DOCKER_IMAGE=kkwjk2718git/gshsapp`
- `HOST_BIND_IP=127.0.0.1`
- `HOST_PORT=1234`
- `APP_VERSION=$IMAGE_TAG`

## 서버 `.env` 예시

```dotenv
DATA_ROOT=/app/data
DATABASE_URL=file:/app/data/dev.db
BACKUP_DIR=/app/data/backup
RESTORE_ROOT=/app/data/restore
WEATHER_CACHE_PATH=/app/data/weather-cache.json
AUTH_SECRET=replace-me
TRUSTED_PROXY_HOPS=1
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버에서는 URL 세 값을 `https://gshs.app`으로 변경합니다.

## GitHub Secrets / Environments

Repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

고정 배포 경로:

- `/opt/gshsapp`

Runner labels:

- 테스트 서버: `gshs-test`
- 운영 서버: `gshs-prod`

## 운영 시 주의 사항

- 태그만 신뢰하지 않고, 검증한 `sha-<commit>` 출처와 immutable image digest를 함께 배포 기준으로 사용합니다.
- 별도 프록시 호스트를 쓰는 경우 [`host-hardening.sh`](./host-hardening.sh)와 [인프라 보안 런북](../docs/infrastructure-security-runbook.md)을 먼저 적용합니다.
- `backup/` 디렉터리는 삭제하지 않습니다.
- `.env`는 서버에서 직접 관리하며 저장소에는 올리지 않습니다.
- SQLite를 사용하므로 대규모 변경 전에는 백업 상태를 먼저 확인합니다.

## 복원 리허설

`restore-drill.sh`는 정해진 이름의 최신 백업이 freshness 기준을 만족할 때만 사용합니다. 새 이미지 내부의 공용 검증기로 아카이브를 격리 검증한 뒤 별도 포트에서 컨테이너를 띄우며, 라이브 DB 복사본이나 호스트 `tar` 폴백은 사용하지 않습니다.

관련 환경 변수:

- `CONTAINER_NAME`
- `BACKUP_MAX_AGE_HOURS`
- `RESTORE_DRILL_PORT`

## 오프호스트 백업 내보내기

`offsite-backup.sh`는 백업 엔진이 생성한 정해진 이름의 최신 스냅샷과 companion metadata만 외부 저장소로 보냅니다. 크기와 SHA-256이 metadata와 일치하지 않거나 스냅샷이 없으면 실패하며 라이브 DB를 복사하지 않습니다.

필수 환경 변수:

- `OFFSITE_TARGET`

예시:

```bash
cd /opt/gshsapp
OFFSITE_TARGET=/mnt/backups/gshsapp ./offsite-backup.sh
```

```bash
cd /opt/gshsapp
OFFSITE_TARGET=backup-user@backup-host:/srv/backups/gshsapp/ ./offsite-backup.sh
```

## 정기 백업 러너 구조

정기 백업은 더 이상 웹 요청 경로에서 실행되지 않습니다.

현재 구조:

- GitHub Actions scheduler가 `gshs-test` runner를 깨움
- runner가 [`run-scheduled-backup.sh`](./run-scheduled-backup.sh)를 실행
- 호스트 스크립트가 실행 중인 앱 컨테이너 안으로 들어감
- 컨테이너 내부의 빌드 산출물 `.next/ops/run-scheduled-backup.mjs`를 실행

워크플로우:

- [`.github/workflows/scheduled-backup-test.yml`](../.github/workflows/scheduled-backup-test.yml)

수동 실행 예시:

```bash
cd /opt/gshsapp
./run-scheduled-backup.sh
```

## 관련 문서

- [DEPLOY.md](../DEPLOY.md)
- [docs/server-bootstrap.md](../docs/server-bootstrap.md)
- [docs/cicd-setup.md](../docs/cicd-setup.md)
- [docs/production-launch-runbook.md](../docs/production-launch-runbook.md)
