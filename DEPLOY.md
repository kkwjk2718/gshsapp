# GSHS.app 배포 가이드

이 문서는 저장소 기준의 배포 구조를 설명합니다.

대상 독자:

- 새 팀원
- 테스트 서버를 새로 준비하는 사람
- GitHub Actions와 Docker Hub 연동을 유지보수하는 사람

## 배포 구조

현재 기준 배포 흐름은 아래와 같습니다.

1. Pull Request 또는 push에서 CI 실행
2. `main` push 시 Docker 이미지 빌드
3. Docker Hub에 `sha-<commit>`, `main`, `latest` 태그 푸시
4. 테스트 서버 self-hosted runner가 `sha-<commit>` 자동 배포
5. 운영 서버는 GitHub Actions 수동 실행 + 운영 서버 runner로 배포

핵심 원칙:

- 실제 배포는 항상 `sha-<commit>` 태그로 진행
- 테스트와 운영 서버 분리
- 서버 런타임 시크릿은 GitHub가 아니라 서버 `.env`에 저장
- SQLite는 컨테이너 내부가 아니라 볼륨에 저장
- 사설망 VM에는 GitHub-hosted runner가 직접 SSH하지 않고, 각 서버 안의 self-hosted runner가 배포를 수행

## 저장소 안의 배포 관련 파일

- [Dockerfile](./Dockerfile): 앱 이미지 빌드
- [docker-compose.yml](./docker-compose.yml): 로컬/수동 서버 실행용 compose
- [deploy/compose.yml](./deploy/compose.yml): CI/CD 서버 배포용 compose
- [deploy/deploy.sh](./deploy/deploy.sh): 서버의 self-hosted runner가 실행하는 실제 배포 스크립트
- [deploy/smoke_check.py](./deploy/smoke_check.py): 배포 후 기본 검증
- [deploy/README.md](./deploy/README.md): 배포 자산 설명
- [.github/workflows/ci.yml](./.github/workflows/ci.yml): CI
- [.github/workflows/publish-and-deploy-test.yml](./.github/workflows/publish-and-deploy-test.yml): 테스트 자동 배포
- [.github/workflows/deploy-prod.yml](./.github/workflows/deploy-prod.yml): 운영 수동 배포

## 로컬에서 Docker로 실행하기

빠르게 로컬에서 띄워볼 때는 기존 compose를 사용할 수 있습니다.

```bash
docker compose up -d --build
docker compose logs -f
```

주의:

- 현재 루트의 `docker-compose.yml`은 로컬 또는 기존 수동 서버 운영 기준입니다.
- GitHub Actions 기반 서버 배포는 `deploy/compose.yml`을 사용합니다.

## 서버 배포에서 중요한 환경 변수

서버 `.env`에는 최소한 아래 값들이 있어야 합니다.

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-with-long-random-secret
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버에서는 URL 세 값을 `https://gshs.app`로 바꿉니다.

추가 메모:

- Google Analytics는 `/admin/settings`에서 관리합니다.
- `APP_VERSION`은 GitHub Actions 또는 `deploy.sh`가 주입합니다.
- `BACKUP_DIR`은 `deploy/compose.yml`에서 `/app/backup`으로 잡혀 있습니다.

## SQLite 관련 주의 사항

이 프로젝트는 현재 SQLite를 사용합니다.

반드시 지켜야 하는 것:

- DB 파일은 `/app/data/dev.db`처럼 볼륨 경로에 둡니다.
- 배포 전 DB 백업을 수행합니다.
- 컨테이너 내부 임시 경로에 DB를 두지 않습니다.
- 운영에서 스키마 변경이 잦아지기 전까지는 `prisma db push`를 유지하되, 추후 `prisma migrate deploy` 전환을 고려합니다.

## 배포 전 체크리스트

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `.env` 또는 API 키가 커밋되지 않았는지 확인
- [ ] 서버 `.env`가 최신 도메인 기준인지 확인
- [ ] Docker Hub 접근 권한이 정상인지 확인
- [ ] GitHub self-hosted runner가 online 상태인지 확인

## 테스트 서버 자동 배포

트리거:

- `main` 브랜치 push

동작:

1. CI 품질 검사
2. Docker 이미지 빌드 및 푸시
3. `gshs-test` 라벨의 self-hosted runner가 테스트 서버에서 작업 수신
4. 테스트 서버 로컬 `/opt/gshsapp`에 `deploy/compose.yml`, `deploy.sh` 반영
5. 서버에서 `deploy.sh` 실행
6. 서버 내부 `127.0.0.1:1234` 기준 `/api/health`, `/`, `/menu`, `/notices` 스모크 체크

실패 시:

- Actions 로그 확인
- 서버의 `docker compose logs`
- 서버 `backup/` 폴더의 최근 DB 백업 확인
- runner 상태 확인: GitHub repository settings > Actions > Runners

## 운영 배포

트리거:

- GitHub Actions `Deploy Production`
- 입력값: `sha-<commit>`
- GitHub `production` environment 승인 필요

원칙:

- 운영은 `latest`가 아니라 승인된 `sha-<commit>`만 사용
- 운영 반영 전 테스트 서버에서 같은 SHA가 검증되어야 함
- 운영 서버에는 `gshs-prod` 라벨의 self-hosted runner가 준비되어 있어야 함

## 롤백 전략

자동 롤백은 현재 넣지 않았습니다.

롤백 방법:

1. 이전 정상 SHA 확인
2. `Deploy Production` 워크플로우를 이전 `sha-<commit>`으로 재실행
3. 필요 시 `backup/dev.db.<timestamp>.bak`에서 DB 복원

## 새 팀원에게 꼭 전달할 것

아래 문서까지 읽으면 서버 운영 문맥을 대부분 이해할 수 있습니다.

- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [deploy/README.md](./deploy/README.md)

이 세 문서가 실제 서버 구축과 CI/CD 설정의 기준 문서입니다.
