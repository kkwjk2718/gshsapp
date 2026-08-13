# 서버 신뢰 부트스트랩

테스트·운영 호스트는 과거 self-hosted runner, Docker 상태, checkout, 배포 계정과 자격증명을 승계하지 않은 **재이미징된 상태**에서 준비합니다. GitHub Actions는 GitHub-hosted CI·publish·공개 검증만 수행하며 서버에 로그인하거나 배포·백업·복원·import를 실행하지 않습니다. 호스트 변경은 OOB로 인증한 root 콘솔에서만 수행합니다.

최초 control 설치는 반드시 [Root operations 신뢰 부트스트랩](./root-operations-bootstrap.md)의 독립 digest 검증 절차를 그대로 따릅니다. 저장소 checkout에서 `sudo deploy/install-*.sh`를 실행하는 방식은 지원하지 않습니다.

## 1. 시작 전 launch blockers

다음 중 하나라도 충족하지 않으면 호스트를 출고하거나 workflow·배포를 시작하지 않습니다.

- `main`에 required review 1개 이상, strict required CI, conversation resolution, admin enforcement, force-push/deletion 금지가 실제 적용됨
- `publish`, `preproduction-verification`, `production-verification`은 `main` only와 required reviewer로 보호되고, `production-monitor`는 `main` only·required reviewer 없음으로 무인 실행 가능함
- 과거 runner service·계정·등록 token·deploy key·Docker state·checkout이 제거됨
- 과거 Docker Hub, GitHub, SSH, webhook, Brevo, E2E, runtime secret이 폐기되고 새 값으로 회전됨
- OS가 신뢰 매체로 재설치되고 보안 update와 재부팅이 완료됨
- key-only 비-root 관리자 접속과 OOB 콘솔 fallback이 모두 검증됨
- 별도 filesystem의 exact offsite mount가 root:root `0700`이고 immutable 또는 versioned retention이 활성화됨

GitHub 보호 정책은 [저장소 운영 규칙](./repository-governance.md)을 따릅니다.

신뢰한 OS package source에서 Docker Engine/Compose plugin, GitHub CLI, Python 3, curl, util-linux, coreutils, iptables, UFW와 OpenSSH server를 설치합니다. Control이 요구하는 고정 경로와 비어 있는 Docker state를 root 콘솔에서 먼저 확인합니다.

```bash
set -Eeuo pipefail
for binary in \
  /bin/bash \
  /usr/bin/curl \
  /usr/bin/docker \
  /usr/bin/findmnt \
  /usr/bin/flock \
  /usr/bin/gh \
  /usr/bin/python3 \
  /usr/bin/sha256sum \
  /usr/bin/ssh-keygen \
  /usr/bin/systemctl \
  /usr/bin/timeout \
  /usr/sbin/iptables \
  /usr/sbin/sshd \
  /usr/sbin/ufw
do
  test -x "$binary"
done
/usr/bin/systemctl enable --now docker.service
/usr/bin/docker compose version
/usr/bin/gh attestation --help >/dev/null
test -z "$(/usr/bin/docker ps -aq)"
```

## 2. OOB root control 설치

검토된 bundle과 별도 인증 채널로 전달된 `deploy/root-bootstrap.sha256` digest를 준비합니다. Root 콘솔에서 고정 allowlist를 root-owned staging으로 복사하고 OS의 `/usr/bin/sha256sum`으로 bootstrap manifest와 control manifest를 검증한 뒤에만 installer를 실행합니다. 정확한 복사·검증 명령은 [Root operations 신뢰 부트스트랩 1~4절](./root-operations-bootstrap.md)을 그대로 사용합니다.

호스트 역할은 최초 설치 때 `test` 또는 `prod`로 고정합니다. 예를 들어 운영 호스트는 검증 블록이 만든 일회성 승인 증표가 존재하는 같은 root shell에서 다음을 실행합니다.

```bash
/bin/bash /root/gshsapp-control-bundle/deploy/install-root-operations.sh \
  /root/gshsapp-control-bundle \
  REPLACE_WITH_64_HEX_FROM_INDEPENDENT_CHANNEL \
  prod
```

설치 후 실행 경로는 항상 `/usr/local/lib/gshsapp-operations`입니다. Bundle·checkout·`/opt/gshsapp` 복사본을 실행하지 않습니다.

## 3. 고정 역할과 root-only 구성

```text
/usr/local/lib/gshsapp-operations/   root:root 0700, control files 0400
/etc/gshsapp-operations/             root:root 0700
  host-role                           root:root 0400, exact test|prod
  github-token                        root:root 0600
  backup.env                          root:root 0600
  deploy.env                          root:root 0600
/opt/gshsapp/                         root:root 0755
  .env                                root:root 0600
  data/                               61001:61001 0700
  backup/                             61001:61001 0700
  root-backup/                        root:root 0700
/run/lock/gshsapp/                    root:root 0700
$OFFSITE_DIR/                         root:root 0700, 별도 exact mount
  .gshsapp-receipts/                  root:root 0700, immutable/versioned receipt
```

앱 UID/GID 61001은 login·sudo·Docker 권한이 없어야 합니다. `/usr/local/lib/gshsapp-operations`, `/etc/gshsapp-operations`, Docker socket과 `.gshsapp-receipts`에는 접근할 수 없습니다.

Secret manager에서 새 runtime 환경을 `/opt/gshsapp/.env`로, 최소 read 권한 GitHub token을 `/etc/gshsapp-operations/github-token`으로 설치합니다. 값을 command line, shell history, 문서나 Actions secret에 넣지 않습니다. `backup.env`와 `deploy.env`의 exact 키·형식은 [Root operations 신뢰 부트스트랩 5절](./root-operations-bootstrap.md)을 따릅니다.

테스트 역할의 URL은 모두 `https://test.gshs.app`, 운영 역할은 모두 `https://gshs.app`이어야 합니다. `IMAGE_TAG=sha-<40-hex>`와 `IMAGE_DIGEST=sha256:<64-hex>`는 같은 후보를 가리켜야 합니다. Offsite source/type/options와 `OFFSITE_DIR`은 실제 root-only mount identity에 정확히 고정합니다.

## 4. Host hardening과 systemd 설치

설치된 `host-hardening.sh`를 root 콘솔에서 먼저 `--dry-run`하고, 검토된 proxy·SSH CIDR, 관리자 key fingerprint, proxy-facing 단일 bind IP를 입력합니다. 같은 값으로 `--apply`한 뒤 현재 콘솔을 닫기 전에 두 번째 key-only SSH session을 검증합니다. Host published address를 `0.0.0.0`에 bind하지 않고, UFW host 정책과 Docker bridge의 exact `DOCKER-USER` 정책이 모두 reverse proxy source만 허용하는지 확인합니다. UFW INPUT만 구성된 호스트에서는 published port가 우회될 수 있으므로 출고하지 않습니다.

설정과 mount 검증이 끝난 뒤 설치된 control로 unit을 설치합니다.

```bash
/bin/bash /usr/local/lib/gshsapp-operations/install-backup-timer.sh
/bin/bash /usr/local/lib/gshsapp-operations/install-deploy-service.sh
systemctl is-enabled gshsapp-backup.timer
systemctl status --no-pager gshsapp-backup.timer
systemctl is-enabled gshsapp-docker-user-firewall.service
systemctl status --no-pager gshsapp-docker-user-firewall.service
```

Backup은 GitHub Actions schedule이 아니라 root `gshsapp-backup.timer`가 수행합니다. Timer는 매일 예약 외에 1시간마다 offsite의 완전한 archive/metadata/receipt freshness를 writer 정지 전에 재확인하므로, mount 장애가 풀리면 같은 날 재시도하면서 fresh 상태에서는 서비스 중단이 없습니다. `gshsapp-docker-user-firewall.service`는 Docker 시작 뒤 exact bridge ingress 정책을 복원합니다. Backup·import·restore·deploy는 같은 `/run/lock/gshsapp/lifecycle.lock`을 사용합니다.

## 5. Fresh host 최초 데이터 복구와 배포

아래 순서는 생략하거나 바꾸지 않습니다. `/opt/gshsapp/data`가 비어 있고 application container가 없는 fresh host에서 실행합니다.

### 5.1 exact 후보 승인

테스트 역할:

```bash
CANDIDATE_SHA=REPLACE_WITH_40_HEX
IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX
/bin/bash /usr/local/lib/gshsapp-operations/approve-release.sh \
  "$CANDIDATE_SHA" "$IMAGE_DIGEST"
```

운영 역할은 동일 후보가 테스트 호스트에 설치된 뒤 성공한 `Preproduction Public Verification` run ID를 요구합니다.

```bash
CANDIDATE_SHA=REPLACE_WITH_40_HEX
IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX
PREPRODUCTION_RUN_ID=REPLACE_WITH_SUCCESSFUL_RUN_ID
/bin/bash /usr/local/lib/gshsapp-operations/approve-release.sh \
  "$CANDIDATE_SHA" "$IMAGE_DIGEST" "$PREPRODUCTION_RUN_ID"
```

Approval은 protected `main`, branch protection, exact registry bytes, GitHub build provenance와 운영의 exact preproduction proof를 검증합니다. Approval은 24시간만 유효합니다.

### 5.2 offsite receipt 검증과 import

Receipt는 archive/metadata와 같은 immutable 또는 versioned offsite filesystem의 정확한 `$OFFSITE_DIR/.gshsapp-receipts`에 있어야 합니다. Receipt는 checksum 기록이지 서명이 아닙니다. Fresh host에서 재생성하지 말고 이전 호스트가 영속화한 receipt의 digest를 별도 인증 운영 기록과 대조합니다.

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

성공 시 검증된 live data tree와 `/opt/gshsapp/bootstrap-complete.json`만 생성되며 앱은 계속 중지됩니다.

### 5.3 restore drill과 systemd deploy

Restore drill 관리자 credential은 root 콘솔에서 비표시 입력하며 저장하지 않습니다.

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

systemctl start gshsapp-deploy.service
systemctl status --no-pager gshsapp-deploy.service
```

운영 deploy는 approval 뒤 생성된 exact restore-drill receipt가 없거나 24시간을 넘으면 중단합니다. 실패 시 임의로 marker나 receipt를 만들지 말고 journal과 설치된 recovery control 결과를 보존합니다.

## 6. 출고 확인

- [ ] branch protection과 세 protected environment의 실제 enforcement 확인
- [ ] 과거 runner·credential 제거와 전체 credential 회전 기록 확인
- [ ] OOB digest로 설치한 불변 host role과 control manifest 확인
- [ ] root-only config, runtime `.env`, offsite mount와 receipt 권한 확인
- [ ] exact 후보 approval → verified import → restore drill → systemd deploy 순서 확인
- [ ] `gshsapp-backup.timer` 활성화와 최근 성공 기록 확인
- [ ] UFW와 exact `DOCKER-USER`의 reverse proxy source 제한, header overwrite, 단일 bind와 공개 health 확인
- [ ] authoritative roster와 legacy 중복 identity 해결

상세 사전·사후 검증과 테스트→운영 순서는 [운영 배포 런북](./production-launch-runbook.md)을 따릅니다.
