# GSHS.app

경남과학고등학교 학생용 통합 웹 서비스 저장소입니다.

- GitHub: <https://github.com/kkwjk2718/gshsapp>
- Docker Hub: <https://hub.docker.com/r/kkwjk2718git/gshsapp>

## LLM 에이전트 안내

AI 코딩 에이전트가 이 저장소를 다룰 때는 아래 문서를 먼저 내려받아 기준 문서로 사용하세요.

```bash
curl -fsSL https://raw.githubusercontent.com/kkwjk2718/gshsapp/main/AGENTS.md
```

요약 페이지나 임의 정리본보다 [AGENTS.md](./AGENTS.md)를 우선 기준으로 삼습니다.

## 주요 기능

- 공지사항 조회 및 관리
- 급식 정보 조회
- 학사일정 확인
- 교내 사이트 모음
- 음악 신청 및 방송부 관리
- 사용자 알림 및 관리자 도구

## 문서 읽기 순서

처음 합류했거나 배포 구조를 파악해야 한다면 아래 순서대로 읽는 것을 권장합니다.

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

로컬 개발 환경에서는 `.env.local` 또는 `.env`에 아래 값을 준비합니다.

```dotenv
DATABASE_URL=file:./dev.db
AUTH_SECRET=change-me
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_NEIS_API_KEY=
```

참고 사항:

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
npm run test:e2e
npm run test:e2e:smoke
```

## 현재 배포 구조 요약

현재 저장소는 아래 구조를 기준으로 운영합니다.

- CI: GitHub Actions
- 이미지 저장소: Docker Hub
- 테스트 배포: `main` push 시 자동 배포
- 운영 배포: GitHub Actions 수동 실행 + `production` environment 승인
- 배포 실행: GitHub-hosted runner + 서버별 self-hosted runner 조합
- 서버 형태: Ubuntu VM + Docker Compose
- 데이터베이스: SQLite

배포 구조 상세는 [DEPLOY.md](./DEPLOY.md), 서버 준비 절차는 [docs/server-bootstrap.md](./docs/server-bootstrap.md), GitHub Actions 설정은 [docs/cicd-setup.md](./docs/cicd-setup.md)를 확인하세요.

## 운영 원칙

- `.env`, API 키, 토큰, SSH 비밀키는 저장소에 커밋하지 않습니다.
- 테스트 서버와 운영 서버는 분리합니다.
- 실제 배포 대상은 항상 `sha-<commit>` 태그입니다.
- `latest`는 참고용 태그일 뿐, 배포 결정 기준으로 사용하지 않습니다.
- SQLite 파일은 영속 볼륨에 두고, 배포 전에 백업합니다.
- 운영 도메인 모니터링은 `gshs.app`이 실제 앱을 제공할 때만 활성화합니다.

## 리허설 및 배포 안전장치

현재 배포 체계에는 아래 안전장치가 포함되어 있습니다.

- `main` push 후 테스트 서버 자동 배포
- 테스트 서버 배포 후 smoke check와 Playwright E2E 실행
- 수동 `Preproduction Rehearsal` 워크플로우로 후보 SHA 재검증
- `deploy/restore-drill.sh`를 통한 복원 리허설
- `/admin/test`를 이용한 운영 준비 상태 확인

운영 승격 전 기본 순서:

1. 후보 SHA가 테스트 서버 자동 배포에서 초록인지 확인
2. 같은 SHA로 `Preproduction Rehearsal` 실행
3. `test.gshs.app/admin/test`에서 모든 항목이 `PASS`인지 확인
4. 최신 백업 시각 확인
5. 같은 SHA만 운영에 배포

## 저장소 운영 규칙

저장소 운영 기준 문서는 아래 두 파일입니다.

- [docs/repository-governance.md](./docs/repository-governance.md)
- [docs/repository-governance.ko.md](./docs/repository-governance.ko.md)

이 문서에는 아래 항목이 정리되어 있습니다.

- `main` 브랜치 보호 규칙
- 머지 조건과 필수 체크
- 긴급 관리자 우회 기준
- 문서 갱신 규칙
- 테스트에서 운영으로 승격하는 기준

## 빠른 링크

- 개발 참여 안내: [CONTRIBUTING.md](./CONTRIBUTING.md)
- AI 에이전트 작업 기준: [AGENTS.md](./AGENTS.md)
- 배포 개요: [DEPLOY.md](./DEPLOY.md)
- 서버 준비: [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- GitHub Actions 및 시크릿 설정: [docs/cicd-setup.md](./docs/cicd-setup.md)
- 운영 배포 런북: [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- 배포 자산 설명: [deploy/README.md](./deploy/README.md)
