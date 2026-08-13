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
- `/api/log/page-view`, `/api/log/meal-view`: 비차단 로깅. 정확한 `NEXT_PUBLIC_APP_URL` origin, same-origin Fetch Metadata, JSON content type, 1,024바이트 body와 512바이트 pathname, 프로세스 limiter를 통과한 이벤트만 받는다. forwarded IP 신뢰 기본값은 0 hop이다.

대표 서비스 계층:

- `src/lib/public-content.ts`: 공개 데이터 조회 및 캐시
- `src/lib/distribution-reservation.ts`: SQLite writer lock 아래 `PENDING` 예약, 쿨다운, 일일 한도, 토큰 해시 저장을 원자적으로 처리
- `src/lib/invite-redemption.ts`: bcrypt 전에 활성·수신자 결합을 저비용 사전 검증하고 조건부 1회 claim 이후 계정 생성
- `src/lib/token-distribution.ts`: 예약된 토큰의 fragment 링크 메일 발송, 실패 시 토큰 분리·삭제, 실패를 포함한 발송 한도 상태 전이
- `src/lib/invite-token-lifecycle.ts`: 7일이 지난 초대 레코드와 legacy 평문 토큰을 배부 로그에서 분리한 뒤 제한된 배치로 삭제
- `src/lib/brevo.ts`: Brevo 메일 연동
- `src/lib/backup.ts`: 백업 경로와 파일 처리
- `src/auth.config.ts`: Edge 호환 route UX guard와 JWT/session claim 전달(DB 접근 금지)
- `src/lib/current-user.ts`: Node 런타임의 DB 기반 현재 사용자·관리자 인가
- `src/lib/system-log-store.ts`: `SystemLog` 정규화, 1~90일 보관, 공개/전체 행 상한과 oldest-first pruning
- 클라이언트 주소 경계: 로깅·공개 텔레메트리·요청 제한은 `TRUSTED_PROXY_HOPS`만 사용한다. 기본값 `0`은 `X-Forwarded-For`를 무시하고 공유 unknown 버킷을 사용하며, 설정값은 오른쪽부터 신뢰할 프록시 홉 수 `0..3`만 허용한다. 로그인/회원가입/포털 제한기는 계정·클라이언트 임계값보다 공유 학교 NAT의 네트워크 임계값을 높게 두고 key 상한 도달 시 전역 차단 대신 LRU 항목을 교체한다. 회원가입 제한과 초대 사전 조회는 bcrypt보다 먼저 실행된다.
- `src/lib/audit.ts`: 공개 텔레메트리와 분리된 폐쇄형 관리자 감사 이벤트 기록
- `InviteToken.token`은 7일 legacy 호환을 위한 nullable 필드이고 신규 발급은 `tokenHash`만 저장한다. 원문은 DB에서 복구하지 않는다.
- `AuditLog.actorId`는 사용자 삭제 뒤에도 감사 행을 보존하기 위해 nullable `ON DELETE SET NULL` 관계를 사용한다.

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
- NEIS·날씨·YouTube oEmbed 응답은 공용 스트리밍 리더로 콘텐츠 유형과 최대 바이트를 검사하며, 각 연동은 타임아웃과 스키마/행 상한을 별도로 적용
- iCal은 임의 외부 URL을 받지 않고 `ICAL_ALLOWED_HOSTS`(기본 `calendar.google.com`)의 정확한 HTTPS 호스트만 허용한다. 시간 제한 안에 받은 DNS 결과 전체가 공용 주소인지 검사하고, 선택한 주소를 새 TLS 연결의 lookup에 고정해 검증/연결 사이 DNS 변경과 기존 소켓 재사용을 차단한다. 응답 크기와 물리/논리 줄, 속성, UID, 이벤트 수를 파싱 전에 제한하고 예약 객체 키를 거부한 뒤 own-property만 공개 DTO로 변환한다

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
- middleware의 JWT 역할 검사는 UX용이며 최종 권한 판단이 아님
- 보호된 Node route/action은 JWT subject와 정수 `sessionVersion`을 DB 값과 정확히 비교하고 DB의 현재 역할을 사용
- 기존 JWT에 version claim이 없거나 값이 잘못되면 fail closed되어 재로그인이 필요
- 비밀번호 변경/초기화, 역할 변경, 인증 필드 import는 같은 DB write에서 `sessionVersion`을 원자적으로 증가
- 관리자 초기화 비밀번호는 `mustChangePassword`를 설정하고 정상 보호 기능보다 비밀번호 변경을 먼저 강제
- 로그인/포털의 keyed 제한과 포털 세션 서명에는 placeholder가 아닌 32바이트 이상의 `AUTH_SECRET`이 필요하며, 조건을 만족하지 않으면 fail closed
- `/teachers`는 현재 회원 세션을 요구하며 이름, 이메일, 과목, 위치, 소개 문구만 조회

## 7. 배포 아키텍처

배포 흐름:

1. PR / push에서 CI 실행
2. `main` push 시 Docker 이미지 빌드
3. Docker Hub에 `sha-<40-hex commit>` 이미지를 푸시하고 digest 고정
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

- 실제 배포 기준은 검증된 `sha-<commit>` 출처와 immutable image digest
- GitHub Release는 `package.json` semver 기준 `vX.Y.Z`
- 운영 릴리스가 다른 SHA에 이미 사용된 semver를 재사용하면 배포 실패
- 배포 컨테이너 시간대는 `TZ=Asia/Seoul`, UI 시간 표시는 KST helper 기준으로 통일

## 8. 백업과 복원

현재 백업 구조:

- 정기 백업은 웹 요청이 아니라 scheduler 기반
- 테스트 서버 정기 백업 workflow 존재
- 복원 리허설은 라이브 DB를 덮어쓰지 않는 임시 컨테이너 방식
- 운영 직전에는 최신 백업과 restore drill 상태를 확인
- 이전 DB를 복원하면 세션 버전도 과거로 돌아갈 수 있으므로 복원 후 `AUTH_SECRET`을 회전해 전역 로그아웃

주요 파일:

- `deploy/run-scheduled-backup.sh`
- `scripts/run-scheduled-backup.ts` → 빌드 시 `.next/ops/run-scheduled-backup.mjs`
- `deploy/restore-drill.sh`
- `deploy/offsite-backup.sh`

백업은 라이브 SQLite 파일 복사가 아니라 `VACUUM INTO` 스냅샷과 버전 2 manifest로 생성됩니다. 아카이브는 허용된 논리 루트, 일반 파일/디렉터리, 경로·항목 수·크기·깊이 제한, manifest SHA-256을 모두 통과해야 합니다. 웹 복원은 이 검증을 거친 보류 항목을 비공개 데이터 디렉터리에 스테이징할 뿐 라이브 DB를 교체하지 않습니다. 자동 적용은 crash-safe 오프라인 저널 설치기가 별도 검토되기 전까지 비활성화됩니다.

런타임의 모든 파일 경로는 `DATA_ROOT` 아래 정적 매핑으로 계산합니다. 프로덕션 standalone 산출물은 원본 `src`, 로컬 DB, 문서, seed/repair/debug 도구, 공개 디버그 캡처를 포함할 수 없으며 빌드 후 assertion이 이를 검사합니다.

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
