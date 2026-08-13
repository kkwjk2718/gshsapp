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
3. Docker Hub에 `sha-<40-hex commit>` 태그를 푸시하고 registry digest 기록
4. 테스트 서버 self-hosted runner가 자동 배포
5. 운영 서버는 GitHub Actions 수동 실행 + `production` 승인 후 배포

핵심 원칙:

- 실제 배포는 정확한 `sha-<40-hex commit>` 출처와 `sha256:<64-hex>` image digest를 모두 검증
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
AUTH_SECRET=replace-with-long-random-secret
TRUSTED_PROXY_HOPS=1
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버에서는 URL 세 값을 `https://gshs.app`으로 바꿉니다.

추가 메모:

- `AUTH_SECRET`은 CSPRNG로 생성한 32바이트 이상의 실제 시크릿이어야 하며 예시 placeholder는 런타임에서 거부됩니다.
- `TRUSTED_PROXY_HOPS`는 전달 헤더를 덮어쓰는 통제된 프록시의 정확한 수(1~3)여야 합니다. 누락·0이면 운영 배포와 웹 컨테이너 시작이 중단됩니다.
- Google Analytics는 `/admin/settings`에서 관리합니다.
- Brevo 메일 발송은 서버 `.env`에 별도 API 키가 필요합니다.
- `APP_VERSION`은 배포 시점에 workflow와 `deploy.sh`가 주입합니다.
- 배포용 웹 컨테이너는 `TZ=Asia/Seoul`로 고정합니다.

## 4. SQLite 운영 원칙

- DB 파일은 `/app/data/dev.db` 영속 볼륨 경로를 사용합니다.
- 일반 배포 전 백업은 실행 중인 마지막 신뢰 이미지의 공용 엔진이 `VACUUM INTO`로 만든 일관된 스냅샷이어야 합니다. 최초 강화 배포에서 구형 이미지에 ops 런타임이 없을 때만 호스트 Python SQLite online-backup으로 DB-only v2 쌍을 만들며, 후보 이미지는 네트워크 없이 아카이브만 읽어 격리 migration 검증합니다. 어느 경로도 라이브 DB 파일을 `cp`하거나 후보 이미지에 라이브 data root를 마운트하지 않습니다.
- 백업 엔진은 backup directory의 cross-process heartbeat lease를 획득한 한 writer만 capacity check, snapshot, archive, retention을 수행합니다. 새 세대의 검증과 metadata 영속화가 끝난 뒤에만 완전한 archive/metadata 쌍을 count, age, total-bytes 정책으로 정리합니다. 최신 세대와 최소 3세대는 항상 남기며, 예상 스냅샷 공간과 256 MiB 여유를 확보하지 못하면 생성 전에 중단합니다.
- 라이브 DB를 컨테이너 임시 경로에 두지 않습니다.
- 복원 리허설은 라이브 DB를 직접 덮어쓰지 않습니다.
- 웹 업로드는 검증된 보류 복원만 생성합니다. 원자적 lock directory는 1분 heartbeat로 느린 활성 업로드를 보호하고 heartbeat가 30분 끊긴 crash lock만 회수합니다. 만료 descriptor는 엄격히 파싱하며, 관리자는 정확한 opaque restore ID를 사용해 감사 로그가 남는 취소를 할 수 있습니다. 자동 적용은 비활성화되어 있으며 운영자가 오프라인 절차를 별도로 검토해야 합니다.
- 컨테이너 시작 스크립트는 스키마를 변경하지 않습니다. 배포 절차가 앱 시작 전에 스키마 동기화를 완료해야 합니다.

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

- `image_tag=sha-<40-hex commit>`
- `image_digest=sha256:<64-hex>`
- `rehearsal_run_id=<successful Preproduction Rehearsal run ID>`

원칙:

- mutable 태그가 아니라 검증된 digest를 사용하고, 이미지 revision label이 입력 commit과 같은지 확인
- 같은 SHA가 테스트 서버와 프리프로덕션 리허설에서 초록이어야 함
- 운영 Release는 `vX.Y.Z` semver 기준으로 생성됨
- 같은 버전 태그가 다른 SHA에 이미 쓰였으면 배포를 멈추고 버전 bump를 먼저 수행

## 7. 롤백 규칙

자동 롤백은 기본 제공하지 않습니다.

기본 순서:

1. 마지막 정상 `sha-<commit>`와 정확한 image digest 확인
2. `Deploy Production`을 그 SHA와 digest로 다시 실행
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
