# deploy/README.md

이 디렉터리는 GitHub Actions deploy job이 서버 안의 self-hosted runner에서 반영하는 배포 자산 모음입니다.

## 파일 설명

- [compose.yml](./compose.yml): 서버용 Docker Compose 템플릿
- [deploy.sh](./deploy.sh): 서버에서 실제 배포를 수행하는 스크립트
- [smoke_check.py](./smoke_check.py): 배포 후 URL 스모크 체크

## 서버에서 최종적으로 필요한 파일 구조

```text
/opt/gshsapp
  .env
  compose.yml
  deploy.sh
  data/
  backup/
```

설명:

- `.env`: 서버 런타임 시크릿
- `compose.yml`: runner가 `/opt/gshsapp`에 반영하는 파일
- `deploy.sh`: runner가 `/opt/gshsapp`에 반영하는 파일
- `data/`: SQLite DB 저장
- `backup/`: 배포 전 DB 백업 저장

## compose.yml 동작

서버용 compose는 아래 원칙으로 작성되어 있습니다.

- `build:` 대신 `image:` 사용
- `sha-<commit>` 기반 이미지 배포
- `127.0.0.1:${HOST_PORT}:3000` 방식 포트 바인딩
- `./data:/app/data`, `./backup:/app/backup` 볼륨 사용
- `APP_VERSION`을 컨테이너에 주입

즉, 리버스 프록시가 같은 서버에서 `127.0.0.1:1234`를 바라보는 구조를 기본값으로 가정합니다.

## deploy.sh 동작 순서

`deploy.sh`는 아래 순서로 동작합니다.

1. Docker Compose 사용 가능 여부 확인
2. `data/`, `backup/` 디렉터리 생성
3. 임시 `.deploy.env` 파일 생성
4. 필요 시 Docker Hub 로그인
5. `sha-<commit>` 이미지 pull
6. 기존 SQLite DB 백업
7. `docker compose up -d --remove-orphans`
8. `/api/health` 응답 확인
9. 실패 시 compose 상태와 로그 출력

## deploy.sh에서 사용하는 주요 환경 변수

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

기본값:

- `DOCKER_IMAGE=kkwjk2718git/gshsapp`
- `HOST_BIND_IP=127.0.0.1`
- `HOST_PORT=1234`
- `APP_VERSION=$IMAGE_TAG`

## 서버 .env 예시

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-me
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버에서는 URL 세 값을 `https://gshs.app`로 변경합니다.

## GitHub Secrets / Environments

Repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

고정 배포 경로:

- `/opt/gshsapp`

Runner labels:

- 테스트 서버: `gshs-test`
- 운영 서버: `gshs-prod`

## 운영 시 주의할 점

- `latest`가 아니라 `sha-<commit>`를 배포 기준으로 사용합니다.
- `backup/` 폴더는 삭제하지 않습니다.
- `.env`는 서버에서 직접 관리하고 저장소에 올리지 않습니다.
- SQLite를 쓰고 있으므로 운영 대규모 변경 전에 백업 상태를 먼저 확인합니다.

## 관련 문서

- [DEPLOY.md](../DEPLOY.md)
- [docs/server-bootstrap.md](../docs/server-bootstrap.md)
- [docs/cicd-setup.md](../docs/cicd-setup.md)
## Additional Deploy Assets

New asset:

- [restore-drill.sh](./restore-drill.sh): isolated restore rehearsal on a temporary localhost port

Additional environment values:

- `CONTAINER_NAME`
- `BACKUP_MAX_AGE_HOURS`
- `RESTORE_DRILL_PORT`

`restore-drill.sh` stages a copy of the latest backup or a copy of the live DB, boots a temporary container, verifies `/api/health`, verifies admin login, then cleans everything up.
## Network Binding Note

The default deployment binding is now `0.0.0.0:${HOST_PORT}:3000`.

Reason:

- the reverse proxy currently reaches the app over the VM network, not through a same-host localhost-only proxy
- binding to `127.0.0.1` prevented the external reverse proxy server from reaching the app container on the test VM

If the network model changes later, `HOST_BIND_IP` can still be overridden explicitly.
