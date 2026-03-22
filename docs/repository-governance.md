# 저장소 운영 규칙

이 문서는 저장소 운영 규칙의 단일 정본입니다.

함께 읽을 문서:

- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [docs/cicd-setup.md](./cicd-setup.md)
- [docs/production-launch-runbook.md](./production-launch-runbook.md)
- [AGENTS.md](../AGENTS.md)

## 1. 이 문서의 역할

이 저장소에는 이미 아래 체계가 들어 있습니다.

- CI/CD
- 테스트 서버 자동 배포
- Playwright E2E
- 복원 리허설
- 운영 배포 workflow
- semver 릴리스 정책

이 문서는 위 구조를 안전하게 유지하기 위한 저장소 운영 기준을 정의합니다.

## 2. 현재 `main` 브랜치 보호 상태

현재 `main`은 아래 기준으로 보호됩니다.

- 일반 변경은 Pull Request를 통해 들어오는 것을 전제로 함
- 필수 status check 통과 전 머지 불가
- 필수 체크:
  - `lint`
  - `test`
  - `build`
- strict status check 활성화
- 미해결 리뷰 대화가 있으면 머지 불가
- `main`에 대한 force push 금지
- `main` branch deletion 금지

현재 예외 모델:

- admin enforcement 비활성화
- required approving review count는 `0`

즉, 평상시에는 PR + 초록 CI 흐름을 따르고, 관리자 우회는 사고 대응용으로만 사용합니다.

## 3. 기본 개발 흐름

일반적인 변경은 아래 절차를 따릅니다.

1. 기능 브랜치 생성
2. 브랜치에서 변경 진행
3. 변경에 맞는 로컬 검증 실행
4. `main` 대상 Pull Request 생성
5. 필수 체크 통과 대기
6. 리뷰 코멘트와 대화 스레드 정리
7. 브랜치가 최신 `main` 기준일 때만 머지

## 4. 머지 조건

Pull Request는 아래 조건을 모두 만족할 때만 머지 준비 완료로 봅니다.

- `lint` 초록
- `test` 초록
- `build` 초록
- 미해결 리뷰 대화 없음
- PR 브랜치가 최신 `main` 기준으로 갱신됨
- 변경 설명에 사용자 영향과 배포 영향이 포함됨
- 동작, 인프라, 프로세스를 바꿨다면 관련 문서가 함께 업데이트됨

머지하지 않는 경우:

- CI가 빨간 상태
- 기능 회귀가 해결되지 않음
- 인증, 환경 변수, 배포, 백업 변경이 문서화되지 않음
- 시크릿, 비밀번호, 토큰, `.env` 내용이 포함됨

## 5. PR 전 기본 검증

기본 검증:

```bash
npm run lint
npm test
npm run build
```

배포 또는 핵심 흐름에 영향이 있다면:

```bash
npm run test:e2e:smoke
```

## 6. 리뷰 기준

리뷰는 스타일보다 위험을 우선합니다.

핵심 질문:

- 로그인, 관리자 접근, 역할 검사가 깨지지 않는가?
- SQLite 쓰기, 백업, 복원 흐름을 깨지 않는가?
- 테스트/운영 도메인 동작을 섞지 않는가?
- Docker 배포, smoke check, 릴리스 흐름을 깨지 않는가?
- 최근 기능 명세와 운영 문서가 여전히 맞는가?

## 7. 문서 갱신 규칙

아래 항목에 영향을 주는 변경은 같은 PR에서 문서도 함께 갱신합니다.

- 환경 변수
- GitHub Actions 동작
- 배포 스크립트 또는 배포 자산 구조
- 서버 부트스트랩 절차
- 브랜치 보호 또는 머지 정책
- 테스트/운영 도메인
- 백업, 복원, 롤백 절차
- 관리자 운영 워크플로우
- 토큰 배부 포털과 메일 발송 구조
- 릴리스 버전 정책
- AI 에이전트 작업 규칙

최소한 아래 문서 중 가장 관련 있는 파일은 갱신합니다.

- [README.md](../README.md)
- [docs/product-overview.md](./product-overview.md)
- [docs/features/public-features.md](./features/public-features.md)
- [docs/features/account-and-access.md](./features/account-and-access.md)
- [docs/features/admin-features.md](./features/admin-features.md)
- [DEPLOY.md](../DEPLOY.md)
- [docs/cicd-setup.md](./cicd-setup.md)
- [docs/server-bootstrap.md](./server-bootstrap.md)
- [docs/production-launch-runbook.md](./production-launch-runbook.md)
- [AGENTS.md](../AGENTS.md)

## 8. 시크릿 및 민감 정보 규칙

절대 커밋하지 않는 항목:

- `.env`
- `.env.local`
- 서버에서 복사한 시크릿 백업 파일
- API 키
- Docker Hub 토큰
- SSH 비밀키
- 비밀번호
- 통제되지 않은 테스트/운영 DB 원본 파일

## 9. 테스트에서 운영으로 승격하는 규칙

운영 배포는 항상 불변 SHA 승격 방식으로 진행합니다.

필수 순서:

1. 변경이 `main`에 반영됨
2. 테스트 서버 자동 배포 성공
3. 같은 `sha-<commit>`로 `Preproduction Rehearsal` 성공
4. `test.gshs.app`에서 사람 확인 통과
5. 운영 배포는 같은 `sha-<commit>` 사용

추가 규칙:

- 운영 Release는 `vX.Y.Z` semver 기준
- 같은 버전 태그를 다른 SHA에 재사용하지 않음

## 10. 긴급 예외 규칙

현재 admin enforcement가 비활성화되어 있으므로, 실제 장애 상황에서는 저장소 소유자가 정상 PR 흐름을 우회할 수 있습니다.

허용되는 상황:

- 운영 서비스가 내려감
- 로그인 또는 관리자 접근이 깨짐
- 배포 자동화가 복구를 막고 있음
- 시크릿 교체나 인프라 복구를 즉시 해야 함

긴급 우회가 발생하면 반드시 후속 조치를 남깁니다.

1. 관련 PR, 이슈, 사고 노트 중 하나에 상황 요약 작성
2. 표준 리뷰 흐름 밖에서 코드가 바뀌었다면 후속 PR 생성
3. 이번 사고로 드러난 누락 규칙이 있다면 문서 업데이트

## 11. AI 에이전트용 추가 규칙

AI 에이전트도 사람과 같은 저장소 규칙을 따릅니다.

추가 요구 사항:

- 비사소한 변경 전 [AGENTS.md](../AGENTS.md) 확인
- 기능 명세와 운영 문서를 기준으로 동작 확인
- SHA 기반 배포와 semver 릴리스 구조를 깨뜨리지 않기
- 저장소 프로세스나 인프라 동작을 바꾸면 문서 동시 갱신

## 12. 향후 더 엄격하게 하고 싶을 때

추후 강화 후보:

1. approving review 최소 1개 필수
2. 관리자에게도 동일한 브랜치 보호 강제
3. 인증, 배포, DB 위험 변경에는 두 번째 유지보수자 승인 필수
