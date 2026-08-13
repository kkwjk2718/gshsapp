# 운영 배포 런북

이 문서는 재이미징된 호스트에서 첫 강화 배포를 수행하는 최종 순서입니다. GitHub Actions는 호스트를 배포하지 않습니다. 모든 host mutation은 OOB 인증을 거친 root 콘솔과 설치된 systemd unit에서 수행합니다.

## 1. 수동 시작 차단 조건

다음 항목이 모두 완료되기 전에는 후보 승인이나 systemd deploy를 시작하지 않습니다.

- 노출된 Ubuntu/SSH, `AUTH_SECRET`, Docker Hub, Brevo, API, E2E/admin, webhook, 과거 runner·deploy credential 회전 및 session 폐기
- 민감한 Playwright artifact 삭제, public Git history 정리, full-history와 working-tree gitleaks scan 통과
- 과거 self-hosted runner service/계정/등록 토큰/deploy key/broker credential 제거; 새 호스트에는 runner를 설치하지 않음
- OS patch와 reboot 완료, 예약된 UID/GID `61001:61001` 사용 가능
- `main`에 review 1개 이상, strict required CI, conversation resolution, admin enforcement, force-push/deletion 금지 적용
- GitHub `publish`, `preproduction-verification`, `production-verification` environment는 `main` only, required reviewer 1명 이상, self-review 방지를 적용하고, 무인 `production-monitor`는 `main` only이되 required reviewer를 두지 않음
- exact admin SSH key, 두 번째 key-only session, proxy/admin CIDR UFW와 Docker bridge `DOCKER-USER` 정책 검증
- runtime secret, origin, proxy hop, offsite mount identity와 file permission 검토
- legacy 중복 학생 identity 해결 계획과 authoritative roster 준비

실제 secret, IP, token 또는 사용자 credential을 이 문서의 placeholder에 치환해 저장하지 않습니다.

## 2. 후보 식별

보호된 `main` push의 `Publish Candidate Image`가 성공한 뒤 다음 값을 운영 기록에 남깁니다.

```text
CANDIDATE_SHA=<40 lowercase hex>
IMAGE_TAG=sha-<same 40 lowercase hex>
IMAGE_DIGEST=sha256:<64 lowercase hex>
```

`latest`, `main`, 로컬 image ID 또는 workflow run 이름은 승격 identity가 아닙니다.

## 3. 테스트 호스트 선행 배포

운영 전에 test 역할의 fresh host에서 [Root operations 신뢰 부트스트랩](./root-operations-bootstrap.md)을 끝냅니다. 순서는 반드시 다음과 같습니다.

1. 독립 채널의 `root-bootstrap.sha256` digest로 bundle 확인 후 root control 설치
2. `/opt/gshsapp/.env`, `/etc/gshsapp-operations/{backup.env,deploy.env,github-token}`, offsite mount, SSH/UFW 구성
3. 설치된 backup timer와 deploy service 설치
4. test 후보 승인
5. `$OFFSITE_DIR/.gshsapp-receipts`의 기존 receipt와 별도 기록의 digest로 검증한 offsite generation을 빈 data root에 import
6. 같은 후보의 isolated restore drill
7. root systemd deploy

Test 승인에는 preproduction run ID를 넣지 않습니다.

```bash
set -Eeuo pipefail
CANDIDATE_SHA=REPLACE_WITH_40_HEX
IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX
/bin/bash /usr/local/lib/gshsapp-operations/approve-release.sh \
  "$CANDIDATE_SHA" "$IMAGE_DIGEST"
```

Import·restore·deploy 명령은 5~7절과 같으며 test `deploy.env`의 `EXPECTED_APP_ORIGIN`만 `https://test.gshs.app`입니다.

배포 후 GitHub Actions의 `Preproduction Public Verification`을 현재 `main`에서 수동 실행합니다.

- `candidate_sha=$CANDIDATE_SHA`
- `image_digest=$IMAGE_DIGEST`

Workflow가 `test.gshs.app`의 exact health/digest와 익명 public E2E를 확인해 만든 run ID를 기록합니다. 이 workflow는 test host를 변경하지 않습니다.

## 4. 운영 호스트 OOB bootstrap과 root 구성

운영 호스트를 fresh image에서 시작하고 [Root operations 신뢰 부트스트랩](./root-operations-bootstrap.md) 1~5절을 `prod` role로 수행합니다.

필수 상태:

- `/usr/local/lib/gshsapp-operations`가 installed manifest 검증을 통과
- `/etc/gshsapp-operations/host-role`이 정확히 `prod`
- `/opt/gshsapp/.env`가 root:root `0600`, 운영 URL 세 값이 모두 `https://gshs.app`
- `/etc/gshsapp-operations/deploy.env`가 exact 후보와 운영 origin/network/offsite policy를 포함
- `/etc/gshsapp-operations/backup.env`가 exact offsite mount와 retention policy를 포함
- `/etc/gshsapp-operations/github-token`이 최소 read 권한의 root:root `0600` 파일
- offsite mount가 root:root `0700`, 별도 filesystem, exact source/type/options와 일치
- `gshsapp-backup.timer`가 enabled이고 `gshsapp-deploy.service`가 설치됨

`HOST_BIND_IP`가 non-RFC1918이면 routing owner가 확인한 경우에만 `ALLOW_PUBLIC_BIND=true`를 사용합니다. `PROTECTED_INTERNAL_CIDRS`에는 `HOST_BIND_IP`가 속한 prefix와 모든 routed campus/management IPv4 CIDR을 정렬된 canonical 목록으로 고정합니다. `host-hardening.sh --apply` 후 현재 세션을 닫기 전에 두 번째 key-only SSH session을 확인합니다.

## 5. 운영 후보 승인

Preproduction proof는 같은 candidate/control/digest의 성공한 `workflow_dispatch` run이어야 하며 24시간보다 오래될 수 없습니다. Root approval도 24시간 유효합니다.

```bash
set -Eeuo pipefail
CANDIDATE_SHA=REPLACE_WITH_40_HEX
IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX
PREPRODUCTION_RUN_ID=REPLACE_WITH_SUCCESSFUL_RUN_ID
/bin/bash /usr/local/lib/gshsapp-operations/approve-release.sh \
  "$CANDIDATE_SHA" "$IMAGE_DIGEST" "$PREPRODUCTION_RUN_ID"
```

설치본은 현재 protected `main`, branch protection, registry bytes, GitHub provenance, preproduction run과 proof artifact를 다시 조회한 뒤 `/opt/gshsapp/approved-release.json`을 root:root `0400`으로 기록합니다.

## 6. Offsite generation 검증과 fresh-host import

이 단계는 fresh host의 빈 `/opt/gshsapp/data`에만 허용됩니다. In-place restore가 아닙니다.

Offsite mount에는 exact archive/metadata pair와 이전 root host가 같은 세대에 영속화한 `*.receipt.json`이 있어야 합니다. Receipt의 고정 위치는 `$OFFSITE_DIR/.gshsapp-receipts`이며 archive/metadata와 함께 immutable 또는 versioned retention으로 보호합니다. Receipt는 checksum 기록이지 서명이 아니므로 fresh host에서 재생성하지 않고, 그 SHA-256을 별도 인증 운영 기록과 대조합니다.

```bash
set -Eeuo pipefail
BACKUP_NAME=backup-YYYYMMDD-HHMMSS-REPLACE8.tar.gz
EXPECTED_OFFSITE_RECEIPT_SHA256=REPLACE_WITH_SEPARATELY_AUTHENTICATED_64_HEX
set -a
. /etc/gshsapp-operations/deploy.env
set +a

RECEIPT="$OFFSITE_DIR/.gshsapp-receipts/$BACKUP_NAME.receipt.json"
/usr/bin/test -f "$RECEIPT"
/usr/bin/test "$(/usr/bin/stat -c '%u:%g:%a:%h' "$RECEIPT")" = 0:0:600:1
/usr/bin/test "$(/usr/bin/stat -c '%u:%g:%a' "$OFFSITE_DIR/.gshsapp-receipts")" = 0:0:700
/usr/bin/python3 /usr/local/lib/gshsapp-operations/bootstrap-backup.py verify-receipt \
  --offsite-dir "$OFFSITE_DIR" \
  --receipt-dir "$OFFSITE_DIR/.gshsapp-receipts" \
  --name "$BACKUP_NAME"

BACKUP_NAME="$BACKUP_NAME" EXPECTED_OFFSITE_RECEIPT_SHA256="$EXPECTED_OFFSITE_RECEIPT_SHA256" \
  /bin/bash /usr/local/lib/gshsapp-operations/pin-offsite-operation.sh import
```

`import-backup.sh`는 approval과 exact candidate를 다시 확인하고, application container가 없고 data root가 비어 있을 때만 후보 image의 isolated migration validator를 실행합니다. 성공하면 `/opt/gshsapp/bootstrap-complete.json`을 기록하지만 앱은 시작하지 않습니다.

## 7. 같은 후보의 restore drill

Restore drill은 같은 approval, image tag/digest, fresh offsite receipt를 사용하고 live data를 변경하지 않습니다. 전용 최소권한 검증 계정의 자격증명은 root 콘솔에서 비표시 입력하며 shell history나 파일에 적지 않습니다.

```bash
set -Eeuo pipefail
set -a
. /etc/gshsapp-operations/deploy.env
set +a

IFS= read -r -p 'Restore-drill admin user: ' E2E_ADMIN_USER
IFS= read -r -s -p 'Restore-drill admin password: ' E2E_ADMIN_PASSWORD
printf '\n'
export E2E_ADMIN_USER E2E_ADMIN_PASSWORD
/bin/bash /usr/local/lib/gshsapp-operations/pin-offsite-operation.sh restore
unset E2E_ADMIN_USER E2E_ADMIN_PASSWORD
```

성공하면 exact candidate/control/offsite receipt에 결합된 `/opt/gshsapp/restore-drill-receipt.json`이 root:root `0400`으로 생성됩니다. 운영 deploy는 approval 이후 생성되고 24시간 이내인 이 receipt가 없으면 중단합니다.

## 8. Root systemd deploy

직접 `/usr/local/lib/gshsapp-operations/deploy.sh`를 실행하거나 mutable checkout의 스크립트를 `sudo`로 실행하지 않습니다.

```bash
systemctl start gshsapp-deploy.service
systemctl status --no-pager gshsapp-deploy.service
journalctl -u gshsapp-deploy.service --since '-30 minutes' --no-pager
```

Unit은 installed manifest와 config를 재검증하고 active firewall, bootstrap marker, approval, restore receipt, offsite generation을 확인한 뒤 lifecycle lock 안에서 backup·migration·candidate health를 수행합니다.

완료 후 확인:

```bash
curl --fail --silent --show-error https://gshs.app/api/health
systemctl status --no-pager gshsapp-backup.timer
```

응답의 `version`과 `imageDigest`가 승인한 값과 정확히 같아야 합니다. 관리자 로그인과 `/admin/test`, 공지 조회, 급식, 학사일정도 수동 확인합니다.

## 9. Production Release Verification

운영 host 배포 확인 뒤 GitHub Actions의 `Production Release Verification`을 수동 실행합니다.

- `image_tag=sha-$CANDIDATE_SHA`
- `image_digest=$IMAGE_DIGEST`

`production-verification` required reviewer 승인 후 workflow는 test와 production 공개 origin, exact version/digest, 익명 E2E를 확인하고 exact proof를 게시합니다. 기본 브랜치의 별도 `workflow_run` publisher가 run·proof·provenance·현재 production을 재검증한 뒤 SHA-bound `vX.Y.Z` Release를 생성합니다. Host mutation은 수행하지 않습니다.

## 10. 백업과 장애 대응

`gshsapp-backup.timer`는 매일 예약과 1시간 재확인으로 먼저 exact offsite mount의 완전 archive/metadata/receipt freshness를 검증합니다. Fresh하면 writer를 건드리지 않고 종료하고, stale일 때만 host systemd에서 writer를 quiesce해 새 archive/metadata를 만든 뒤 `$OFFSITE_DIR/.gshsapp-receipts`의 root checksum receipt까지 검증합니다. GitHub Actions backup schedule이나 임의 ad-hoc 전송 대상을 사용하지 않습니다.

배포 실패 시 lifecycle recovery와 journal을 먼저 확인합니다. Durable schema transition 뒤에는 과거 바이너리를 자동 재시작하지 않습니다. 임의 `docker compose up`, live SQLite `cp`, 검증되지 않은 archive 적용을 금지합니다. 복구는 다음 중 하나로 별도 승인합니다.

- 같은 강화 후보의 배포 transaction 재실행
- 새로 검증된 강화 후보 배포
- 서비스를 멈춘 상태의 검증된 pre-deployment/offsite generation 복원 계획

라우팅/TLS 문제는 DB를 건드리기 전에 reverse proxy와 firewall을 수정합니다.

## 11. 공개 health monitor

운영 전환 뒤 repository variable `PRODUCTION_MONITOR_ENABLED=true`를 설정하면 GitHub-hosted schedule이 공개 `/api/health`와 `/`만 확인합니다. 선택적 `MONITOR_ALERT_WEBHOOK_URL`은 `main` only인 `production-monitor` environment secret으로만 관리하고 repository-scoped 사본은 삭제·회전합니다. 10분 schedule이 무인 실행되도록 이 environment에는 required reviewer를 두지 않습니다. 이 monitor는 host 배포·복구·백업 권한이 없습니다.
