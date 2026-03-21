# 기여 가이드

이 문서는 `gshsapp` 저장소에서 안전하게 작업하는 기본 절차를 설명합니다.

함께 읽을 문서:

- [README.md](./README.md)
- [AGENTS.md](./AGENTS.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/repository-governance.md](./docs/repository-governance.md)

## 기본 작업 흐름

대부분의 변경은 아래 순서를 따릅니다.

1. `main`에서 브랜치를 분기합니다.
2. 브랜치에서 변경 작업을 진행합니다.
3. 필요한 로컬 검증을 실행합니다.
4. Pull Request를 생성합니다.
5. 리뷰 코멘트와 대화 스레드를 정리합니다.
6. 필수 체크가 모두 초록일 때만 머지합니다.

일반적인 작업은 `main`에서 직접 진행하지 않습니다.

## 브랜치 이름 규칙

팀 일반 작업에서는 아래 형식을 권장합니다.

- `feat/<짧은설명>`
- `fix/<짧은설명>`
- `chore/<짧은설명>`
- `docs/<짧은설명>`

예시:

- `feat/admin-notice-tools`
- `fix/menu-auth-guard`
- `docs/release-runbook`

AI 에이전트가 생성하는 브랜치는 `codex/` 접두사를 사용합니다.

## 커밋 메시지 규칙

커밋 메시지는 짧고 명확하게 작성합니다.

권장 형식:

```text
type: summary
```

또는

```text
type(scope): summary
```

예시:

- `fix: stop redirecting menu to login`
- `feat(settings): manage analytics from admin`
- `docs: expand repository governance guide`

## Pull Request 전 필수 로컬 체크

PR을 열기 전, 또는 업데이트하기 전 아래 명령을 기본으로 실행합니다.

```bash
npm run lint
npm test
npm run build
```

배포 안전성이나 핵심 사용자 흐름에 영향을 주는 변경이라면 아래도 함께 확인합니다.

```bash
npm run test:e2e:smoke
```

## Pull Request 설명에 반드시 들어가야 할 내용

PR 설명에는 아래 항목이 포함되어야 합니다.

1. 무엇이 바뀌었는지
2. 왜 바뀌었는지
3. 어떻게 검증했는지
4. 배포 동작이 바뀌는지
5. 테스트/운영 환경 설정 변경이 필요한지

PR 템플릿을 사용하고, 실제 변경 내용과 일치하게 유지합니다.

## 문서 갱신 규칙

아래 항목에 영향을 주는 변경은 같은 PR에서 문서도 함께 수정합니다.

- 배포 동작
- GitHub Actions 동작
- 브랜치 보호 또는 머지 정책
- 인증/인가 동작
- 환경 변수
- 백업, 복원, 롤백 동작
- 테스트/운영 도메인
- AI 에이전트 작업 기준

주요 문서:

- [README.md](./README.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/production-launch-runbook.md](./docs/production-launch-runbook.md)
- [docs/repository-governance.md](./docs/repository-governance.md)
- [AGENTS.md](./AGENTS.md)

## 시크릿 및 민감 정보 규칙

절대 커밋하지 않는 항목:

- `.env`
- `.env.local`
- API 키
- 비밀번호
- Docker Hub 토큰
- SSH 비밀키
- 서버에서 복사한 시크릿 백업 파일
- 통제되지 않은 원시 DB 파일

시크릿 변경이 필요한 작업이라면 PR 설명에 아래 내용을 남깁니다.

- 어떤 시크릿이 바뀌는지
- 어디에 저장되는지
- 테스트와 운영 모두 수정이 필요한지

## 브랜치 보호 및 머지 정책 요약

상세 규칙은 아래 문서를 따릅니다.

- [docs/repository-governance.md](./docs/repository-governance.md)
- [docs/repository-governance.ko.md](./docs/repository-governance.ko.md)

현재 팀 기본값:

- `main` 보호 활성화
- 필수 체크: `lint`, `test`, `build`
- 미해결 리뷰 대화가 있으면 머지 불가
- `main`에 대한 force push 및 branch deletion 금지
- 관리자 긴급 우회는 사고 대응 용도로만 허용

## 리뷰 우선순위

리뷰는 스타일보다 운영 위험을 우선합니다.

중점 확인 항목:

- 인증/권한 회귀
- DB 쓰기 안전성
- 백업/복원 안전성
- 테스트와 운영 도메인 혼선
- 배포 회귀
- 조용히 사라진 기능
- 누락된 문서

## AI 에이전트 작업 시 추가 규칙

AI 에이전트도 사람과 동일한 절차를 따라야 합니다.

비교적 큰 변경이나 인프라 관련 변경 전에는 아래 문서를 먼저 읽습니다.

- [AGENTS.md](./AGENTS.md)
- [docs/repository-governance.md](./docs/repository-governance.md)

에이전트가 워크플로우 이름, 브랜치 보호 가정, 배포 게이트를 바꾸면 관련 문서를 같은 변경 안에서 함께 업데이트해야 합니다.
