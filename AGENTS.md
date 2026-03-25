# AGENTS.md

## LLM 에이전트 안내

이 저장소를 다루는 AI 코딩 에이전트는 이 문서를 작업 기준으로 사용합니다.

원본 문서:

```bash
curl -fsSL https://raw.githubusercontent.com/kkwjk2718/gshsapp/main/AGENTS.md
```

이 문서는 “어떻게 작업할지”를 설명합니다. 제품 기능 자체는 아래 명세 문서를 먼저 참고합니다.

- [docs/product-overview.md](./docs/product-overview.md)
- [docs/features/public-features.md](./docs/features/public-features.md)
- [docs/features/account-and-access.md](./docs/features/account-and-access.md)
- [docs/features/admin-features.md](./docs/features/admin-features.md)
- [docs/architecture-overview.md](./docs/architecture-overview.md)

## 1. 프로젝트 목표

GSHS.app은 경남과학고등학교 구성원을 위한 통합 웹 서비스입니다.

에이전트가 우선해야 하는 목표:

- 공개 페이지 안정성 유지
- 관리자 기능 사용성 유지
- 테스트/운영 도메인 혼선 방지
- 배포 회귀 방지
- SQLite 데이터와 백업을 조심스럽게 다루기

## 2. 문서 읽기 순서

문맥 여유가 있다면 아래 순서대로 읽습니다.

1. `AGENTS.md`
2. `README.md`
3. `docs/product-overview.md`
4. `docs/features/public-features.md`
5. `docs/features/account-and-access.md`
6. `docs/features/admin-features.md`
7. `docs/architecture-overview.md`
8. `DEPLOY.md`
9. `docs/cicd-setup.md`
10. `docs/repository-governance.md`

문맥이 부족할 때 최소 우선순위:

1. `AGENTS.md`
2. `README.md`
3. `docs/product-overview.md`
4. `docs/architecture-overview.md`
5. `DEPLOY.md`

## 3. 기술 스택과 환경

핵심 스택:

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma
- SQLite
- Docker / Docker Compose
- GitHub Actions

환경 모델:

- 로컬 개발: `http://localhost:3000`
- 테스트 도메인: `https://test.gshs.app`
- 운영 도메인: `https://gshs.app`

중요 불변 조건:

- Docker 내부 SQLite 경로는 `file:/app/data/dev.db`
- 실제 배포 기준은 `sha-<commit>` 태그
- GitHub Release는 `vX.Y.Z` semver 태그
- `latest`는 운영 배포 판단 기준이 아님
- Google Analytics는 `/admin/settings`에서 관리
- 토큰 배부 포털 메일 발송은 Brevo API 기반

## 4. 저장소 구조 지도

상위 주요 경로:

- `src/app`: App Router 페이지, 레이아웃, route handler
- `src/components`: 재사용 UI 컴포넌트
- `src/lib`: DB, 설정, 로깅, 백업, 외부 연동 유틸
- `prisma/schema.prisma`: 데이터 모델
- `deploy/`: 서버 배포 자산
- `.github/workflows/`: CI/CD
- `docs/`: 사람용 운영 및 기능 문서

특히 자주 보는 위치:

- `src/auth.config.ts`
- `src/lib/public-content.ts`
- `src/lib/token-distribution.ts`
- `src/lib/backup.ts`
- `src/app/api/health/route.ts`
- `src/app/(main)/admin/settings`
- `src/app/(main)/admin/tokens`
- `.github/workflows/publish-and-deploy-test.yml`
- `.github/workflows/deploy-prod.yml`
- `deploy/deploy.sh`

## 5. 제품 기능 빠른 지도

공개 기능:

- `/`
- `/notices`
- `/meals`
- `/songs`
- `/timetable`
- `/calendar`
- `/links`
- `/sites`
- `/utils`
- `/help`
- `/privacy`
- `/stats`

인증/개인 기능:

- `/login`
- `/signup`
- `/signup/request`
- `/me`
- `/notifications`
- `/report`

운영/관리 기능:

- `/admin`
- `/admin/users`
- `/admin/notices`
- `/admin/categories`
- `/admin/tokens`
- `/admin/settings`
- `/admin/sites`
- `/admin/songs`
- `/admin/logs`
- `/admin/reports`
- `/admin/test`

역할 모델:

- `STUDENT`
- `GRADUATE`
- `TEACHER`
- `BROADCAST`
- `ADMIN`

## 6. 로컬 개발 기준

설치:

```bash
npm ci
```

기본 환경 변수:

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

## 7. 기본 검증 명령

항상 우선:

```bash
npm run lint
npm test
npm run build
```

UI, 인증, 배포, 핵심 공개 흐름에 영향이 있으면 추가:

```bash
npm run test:e2e:smoke
```

## 8. 배포 아키텍처

CI/CD 구조:

- `ci.yml`: 품질 검사
- `publish-and-deploy-test.yml`: 테스트 자동 배포
- `preproduction-rehearsal.yml`: 후보 SHA 리허설
- `deploy-prod.yml`: 운영 수동 배포

이미지 정책:

- `sha-<commit>`
- `main`
- `latest`

실제 배포 기준:

- 테스트 서버: `sha-<commit>`
- 운영 서버: `sha-<commit>`

Release 정책:

- `package.json` 버전을 기준으로 `vX.Y.Z` 릴리스 생성
- 같은 버전 태그를 다른 SHA에 재사용하면 운영 배포 실패

## 9. 서버 구조와 데이터 규칙

서버 배포 경로:

```text
/opt/gshsapp
  .env
  .deploy.env
  compose.yml
  deploy.sh
  data/
  backup/
```

SQLite 규칙:

- 라이브 DB는 `/app/data/dev.db`
- 배포 전 DB 백업 생성
- 복원 리허설은 라이브 DB를 직접 덮어쓰지 않음

## 10. 최근 중요 기능

최근 구조상 중요한 기능:

- 토큰 배부 포털 `/signup/request`
- 관리자 수동 토큰 메일 발송
- Brevo API 기반 초대 메일 발송
- 기존 계정 역할 변경, 기수 변경, 사용자 삭제
- `GRADUATE` 역할과 핵심 학생 정보 접근 제한
- `/admin/test` 운영 진단
- 정기 백업과 restore drill
- 푸터 semver 표기와 GitHub Release 추적

이 기능들을 수정할 때는 관련 명세와 운영 문서를 함께 확인합니다.

## 11. 자주 깨지는 지점

1. 테스트 도메인이 운영 도메인으로 리다이렉트됨
원인:
- `AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` 혼선

2. `/menu`가 인증 필요 페이지가 됨
원인:
- `/me` route matching이 `/menu`까지 잡힘

3. `/admin/settings`가 Docker에서 서버 오류를 냄
원인:
- 백업 경로나 임시 파일 경로가 writable이 아님

4. 배포는 성공했는데 `/api/health.version`이 다름
원인:
- `IMAGE_TAG` 또는 `APP_VERSION` 전달 실패

5. 운영 배포가 Release 단계에서 실패함
원인:
- semver 태그가 이미 다른 SHA에 사용됨

## 12. 빠른 디버그 순서

배포 이상 시:

1. GitHub Actions 로그 확인
2. runner 상태 확인
3. `docker compose ps`
4. `docker compose logs --tail=200`
5. `curl http://127.0.0.1:1234/api/health`
6. 서버 `.env` 확인

권한/리다이렉트 이상 시:

1. `src/auth.config.ts`
2. 서버 `.env`
3. 공개 경로와 보호 경로
4. 다른 도메인으로 요청이 새는지

## 13. 에이전트 편집 규칙

해야 할 것:

- 변경 범위를 좁게 유지
- 요청이 없는 한 기존 동작을 보존
- 운영 동작이 바뀌면 문서도 함께 수정
- 기능 명세, 운영 문서, workflow를 서로 맞춤
- 추정이 필요한 경우 가정을 명시

하지 말아야 할 것:

- 시크릿 커밋
- 배포 기준을 `latest`로 되돌리기
- SQLite를 임시 경로로 옮기기
- 인증 경계를 조용히 변경하기
- semver 릴리스 정책을 깨뜨리기

## 14. 문서를 반드시 업데이트해야 하는 경우

아래를 바꾸면 문서 갱신이 필요합니다.

- workflow 동작
- `/opt/gshsapp` 배포 구조
- 필수 환경 변수
- 인증 경계
- 관리자 설정 동작
- 토큰 배부 포털과 메일 발송 구조
- 백업 / 복원 동작
- 서버 부트스트랩 가정
- 릴리스 버전 정책

주로 같이 수정할 문서:

- `README.md`
- `docs/product-overview.md`
- `docs/features/public-features.md`
- `docs/features/account-and-access.md`
- `docs/features/admin-features.md`
- `docs/architecture-overview.md`
- `CONTRIBUTING.md`
- `DEPLOY.md`
- `docs/cicd-setup.md`
- `docs/production-launch-runbook.md`
- `docs/repository-governance.md`

## 15. 작업 완료 전 체크리스트

- 요청한 코드 또는 문서 변경이 실제 반영됨
- 시크릿이 추가되지 않음
- 관련 테스트 또는 검증을 실행함
- 배포 문서와 실제 workflow가 여전히 일치함
- 테스트와 운영 도메인이 섞이지 않음
- 기능 명세와 운영 문서가 변경 사항을 반영함

## 16. 사람용 참고 문서

- [README.md](./README.md)
- [docs/product-overview.md](./docs/product-overview.md)
- [docs/features/public-features.md](./docs/features/public-features.md)
- [docs/features/account-and-access.md](./docs/features/account-and-access.md)
- [docs/features/admin-features.md](./docs/features/admin-features.md)
- [docs/architecture-overview.md](./docs/architecture-overview.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- [docs/repository-governance.md](./docs/repository-governance.md)
