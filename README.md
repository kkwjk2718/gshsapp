# GSHS.app

경남과학고 학생 통합 플랫폼입니다.

링크:
- GitHub: <https://github.com/kkwjk2718/gshsapp>
- Docker Hub: <https://hub.docker.com/r/kkwjk2718git/gshsapp>

주요 기능:
- 공지사항
- 급식
- 시간표
- 학사일정(NEIS)
- 기상곡 신청
- 교내 링크/유틸
- 관리자 페이지(사용자/카테고리/설정/로그)

---

## 1) 로컬 개발 시작

### 요구사항
- Node.js 20+
- npm 10+

### 설치
```bash
npm ci
```

### 환경변수
로컬 실행 전 `.env.local`(또는 `.env`)을 준비하세요.

```bash
AUTH_SECRET=change-me
AUTH_TRUST_HOST=true
NEXT_PUBLIC_NEIS_API_KEY=your-neis-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=file:./prisma/dev.db
```

> `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_NEIS_API_KEY`는 로컬 개발 시 비워도 동작합니다(일부 기능 제한).

### DB 초기화
```bash
npx prisma db push
```

### 실행
```bash
npm run dev
```

브라우저: <http://localhost:3000>

---

## 2) 스크립트

```bash
npm run dev     # 개발 서버
npm run build   # 프로덕션 빌드
npm run start   # 프로덕션 실행
npm run lint    # ESLint
```

---

## 3) Docker 배포

배포 절차는 [`DEPLOY.md`](./DEPLOY.md) 참고.

빠른 실행 예시:
```bash
docker compose up -d --build
docker compose logs -f
```

> 운영 DB는 SQLite를 사용합니다. DB 경로/볼륨 설정 변경 시 데이터 유실이 발생할 수 있으니 주의하세요.

---

## 4) 기여 가이드

외부 기여/팀 개발은 [`CONTRIBUTING.md`](./CONTRIBUTING.md)를 먼저 읽어주세요.

요약:
- 기능 브랜치에서 작업 (`feat/...`, `fix/...`)
- 작은 단위 커밋
- PR 템플릿에 맞춰 설명
- 민감정보(토큰/비밀번호/.env) 커밋 금지

---

## 5) 보안/운영 주의사항

- `.env`, API 키, 비밀번호는 절대 커밋하지 않습니다.
- 데모 계정 정보는 UI/문서에 노출하지 않습니다.
- 운영 DB 백업 후 작업하세요.
- 배포 전 `npm run lint` + 핵심 페이지 동작 확인 권장

---

## 6) 라이선스

내부 프로젝트(Private) 기준으로 운영 중입니다.
