# 배포 자산 안내

이 디렉터리는 GitHub Actions 배포 job과 서버의 self-hosted runner가 사용하는 배포 자산을 모아둔 곳입니다.

## 파일 설명

- [compose.yml](./compose.yml): 서버용 Docker Compose 템플릿
- [deploy.sh](./deploy.sh): 실제 배포를 수행하는 메인 스크립트
- [smoke_check.py](./smoke_check.py): 배포 후 헬스 확인 보조 스크립트
- [restore-drill.sh](./restore-drill.sh): 임시 컨테이너 기반 복원 리허설
- [offsite-backup.sh](./offsite-backup.sh): 오프호스트 백업 내보내기
- [run-scheduled-backup.sh](./run-scheduled-backup.sh): self-hosted runner가 실행하는 정기 백업 진입점
- [predeployment-backup.sh](./predeployment-backup.sh): 배포 잠금 안에서 신뢰 컨테이너 또는 최초 강화 배포용 호스트 백업을 선택
- [bootstrap-backup.py](./bootstrap-backup.py): 구형 컨테이너용 SQLite online-backup 및 v2 archive/metadata 검증기
- [verify-image-provenance.sh](./verify-image-provenance.sh): GitHub-hosted prepare job에서 `main` ancestry, Docker Hub digest, GitHub Sigstore build provenance를 함께 검증
- [verify-rehearsal-proof.sh](./verify-rehearsal-proof.sh): 운영 배포 전에 동일 control SHA에서 동일 후보/digest의 E2E·restore drill 리허설이 성공했는지 GitHub run과 proof artifact로 검증

## 서버에 최종적으로 필요한 구조

```text
/opt/gshsapp
  .env
  compose.yml
  deploy.sh
  restore-drill.sh
  offsite-backup.sh
  run-scheduled-backup.sh
  predeployment-backup.sh
  bootstrap-backup.py
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
- `predeployment-backup.sh`, `bootstrap-backup.py`: 최초 강화 배포 호환 사전 백업 경계
- `data/`: SQLite DB 보관 디렉터리
- `backup/`: 백업 파일 보관 디렉터리

## `compose.yml` 동작 방식

서버용 compose는 아래 원칙으로 작성되어 있습니다.

- `build:` 대신 `image:` 사용
- `sha-<40-hex commit>`이 `main`의 조상인지 확인하고 Docker Hub가 반환한 `sha256:<64-hex>` digest에 `publish-and-deploy-test.yml`의 서명된 build provenance가 있는지 검증하여 배포
- `${HOST_BIND_IP}:${HOST_PORT}:3000` 방식 포트 바인딩
- `./data:/app/data`, `./backup:/app/data/backup` 영속 볼륨 사용
- `DATA_ROOT=/app/data` 아래에서 DB, 백업, 복원 스테이징, 날씨 캐시 경로를 고정
- `APP_VERSION`을 컨테이너에 주입

기본 바인딩은 `127.0.0.1:${HOST_PORT}:3000`입니다. 프록시가 별도 서버라면 `HOST_BIND_IP`를 프록시 전용 인터페이스로 명시하고, 호스트 방화벽에서 프록시 source CIDR만 허용해야 합니다. 전체 인터페이스 바인딩은 기본적으로 거부됩니다.

## `deploy.sh` 실행 순서

`deploy.sh`는 아래 순서로 동작합니다.

1. Docker Compose 사용 가능 여부 확인
2. `data/`, `backup/` 디렉터리 준비
3. 필요 시 Docker Hub 로그인
4. GitHub-hosted prepare job이 승인한 digest로 이미지를 pull하고 revision label을 보조 검증
5. 기존 Compose web의 이름·상태와 immutable image ID를 캡처하고, backup ops 런타임 보유 여부를 확인
6. 기존 web 컨테이너를 정지·삭제하고 부재를 검증하여 SQLite writer를 완전히 quiesce
7. 직전에 승인되어 실행 중이던 image ID의 backup ops를 네트워크 없는 one-shot 컨테이너로 실행하여 마지막 쓰기까지 포함한 최종 스냅샷 생성. 구형 image에 ops가 없거나 이전 실패로 web이 이미 없으면 검토된 호스트 Python SQLite backup으로 DB 전용 v2 쌍을 만들고, 후보 이미지는 네트워크 없이 그 아카이브만 읽어 격리 마이그레이션 검증(후보에 라이브 DB·data root·runtime secret을 마운트하지 않음)
8. 후보 digest의 `.deploy.env`를 원자적으로 기록
9. 검토된 Prisma migration을 일회성 컨테이너에서 적용
10. `docker compose up -d --remove-orphans --wait web`
11. `/api/health` 버전·digest 응답 확인
12. migration 시작 뒤 실패하면 후보를 제거하고 서비스를 offline 상태로 유지

스키마 전환이 시작된 뒤 구 바이너리만 자동 롤백하지 않습니다. 구 바이너리가 새 스키마에 legacy 데이터를 다시 쓰는 것을 막기 위한 의도적인 유지보수 경계입니다. 실패 시 검증된 사전 백업을 별도 복구 절차로 복원하거나, 같은/새로운 강화 후보의 migration과 health를 다시 통과시켜야 합니다. `docker compose up`으로 과거 digest를 임의 재시작하면 안 됩니다.

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
BACKUP_RETENTION_MIN_GENERATIONS=3
BACKUP_RETENTION_MAX_GENERATIONS=30
BACKUP_RETENTION_MAX_AGE_DAYS=90
BACKUP_RETENTION_MAX_TOTAL_BYTES=21474836480
BACKUP_RESERVE_FREE_BYTES=268435456
BACKUP_STALE_WORK_MAX_AGE_HOURS=24
RESTORE_MAX_UPLOAD_BYTES=134217728
WEATHER_CACHE_PATH=/app/data/weather-cache.json
AUTH_SECRET=<openssl-rand-base64-48-output>
TRUSTED_PROXY_HOPS=1
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버에서는 URL 세 값을 `https://gshs.app`으로 변경합니다.
`.env`는 root 또는 전용 deploy 계정 소유의 일반 파일로 `0600` 권한을 사용해야 하며 `/opt/gshsapp` 아래 경로 구성 요소도 group/other 쓰기를 허용하면 안 됩니다. 배포 스크립트가 이를 사전에 검증합니다.

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
- 별도 프록시 호스트를 쓰는 경우 [`host-hardening.sh`](./host-hardening.sh)와 [인프라 보안 런북](../docs/infrastructure-security-runbook.md)을 먼저 적용합니다. 기존 UFW 관리 규칙이 없거나 의도한 SSH/프록시 규칙 두 개와 정확히 일치하지 않으면 스크립트가 변경 전에 중단되며, 규칙을 자동 초기화하거나 일괄 삭제하지 않습니다.
- `backup/` 디렉터리는 삭제하지 않습니다.
- `.env`는 서버에서 직접 관리하며 저장소에는 올리지 않습니다.
- private registry 자격증명이 필요한 경우에도 배포/복원 스크립트는 `0700` 임시 `DOCKER_CONFIG`만 사용하고 종료 시 삭제합니다. publish 권한 토큰을 runner의 기본 `~/.docker/config.json`에 남기지 않습니다.
- SQLite를 사용하므로 대규모 변경 전에는 백업 상태를 먼저 확인합니다.

백업 보존은 완전한 archive/metadata 쌍을 세대 단위로 다루며 새 백업 파일과 metadata의 rename 뒤 각각 backup directory까지 `fsync`하여 검증·영속화된 뒤에만 실행됩니다. prune/cleanup의 unlink 뒤에도 directory를 `fsync`합니다. manual, scheduled, 일반 pre-deployment가 다른 Node process에서 겹쳐도 backup directory의 원자적 lock directory와 heartbeat lease를 획득한 한 writer만 전체 생명주기를 수행하고 나머지는 `BACKUP_BUSY`로 중단합니다. 최초 강화 배포의 호스트 bootstrap은 바깥의 `.deploy.lock`으로 정기 작업과 직렬화되고 보존 삭제를 수행하지 않으며, 고유 이름의 DB-only 쌍을 완전히 검증한 뒤에만 남깁니다. 기본값은 최소 3세대, 최대 30세대, 90일, 총 20 GiB이고 최신 검증 세대와 최소 세대 수가 age/bytes 제한보다 우선합니다. 생성 전에는 DB와 선택된 content root를 기준으로 snapshot+archive 동시 점유량과 256 MiB reserve를 보수적으로 검사합니다. 24시간이 지난 정해진 이름의 `.create-*`, `.partial`, unpaired archive/metadata만 일반 파일·디렉터리와 inode를 재검증한 뒤 정리합니다.

## 복원 리허설

`restore-drill.sh`는 정해진 이름의 최신 백업이 freshness 기준을 만족할 때만 사용합니다. 새 이미지 내부의 공용 검증기로 아카이브를 격리 검증하고, 검토된 legacy/current 스키마는 격리 사본에서 migration까지 통과시킨 뒤 별도 포트에서 컨테이너를 띄웁니다. 라이브 DB 복사본이나 호스트 `tar` 폴백은 사용하지 않습니다.

관련 환경 변수:

- `CONTAINER_NAME`
- `BACKUP_MAX_AGE_HOURS`
- `RESTORE_DRILL_PORT`

## 오프호스트 백업 내보내기

`offsite-backup.sh`는 백업 엔진이 생성한 정해진 이름의 최신 스냅샷과 companion metadata만 외부 저장소로 보냅니다. 크기와 SHA-256이 metadata와 일치하지 않거나 스냅샷이 없으면 실패하며 라이브 DB를 복사하지 않습니다.

로컬 보존 정리는 오프사이트 전송 성공 여부를 기록하거나 보장하지 않습니다. 따라서 정기 백업 직후 이 스크립트를 실행하고, 원격 저장소는 별도의 immutable/versioned 보존 정책을 가져야 합니다. 로컬에서 삭제된 세대를 원격에서도 `--delete`로 지우지 마십시오. `OFFSITE_BACKUP_READY`는 최신 쌍의 전송과 원격 checksum 검증 및 restore drill을 확인한 뒤에만 설정합니다.

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
- [`.github/workflows/scheduled-backup-prod.yml`](../.github/workflows/scheduled-backup-prod.yml): 운영에서 매시간 로그 보존/상한 정리와 정기 백업을 직렬 실행합니다.

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
