# Mobile UX Audit Report (iPhone 14)

## Audited pages
- Main/key: `/`, `/login`, `/signup`, `/notices`, `/meals`, `/calendar`, `/notifications`, `/admin`
- Auth-gated observed: `/songs`, `/timetable`, `/me`
- Full route inventory/checklist: `mobile-audit/checklist.md`

## Issues found
1. Bottom navigation safe-area/bottom overlap risk (undefined safe classes + inconsistent page bottom padding).
2. Several pages had cramped tap targets (<44px) for nav/control/delete actions.
3. Mobile overflow/crowding in headers/forms (notices header action, me D-Day form, notification actions).
4. Calendar view used fixed viewport-height container causing mobile scroll-trap pressure.
5. Login/signup card spacing slightly tight on small mobile viewport + `min-h-screen` instability on iOS browser chrome.
6. Admin dashboard had light-mode contrast/readability issues (`text-slate-100` on light surfaces) and non-mobile-first action layout.
7. Horizontal overflow risk globally in edge cases.

## Fixes applied
### Batch A — shared mobile foundations
- Added shared utilities in `globals.css`:
  - `.mobile-page`, `.mobile-safe-bottom`, `.tap-target`
  - `body { overflow-x: hidden; }`
- Updated main layout bottom padding to include safe-area with bottom nav.
- Updated bottom nav + mobile menu for safe-area and touch target sizing.

### Batch B — key page/component UX
- Applied `mobile-page mobile-safe-bottom` to major pages (`home/notices/meals/songs/timetable/calendar/me/notifications/admin`).
- Timetable controls: wider mobile-friendly date nav container, larger prev/next tap targets, responsive grade/class filter layout.
- Calendar view: removed hard fixed-height behavior on mobile, reduced cramped cell spacing, improved mobile sizing.
- Notices header/button responsive wrapping and full-width CTA on small screens.
- Me page: D-Day creation form responsive grid; larger destructive action tap targets.
- Notifications item: action row wraps safely on mobile, larger delete target.
- Login/signup: `min-h-[100dvh]` and responsive card padding.
- Admin dashboard: fixed light-mode contrast and moved quick-actions to responsive grid layout.

## Verification
- `npm run lint` ✅ (existing warnings only, no new errors)
- `npm run build` ✅
- Mobile screenshots captured before/after in `mobile-audit/before` and `mobile-audit/after`.

## Residual issues / follow-up
- Some protected flows remained auth-gated in scripted capture (songs/timetable/me), but gating behavior is correct.
- There are many pre-existing lint warnings across unrelated files (not introduced by this UX batch).
- Broader deep-pass can still be done for all admin subpages/forms/tables under real admin login to tune per-screen spacing and modal behaviors.

## Commits
- `c2f4396` — Improve core mobile UX: safe-area spacing, tap targets, responsive key layouts
- `c39b680` — Add mobile audit checklist/report and iPhone 14 screenshot capture scripts
