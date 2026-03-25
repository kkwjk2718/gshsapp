# 아키텍처 개요

이 문서는 GSHS.app의 코드 구조, 데이터 계층, 외부 연동, 배포/런타임 구조를 빠르게 파악하기 위한 기술 개요입니다.

## 1. 애플리케이션 스택

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma
- SQLite
- Docker / Docker Compose
- GitHub Actions

## 2. 코드 구조

핵심 디렉터리:

- `src/app`: App Router 페이지, 레이아웃, route handler
- `src/components`: 공용 UI와 레이아웃 컴포넌트
- `src/lib`: 데이터 접근, 설정, 백업, 로깅, 외부 연동 유틸
- `prisma/schema.prisma`: 데이터 모델 정의
- `deploy/`: 서버 배포 자산
- `.github/workflows/`: CI/CD와 운영 자동화

Route group 기준:

- `src/app/(main)`: 실제 서비스 화면
- `src/app/api`: 헬스체크, 인증, 로그, 사용자 요약 같은 route handler

## 3. 데이터 계층

데이터베이스:

- Prisma + SQLite
- 서버 런타임 경로: `file:/app/data/dev.db`

주요 모델:

- 사용자/인증: `User`, `InviteToken`, `TokenBatch`, `TokenDistributionLog`
- 콘텐츠: `Notice`, `NoticeCategory`, `Schedule`, `SongRequest`, `SongRule`, `LinkItem`, `RelatedSite`
- 개인화: `PersonalEvent`, `Notification`, `TeacherProfile`
- 운영: `AuditLog`, `SystemLog`, `SystemSetting`, `ErrorReport`

현재 중요한 운영 특징:

- 토큰 배부 포털과 수동 메일 발송은 `TokenDistributionLog`를 기준으로 추적
- 설정은 환경변수와 `SystemSetting`이 혼합됨
- Google Analytics, 토큰 포털 상태 같은 운영 설정은 DB 기반

## 4. 주요 런타임 인터페이스

대표 route handler:

- `/api/health`: 배포 검증과 운영 상태 확인
- `/api/auth/[...nextauth]`: 인증
- `/api/public-settings`: 공개 런타임 설정
- `/api/me/summary`: 공개 셸 사용자 상태 요약
- `/api/me/home`: 홈 개인화 데이터
- `/api/log/page-view`, `/api/log/meal-view`: 비차단 로깅

대표 서비스 계층:

- `src/lib/public-content.ts`: 공개 데이터 조회 및 캐시
- `src/lib/token-distribution.ts`: 토큰 발급/재사용/메일 발송
- `src/lib/brevo.ts`: Brevo 메일 연동
- `src/lib/backup.ts`: 백업 경로와 파일 처리
- `src/auth.config.ts`: 인증/인가와 route guard

## 5. 외부 연동

현재 주요 외부 연동:

- NEIS Open API: 급식, 학사일정 계열 데이터
- Google Calendar iCal: 일정 소스 일부
- Brevo API: 토큰 메일 발송
- Docker Hub: 배포 이미지 저장소
- GitHub Actions: CI/CD, 릴리스, 정기 작업
- OpenClaw / Telegram / 기타 운영 도구는 서버 운영 보조 용도로 별도 존재

연동 관련 주의점:

- 메일 발송은 환경변수 시크릿에 의존
- 공개 데이터는 실패해도 페이지 전체가 죽지 않도록 폴백이 필요
- 운영 도메인과 테스트 도메인 값이 외부 연동 URL에 섞이면 안 됨

## 6. 권한 구조

현재 주요 역할:

- `STUDENT`
- `GRADUATE`
- `TEACHER`
- `BROADCAST`
- `ADMIN`

대표 접근 패턴:

- 공개 페이지는 비로그인 접근 가능
- `/me`는 로그인 필요
- `/music`은 방송부 또는 관리자
- `/admin/*`는 대부분 관리자 전용
- `/songs`, `/timetable`, `/links`, `/sites`는 로그인 필요
- `GRADUATE`는 로그인은 가능하지만 학생 전용 핵심 정보에는 접근하지 않음
- 일부 공개 화면은 로그인 시 개인화 정보를 추가 표시

## 7. 배포 아키텍처

배포 흐름:

1. PR / push에서 CI 실행
2. `main` push 시 Docker 이미지 빌드
3. Docker Hub에 `sha-<commit>`, `main`, `latest` 푸시
4. 테스트 서버 self-hosted runner가 자동 배포
5. 운영 서버는 수동 `Deploy Production`으로 승격

서버 구조:

```text
/opt/gshsapp
  .env
  .deploy.env
  compose.yml
  deploy.sh
  data/
  backup/
```

핵심 규칙:

- 실제 배포 기준은 `sha-<commit>`
- GitHub Release는 `package.json` semver 기준 `vX.Y.Z`
- 운영 릴리스가 다른 SHA에 이미 사용된 semver를 재사용하면 배포 실패

## 8. 백업과 복원

현재 백업 구조:

- 정기 백업은 웹 요청이 아니라 scheduler 기반
- 테스트 서버 정기 백업 workflow 존재
- 복원 리허설은 라이브 DB를 덮어쓰지 않는 임시 컨테이너 방식
- 운영 직전에는 최신 백업과 restore drill 상태를 확인

주요 파일:

- `deploy/run-scheduled-backup.sh`
- `scripts/run-scheduled-backup.mjs`
- `deploy/restore-drill.sh`
- `deploy/offsite-backup.sh`

## 9. 운영 추적과 릴리스

추적 기준:

- `/api/health.version`은 현재 배포 SHA
- GitHub Release는 현재 서비스 버전 `vX.Y.Z`
- 푸터에는 semver를 노출

이 구조 덕분에 다음을 분리해서 추적할 수 있습니다.

- 어떤 코드 SHA가 올라갔는지
- 현재 사용자에게 보이는 서비스 버전이 무엇인지

## 10. 이 문서 다음에 읽으면 좋은 문서

- 제품과 역할 흐름이 궁금하면 [제품 개요](./product-overview.md)
- 공개 기능이 궁금하면 [공개 기능 명세](./features/public-features.md)
- 계정/토큰/가입이 궁금하면 [계정 및 접근 기능 명세](./features/account-and-access.md)
- 관리자 화면이 궁금하면 [관리자 기능 명세](./features/admin-features.md)
- 실제 배포 절차가 궁금하면 [DEPLOY.md](../DEPLOY.md)
