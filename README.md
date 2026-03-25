# GSHS.app

경남과학고등학교 구성원을 위한 통합 웹 서비스 저장소입니다.

- 운영 서비스: <https://gshs.app>
- 테스트 서비스: <https://test.gshs.app>
- GitHub: <https://github.com/kkwjk2718/gshsapp>
- Docker Hub: <https://hub.docker.com/r/kkwjk2718git/gshsapp>

## 한눈에 보기

GSHS.app은 학교 생활에서 자주 확인하는 정보를 한곳에 모은 Next.js 기반 웹 서비스입니다.

핵심 사용자:

- 비로그인 사용자: 홈, 공지, 급식, 학사일정, 도구, 통계, 도움말
- 학생: 내 정보, 알림, 개인 일정, 오류 신고, 기상곡, 시간표, 링크모음, 교내 사이트, 토큰 기반 회원가입
- 졸업생: 로그인과 기본 계정 기능은 가능하지만 학생 전용 핵심 정보 접근은 제한
- 교사: 학생 기능 + 링크모음 관리, 공지 작성
- 방송부: 학생 기능 + 기상곡 검수 및 방송부 스튜디오
- 관리자: 사용자/공지/카테고리/토큰/설정/사이트/로그/리포트/진단 관리

주요 기능군:

- 공개 정보: 홈, 공지사항, 급식, 학사일정, 도구, 도움말, 개인정보처리방침, 통계
- 로그인 필요 정보: 기상곡, 시간표, 링크모음, 교내 사이트, 내 정보, 개인 일정, 알림, 오류 신고
- 계정 및 개인화: 로그인, 회원가입, 토큰 배부 포털, 내 정보, 개인 일정, 알림, 오류 신고
- 운영 도구: 기상곡 검수, 관리자 설정, 토큰 발급 및 메일 발송, 백업/복원, 운영 진단

## 현재 환경 구조

| 구분 | 주소 | 용도 |
| --- | --- | --- |
| 로컬 개발 | `http://localhost:3000` | 개발 및 수동 확인 |
| 테스트 서버 | `https://test.gshs.app` | `main` 자동 배포 검증 |
| 운영 서버 | `https://gshs.app` | 실제 서비스 |

배포 기본 원칙:

- Docker 이미지는 `sha-<commit>` 불변 태그를 기준으로 배포합니다.
- GitHub Release는 `vX.Y.Z` semver 태그를 기준으로 관리합니다.
- 테스트와 운영은 self-hosted runner가 각각 분리되어 있습니다.
- SQLite는 `/app/data/dev.db` 영속 볼륨 경로를 사용합니다.

## 빠른 시작

### 요구 사항

- Node.js 20 이상
- npm 10 이상

### 설치

```bash
npm ci
```

### 로컬 환경 변수

`.env.local` 또는 `.env`에 아래 값을 준비합니다.

```dotenv
DATABASE_URL=file:./dev.db
AUTH_SECRET=change-me
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_NEIS_API_KEY=
```

추가 메모:

- Google Analytics는 환경 변수가 아니라 `/admin/settings`에서 관리합니다.
- Brevo 메일 발송은 `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`이 있어야 실제 동작합니다.

### 데이터베이스 초기화

```bash
npx prisma db push
```

### 실행

```bash
npm run dev
```

### 기본 검증

```bash
npm run lint
npm test
npm run build
```

배포 안전성이나 핵심 사용자 흐름에 영향이 있다면 아래도 함께 확인합니다.

```bash
npm run test:e2e:smoke
```

## 문서 허브

### 처음 기여하는 팀원

1. [README.md](./README.md)
2. [docs/product-overview.md](./docs/product-overview.md)
3. [docs/features/public-features.md](./docs/features/public-features.md)
4. [docs/features/account-and-access.md](./docs/features/account-and-access.md)
5. [docs/features/admin-features.md](./docs/features/admin-features.md)
6. [CONTRIBUTING.md](./CONTRIBUTING.md)

### 실제 사용자 안내

1. [USER_GUIDE.md](./USER_GUIDE.md)
2. [docs/features/public-features.md](./docs/features/public-features.md)
3. [docs/features/account-and-access.md](./docs/features/account-and-access.md)

### 운영/배포 담당자

1. [README.md](./README.md)
2. [docs/architecture-overview.md](./docs/architecture-overview.md)
3. [DEPLOY.md](./DEPLOY.md)
4. [docs/cicd-setup.md](./docs/cicd-setup.md)
5. [docs/server-bootstrap.md](./docs/server-bootstrap.md)
6. [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
7. [docs/repository-governance.md](./docs/repository-governance.md)

### AI 에이전트

1. [AGENTS.md](./AGENTS.md)
2. [README.md](./README.md)
3. [docs/product-overview.md](./docs/product-overview.md)
4. [docs/architecture-overview.md](./docs/architecture-overview.md)
5. [DEPLOY.md](./DEPLOY.md)

## 기능 명세

- [제품 개요](./docs/product-overview.md)
- [사용자 안내문](./USER_GUIDE.md)
- [공개 기능 명세](./docs/features/public-features.md)
- [계정 및 접근 기능 명세](./docs/features/account-and-access.md)
- [관리자 기능 명세](./docs/features/admin-features.md)
- [아키텍처 개요](./docs/architecture-overview.md)

## 협업 및 운영 문서

| 문서 | 용도 |
| --- | --- |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 브랜치 생성, 검증, PR 작성, 문서 갱신 기준 |
| [DEPLOY.md](./DEPLOY.md) | 배포 구조와 배포 원칙의 개요 |
| [docs/cicd-setup.md](./docs/cicd-setup.md) | GitHub Actions, Docker Hub, runner, secrets 연결 |
| [docs/server-bootstrap.md](./docs/server-bootstrap.md) | 새 Ubuntu VM 부트스트랩 절차 |
| [docs/production-launch-runbook.md](./docs/production-launch-runbook.md) | 운영 직전/직후 체크리스트 |
| [docs/repository-governance.md](./docs/repository-governance.md) | 저장소 운영 규칙 단일 정본 |
| [deploy/README.md](./deploy/README.md) | `deploy/` 배포 자산 설명 |
| [AGENTS.md](./AGENTS.md) | AI 에이전트 전용 작업 기준 |

## 현재 라우트 요약

공개 기능:

- `/`
- `/notices`
- `/meals`
- `/calendar`
- `/utils`
- `/help`
- `/privacy`
- `/stats`

인증 기능:

- `/login`
- `/signup`
- `/signup/request`
- `/songs`
- `/timetable`
- `/links`
- `/sites`
- `/me`
- `/notifications`
- `/report`

관리자 기능:

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

## 핵심 운영 원칙

- 테스트/운영 도메인 값은 절대 섞지 않습니다.
- 운영 배포는 항상 검증된 `sha-<commit>`만 사용합니다.
- semver 릴리스는 `package.json` 버전을 기준으로 생성합니다.
- 백업, 복원, 릴리스, runner 구조를 바꾸면 문서를 함께 수정합니다.
- 시크릿, 비밀번호, API 키, 서버 `.env`는 저장소에 커밋하지 않습니다.

## 추가 참고

- GitHub Copilot 전용 안내: [`.github/copilot-instructions.md`](./.github/copilot-instructions.md)
- PR 템플릿: [`.github/pull_request_template.md`](./.github/pull_request_template.md)
