# GSHS.app 배포 가이드

이 문서는 저장소 기준의 배포 구조와 운영 원칙을 설명하는 개요 문서입니다.

세부 절차는 아래 문서로 나뉩니다.

- [docs/cicd-setup.md](./docs/cicd-setup.md): GitHub Actions, Docker Hub, self-hosted runner, secrets 연결
- [docs/server-bootstrap.md](./docs/server-bootstrap.md): 새 Ubuntu VM 부트스트랩
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md): 운영 직전/직후 체크리스트
- [deploy/README.md](./deploy/README.md): 배포 자산 구조와 스크립트 설명

## 1. 배포 구조 요약

현재 기본 흐름:

1. Pull Request 또는 push에서 CI 실행
2. `main` push 시 Docker 이미지 빌드
3. Docker Hub에 `sha-<commit>`, `main`, `latest` 태그 푸시
4. 테스트 서버 self-hosted runner가 자동 배포
5. 운영 서버는 GitHub Actions 수동 실행 + `production` 승인 후 배포

핵심 원칙:

- 실제 배포 기준은 항상 `sha-<commit>`
- 테스트와 운영 서버는 분리
- 서버 시크릿은 GitHub가 아니라 서버 `.env`에서 관리
- SQLite는 영속 볼륨 위에서 운영
- GitHub Release는 `package.json` 기준 `vX.Y.Z` 태그로 관리

## 2. 저장소 안의 주요 배포 파일

- [Dockerfile](./Dockerfile): 앱 이미지 빌드
- [docker-compose.yml](./docker-compose.yml): 로컬 개발용 compose
- [deploy/compose.yml](./deploy/compose.yml): 서버 배포용 compose 템플릿
- [deploy/deploy.sh](./deploy/deploy.sh): 서버 배포 스크립트
- [deploy/restore-drill.sh](./deploy/restore-drill.sh): 복원 리허설
- [deploy/offsite-backup.sh](./deploy/offsite-backup.sh): 오프호스트 백업 내보내기
- [deploy/run-scheduled-backup.sh](./deploy/run-scheduled-backup.sh): 정기 백업 실행
- [.github/workflows/ci.yml](./.github/workflows/ci.yml): 품질 검사
- [.github/workflows/publish-and-deploy-test.yml](./.github/workflows/publish-and-deploy-test.yml): 테스트 자동 배포
- [.github/workflows/preproduction-rehearsal.yml](./.github/workflows/preproduction-rehearsal.yml): 후보 SHA 리허설
- [.github/workflows/deploy-prod.yml](./.github/workflows/deploy-prod.yml): 운영 수동 배포

## 3. 서버 기준 환경 변수

서버 `.env` 최소 예시:

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
- Brevo 메일 발송은 서버 `.env`에 별도 API 키가 필요합니다.
- `APP_VERSION`은 배포 시점에 workflow와 `deploy.sh`가 주입합니다.
- 배포용 웹 컨테이너는 `TZ=Asia/Seoul`로 고정합니다.

## 4. SQLite 운영 원칙

- DB 파일은 `/app/data/dev.db` 영속 볼륨 경로를 사용합니다.
- 배포 전 DB 백업을 먼저 생성합니다.
- 라이브 DB를 컨테이너 임시 경로에 두지 않습니다.
- 복원 리허설은 라이브 DB를 직접 덮어쓰지 않습니다.

## 5. 테스트 서버 자동 배포

트리거:

- `main` 브랜치 push

흐름:

1. `lint`, `test`, `build`
2. Docker 이미지 빌드 및 Docker Hub 푸시
3. `gshs-test` runner가 테스트 서버 배포
4. `/opt/gshsapp`에 최신 배포 자산 반영
5. `deploy.sh` 실행
6. 서버 내부 smoke check
7. Playwright E2E

## 6. 운영 배포

트리거:

- GitHub Actions `Deploy Production`

입력값:

- `image_tag=sha-<commit>`

원칙:

- `latest`가 아니라 검증된 `sha-<commit>`만 사용
- 같은 SHA가 테스트 서버와 프리프로덕션 리허설에서 초록이어야 함
- 운영 Release는 `vX.Y.Z` semver 기준으로 생성됨
- 같은 버전 태그가 다른 SHA에 이미 쓰였으면 배포를 멈추고 버전 bump를 먼저 수행

## 7. 롤백 규칙

자동 롤백은 기본 제공하지 않습니다.

기본 순서:

1. 마지막 정상 `sha-<commit>` 확인
2. `Deploy Production`을 그 SHA로 다시 실행
3. 필요 시 최신 백업에서 DB 복원
4. 라우팅/TLS 문제라면 DB보다 프록시를 먼저 확인

## 8. 배포 전 체크리스트

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] 필요한 경우 `npm run test:e2e:smoke`
- [ ] 관련 문서를 함께 업데이트했는지 확인
- [ ] 서버 `.env`가 최신 도메인 기준인지 확인
- [ ] self-hosted runner가 online 상태인지 확인
- [ ] 후보 SHA가 리허설까지 통과했는지 확인

## 9. 관련 문서

- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- [deploy/README.md](./deploy/README.md)
- [docs/architecture-overview.md](./docs/architecture-overview.md)
