# CONTRIBUTING.md

GSHS.app 기여 가이드입니다.

## 0. 기본 원칙
- 작은 변경, 명확한 설명, 빠른 리뷰
- 운영 안정성 우선 (특히 DB/인증/권한)
- 민감정보는 절대 커밋 금지

---

## 1. 개발 환경 준비

```bash
npm ci
cp env-docker-example.txt .env.local   # 필요 시 값 수정
npm run dev
```

권장 Node 버전: 20+

---

## 2. 브랜치 전략

`main`에 직접 푸시하지 않고 기능 브랜치로 작업합니다.

브랜치 네이밍:
- `feat/<short-description>`
- `fix/<short-description>`
- `chore/<short-description>`
- `docs/<short-description>`

예시:
- `feat/calendar-3year-window`
- `fix/login-demo-hint`

---

## 3. 커밋 메시지 규칙

권장 형식:

```text
type(scope): summary
```

예시:
- `fix(calendar): extend NEIS query range`
- `docs(contrib): add PR checklist`
- `chore(login): remove demo credentials hint`

---

## 4. PR 생성 전 체크리스트

- [ ] `npm run lint` 통과
- [ ] 로컬에서 핵심 페이지 동작 확인 (`/login`, `/calendar`, `/timetable`)
- [ ] 민감정보/테스트 계정/비밀키 미포함 확인
- [ ] DB 스키마 변경 시 영향도 설명 추가
- [ ] 변경 내용 스크린샷 또는 재현 절차 첨부

---

## 5. PR 작성 가이드

PR에는 아래를 포함해주세요.

1. **왜** 바꿨는지 (문제)
2. **무엇을** 바꿨는지 (해결 방식)
3. **어떻게 검증**했는지 (테스트/체크)
4. 배포 시 주의사항 (있다면)

PR 템플릿(`.github/pull_request_template.md`)을 사용합니다.

---

## 6. 금지사항 (중요)

- `.env`, 토큰, 비밀번호, API Key 커밋 금지
- 운영 DB 파일 직접 커밋 금지
- 권한/인증 로직 변경 시 리뷰 없이 병합 금지
- UI에 데모 계정 정보 하드코딩 금지

---

## 7. 이슈 작성 가이드

버그 이슈에 포함할 내용:
- 재현 절차
- 기대 결과 vs 실제 결과
- 환경(브라우저/OS/배포 환경)
- 로그/스크린샷

기능 요청 이슈:
- 목적(사용자 가치)
- 범위(필수/선택)
- 수용 기준(완료 조건)

---

## 8. 리뷰 기준

리뷰어는 아래를 중점 확인합니다.
- 안정성: 런타임 에러/권한 오류 여부
- 보안: 민감정보 노출 여부
- 유지보수성: 과도한 복잡도/중복 여부
- 문서화: 배포/운영 영향 설명 여부

---

문의 사항은 이슈 또는 PR 코멘트로 남겨주세요.
