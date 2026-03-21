# 운영 배포 런북

이 문서는 `gshs.app` 첫 운영 배포를 위한 최종 런북입니다.

## 이미 준비된 것

- `main` push 시 CI가 돌고 `test.gshs.app`으로 자동 배포됨
- `Preproduction Rehearsal`로 후보 `sha-<commit>`를 테스트 서버에서 재검증 가능
- `deploy/restore-drill.sh`로 라이브 DB를 건드리지 않는 복원 리허설 가능
- `/api/health`와 `/admin/test`를 운영 전 최종 판단 기준으로 사용

## 운영 배포 전 필수 준비

첫 운영 배포 전에 아래 조건이 모두 충족되어야 합니다.

- 운영 VM에 `gshs-prod` self-hosted runner가 설치되어 있음
- 운영 VM에 `/opt/gshsapp/{data,backup,.env}`가 준비되어 있음
- 운영 `.env`가 `AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`에 모두 `https://gshs.app`을 사용함
- `DATABASE_URL=file:/app/data/dev.db`
- 리버스 프록시가 `gshs.app`을 운영 VM `1234` 포트로 전달함
- GitHub `production` environment에 승인 규칙이 활성화되어 있음
- GitHub `production` environment에 아래 값이 준비되어 있음
  - `DOCKERHUB_USERNAME`
  - `DOCKERHUB_TOKEN`
  - `E2E_ADMIN_USER`
  - `E2E_ADMIN_PASSWORD`
- 필요하다면 repository secret `MONITOR_ALERT_WEBHOOK_URL`도 준비되어 있음

## 운영 배포 직전 필수 순서

배포할 정확한 `sha-<commit>` 기준으로 아래 순서를 지킵니다.

1. `Publish And Deploy Test`가 해당 SHA에서 초록인지 확인
2. 같은 SHA로 `Preproduction Rehearsal` 실행 후 초록 확인
3. `test.gshs.app/admin/test`에서 모든 항목이 `PASS`인지 확인
4. 최신 백업 시각이 충분히 최근인지 확인
5. `test.gshs.app`에서 아래 수동 점검 수행
   - 로그인
   - 관리자 설정
   - 공지 작성 / 조회
   - 급식
   - 학사일정
6. 오프호스트 백업 복사 또는 Proxmox 스냅샷 1회 생성

## 오프호스트 백업 내보내기

최신 백업 파일이 있다면 그것을 사용하고, 없다면 라이브 SQLite 파일 복사본을 내보냅니다.

```bash
cd /opt/gshsapp
OFFSITE_TARGET=/mnt/backups/gshsapp ./offsite-backup.sh
```

원격 저장소 예시:

```bash
cd /opt/gshsapp
OFFSITE_TARGET=backup-user@backup-host:/srv/backups/gshsapp/ ./offsite-backup.sh
```

## 운영 배포 절차

1. GitHub Actions에서 `Deploy Production` 실행
2. 이미 리허설을 통과한 동일한 `sha-<commit>` 입력
3. `production` environment 승인
4. 워크플로우가 `deploy -> smoke -> e2e`까지 끝날 때까지 대기
5. `https://gshs.app/api/health`가 배포한 SHA를 반환하는지 확인
6. 관리자 계정으로 `gshs.app` 로그인
7. `/admin/test`에서 모든 항목이 `PASS`인지 확인

## 롤백 규칙

배포 실패 시, 새롭고 검증되지 않은 SHA를 올리지 않습니다. 아래 순서로 되돌립니다.

1. 마지막 정상 `sha-<commit>`를 다시 배포
2. `https://gshs.app/api/health` 재확인
3. 데이터 문제일 때만 최신 `dev.db.*.bak` 복원 고려
4. 라우팅 또는 TLS 문제면 DB를 건드리기 전에 프록시 수정 및 smoke check 재실행

## 운영 모니터링 기준

저장소에는 [`.github/workflows/production-health-monitor.yml`](../.github/workflows/production-health-monitor.yml)이 포함되어 있습니다.

현재 규칙:

- `PRODUCTION_MONITOR_ENABLED=true`일 때만 실제 운영 헬스 체크 수행
- 운영 도메인이 실제 앱이 아니면 활성화하지 않음
- `MONITOR_ALERT_WEBHOOK_URL`이 있으면 실패 시 웹훅 알림 전송 가능

운영 전환이 완료되면 아래를 확인합니다.

- `PRODUCTION_MONITOR_ENABLED=true`
- `https://gshs.app/api/health`가 JSON 응답 반환
- `gshs.app` 루트도 정상 `200` 응답

## 운영 첫 주 권장 수동 점검 명령

```bash
cd /opt/gshsapp
docker compose ps
docker compose logs --tail=200
```
