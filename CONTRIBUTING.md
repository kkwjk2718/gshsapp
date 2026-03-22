# 기여 가이드

이 문서는 `gshsapp` 저장소에 처음 참여하는 팀원이 로컬 실행, 변경 작업, PR 작성, 배포 영향 설명까지 한 번에 따라갈 수 있도록 정리한 실행 가이드입니다.

함께 읽을 문서:

- [README.md](./README.md)
- [docs/product-overview.md](./docs/product-overview.md)
- [docs/features/public-features.md](./docs/features/public-features.md)
- [docs/features/account-and-access.md](./docs/features/account-and-access.md)
- [docs/features/admin-features.md](./docs/features/admin-features.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/repository-governance.md](./docs/repository-governance.md)

## 1. 처음 시작할 때

권장 순서:

1. 저장소를 클론합니다.
2. [README.md](./README.md) 기준으로 로컬 개발 환경을 맞춥니다.
3. 자신이 건드릴 기능군의 명세 문서를 먼저 읽습니다.
4. 배포나 운영에 영향이 있다면 [DEPLOY.md](./DEPLOY.md)와 [docs/cicd-setup.md](./docs/cicd-setup.md)를 확인합니다.
5. 그 다음 브랜치를 만들어 작업합니다.

작업 전 최소 이해해야 하는 것:

- 이 프로젝트는 Next.js App Router 기반입니다.
- 데이터베이스는 Prisma + SQLite입니다.
- 테스트/운영은 self-hosted runner 기반으로 배포됩니다.
- 운영 배포는 `sha-<commit>` 기준이고, 릴리스는 `vX.Y.Z` semver 기준입니다.

## 2. 기본 작업 흐름

대부분의 변경은 아래 순서를 따릅니다.

1. `main` 최신 상태를 가져옵니다.
2. 기능 브랜치를 생성합니다.
3. 로컬에서 변경을 진행합니다.
4. 관련 검증을 실행합니다.
5. Pull Request를 생성합니다.
6. 리뷰 코멘트와 대화 스레드를 정리합니다.
7. 필수 체크가 모두 초록일 때 머지합니다.

일반적인 작업은 `main`에서 직접 진행하지 않습니다.

## 3. 브랜치와 커밋 규칙

권장 브랜치 이름:

- `feat/<짧은설명>`
- `fix/<짧은설명>`
- `chore/<짧은설명>`
- `docs/<짧은설명>`

예시:

- `feat/token-portal-mailing`
- `fix/calendar-hydration`
- `docs/product-spec-refresh`

AI 에이전트 브랜치는 `codex/` 접두사를 사용합니다.

권장 커밋 메시지 형식:

```text
type: summary
```

또는

```text
type(scope): summary
```

예시:

- `fix: stabilize calendar hydration`
- `feat(tokens): add manual email delivery`
- `docs: reorganize repository documentation`

## 4. 변경 유형별 체크포인트

### UI 또는 공개 페이지 변경

- 대상 페이지가 공개인지 인증 필요인지 먼저 확인합니다.
- 모바일/HD/FHD에서 레이아웃이 깨지지 않는지 봅니다.
- 주요 CTA, 링크, 문구, 빈 상태를 확인합니다.
- 공개 데이터 캐시나 ISR 동작을 건드렸다면 관련 설명을 PR에 적습니다.

### 인증 또는 권한 변경

- `/login`, `/me`, `/admin`, `/menu`를 반드시 같이 확인합니다.
- 역할별 접근 제한이 그대로 유지되는지 점검합니다.
- 테스트/운영 도메인 리다이렉트가 섞이지 않는지 봅니다.

### 관리자 기능 변경

- 관리자 페이지 진입, 저장, 실패 메시지, 빈 상태를 확인합니다.
- 로그/리포트/토큰/설정처럼 운영 도구라면 사용자 영향과 운영 영향을 PR에 분리해 적습니다.
- 관리자 설정에서 바꾸는 값이 환경변수인지 DB 설정인지 명확히 구분합니다.

### 배포 또는 인프라 변경

- `deploy/`, `.github/workflows/`, `docs/`를 함께 확인합니다.
- runner, secrets, Docker Hub, `.env`, `/opt/gshsapp` 구조 영향 여부를 PR에 적습니다.
- `latest`가 아니라 `sha-<commit>` 기준이 유지되는지 확인합니다.

### DB 또는 Prisma 변경

- 스키마 변경 이유와 사용자 영향을 설명합니다.
- SQLite 운영 제약을 고려해 백업/복원 영향이 있는지 확인합니다.
- 현재 구조에서는 `prisma db push` 기준인지, 별도 migration 도입인지 명확히 씁니다.

## 5. 로컬 필수 검증

모든 PR 전 기본 검증:

```bash
npm run lint
npm test
npm run build
```

추가 검증이 필요한 경우:

- 핵심 사용자 흐름, 공개 페이지, 관리자 UI, 배포 안전성에 영향이 있다면:

```bash
npm run test:e2e:smoke
```

- 배포 또는 릴리스 흐름을 건드렸다면 workflow 문법과 배포 문서까지 함께 확인합니다.

## 6. PR 설명에 꼭 들어가야 할 내용

PR 본문에는 아래를 반드시 포함합니다.

1. 무엇이 바뀌었는지
2. 왜 바뀌었는지
3. 어떻게 검증했는지
4. 배포 영향이 있는지
5. 서버/환경 영향이 있는지
6. 관련 기능 명세나 운영 문서를 수정했는지

특히 아래는 빠뜨리지 않습니다.

- 테스트 서버 영향
- 운영 서버 영향
- 환경 변수 추가/변경 여부
- 인증/권한 회귀 가능성
- 문서 동기화 여부

## 7. 문서를 함께 수정해야 하는 경우

아래를 바꾸면 같은 PR에서 문서도 함께 수정합니다.

- 환경 변수
- GitHub Actions 동작
- 배포 자산 구조
- 서버 부트스트랩 절차
- 인증/권한 경계
- 토큰/가입/메일 발송 구조
- 백업, 복원, 롤백 절차
- 릴리스 버전 정책
- 테스트/운영 도메인
- 관리자 운영 워크플로우

주로 함께 수정할 문서:

- [README.md](./README.md)
- [docs/product-overview.md](./docs/product-overview.md)
- [docs/features/public-features.md](./docs/features/public-features.md)
- [docs/features/account-and-access.md](./docs/features/account-and-access.md)
- [docs/features/admin-features.md](./docs/features/admin-features.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- [docs/repository-governance.md](./docs/repository-governance.md)
- [AGENTS.md](./AGENTS.md)

## 8. 시크릿 및 민감 정보 규칙

절대 커밋하지 않는 항목:

- `.env`
- `.env.local`
- API 키
- 비밀번호
- Docker Hub 토큰
- SSH 비밀키
- 서버에서 내려받은 시크릿 백업 파일
- 통제되지 않은 테스트/운영 DB 원본 파일

시크릿 또는 인프라 값이 바뀌는 작업이라면 PR 설명에 아래를 남깁니다.

- 어떤 값이 바뀌는지
- 어디에 저장되는지
- 테스트/운영 모두 수정해야 하는지
- GitHub secrets인지 서버 `.env`인지

## 9. 리뷰 기준

리뷰는 스타일보다 위험을 우선합니다.

중점 확인 항목:

- 인증/권한 회귀
- DB 쓰기 안전성
- 백업/복원 안전성
- 테스트/운영 도메인 혼선
- 배포 회귀
- 조용히 사라진 기능
- 문서 누락

좋은 리뷰 코멘트는 아래 내용을 포함합니다.

- 어떤 동작이 깨지는지
- 어디서 재현되는지
- 어떻게 확인했는지
- 머지 전 최소 수정 조건이 무엇인지

## 10. 저장소 규칙과 머지 기준

상세 정책은 [docs/repository-governance.md](./docs/repository-governance.md)를 기준으로 합니다.

현재 기본선:

- `main` 보호 활성화
- 필수 체크: `lint`, `test`, `build`
- 미해결 리뷰 대화가 있으면 머지 불가
- `main`에 대한 force push 및 branch deletion 금지
- 관리자 긴급 우회는 사고 대응 용도로만 허용

## 11. 빠른 체크리스트

PR을 열기 전 아래를 한 번 더 확인합니다.

- [ ] 변경한 기능의 명세 문서를 읽었음
- [ ] `npm run lint`, `npm test`, `npm run build`를 실행했음
- [ ] 필요한 경우 `npm run test:e2e:smoke`까지 확인했음
- [ ] 배포/인증/백업/환경 변수 변경 시 관련 문서를 함께 수정했음
- [ ] 시크릿, 비밀번호, 키를 추가하지 않았음
- [ ] PR 설명에 테스트/운영 영향과 검증 내용을 적었음
