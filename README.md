# GSHS.app

경남과학고 학생용 통합 웹 서비스입니다.

- GitHub: <https://github.com/kkwjk2718/gshsapp>
- Docker Hub: <https://hub.docker.com/r/kkwjk2718git/gshsapp>

## 주요 기능

- 공지사항
- 급식
- 시간표
- 학사 일정
- 교내 링크 모음
- 음악 신청
- 관리자 페이지

## 문서 안내

처음 합류한 팀원은 아래 순서대로 읽으면 됩니다.

1. [README.md](./README.md)
2. [CONTRIBUTING.md](./CONTRIBUTING.md)
3. [AGENTS.md](./AGENTS.md)
4. [DEPLOY.md](./DEPLOY.md)
5. [docs/server-bootstrap.md](./docs/server-bootstrap.md)
6. [docs/cicd-setup.md](./docs/cicd-setup.md)
7. [deploy/README.md](./deploy/README.md)

## 로컬 개발 시작

### 요구 사항

- Node.js 20 이상
- npm 10 이상

### 설치

```bash
npm ci
```

### 환경 변수

로컬에서는 `.env.local` 또는 `.env`를 준비합니다.

```dotenv
DATABASE_URL=file:./dev.db
AUTH_SECRET=change-me
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_NEIS_API_KEY=
```

참고:

- Google Analytics 측정 ID는 환경 변수가 아니라 `/admin/settings`에서 관리합니다.
- 서버 Docker 배포에서는 `DATABASE_URL=file:/app/data/dev.db`를 사용합니다.

### 데이터베이스 초기화

```bash
npx prisma db push
```

### 실행

```bash
npm run dev
```

브라우저: <http://localhost:3000>

## 자주 쓰는 명령

```bash
npm run dev
npm run lint
npm test
npm run build
```

## 현재 배포 구조 요약

이 프로젝트는 아래 구조를 기준으로 운영합니다.

- CI: GitHub Actions
- 이미지 저장소: Docker Hub
- 테스트 배포: `main` push 후 자동 배포
- 운영 배포: GitHub Actions 수동 실행 + `production` environment 승인
- 배포 실행: GitHub-hosted CI + 서버별 self-hosted runner
- 런타임: Ubuntu VM + Docker Compose
- 데이터베이스: SQLite

배포 관련 자세한 내용은 [DEPLOY.md](./DEPLOY.md)를 먼저 보고, 실제 서버 준비는 [docs/server-bootstrap.md](./docs/server-bootstrap.md), GitHub 설정은 [docs/cicd-setup.md](./docs/cicd-setup.md)를 보면 됩니다.

## 서버 운영 원칙

- `.env`, API 키, 토큰, SSH 키는 저장소에 커밋하지 않습니다.
- 테스트 서버와 운영 서버는 분리합니다.
- 운영 배포는 항상 불변 태그 `sha-<commit>` 기준으로 올립니다.
- `latest` 태그는 참고용으로만 두고 실제 배포 기준으로 사용하지 않습니다.
- SQLite 파일은 반드시 볼륨으로 분리하고 배포 전에 백업합니다.

## 팀원용 빠른 안내

- 기능 개발: [CONTRIBUTING.md](./CONTRIBUTING.md)
- AI 에이전트 작업 기준: [AGENTS.md](./AGENTS.md)
- 수동 Docker 배포: [DEPLOY.md](./DEPLOY.md)
- 새 Ubuntu 서버 준비: [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- GitHub Secrets / Environments / Actions 설정: [docs/cicd-setup.md](./docs/cicd-setup.md)
- 배포용 파일 설명: [deploy/README.md](./deploy/README.md)
