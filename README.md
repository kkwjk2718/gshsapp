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
| 테스트 서버 | `https://test.gshs.app` | 승인된 `main` SHA 수동 배포 검증 |
| 운영 서버 | `https://gshs.app` | 실제 서비스 |

배포 기본 원칙:

- Docker 이미지는 `sha-<commit>` 출처와 immutable registry digest를 함께 검증하여 배포합니다.
- GitHub Release는 `vX.Y.Z` semver 태그를 기준으로 관리합니다.
- GitHub Actions는 GitHub-hosted runner에서 CI, 이미지 publish·attestation, 공개 검증, Release만 수행하며 호스트 배포 권한을 갖지 않습니다.
- 테스트·운영 호스트 변경은 독립 채널로 digest를 확인한 root 운영자가 `/usr/local/lib/gshsapp-operations`의 설치본과 root-only systemd unit으로만 수행합니다.
- 과거 self-hosted runner 서비스와 등록·배포 자격증명은 재이미징 과정에서 제거하고 재등록하지 않습니다.
- SQLite는 `/app/data/dev.db` 영속 볼륨 경로를 사용합니다.

## 빠른 시작

### 요구 사항

- Node.js 24.19 이상(24.x)
- npm 11 이상

### 설치

```bash
npm ci
```

### 로컬 환경 변수

`.env.local` 또는 `.env`에 아래 값을 준비합니다.

```dotenv
DATA_ROOT=
DATABASE_URL=file:./dev.db
BACKUP_DIR=backup
RESTORE_ROOT=restore
BACKUP_RETENTION_MIN_GENERATIONS=3
BACKUP_RETENTION_MAX_GENERATIONS=30
BACKUP_RETENTION_MAX_AGE_DAYS=90
BACKUP_RETENTION_MAX_TOTAL_BYTES=21474836480
BACKUP_RESERVE_FREE_BYTES=268435456
BACKUP_STALE_WORK_MAX_AGE_HOURS=24
RESTORE_MAX_UPLOAD_BYTES=134217728
WEATHER_CACHE_PATH=weather-cache.json
AUTH_SECRET=replace-with-long-random-secret
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_NEIS_API_KEY=
ICAL_ALLOWED_HOSTS=calendar.google.com
```

추가 메모:

- `AUTH_SECRET`은 `openssl rand -base64 48` 같은 CSPRNG로 새로 생성한 32바이트 이상의 값을 사용합니다. 예시 placeholder는 런타임에서 거부됩니다.
- Google Analytics는 환경 변수가 아니라 `/admin/settings`에서 관리합니다.
- Brevo 메일 발송은 `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`이 있어야 실제 동작합니다.
- iCal 동기화는 `ICAL_ALLOWED_HOSTS`의 쉼표 구분 HTTPS 호스트만 허용하며 기본값은 `calendar.google.com`입니다.
- 로컬 상대 SQLite 경로는 Prisma 스키마 디렉터리 아래로, 서버 경로는 명시한 `DATA_ROOT=/app/data` 아래로 제한됩니다.
- 최초 관리자 생성은 환경에서 네 개의 `BOOTSTRAP_ADMIN_*` 값을 일회성으로 주입한 뒤 `npm run bootstrap:admin`을 실행합니다. 기존 계정은 수정하지 않습니다.

### 데이터베이스 초기화

```bash
npx prisma migrate dev
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
5. [docs/root-operations-bootstrap.md](./docs/root-operations-bootstrap.md)
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
| [docs/cicd-setup.md](./docs/cicd-setup.md) | GitHub-hosted Actions, Docker Hub, protected environment 설정 |
| [docs/root-operations-bootstrap.md](./docs/root-operations-bootstrap.md) | 새 호스트의 OOB 인증과 root control 설치 절차 |
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
- 운영 배포는 검증된 `sha-<commit>`와 정확한 image digest를 함께 사용합니다.
- semver 릴리스는 `package.json` 버전을 기준으로 생성합니다.
- 백업, 복원, 릴리스, root control 구조를 바꾸면 문서를 함께 수정합니다.
- 시크릿, 비밀번호, API 키, 서버 `.env`는 저장소에 커밋하지 않습니다.

## 추가 참고

- GitHub Copilot 전용 안내: [`.github/copilot-instructions.md`](./.github/copilot-instructions.md)
- PR 템플릿: [`.github/pull_request_template.md`](./.github/pull_request_template.md)
