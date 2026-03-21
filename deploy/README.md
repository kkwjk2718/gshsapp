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
- `sha-<commit>` 기준 이미지 배포
- `${HOST_BIND_IP}:${HOST_PORT}:3000` 방식 포트 바인딩
- `./data:/app/data`, `./backup:/app/backup` 영속 볼륨 사용
- `APP_VERSION`을 컨테이너에 주입

현재 기본값은 프록시가 다른 서버에서 접근할 수 있도록 `0.0.0.0:${HOST_PORT}:3000`입니다.

## `deploy.sh` 실행 순서

`deploy.sh`는 아래 순서로 동작합니다.

1. Docker Compose 사용 가능 여부 확인
2. `data/`, `backup/` 디렉터리 준비
3. 임시 `.deploy.env` 생성
4. 필요 시 Docker Hub 로그인
5. 지정한 `sha-<commit>` 이미지 pull
6. 기존 SQLite DB 백업
7. `docker compose up -d --remove-orphans`
8. `/api/health` 응답 확인
9. 실패 시 compose 상태와 로그 출력

## `deploy.sh` 주요 환경 변수

필수:

- `IMAGE_TAG`

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
- `HOST_BIND_IP=0.0.0.0`
- `HOST_PORT=1234`
- `APP_VERSION=$IMAGE_TAG`

## 서버 `.env` 예시

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-me
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

- `latest`가 아니라 `sha-<commit>`를 배포 기준으로 사용합니다.
- `backup/` 디렉터리는 삭제하지 않습니다.
- `.env`는 서버에서 직접 관리하며 저장소에는 올리지 않습니다.
- SQLite를 사용하므로 대규모 변경 전에는 백업 상태를 먼저 확인합니다.

## 복원 리허설

`restore-drill.sh`는 최신 백업 또는 라이브 DB 복사본을 임시 작업 디렉터리로 가져와 별도 포트에서 컨테이너를 띄운 뒤, 헬스 응답과 관리자 로그인 가능 여부를 확인하고 정리합니다.

관련 환경 변수:

- `CONTAINER_NAME`
- `BACKUP_MAX_AGE_HOURS`
- `RESTORE_DRILL_PORT`

## 오프호스트 백업 내보내기

`offsite-backup.sh`는 최신 백업 파일이 있으면 그것을, 없으면 라이브 DB 복사본을 외부 저장소로 보냅니다.

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
- 컨테이너 내부에서 [`scripts/run-scheduled-backup.mjs`](../scripts/run-scheduled-backup.mjs)를 실행

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
