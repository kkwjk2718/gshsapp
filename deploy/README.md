# 배포 자산 안내

이 디렉터리는 신뢰된 root 콘솔이 out-of-band digest로 검증해 설치하는 운영 자산을 모아둔 곳입니다. GitHub Actions는 GitHub-hosted 검증·publish만 수행하며 서버의 Docker, 데이터 또는 runtime secret에 접근하지 않습니다.

## 파일 설명

- [compose.yml](./compose.yml): 서버용 Docker Compose 템플릿
- [deploy.sh](./deploy.sh): 실제 배포를 수행하는 메인 스크립트
- [restore-drill.sh](./restore-drill.sh): 임시 컨테이너 기반 복원 리허설
- [offsite-backup.sh](./offsite-backup.sh): exact `BACKUP_NAME` pair를 검증된 mount로 수동 export하고 같은 불변 세대의 root receipt를 생성하는 보조 control
- [pin-offsite-operation.sh](./pin-offsite-operation.sh): 수동 import/restore/offsite export를 private mount namespace의 동일 경로 bind에 고정한 뒤 exact installed control만 실행
- [run-scheduled-backup.sh](./run-scheduled-backup.sh): root systemd timer가 실행하는 완전 백업 진입점
- [predeployment-backup.sh](./predeployment-backup.sh): 배포 잠금 안에서 신뢰 컨테이너 또는 최초 강화 배포용 호스트 백업을 선택
- [bootstrap-backup.py](./bootstrap-backup.py): 구형 컨테이너용 SQLite online-backup 및 v2 archive/metadata 검증기
- [verify-image-provenance.sh](./verify-image-provenance.sh): GitHub-hosted prepare job에서 `main` ancestry, Docker Hub digest, GitHub Sigstore build provenance를 함께 검증
- [verify-rehearsal-proof.sh](./verify-rehearsal-proof.sh): GitHub-hosted 검증 단계에서 exact preproduction proof의 후보/control/digest를 확인
- [control-assets.sha256](./control-assets.sha256): 설치되는 runtime control의 정확한 집합과 digest
- [workflow-policy.sha256](./workflow-policy.sha256): root 승인이 신뢰할 hosted workflow의 OOB 고정 digest
- [root-bootstrap.sha256](./root-bootstrap.sha256): control manifest와 installer 세 개를 묶는 OOB bootstrap manifest
- [install-root-operations.sh](./install-root-operations.sh): 검증된 root staging에서 control을 원자 설치·롤백하고 불변 host role을 설정
- [install-backup-timer.sh](./install-backup-timer.sh): root-only 백업 service/timer 설치
- [install-deploy-service.sh](./install-deploy-service.sh): root-only 수동 배포 service와 지속되는 Docker ingress firewall unit 설치
- [docker-user-firewall.sh](./docker-user-firewall.sh): exact `DOCKER-USER`/`GSHSAPP-INGRESS` bridge forwarding 정책 적용·검증
- [gshsapp-control-update-recovery.service](./gshsapp-control-update-recovery.service): Docker보다 먼저 중단된 control/unit 교환을 mount-independent하게 복구
- [gshsapp-docker-user-firewall.service](./gshsapp-docker-user-firewall.service): Docker 시작 뒤 ingress 정책을 복원하는 정적 systemd unit
- [validate-operations-config.py](./validate-operations-config.py): backup/deploy root 환경 파일의 exact-key·role·경로 검증기

## 서버에 최종적으로 필요한 구조

```text
/usr/local/lib/gshsapp-operations/  # root:root 0700; controls 0400
/etc/gshsapp-operations/            # root:root 0700
  host-role                         # root:root 0400
  deploy.env                        # root:root 0600
  backup.env                        # root:root 0600
  github-token                      # root:root 0600
/opt/gshsapp/
  .env                              # root:root 0600
  data/                             # 61001:61001 0700
  backup/                           # 61001:61001 0700
  root-backup/                      # root:root 0700
OFFSITE_DIR/                        # 별도 검증된 mount, root:root 0700
  .gshsapp-receipts/                # root:root 0700; versioned receipt
```

설명:

- `.env`: 서버 런타임 시크릿
- `compose.yml`, `deploy.sh` 등 실행 control은 `/usr/local/lib/gshsapp-operations`에서만 읽습니다.
- `restore-drill.sh`: 복원 리허설 실행용 스크립트
- `offsite-backup.sh`: 외부 백업 저장소로 복사하는 스크립트
- `run-scheduled-backup.sh`: 정기 백업용 호스트 스크립트
- `predeployment-backup.sh`, `bootstrap-backup.py`: 최초 강화 배포 호환 사전 백업 경계
- `data/`: SQLite DB 보관 디렉터리
- `backup/`: 앱 관리자 UI가 생성·조회하는 비신뢰 로컬 백업 디렉터리
- `root-backup/`: root backup/timer만 쓰는 재해복구 세대 디렉터리. 앱에 mount하지 않으며 이 세대만 offsite receipt 대상입니다.

## `compose.yml` 동작 방식

서버용 compose는 아래 원칙으로 작성되어 있습니다.

- `build:` 대신 `image:` 사용
- `sha-<40-hex commit>`이 root가 승인한 현재 `main`과 정확히 같은지 확인하고 Docker Hub가 반환한 `sha256:<64-hex>` digest에 서명된 build provenance가 있는지 검증하여 배포
- 격리된 Docker bridge에서 `${HOST_BIND_IP}:${HOST_PORT}`를 container port 3000에만 publish하고 host network는 사용하지 않음
- 인증된 host-hardening control의 exact `DOCKER-USER` ingress 정책이 reverse proxy source만 허용하고 그 외 published-port 전달을 차단
- `./data:/app/data`, `./backup:/app/data/backup` 영속 볼륨 사용 (`--project-directory /opt/gshsapp` 기준)
- `DATA_ROOT=/app/data` 아래에서 DB, 백업, 복원 스테이징, 날씨 캐시 경로를 고정
- `APP_VERSION`을 컨테이너에 주입

프록시가 별도 서버라면 `HOST_BIND_IP`를 프록시 전용 인터페이스로 명시하고, UFW INPUT의 host 정책과 `DOCKER-USER`의 Docker bridge 정책 모두에서 exact proxy source CIDR만 허용해야 합니다. Wildcard bind, broad Docker forwarding, host network는 거부됩니다.

## `deploy.sh` 실행 순서

`deploy.sh`는 아래 순서로 동작합니다.

1. 자기 자신을 확인한 직후 sibling control을 열기 전에 shared lifecycle lock 획득
2. 설치된 control manifest, immutable host role, fresh approval, 운영의 restore-drill receipt, imported bootstrap marker 확인
3. runtime `.env`, exact bind/UFW policy, `data/`·`backup/`·root-only `root-backup/`·offsite mount/receipt 검증
4. 공개 registry에서 credential 없이 exact digest pull, revision label 확인
5. 기존 web의 full ID/image/config/restart policy를 기록한 durable restart intent 생성
6. old container의 restart policy를 `no`로 만들고 exact writer를 정지하되 migration 성공 전까지 보존
7. DB-only pre-deployment backup과 offsite receipt 생성, network/secret/live-data mount가 없는 resource-bounded 후보 validator 실행
8. 후보 digest의 `.deploy.env`를 원자적으로 기록
9. durable `schema-transition`을 기록하고 restart intent를 제거한 직후 검토된 migration 실행
10. migration 성공을 기록한 뒤에만 old container 제거
11. restart policy `no`인 후보를 시작해 `/api/health` version·digest 확인
12. exact candidate promotion intent를 기록하고 restart policy를 `always`로 승격·재검증한 뒤 `healthy` 기록

스키마 전환이 시작된 뒤 구 바이너리만 자동 롤백하지 않습니다. 구 바이너리가 새 스키마에 legacy 데이터를 다시 쓰는 것을 막기 위한 의도적인 유지보수 경계입니다. 실패 시 검증된 사전 백업을 별도 복구 절차로 복원하거나, 같은/새로운 강화 후보의 migration과 health를 다시 통과시켜야 합니다. `docker compose up`으로 과거 digest를 임의 재시작하면 안 됩니다.

## `deploy.sh` 주요 환경 변수

`/etc/gshsapp-operations/deploy.env` 필수:

- `IMAGE_TAG`
- `IMAGE_DIGEST`
- `EXPECTED_APP_ORIGIN`
- `HOST_BIND_IP`
- `SSH_SOURCE_CIDR`
- `PROXY_SOURCE_CIDR` (단일 검증된 reverse proxy의 canonical IPv4 `/32`)
- `PROTECTED_INTERNAL_CIDRS` (쉼표로 구분한 정렬된 canonical 내부 IPv4 CIDR; `HOST_BIND_IP` 포함)
- `OFFSITE_DIR`
- `OFFSITE_MOUNT_SOURCE`
- `OFFSITE_FSTYPE`
- `OFFSITE_REQUIRED_OPTIONS`

선택:

- `HOST_PORT`
- `BACKUP_MAX_AGE_HOURS`
- `SMOKE_TIMEOUT_SECONDS`
- `SMOKE_INTERVAL_SECONDS`
- `ALLOW_PUBLIC_BIND=true` (검토된 non-RFC1918 bind만)

`DOCKER_IMAGE`와 `APP_VERSION`은 installed deploy control의 검토된 기본값/후보 identity에서 계산됩니다. `HEALTHCHECK_URL` 같은 임의 key는 strict root config에 넣을 수 없습니다.
workflow는 서버에 Docker credential 또는 runtime secret을 전달하지 않습니다.

현재 기본값:

- `DOCKER_IMAGE=kkwjk2718git/gshsapp`
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
`.env`는 root 소유 일반 파일로 `0600` 권한을 사용해야 하며 `/opt/gshsapp` 아래 경로 구성 요소도 group/other 쓰기를 허용하면 안 됩니다. 배포 스크립트가 이를 사전에 검증합니다.

## GitHub Secrets / Environments

보호된 `publish` environment secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

`preproduction-verification`, `production-verification`, `production-monitor` protected environment는 공개 검증과 monitor secret만 승인합니다. GitHub-hosted job은 이미지 publish/provenance, 공개 origin 검증, 기본 브랜치 `workflow_run` Release만 담당합니다. 테스트·운영 호스트의 배포 기준은 root 콘솔에서 별도로 승인한 exact SHA/digest이며 고정 state 경로는 다음과 같습니다.

- `/opt/gshsapp`

## 운영 시 주의 사항

- 태그만 신뢰하지 않고, 검증한 `sha-<commit>` 출처와 immutable image digest를 함께 배포 기준으로 사용합니다.
- 별도 프록시 호스트를 쓰는 경우 OOB 검증·설치된 `/usr/local/lib/gshsapp-operations/host-hardening.sh`와 [인프라 보안 런북](../docs/infrastructure-security-runbook.md)을 먼저 적용합니다. mutable checkout의 상대 경로 스크립트를 root로 실행하지 않습니다. 기존 UFW 관리 규칙이 없거나 의도한 SSH/프록시 규칙 두 개와 정확히 일치하지 않으면 스크립트가 변경 전에 중단되며, 규칙을 자동 초기화하거나 일괄 삭제하지 않습니다.
- `backup/`과 root-only `root-backup/` 디렉터리는 삭제하지 않습니다.
- `.env`는 서버에서 직접 관리하며 저장소에는 올리지 않습니다.
- 현재 public registry pull에는 Docker credential을 전달하지 않습니다. Docker Hub publish token은 GitHub의 `publish` environment에만 두고 호스트에 저장하지 않습니다.
- SQLite를 사용하므로 대규모 변경 전에는 백업 상태를 먼저 확인합니다.

백업 보존은 완전한 archive/metadata 쌍을 세대 단위로 다루며 새 백업 파일과 metadata의 rename 뒤 각각 backup directory까지 `fsync`하여 검증·영속화된 뒤에만 실행됩니다. prune/cleanup의 unlink 뒤에도 directory를 `fsync`합니다. Host deployment, scheduled backup, import, restore와 control update는 `/run/lock/gshsapp/lifecycle.lock`을 공유하고, backup engine 내부 writer도 heartbeat lease로 직렬화됩니다. 최초 강화 배포의 pre-deployment backup은 old writer를 중지·보존한 lock 경계 안에서 고유 DB-only pair를 완전히 검증한 뒤에만 남깁니다. 기본값은 최소 3세대, 최대 30세대, 90일, 총 20 GiB이고 최신 검증 세대와 최소 세대 수가 age/bytes 제한보다 우선합니다. 생성 전에는 snapshot과 archive가 동시에 존재할 최악의 공간 및 256 MiB reserve를 검사합니다.

## 복원 리허설

`restore-drill.sh`는 검증된 mount의 고정 `.gshsapp-receipts` 디렉터리에 있는 root receipt가 가리키는 최신 fresh offsite generation만 사용합니다. 승인된 이미지 내부의 공용 검증기로 아카이브를 격리 검증하고 migration 뒤 network-none 컨테이너 내부 probe로 health와 관리자 인증 경계를 확인합니다. 호스트 포트를 publish하지 않으며 라이브 DB 복사본이나 호스트 `tar` 폴백을 사용하지 않습니다.

관련 환경 변수:

- `IMAGE_TAG`
- `IMAGE_DIGEST`
- `OFFSITE_DIR`
- `OFFSITE_MOUNT_SOURCE`
- `BACKUP_MAX_AGE_HOURS`
- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

## 오프호스트 백업과 정기 실행

`run-scheduled-backup.sh`는 root systemd timer에서 동일 생명주기 lock을 잡고 앱 writer를 정지한 뒤 DB와 allowlisted content root의 완전 세대를 만듭니다. 정확한 source/type/options로 mount된 별도 root-private 파일시스템에 archive/metadata와 고정 `.gshsapp-receipts` checksum receipt를 영속화한 뒤에만 로컬 retention을 수행합니다. Receipt는 재해복구 내구성을 제공하지만 서명은 아니므로 외부 저장소는 immutable/versioned retention을 강제하고 로컬 삭제나 과거 세대 변경을 전파하지 않아야 합니다.

설치와 구성은 [Root operations 신뢰 부트스트랩](../docs/root-operations-bootstrap.md)을 따릅니다. GitHub Actions는 백업 경로에 참여하지 않으며 host에는 Actions runner를 설치하지 않습니다.

## 관련 문서

- [DEPLOY.md](../DEPLOY.md)
- [docs/root-operations-bootstrap.md](../docs/root-operations-bootstrap.md)
- [docs/cicd-setup.md](../docs/cicd-setup.md)
- [docs/production-launch-runbook.md](../docs/production-launch-runbook.md)
