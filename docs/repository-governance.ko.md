# 저장소 운영 규칙 요약

이 문서는 [repository-governance.md](./repository-governance.md)의 짧은 한국어 요약본입니다.

전체 원문과 세부 기준은 [repository-governance.md](./repository-governance.md)를 우선 기준으로 사용합니다.

## 현재 핵심 규칙

- `main`은 보호 브랜치입니다.
- 필수 체크는 `lint`, `test`, `build`입니다.
- 미해결 리뷰 대화가 있으면 머지할 수 없습니다.
- `main`에 대한 force push와 branch deletion은 금지됩니다.
- 관리자 긴급 우회는 장애 대응 상황에서만 허용됩니다.

## 일반 작업 흐름

1. `main`에서 브랜치를 분기합니다.
2. 브랜치에서 작업합니다.
3. `npm run lint`, `npm test`, `npm run build`를 확인합니다.
4. Pull Request를 생성합니다.
5. 리뷰와 CI가 모두 정리된 뒤 머지합니다.

## 머지 전 꼭 확인할 것

- 인증, 권한, 리다이렉트 회귀가 없는지
- SQLite 쓰기, 백업, 복원 흐름이 안전한지
- 테스트/운영 도메인이 섞이지 않았는지
- 배포 동작 변경이 문서에 반영됐는지
- 시크릿이 커밋되지 않았는지

## 운영 승격 기준

운영 배포는 아래 순서를 따릅니다.

1. `main` 반영
2. 테스트 서버 자동 배포 성공
3. 같은 SHA로 `Preproduction Rehearsal` 성공
4. `test.gshs.app` 수동 확인
5. 같은 `sha-<commit>`를 운영 배포

즉, 운영은 항상 이미 검증된 불변 SHA만 올립니다.

## 긴급 우회가 허용되는 경우

- 운영 서비스 장애
- 로그인 또는 관리자 접근 장애
- 배포 자동화가 복구를 막는 경우
- 시크릿 교체나 인프라 복구를 즉시 해야 하는 경우

긴급 우회 후에는 반드시 사고 요약과 후속 문서 정리를 남깁니다.
