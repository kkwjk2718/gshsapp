# CONTRIBUTING.md

GSHS.app 기여 가이드입니다.

이 문서는 개발 방식, 브랜치 전략, PR 기준, 배포 관련 주의사항을 정리합니다.

## 기본 원칙

- 작은 변경 단위로 작업합니다.
- 동작 변경이 있으면 이유와 영향 범위를 같이 적습니다.
- 서버, 인증, 권한, 데이터베이스 관련 변경은 특히 신중하게 리뷰합니다.
- 시크릿, 비밀번호, 토큰, SSH 키, `.env` 파일은 절대 커밋하지 않습니다.

## 개발 환경 준비

```bash
npm ci
npm run dev
```

권장 버전:

- Node.js 20 이상
- npm 10 이상

로컬 환경 변수 예시는 [README.md](./README.md)를 참고합니다.

## 브랜치 전략

직접 `main`에 작업하지 않습니다.

브랜치 이름 규칙:

- `feat/<short-description>`
- `fix/<short-description>`
- `chore/<short-description>`
- `docs/<short-description>`

예시:

- `feat/admin-settings-backup`
- `fix/menu-auth-guard`
- `docs/server-bootstrap`

## 커밋 메시지 규칙

짧고 명확하게 작성합니다.

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
- `feat(settings): manage google analytics from admin`
- `docs: expand server deployment guide`

## 작업 전에 읽을 문서

변경 내용에 따라 아래 문서를 먼저 읽습니다.

- 기능 개발 전: [README.md](./README.md)
- 배포 관련 변경 전: [DEPLOY.md](./DEPLOY.md)
- 서버 작업 전: [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- GitHub Actions 변경 전: [docs/cicd-setup.md](./docs/cicd-setup.md)

## PR 생성 전 체크리스트

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] 주요 화면 또는 변경한 기능을 직접 확인
- [ ] 민감 정보가 포함되지 않았는지 확인
- [ ] 데이터베이스 또는 권한 관련 영향이 있으면 PR 설명에 적기
- [ ] 문서가 필요한 변경이면 같이 수정하기

## PR 설명에 꼭 포함할 것

1. 왜 바꾸는지
2. 무엇을 바꿨는지
3. 어떻게 검증했는지
4. 배포 영향이 있는지
5. 운영 주의사항이 있는지

## 문서 수정이 필요한 경우

아래 중 하나라도 해당하면 문서를 같이 갱신합니다.

- 새 환경 변수 추가
- Docker 또는 서버 실행 방식 변경
- GitHub Actions 동작 변경
- 테스트 서버/운영 서버 구조 변경
- 팀원이 따라야 하는 작업 절차 변경

우선 수정 후보:

- [README.md](./README.md)
- [DEPLOY.md](./DEPLOY.md)
- [docs/server-bootstrap.md](./docs/server-bootstrap.md)
- [docs/cicd-setup.md](./docs/cicd-setup.md)
- [deploy/README.md](./deploy/README.md)

## 금지 사항

- `.env` 파일 커밋
- Docker Hub 토큰, API 키, SSH 키 커밋
- 운영 계정 정보 하드코딩
- 리뷰 없이 인증/권한 로직 큰 변경
- 데이터베이스 파일 직접 커밋

## 리뷰 포인트

리뷰어는 아래를 우선 확인합니다.

- 서버 오류를 만들 수 있는 예외 처리 누락이 없는지
- 인증/권한 경계가 깨지지 않는지
- SQLite 데이터 손상 가능성이 없는지
- 테스트 서버와 운영 서버 설정이 섞이지 않는지
- 문서와 실제 동작이 맞는지

## 질문이 생기면

이슈, PR 코멘트, 또는 팀 채널에 남기고 문서 기준으로 정리합니다.

구두 설명만으로 해결하지 말고, 반복될 내용이면 문서에 반영하는 것을 원칙으로 합니다.
