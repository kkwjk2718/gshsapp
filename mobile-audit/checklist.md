# Mobile UX Audit Checklist (iPhone 14)

Date: 2026-02-23
Scope: `src/app/(main)` routes + key flows

## Key flows
- [x] Login (`/login`)
- [x] Signup (`/signup`)
- [x] Notices list/detail (`/notices`, `/notices/[id]`)
- [x] Meals (`/meals`)
- [x] Songs (`/songs`, auth gate observed)
- [x] Timetable (`/timetable`, auth gate observed)
- [x] Calendar (`/calendar`)
- [x] Me (`/me`, auth gate observed)
- [x] Notifications (`/notifications`)
- [x] Admin mobile entry (`/admin`)

## Route inventory (`src/app/(main)`) 
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

## Screenshot artifacts
- Before: `mobile-audit/before/*.png`
- After: `mobile-audit/after/*.png`
- Key comparisons: `home`, `notices`, `meals`, `calendar`, `notifications`, `admin`, plus `login/signup`
