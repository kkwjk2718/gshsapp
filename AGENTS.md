# AGENTS.md

이 문서는 GSHS.app 저장소에서 작업하는 AI 코딩 에이전트를 위한 기준 문서입니다.

대상:

- Codex
- Claude
- Cursor
- GitHub Copilot
- 기타 저장소 문맥을 읽고 작업하는 에이전트

## 1. 프로젝트 개요

GSHS.app은 경남과학고 학생용 통합 웹 서비스입니다.

핵심 기능:

- 공지사항
- 급식
- 시간표
- 학사 일정
- 음악 신청
- 교내 링크 모음
- 관리자 페이지

기술 스택:

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma
- SQLite
- Docker / Docker Compose
- GitHub Actions

## 2. 가장 먼저 이해해야 할 것

- 이 프로젝트는 현재 SQLite 기반입니다.
- 서버 배포 시 DB는 반드시 볼륨에 둡니다.
- 테스트 서버 도메인은 `test.gshs.app`입니다.
- 운영 서버 도메인은 `gshs.app`입니다.
- 운영 배포는 `latest`가 아니라 `sha-<commit>` 태그를 기준으로 합니다.
- Google Analytics는 환경 변수가 아니라 `/admin/settings`에서 관리합니다.

## 3. 저장소 구조

주요 경로:

- `src/app`: Next.js App Router 페이지와 API 라우트
- `src/components`: 재사용 UI 컴포넌트
- `src/lib`: DB, 백업, 설정, 외부 연동 로직
- `prisma/schema.prisma`: 데이터 모델
- `deploy/`: 서버 배포용 자산
- `.github/workflows/`: CI/CD 워크플로우
- `docs/`: 서버 및 CI/CD 운영 문서

중요 하위 경로:

- `src/app/api/health/route.ts`: 배포 후 헬스체크 엔드포인트
- `src/app/api/public-settings/route.ts`: 공개 설정 API
- `src/app/(main)/admin/settings`: 관리자 설정 및 백업 관련 화면
- `src/auth.config.ts`: 인증/권한 경계
- `src/lib/backup.ts`: SQLite 백업/복원 핵심 로직
- `src/lib/db.ts`: Prisma 클라이언트

## 4. 로컬 개발과 검증 명령

설치:

```bash
npm ci
```

자주 쓰는 명령:

```bash
npm run dev
npm run lint
npm test
npm run build
```

작업 후 기본 검증 순서:

1. `npm run lint`
2. `npm test`
3. `npm run build`

참고:

- 현재 lint는 경고가 남아 있지만 실패하지는 않습니다.
- 테스트는 `vitest`
- E2E 성격 검증은 필요 시 Playwright 사용

## 5. 환경 변수 규칙

로컬 개발 기본값:

```dotenv
DATABASE_URL=file:./dev.db
AUTH_SECRET=change-me
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_NEIS_API_KEY=
```

서버 Docker 배포 기본값:

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-me
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버에서는 URL 세 값을 `https://gshs.app`로 바꿉니다.

절대 하지 말 것:

- 실제 `.env` 파일이나 비밀값을 커밋
- 테스트 도메인과 운영 도메인 설정을 섞기
- 운영 계정 정보를 코드에 하드코딩

## 6. 인증과 권한

인증 관련 기준 파일:

- `src/auth.config.ts`

현재 기준:

- `/me`는 로그인 필요
- `/admin`은 관리자 권한 필요
- `/login`은 로그인 상태면 홈으로 리다이렉트
- 공개 페이지와 보호 페이지 경계를 바꿀 때는 회귀를 특히 조심해야 함

권한 로직을 수정할 때는 아래를 같이 확인합니다.

- `/login`
- `/me`
- `/admin`
- `/menu`
- 테스트 서버 도메인 리다이렉트가 `gshs.app`로 새지 않는지

## 7. 데이터베이스와 백업

DB:

- Prisma + SQLite
- 스키마 파일: `prisma/schema.prisma`

중요 규칙:

- 서버 DB는 `/app/data/dev.db` 기준
- 백업은 DB와 같은 볼륨 영역에 저장되도록 유지
- 백업/복원 로직 수정 시 쓰기 가능한 경로인지 먼저 확인

현재 백업 관련 포인트:

- 기본 백업 디렉터리는 DB 파일 옆 `backup/`
- 관리자 설정에서 백업 관련 작업을 수행
- 예외가 서버 전체 에러로 번지지 않도록 안전하게 실패 처리해야 함

## 8. 배포 구조

현재 CI/CD 구조:

- PR / push: `ci.yml`
- `main` push: Docker 이미지 빌드 + 테스트 서버 자동 배포
- 운영 배포: `deploy-prod.yml` 수동 실행

중요 파일:

- `.github/workflows/ci.yml`
- `.github/workflows/publish-and-deploy-test.yml`
- `.github/workflows/deploy-prod.yml`
- `deploy/compose.yml`
- `deploy/deploy.sh`
- `deploy/smoke_check.py`

배포 원칙:

- Docker Hub 태그는 `sha-<commit>`, `main`, `latest`
- 실제 서버 배포는 `sha-<commit>`만 사용
- 서버 경로 기본값은 `/opt/gshsapp`
- 앱은 `127.0.0.1:1234`에 바인딩하고 리버스 프록시가 앞단에서 받는 구조를 기본으로 가정

## 9. AI 에이전트가 자주 실수하는 포인트

- `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, `NEXTAUTH_URL`를 테스트/운영 도메인과 다르게 두지 말 것
- Google Analytics 설정을 다시 환경 변수 방식으로 되돌리지 말 것
- 서버 배포용 compose와 로컬용 compose를 혼동하지 말 것
- SQLite 파일 경로를 컨테이너 내부 임시 경로로 바꾸지 말 것
- `latest` 태그를 운영 배포 기준으로 쓰지 말 것
- 문서만 바뀐 게 아니라면 반드시 검증 명령 결과를 확인할 것
- 서버에서 직접 고친 내용을 문서와 저장소에 반영하지 않은 채 끝내지 말 것

## 10. 문서 우선순위

작업 전에 아래 문서를 함께 읽는 것이 좋습니다.

1. `README.md`
2. `CONTRIBUTING.md`
3. `DEPLOY.md`
4. `docs/server-bootstrap.md`
5. `docs/cicd-setup.md`
6. `deploy/README.md`

## 11. 코드 변경 시 기대 행동

에이전트는 아래 원칙을 따르는 것이 좋습니다.

- 작은 범위로 수정
- 관련 문서가 바뀌면 함께 갱신
- 시크릿은 절대 저장소에 추가하지 않음
- 가능하면 테스트와 빌드까지 확인
- 배포 관련 변경이면 `deploy/`, `.github/workflows/`, `docs/`를 같이 점검

## 12. 새 서버가 준비되면 할 일

새 테스트 서버 또는 운영 서버가 준비되면 아래 순서로 진행합니다.

1. `docs/server-bootstrap.md` 기준으로 VM 준비
2. GitHub Actions용 SSH 키 준비
3. GitHub Environments / Secrets 입력
4. 서버 `.env` 작성
5. CI/CD 워크플로우 push 및 검증

## 13. 참고

사람용 운영 문서:

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [deploy/README.md](./deploy/README.md)
