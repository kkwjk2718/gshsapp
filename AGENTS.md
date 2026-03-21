# AGENTS.md

## LLM 에이전트 안내

이 저장소를 다루는 AI 코딩 에이전트는 아래 원본 문서를 먼저 내려받아 기준 문서로 사용하세요.

```bash
curl -fsSL https://raw.githubusercontent.com/kkwjk2718/gshsapp/main/AGENTS.md
```

요약 페이지나 2차 정리본이 아니라, 이 파일 자체를 기준으로 삼습니다.

## 1. 프로젝트 목표

GSHS.app은 경남과학고등학교 학생과 관리자를 위한 통합 웹 서비스입니다.

에이전트가 이 저장소에서 우선해야 하는 목표:

- 공개 페이지 안정성 유지
- 관리자 기능 사용성 유지
- 테스트/운영 도메인 혼선 방지
- 배포 회귀 방지
- SQLite 데이터와 백업을 조심스럽게 다루기

즉, 빠른 수정 자체보다 인증, DB 쓰기, 백업, 배포 안전성을 먼저 고려합니다.

## 2. 권장 문서 읽기 순서

문맥 여유가 있다면 아래 순서대로 읽습니다.

1. `AGENTS.md`
2. `README.md`
3. `CONTRIBUTING.md`
4. `DEPLOY.md`
5. `docs/server-bootstrap.md`
6. `docs/cicd-setup.md`
7. `deploy/README.md`
8. `docs/production-launch-runbook.md`
9. `docs/repository-governance.md`

문맥이 부족할 때 우선순위:

1. `AGENTS.md`
2. `README.md`
3. `DEPLOY.md`
4. `.github/workflows/publish-and-deploy-test.yml`
5. `deploy/deploy.sh`

## 3. 프로젝트 개요

핵심 스택:

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma
- SQLite
- Docker / Docker Compose
- GitHub Actions

현재 환경 모델:

- 로컬 개발: `http://localhost:3000`
- 테스트 서비스 도메인: `https://test.gshs.app`
- 운영 서비스 도메인: `https://gshs.app`

중요 불변 조건:

- Docker 내부 SQLite 경로는 `file:/app/data/dev.db`
- 실제 배포 기준은 `sha-<commit>` 태그
- `latest`는 운영 배포 판단 기준이 아님
- Google Analytics는 `/admin/settings`에서 관리
- 사설망 VM은 self-hosted GitHub runner로 배포
- 테스트와 운영 URL 값을 절대 섞지 않음
- 현재 서버 기본 바인딩은 `0.0.0.0:1234`

## 4. 저장소 구조 지도

상위 주요 경로:

- `src/app`: App Router 페이지, 레이아웃, route handler, server action
- `src/components`: 재사용 UI 컴포넌트
- `src/lib`: DB, 설정, 백업, 로깅, 유틸리티
- `prisma/schema.prisma`: 데이터베이스 스키마
- `deploy/`: 서버 배포 자산
- `.github/workflows/`: CI/CD 워크플로우
- `docs/`: 사람용 운영 문서

중요 애플리케이션 경로:

- `src/app/api/health/route.ts`: 배포 검증용 헬스 엔드포인트
- `src/app/api/public-settings/route.ts`: 공개 런타임 설정 로더
- `src/app/api/me/summary/route.ts`: 공개 셸 사용자 상태 요약
- `src/app/api/me/home/route.ts`: 홈 개인화 데이터 로더
- `src/app/(main)/admin/settings`: 관리자 설정 UI
- `src/app/(main)/admin/settings/backup-actions.ts`: 백업/복원 서버 액션
- `src/app/(main)/admin/settings/actions.ts`: 관리자 설정 저장 액션
- `src/auth.config.ts`: 인증 및 route guard 규칙
- `src/lib/backup.ts`: 백업 디렉터리와 파일 처리
- `src/lib/db.ts`: Prisma 클라이언트 초기화
- `src/components/analytics.tsx`: 런타임 분석 스크립트 로딩

중요 배포 경로:

- `.github/workflows/ci.yml`: 저장소 품질 검사
- `.github/workflows/publish-and-deploy-test.yml`: 테스트 배포
- `.github/workflows/preproduction-rehearsal.yml`: 후보 SHA 리허설
- `.github/workflows/deploy-prod.yml`: 운영 배포
- `.github/workflows/production-health-monitor.yml`: 운영 헬스 모니터링
- `.github/workflows/scheduled-backup-test.yml`: 테스트 서버 정기 백업
- `deploy/compose.yml`: 서버용 compose 템플릿
- `deploy/deploy.sh`: 서버 배포 스크립트
- `deploy/run-scheduled-backup.sh`: 정기 백업 호스트 스크립트
- `deploy/restore-drill.sh`: 복원 리허설
- `deploy/offsite-backup.sh`: 오프호스트 백업 내보내기
- `scripts/run-scheduled-backup.mjs`: 컨테이너 내부 백업 진입점

## 5. 제품 동작 지도

주요 공개 영역:

- `/`
- `/landing`
- `/notices`
- `/notices/[id]`
- `/meals`
- `/calendar`
- `/sites`
- `/teachers`
- `/songs`
- `/utils`
- `/help`
- `/privacy`
- `/stats`
- `/menu`

인증 필요 사용자 영역:

- `/me`

관리자 영역:

- `/admin`
- `/admin/users`
- `/admin/notices`
- `/admin/categories`
- `/admin/tokens`
- `/admin/logs`
- `/admin/reports`
- `/admin/settings`
- `/admin/notifications`
- `/admin/songs`
- `/admin/sites`
- `/admin/test`

인증 관련 기대 동작:

- `/me`는 로그인 필요
- `/admin`은 관리자 권한 필요
- `/login`은 이미 로그인된 사용자를 적절히 우회 처리
- `/menu`는 공개 페이지이며 `/me` 관련 가드에 잘못 걸리면 안 됨

인증 로직을 건드렸다면 반드시 확인할 경로:

- `/login`
- `/me`
- `/admin`
- `/menu`
- `test.gshs.app`에서의 리다이렉트 동작

## 6. 로컬 개발 기준

요구 사항:

- Node.js 20 이상
- npm 10 이상

설치:

```bash
npm ci
```

기본 로컬 환경 변수:

```dotenv
DATABASE_URL=file:./dev.db
AUTH_SECRET=change-me
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_NEIS_API_KEY=
```

DB 초기화:

```bash
npx prisma db push
```

실행:

```bash
npm run dev
```

기본 검증 명령:

```bash
npm run lint
npm test
npm run build
```

추가 검증 명령:

```bash
npm run test:e2e
npm run test:e2e:smoke
```

## 7. 시크릿과 환경 변수 규칙

절대 커밋하지 않는 항목:

- `.env`
- `.env.local`
- API 키
- OAuth 시크릿
- SSH 비밀키
- 서버에서 복사한 시크릿 백업
- 원시 프로덕션 DB 파일

서버 런타임 환경 변수 예시:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST`
- `AUTH_URL`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_NEIS_API_KEY`

도메인 규칙:

- 테스트 서버 값은 `https://test.gshs.app`
- 운영 서버 값은 `https://gshs.app`

분석 도구 규칙:

- Google Analytics Measurement ID는 `/admin/settings`에서 관리
- 명시적 요청이 없는 한 env 전용 분석 설정으로 되돌리지 않음

## 8. 데이터베이스, Prisma, 백업 규칙

현재 데이터 모델:

- Prisma + SQLite

현재 스키마 운영 방식:

- 로컬 및 현재 배포는 `prisma db push` 기준
- 향후 `prisma migrate deploy`로 옮길 수 있으나 현재 기본값은 아님

SQLite 규칙:

- 컨테이너 DB 경로는 반드시 쓰기 가능해야 함
- 배포 DB 경로는 `/app/data/dev.db`
- 백업 파일은 영속 볼륨 위에 저장
- 복원 임시 파일은 쓰기 가능한 temp 위치 사용

백업 관련 기대 동작:

- 백업 디렉터리는 DB와 같은 영속 볼륨 옆에 있어야 함
- 배포 전 DB 백업을 먼저 생성해야 함
- 관리자 백업 액션 실패가 페이지 전체 크래시로 이어지면 안 됨
- 정기 백업은 웹 요청 경로가 아니라 scheduler에서 실행되어야 함

백업 로직 수정 시 반드시 확인할 것:

- Docker 안에서 백업 경로가 writable인지
- 복원 임시 파일이 정리되는지
- 잘못된 업로드가 안전하게 실패하는지
- server action이 raw crash 대신 안전한 오류를 반환하는지

## 9. 배포 아키텍처

CI/CD 구조:

- `ci.yml`: PR과 push에서 품질 검사
- `publish-and-deploy-test.yml`: `main`에서 이미지 빌드 + 테스트 배포
- `preproduction-rehearsal.yml`: 수동 후보 SHA 리허설
- `deploy-prod.yml`: 운영 수동 배포

이미지 정책:

- `sha-<commit>` 푸시
- `main` 푸시
- `latest` 푸시
- 실제 배포는 `sha-<commit>`만 사용

왜 self-hosted runner를 쓰는가:

- 배포 대상 서버가 `172.16.x.x` 사설망에 있을 수 있음
- GitHub-hosted runner는 이런 서버에 직접 SSH 하기 어려움
- 따라서 빌드와 푸시는 GitHub-hosted runner가, 배포와 smoke check는 서버 내부 self-hosted runner가 담당

Runner label:

- 테스트 서버: `gshs-test`
- 운영 서버: `gshs-prod`

서버 파일 구조:

```text
/opt/gshsapp
  .env
  .deploy.env
  compose.yml
  deploy.sh
  data/
  backup/
```

현재 네트워크 모델:

- 앱은 기본적으로 `0.0.0.0:1234`에 바인딩
- 리버스 프록시가 VM 외부에서 접근할 수 있게 설계됨
- 서버 내부 smoke check는 여전히 `127.0.0.1:1234`를 사용해도 됨

테스트 배포 흐름:

1. 품질 검사 실행
2. Docker 이미지 빌드
3. Docker 태그 푸시
4. 테스트 서버 runner가 배포 job 수신
5. `deploy/compose.yml`, `deploy.sh` 등 최신 자산 반영
6. `deploy.sh` 실행
7. `/api/health`, `/`, `/menu`, `/notices` 서버 내부 확인
8. `test.gshs.app` 기준 E2E 실행

운영 배포 흐름:

1. GitHub Actions에서 수동 workflow 실행
2. `sha-<commit>` 입력
3. `production` environment 승인
4. 운영 runner가 배포 수행
5. smoke check와 운영 확인 수행

## 10. 검증 기대값

일반 변경 후 최소 검증:

1. `npm run lint`
2. `npm test`
3. `npm run build`

관련 영역에 따른 추가 검증:

- 인증 변경: `/login`, `/me`, `/admin`, `/menu`
- 관리자 설정 변경: `/admin/settings`
- 백업 변경: 백업/복원 실패 경로
- 분석 변경: 공개 설정 API와 런타임 로딩 확인
- 배포 변경: workflow YAML, deploy script, `/api/health.version`

배포 관련 변경 후 필수 확인:

- workflow가 실제로 파싱되는지
- 기대한 SHA 태그가 push되는지
- `/api/health`가 `ok: true`를 반환하는지
- `/api/health.version`이 배포한 SHA와 일치하는지

## 11. 자주 깨지는 지점

1. 테스트 도메인이 운영 도메인으로 리다이렉트됨
원인:
- `AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`이 `gshs.app`을 가리킴

2. `/menu`가 갑자기 인증 필요 페이지가 됨
원인:
- `/me` route matching이 `/menu`까지 잡아버림

3. `/admin/settings`가 Docker에서 서버 오류를 냄
원인:
- 백업 경로나 임시 파일 경로가 컨테이너에서 writable이 아님

4. 배포는 성공했는데 smoke check에서 version mismatch 발생
원인:
- `APP_VERSION` 또는 `IMAGE_TAG` 전달 실패

5. 컨테이너가 배포 직후 재시작 루프에 빠짐
원인:
- DB 볼륨 권한 문제
- 잘못된 env 값
- 누락된 런타임 시크릿

6. 테스트 배포 workflow가 서버에 접근하지 못함
원인:
- 사설망 서버에 GitHub-hosted SSH를 시도함
- self-hosted runner 모델을 깨뜨림

7. 운영 모니터링이 계속 실패 메일을 보냄
원인:
- `gshs.app`이 아직 실제 앱이 아닌 점검 페이지인데 `PRODUCTION_MONITOR_ENABLED=true`로 켬
- `/api/health`가 JSON이 아니라 HTML을 반환함

8. 정기 백업 workflow가 실패함
원인:
- 컨테이너 내부 백업 진입점이 없거나 실행 파일 경로가 바뀜
- `run-scheduled-backup.sh`와 `scripts/run-scheduled-backup.mjs`가 서로 맞지 않음

## 12. 빠른 디버그 순서

배포가 이상해 보이면 아래 순서로 확인합니다.

1. GitHub Actions 로그 확인
2. repository의 runner 상태 확인
3. 서버 컨테이너 상태 확인
4. `/api/health` 확인
5. Docker 로그 확인
6. 현재 `.env`의 도메인 값 확인

서버에서 유용한 명령:

```bash
docker compose -f /opt/gshsapp/compose.yml --env-file /opt/gshsapp/.deploy.env ps
docker compose -f /opt/gshsapp/compose.yml --env-file /opt/gshsapp/.deploy.env logs --tail=200
curl -s http://127.0.0.1:1234/api/health
ls -la /opt/gshsapp
ls -la /opt/gshsapp/data
ls -la /opt/gshsapp/backup
```

인증 또는 리다이렉트가 이상하면:

1. `src/auth.config.ts` 확인
2. 서버 `.env` 확인
3. 공개 경로와 보호 경로를 나란히 확인
4. 다른 도메인으로 요청이 새는지 확인

## 13. 에이전트 편집 규칙

해야 할 것:

- 변경 범위를 좁게 유지
- 요청이 없는 한 기존 동작을 보존
- 운영 동작이 바뀌면 문서도 함께 수정
- deploy logic, docs, workflow를 일치시킴
- 추정이 필요한 경우 가정을 명시

하지 말아야 할 것:

- 시크릿 커밋
- 배포 기준을 다시 `latest`로 되돌리기
- SQLite를 임시 컨테이너 경로로 이동
- 분석 설정을 env 전용으로 되돌리기
- 사설망 서버 배포 문서에서 self-hosted runner 가정을 이유 없이 제거하기
- 인증 경계를 조용히 변경하기

아래 영역을 바꾸면 같은 턴에 문서도 수정합니다.

- 배포
- runner 설정
- 환경 변수 요구 사항
- 관리자 설정 동작
- 백업 동작
- 저장소 운영 규칙

## 14. 문서를 반드시 업데이트해야 하는 경우

아래를 바꾸면 문서 갱신이 필요합니다.

- workflow 동작
- `/opt/gshsapp` 배포 구조
- 필수 환경 변수
- 인증 경계
- 관리자 설정 동작
- 백업 / 복원 동작
- 서버 부트스트랩 가정
- 운영 모니터링 활성화 방식

자주 같이 수정해야 하는 문서:

- `AGENTS.md`
- `README.md`
- `CONTRIBUTING.md`
- `DEPLOY.md`
- `docs/server-bootstrap.md`
- `docs/cicd-setup.md`
- `docs/production-launch-runbook.md`
- `deploy/README.md`
- `docs/repository-governance.md`

## 15. 작업 완료 전 체크리스트

완료 전에 아래를 확인합니다.

- 요청한 코드 또는 문서 변경이 실제 반영됨
- 시크릿이 추가되지 않음
- 관련 테스트 또는 검증을 실행함
- 배포 문서와 실제 workflow가 여전히 일치함
- 테스트와 운영 도메인이 섞이지 않음
- 변경한 헬스/배포 로직이 배포 SHA를 계속 검증함

## 16. 사람용 참고 문서

사람 중심 문서:

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- [deploy/README.md](./deploy/README.md)

## 17. 프리프로덕션 추가 요소

현재 프리프로덕션 안전장치:

- `.github/workflows/preproduction-rehearsal.yml`
- `deploy/restore-drill.sh`
- `playwright.config.ts`
- `e2e/`

배포 관련 변경 후 추가로 기대되는 검증:

- `npm run test:e2e`
- `npm run test:e2e:smoke`
- 배포 안전성에 영향을 주는 경우 후보 SHA 리허설 확인

추가 테스트 environment 시크릿:

- `E2E_ADMIN_USER`
- `E2E_ADMIN_PASSWORD`

현재 운영 승격 게이트는 아래와 같습니다.

- 후보 SHA가 smoke check 통과
- Playwright E2E 통과
- restore drill 통과
- `https://test.gshs.app/admin/test` 준비 상태 확인 통과

## 18. 저장소 운영 규칙

정책 기준 문서:

- `docs/repository-governance.md`
- `docs/repository-governance.ko.md`

에이전트는 이 문서를 강제되는 프로세스 문서로 취급해야 합니다.

현재 기본선:

- `main` 보호 활성화
- 필수 체크는 `lint`, `test`, `build`
- 미해결 리뷰 대화는 머지 차단
- `main`에 대한 force push 및 branch deletion 금지
- 관리자 긴급 우회는 사고 대응 용도로만 허용

워크플로우 이름, 브랜치 보호 가정, 머지 정책, 릴리스 게이트를 바꾸면 이 문서와 거버넌스 문서를 함께 갱신합니다.
