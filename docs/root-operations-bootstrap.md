# Root operations 신뢰 부트스트랩

이 절차는 재이미징된 테스트·운영 호스트에 root 전용 운영 control을 처음 설치하거나 갱신할 때 사용한다. 저장소 checkout 안의 스크립트는 자기 자신을 인증할 수 없다. 따라서 **같은 bundle에서 읽은 digest는 신뢰 근거가 아니며**, 최초 root 실행 전에 별도 인증 채널로 전달받은 `deploy/root-bootstrap.sha256`의 SHA-256을 운영자가 OS의 `/usr/bin/sha256sum`으로 직접 확인해야 한다.

과거 self-hosted runner 서비스·계정·등록 토큰·deploy key와 broker credential은 재이미징 전에 폐기하고 이 호스트에 runner를 재설치하지 않는다. `sudo ./deploy/install-*.sh`, GitHub Actions, 앱 컨테이너, `/opt/gshsapp`의 복사본에서 installer를 직접 실행하지 않는다. 최초 설치 후에는 `/usr/local/lib/gshsapp-operations/install-*.sh`만 실행한다.

## 1. 검토 bundle과 독립 digest 준비

검토 호스트에서 보호된 `main`의 정확한 commit을 확인하고 아래 검사를 통과시킨다.

```bash
node scripts/generate-control-assets-manifest.mjs --check
node scripts/control-assets-manifest.test.mjs
sha256sum deploy/root-bootstrap.sha256
```

`workflow-policy.sha256`는 CI, secret scan, publish, 공개 검증, release workflow의 정확한 바이트를 OOB control bundle에 묶습니다. 후보가 이 정책과 다른 workflow를 포함하면 `approve-release.sh`는 check/attestation이 성공했더라도 승인을 거부합니다.

마지막 64자리 값을 서명된 변경 기록, 별도 암호화 채널 또는 읽기 전용 운영 기록처럼 bundle 전송과 독립된 채널로 root 운영자에게 전달한다. 채팅에 올라온 값, 같은 다운로드 디렉터리의 checksum 파일, 실행하려는 checkout에서 다시 계산한 값만으로 승인하지 않는다.

## 2. 고정 파일 집합을 root staging에 복사

재이미징된 호스트의 콘솔에서 검토 bundle을 읽기 전용 매체 또는 비권한 다운로드 위치에 둔다. 아래 목록은 manifest를 실행하거나 root 경로로 해석하지 않고, 고정된 파일명만 새 root-owned regular file로 복사한다. `REVIEWED_BUNDLE`은 실제 위치로 바꾼다.

```bash
set -Eeuo pipefail
REVIEWED_BUNDLE=/media/reviewed/gshsapp
STAGED_BUNDLE=/root/gshsapp-control-bundle
test ! -e "$STAGED_BUNDLE"
/usr/bin/install -d -o root -g root -m 0700 "$STAGED_BUNDLE/deploy"
for name in \
  approve-release.sh \
  bootstrap-backup.py \
  compose.yml \
  deploy-policy.sh \
  deploy.sh \
  docker-user-firewall.sh \
  gshsapp-control-update-recovery.service \
  gshsapp-docker-boot-quarantine.service \
  gshsapp-docker-user-firewall.service \
  gshsapp-docker-user-firewall.timer \
  gshsapp-writer-recovery.service \
  host-hardening.sh \
  import-backup.sh \
  install-backup-timer.sh \
  install-deploy-service.sh \
  install-root-operations.sh \
  offsite-backup.sh \
  pin-offsite-operation.sh \
  predeployment-backup.sh \
  recover-backup-writer.sh \
  recover-deployment-writer.sh \
  recover-writers-at-boot.sh \
  restore-drill.sh \
  run-scheduled-backup.sh \
  validate-live-database.py \
  validate-docker-network.py \
  validate-host-routes.py \
  validate-operations-config.py \
  validate-ufw-rules.py \
  workflow-policy.sha256 \
  control-assets.sha256 \
  root-bootstrap.sha256
do
  /usr/bin/install -o root -g root -m 0400 \
    "$REVIEWED_BUNDLE/deploy/$name" "$STAGED_BUNDLE/deploy/$name"
done
/usr/bin/sync "$STAGED_BUNDLE/deploy" "$STAGED_BUNDLE"
```

Installer는 staging 경로 전체의 root 소유권, group/world 비쓰기, symlink·hardlink 부재를 다시 검사한다.

## 3. OS 도구로 실행 전에 검증

`EXPECTED_BOOTSTRAP_SHA256`에는 독립 채널로 받은 값만 직접 입력한다. 다음 블록은 bootstrap manifest, installer 세 개, control manifest, 모든 runtime control을 차례로 검증한 뒤에만 일회성 증표를 만든다.

```bash
set -Eeuo pipefail
STAGED_BUNDLE=/root/gshsapp-control-bundle
EXPECTED_BOOTSTRAP_SHA256=REPLACE_WITH_64_HEX_FROM_INDEPENDENT_CHANNEL
[[ "$EXPECTED_BOOTSTRAP_SHA256" =~ ^[0-9a-f]{64}$ ]]
cd "$STAGED_BUNDLE"
printf '%s  %s\n' "$EXPECTED_BOOTSTRAP_SHA256" deploy/root-bootstrap.sha256 \
  | /usr/bin/sha256sum --check --strict -
/usr/bin/sha256sum --check --strict deploy/root-bootstrap.sha256
/usr/bin/sha256sum --check --strict deploy/control-assets.sha256

test ! -e /run/gshsapp-root-bootstrap.approved
umask 077
printf 'gshsapp-root-bootstrap-v1 %s\n' "$EXPECTED_BOOTSTRAP_SHA256" \
  > /run/gshsapp-root-bootstrap.approved
/usr/bin/chown root:root /run/gshsapp-root-bootstrap.approved
/usr/bin/chmod 0400 /run/gshsapp-root-bootstrap.approved
/usr/bin/sync /run/gshsapp-root-bootstrap.approved /run
```

검증 하나라도 실패하면 아무 installer도 실행하지 않고 bundle과 독립 digest의 출처부터 다시 확인한다. 일회성 증표는 installer가 성공·실패와 관계없이 제거한다.

## 4. 최초 설치와 불변 host role

각 호스트는 최초 설치 때 `test` 또는 `prod` 하나로 고정한다. 설치 후 `/etc/gshsapp-operations/host-role`은 root:root `0400`이며 값 변경은 거부된다. 역할을 바꾸려면 호스트를 다시 이미지화하고 처음부터 부트스트랩한다.

```bash
/bin/bash "$STAGED_BUNDLE/deploy/install-root-operations.sh" \
  "$STAGED_BUNDLE" "$EXPECTED_BOOTSTRAP_SHA256" prod
```

Control은 `/usr/local/lib/gshsapp-operations`에 root:root `0400`, 디렉터리는 `0700`으로 설치된다. 정확한 manifest 집합 외 파일은 허용하지 않는다. 갱신 시 새 디렉터리와 기존 디렉터리를 원자적으로 교환하고, 검증·설정 단계가 실패하면 기존 디렉터리로 역교환한다. 모든 파일과 부모 디렉터리를 `fsync`한 뒤 완료한다.

## 5. root service 구성

설정 디렉터리와 두 환경 파일은 root 전용이다.

```bash
/usr/bin/install -d -o root -g root -m 0700 /etc/gshsapp-operations
/usr/bin/install -o root -g root -m 0600 /dev/null /etc/gshsapp-operations/backup.env
/usr/bin/install -o root -g root -m 0600 /dev/null /etc/gshsapp-operations/deploy.env
/usr/bin/install -o root -g root -m 0600 /dev/null /etc/gshsapp-operations/github-token
```

`github-token`에는 secret manager에서 전달받은 최소 read 권한 token을 비대화형 안전 경로로 기록한다. 이 token은 현재 protected `main`, branch protection, Actions run/artifact와 attestation 확인에만 사용하며 Docker Hub push나 repository write 권한을 부여하지 않는다. 값을 command line, shell history, 문서 또는 Actions secret에 복제하지 않는다.

Runtime secret도 저장소 checkout에서 만들지 않는다. Secret manager에서 받은 검토 파일을 root-only staging에 둔 뒤 다음처럼 설치하고 staging을 안전하게 폐기한다.

```bash
/usr/bin/install -o root -g root -m 0600 \
  /root/reviewed-runtime.env /opt/gshsapp/.env
/usr/bin/install -o root -g root -m 0600 \
  /root/reviewed-github-token /etc/gshsapp-operations/github-token
```

`backup.env`는 다음 키만 허용한다.

```dotenv
OFFSITE_DIR=/mnt/immutable/gshsapp
OFFSITE_MOUNT_SOURCE=UUID=REPLACE_WITH_EXACT_DEVICE_ID
OFFSITE_FSTYPE=ext4
OFFSITE_REQUIRED_OPTIONS=rw,nodev,nosuid,noexec
MINIMUM_GENERATIONS=3
MAXIMUM_GENERATIONS=14
MAXIMUM_AGE_DAYS=30
MAXIMUM_TOTAL_BYTES=21474836480
BACKUP_FRESHNESS_HOURS=23
```

`deploy.env`는 배포할 때마다 root가 정확한 후보로 갱신한다. 아래 예시는 운영 역할이다.

```dotenv
IMAGE_TAG=sha-REPLACE_WITH_40_HEX
IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX
EXPECTED_APP_ORIGIN=https://gshs.app
HOST_BIND_IP=REPLACE_WITH_EXACT_PROXY_FACING_IPV4
ALLOW_PUBLIC_BIND=true
SSH_SOURCE_CIDR=REPLACE_WITH_EXACT_ADMIN_IPV4_CIDR
PROXY_SOURCE_CIDR=REPLACE_WITH_EXACT_PROXY_IPV4_CIDR
PROTECTED_INTERNAL_CIDRS=REPLACE_WITH_SORTED_CANONICAL_INTERNAL_IPV4_CIDRS
OFFSITE_DIR=/mnt/immutable/gshsapp
OFFSITE_MOUNT_SOURCE=UUID=REPLACE_WITH_EXACT_DEVICE_ID
OFFSITE_FSTYPE=ext4
OFFSITE_REQUIRED_OPTIONS=rw,nodev,nosuid,noexec
HOST_PORT=1234
BACKUP_MAX_AGE_HOURS=24
SMOKE_TIMEOUT_SECONDS=90
SMOKE_INTERVAL_SECONDS=3
```

`PROXY_SOURCE_CIDR` must be the single reviewed reverse proxy expressed as a canonical IPv4 `/32`; broader proxy subnets are refused. `PROTECTED_INTERNAL_CIDRS` must include every routed campus/management prefix and the prefix containing `HOST_BIND_IP`.

테스트 역할은 `EXPECTED_APP_ORIGIN=https://test.gshs.app`을 사용한다. 알 수 없는 키, 중복 키, quote·공백·CRLF, `BASH_ENV`/`PATH`, wildcard bind, 안전하지 않은 systemd 경로 문자는 모두 거부된다. 오프사이트 mountpoint는 root:root `0700`이며 별도 파일시스템, 정확한 source/type/options로 mount되어 있어야 한다.

설치된 host hardening control을 먼저 dry-run하고, 콘솔 접근과 reviewed SSH key fingerprint를 확인한 뒤에만 apply한다. 아래 값은 실제 검토값으로 root 콘솔에서 입력하며 문서에 저장하지 않는다.

```bash
PROXY_SOURCE_CIDR=REPLACE_WITH_EXACT_PROXY_CIDR \
SSH_SOURCE_CIDR=REPLACE_WITH_EXACT_ADMIN_CIDR \
SSH_ADMIN_USER=REPLACE_WITH_NON_ROOT_ADMIN \
SSH_AUTHORIZED_KEY_FINGERPRINT=SHA256:REPLACE_WITH_REVIEWED_FINGERPRINT \
HOST_BIND_IP=REPLACE_WITH_EXACT_PROXY_FACING_IPV4 \
APP_PORT=1234 \
ALLOW_NON_RFC1918_INTERNAL=true \
/bin/bash /usr/local/lib/gshsapp-operations/host-hardening.sh --dry-run
```

동일 환경으로 `--apply`한 뒤 현재 세션을 유지한 채 두 번째 key-only SSH session을 검증한다. 모든 주소가 RFC1918이면 `ALLOW_NON_RFC1918_INTERNAL`을 생략한다.

설정 후 설치된 control만 사용한다.

```bash
/bin/bash /usr/local/lib/gshsapp-operations/install-backup-timer.sh
/bin/bash /usr/local/lib/gshsapp-operations/install-deploy-service.sh
systemctl is-enabled gshsapp-docker-user-firewall.service
systemctl is-enabled gshsapp-control-update-recovery.service
systemctl is-enabled gshsapp-docker-boot-quarantine.service
systemctl is-enabled gshsapp-writer-recovery.service
systemctl status --no-pager gshsapp-docker-user-firewall.service
systemctl status --no-pager gshsapp-control-update-recovery.service
systemctl status --no-pager gshsapp-docker-boot-quarantine.service
systemctl status --no-pager gshsapp-writer-recovery.service
```

각 systemd 실행은 시작 전에 설치된 control manifest 전체와 해당 환경 파일을 다시 검증한다. Docker 시작 전에는 별도 recovery oneshot이 control root를 mount point로 만들지 않은 namespace에서 durable update를 먼저 복구하고, 이후 read-only control namespace의 quarantine이 fail-closed 정책을 설치한다. Deploy installer는 Docker 시작 뒤 exact `DOCKER-USER` ingress를 복원하는 정적 firewall unit도 설치·검증한다. Backup과 deploy는 `/run/lock/gshsapp/lifecycle.lock` 생명주기 경계를 공유하고, 비정상 종료 시 root-owned recovery helper를 실행한다.

## 6. Fresh host의 최초 실행 순서

설치 후에도 mutable bundle 경로를 실행하지 않는다. `deploy.env`를 exact 후보로 갱신하고 offsite mount를 연결한 뒤 아래 순서를 지킨다.

### 6.1 후보 승인

테스트 역할:

```bash
CANDIDATE_SHA=REPLACE_WITH_40_HEX
IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX
/bin/bash /usr/local/lib/gshsapp-operations/approve-release.sh \
  "$CANDIDATE_SHA" "$IMAGE_DIGEST"
```

운영 역할은 동일 후보가 test host에 설치된 뒤 성공한 `Preproduction Public Verification` run ID를 세 번째 인자로 요구한다.

```bash
CANDIDATE_SHA=REPLACE_WITH_40_HEX
IMAGE_DIGEST=sha256:REPLACE_WITH_64_HEX
PREPRODUCTION_RUN_ID=REPLACE_WITH_SUCCESSFUL_RUN_ID
/bin/bash /usr/local/lib/gshsapp-operations/approve-release.sh \
  "$CANDIDATE_SHA" "$IMAGE_DIGEST" "$PREPRODUCTION_RUN_ID"
```

Approval은 현재 protected `main`, branch protection, registry bytes, GitHub build provenance와 운영의 exact preproduction proof를 다시 검증한다. Approval과 proof는 24시간 freshness 경계를 갖는다.

### 6.2 불변 receipt 확인과 offsite import

Fresh host의 `/opt/gshsapp/data`가 비어 있고 application container가 없을 때만 실행한다. Receipt는 archive/metadata와 함께 versioned·immutable offsite storage의 고정 `$OFFSITE_DIR/.gshsapp-receipts`에 보존되어야 한다. Receipt는 checksum 기록이지 서명이 아니므로, fresh host에서 다시 생성하지 않고 이전 host에서 영속화한 동일 세대와 별도 운영 기록에 남긴 receipt digest를 대조한다.

`/opt/gshsapp/backup`은 앱 관리자 UI용 비신뢰 저장소이고, offsite receipt 체인에는 사용하지 않는다. Root timer와 predeployment snapshot은 앱에 mount되지 않는 `/opt/gshsapp/root-backup`(root:root 0700)만 사용한다.

```bash
set -Eeuo pipefail
BACKUP_NAME=backup-YYYYMMDD-HHMMSS-REPLACE8.tar.gz
EXPECTED_OFFSITE_RECEIPT_SHA256=REPLACE_WITH_SEPARATELY_AUTHENTICATED_64_HEX
set -a
. /etc/gshsapp-operations/deploy.env
set +a
/usr/bin/test -f "$OFFSITE_DIR/.gshsapp-receipts/$BACKUP_NAME.receipt.json"
/usr/bin/test "$(/usr/bin/stat -c '%u:%g:%a:%h' "$OFFSITE_DIR/.gshsapp-receipts/$BACKUP_NAME.receipt.json")" = 0:0:600:1
/usr/bin/test "$(/usr/bin/stat -c '%u:%g:%a' "$OFFSITE_DIR/.gshsapp-receipts")" = 0:0:700
/usr/bin/python3 /usr/local/lib/gshsapp-operations/bootstrap-backup.py verify-receipt \
  --offsite-dir "$OFFSITE_DIR" --receipt-dir "$OFFSITE_DIR/.gshsapp-receipts" \
  --name "$BACKUP_NAME"
BACKUP_NAME="$BACKUP_NAME" EXPECTED_OFFSITE_RECEIPT_SHA256="$EXPECTED_OFFSITE_RECEIPT_SHA256" \
  /bin/bash /usr/local/lib/gshsapp-operations/pin-offsite-operation.sh import
```

성공하면 검증된 live data tree와 `/opt/gshsapp/bootstrap-complete.json`만 publish하고 앱은 계속 중지되어 있다.

### 6.3 Restore drill과 systemd deploy

Restore drill 관리자 credential은 root 콘솔에서 비표시 입력하고 저장하지 않는다.

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

운영 deploy는 approval 뒤 생성된 exact restore-drill receipt가 없거나 24시간을 넘으면 중단한다. 자세한 사전·사후 검증은 [운영 배포 런북](./production-launch-runbook.md)을 따른다.

## 7. Control 갱신

새 bundle도 1~3절과 같은 OS 검증을 수행한다. 이미 설치된 호스트에서는 새 bundle의 installer를 직접 실행하지 않고, 기존 설치본에 새 source와 새 독립 digest를 전달한다.

```bash
/bin/bash /usr/local/lib/gshsapp-operations/install-root-operations.sh \
  /root/gshsapp-control-bundle-new "$EXPECTED_BOOTSTRAP_SHA256" prod
```

설치 전후 역할은 반드시 같아야 한다. 설치가 끝난 staging bundle은 운영 기록에 digest만 남기고 root 콘솔에서 안전하게 폐기한다.
