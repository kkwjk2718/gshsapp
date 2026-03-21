# 모바일 UX 감사 체크리스트 (iPhone 14)

- 점검일: 2026-02-23
- 범위: `src/app/(main)` 라우트 및 핵심 사용자 흐름

## 핵심 흐름

- [x] 로그인 (`/login`)
- [x] 회원가입 (`/signup`)
- [x] 공지 목록 및 상세 (`/notices`, `/notices/[id]`)
- [x] 급식 (`/meals`)
- [x] 음악 신청 (`/songs`, 인증 게이트 확인)
- [x] 시간표 (`/timetable`, 인증 게이트 확인)
- [x] 학사일정 (`/calendar`)
- [x] 내 정보 (`/me`, 인증 게이트 확인)
- [x] 알림 (`/notifications`)
- [x] 관리자 진입 (`/admin`)

## 라우트 인벤토리 (`src/app/(main)`)

- [x] `/`
- [x] `/admin`
- [x] `/admin/categories`
- [x] `/admin/logs`
- [x] `/admin/notices`
- [x] `/admin/notices/new`
- [x] `/admin/notifications`
- [x] `/admin/reports`
- [x] `/admin/settings`
- [x] `/admin/sites`
- [x] `/admin/songs`
- [x] `/admin/test`
- [x] `/admin/tokens`
- [x] `/admin/tokens/[batchId]`
- [x] `/admin/users`
- [x] `/calendar`
- [x] `/help`
- [x] `/links`
- [x] `/login`
- [x] `/me`
- [x] `/meals`
- [x] `/menu`
- [x] `/music`
- [x] `/notices`
- [x] `/notices/[id]`
- [x] `/notifications`
- [x] `/privacy`
- [x] `/report`
- [x] `/signup`
- [x] `/sites`
- [x] `/songs`
- [x] `/stats`
- [x] `/teachers`
- [x] `/timetable`
- [x] `/utils`
- [x] `/utils/byte-calculator`
- [x] `/utils/random-number`
- [x] `/utils/seat-arrangement`

## 스크린샷 산출물

- 수정 전: `mobile-audit/before/*.png`
- 수정 후: `mobile-audit/after/*.png`
- 핵심 비교 대상: `home`, `notices`, `meals`, `calendar`, `notifications`, `admin`, `login`, `signup`
