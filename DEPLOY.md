# GSHS.app 배포 가이드

이 문서는 현재 저장소의 배포 신뢰 경계와 운영 순서를 요약합니다. 실행 명령은 [Root operations 신뢰 부트스트랩](./docs/root-operations-bootstrap.md), 운영 판단은 [운영 배포 런북](./docs/production-launch-runbook.md)을 따릅니다.

## 1. 신뢰 경계

- 모든 GitHub Actions job은 GitHub-hosted `ubuntu-latest`에서 실행됩니다.
- Actions는 CI, `main` 후보 이미지 publish·attestation, 이미 배포된 공개 origin 검증, GitHub Release, 공개 health monitor만 담당합니다.
- Actions는 테스트·운영 호스트에 SSH하지 않고 Docker socket, `/opt/gshsapp`, runtime secret, SQLite 또는 백업 저장소에 접근하지 않습니다.
- 호스트 변경은 OOB(out-of-band) digest를 확인한 root 운영자가 설치된 `/usr/local/lib/gshsapp-operations` control과 root-only systemd unit으로만 수행합니다.
- 과거 self-hosted runner, runner 등록 토큰, 배포 계정·broker 자격증명은 새 호스트로 옮기지 않습니다.

## 2. 전체 승격 흐름

1. PR/push에서 `ci.yml`과 `secret-scan.yml`이 검증됩니다.
2. 보호된 `main` push가 `publish-and-deploy-test.yml`에서 `sha-<40-hex>` 이미지를 publish하고 GitHub build provenance를 생성합니다.
3. root 운영자가 후보 SHA/digest와 OOB control bundle을 검증하고 테스트 호스트에서 승인·import·restore drill·systemd deploy를 수행합니다.
4. `preproduction-rehearsal.yml`을 수동 실행해 이미 설치된 `test.gshs.app`의 정확한 version/digest와 익명 공개 흐름을 확인하고 24시간 유효 proof를 만듭니다.
5. root 운영자가 그 proof의 run ID로 운영 후보를 승인하고 운영 호스트에서 같은 순서를 수행합니다.
6. 운영 공개 확인 뒤 `deploy-prod.yml`을 수동 실행하면 정확한 테스트·운영 후보를 재검증하고 SHA-bound semver Release를 생성합니다. 이 workflow는 호스트를 배포하지 않습니다.

실제 서버 배포 기준은 태그 이름만이 아니라 다음 세 값의 결합입니다.

- 보호된 `main`의 정확한 40자리 commit SHA
- `sha-<commit>` 이미지 태그
- registry가 반환하고 attestation이 결합된 `sha256:<64-hex>` manifest digest

## 3. GitHub-hosted workflow

| 파일 | 역할 | 호스트 변경 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | lint, test, build, 운영 control 테스트 | 없음 |
| `.github/workflows/secret-scan.yml` | 전체 Git 이력과 checkout secret scan | 없음 |
| `.github/workflows/publish-and-deploy-test.yml` | `main` 후보 publish와 provenance | 없음 |
| `.github/workflows/preproduction-rehearsal.yml` | 배포 완료된 테스트 origin 공개 검증과 proof 생성 | 없음 |
| `.github/workflows/deploy-prod.yml` | 배포 완료된 운영 origin 검증과 GitHub Release | 없음 |
| `.github/workflows/production-health-monitor.yml` | 선택적 공개 HTTP health 조회 | 없음 |

GitHub Actions 기반 정기 백업 workflow는 없습니다. 백업은 호스트의 `gshsapp-backup.timer`가 수행합니다.

## 4. 호스트 파일과 서비스

```text
/usr/local/lib/gshsapp-operations/  # root:root 0700, manifest와 control은 0400
/etc/gshsapp-operations/
  host-role                         # root:root 0400, test 또는 prod
  deploy.env                        # root:root 0600, 후보·origin·network·offsite policy
  backup.env                        # root:root 0600, offsite·retention policy
  github-token                      # root:root 0600, 승인 시 사용하는 read-only token
/opt/gshsapp/
  .env                              # root:root 0600, 앱 runtime secret
  data/                             # 61001:61001 0700
  backup/                           # 61001:61001 0700
  root-backup/                      # root:root 0700, offsite receipt 대상
$OFFSITE_DIR/                       # root:root 0700, 별도 exact mount
  .gshsapp-receipts/                # root:root 0700, immutable/versioned receipt
```

설치되는 unit:

- `gshsapp-deploy.service`: root 콘솔에서만 `systemctl start`하는 단발 배포 transaction
- `gshsapp-docker-user-firewall.service`: Docker 시작 뒤 exact bridge ingress 정책을 적용·검증
- `gshsapp-backup.service`: writer를 정지하고 완전 백업·offsite export·receipt 검증을 수행
- `gshsapp-backup.timer`: 매일 예약과 1시간 재확인으로 backup service를 시작하며, offsite pair를 검증하는 freshness gate가 writer 정지 전에 중복 생성을 막음

두 작업은 `/run/lock/gshsapp/lifecycle.lock`을 공유하며, 비정상 종료 시 설치된 recovery helper가 durable phase를 기준으로 writer를 복구하거나 격리합니다.

## 5. 설정 파일 역할

`/opt/gshsapp/.env`에는 앱 runtime 값만 둡니다. 운영 환경의 URL 세 값은 모두 `https://gshs.app`, 테스트 환경은 모두 `https://test.gshs.app`이어야 하며 `DATABASE_URL=file:/app/data/dev.db`를 유지합니다. 실제 secret을 문서, 저장소, Actions 입력 또는 shell history에 쓰지 않습니다.

`/etc/gshsapp-operations/deploy.env`는 다음 required key를 정확히 포함합니다.

- `IMAGE_TAG`, `IMAGE_DIGEST`, `EXPECTED_APP_ORIGIN`
- `HOST_BIND_IP`, `SSH_SOURCE_CIDR`, `PROXY_SOURCE_CIDR`, `PROTECTED_INTERNAL_CIDRS`
- `OFFSITE_DIR`, `OFFSITE_MOUNT_SOURCE`, `OFFSITE_FSTYPE`, `OFFSITE_REQUIRED_OPTIONS`

`HOST_PORT`, `BACKUP_MAX_AGE_HOURS`, smoke timeout/interval, 검토된 non-RFC1918 topology의 `ALLOW_PUBLIC_BIND=true`만 선택적으로 허용됩니다. 알 수 없는 키, quote, 공백, 중복 키와 CRLF는 거부됩니다.

`backup.env`는 같은 offsite mount identity와 retention/freshness 값만 허용합니다. `OFFSITE_DIR`은 root:root `0700`의 실제 mountpoint여야 하고 `/opt/gshsapp`와 다른 filesystem이어야 합니다.

## 6. 새 호스트의 필수 순서

순서를 바꾸지 않습니다.

1. 호스트 재이미징과 과거 runner/credential 제거
2. 독립 채널 digest로 root bootstrap manifest 확인 후 control 설치
3. host role, `.env`, `deploy.env`, `backup.env`, GitHub read token, offsite mount, SSH/UFW 구성
4. 설치된 control로 backup timer와 deploy service 설치
5. 정확한 후보를 `approve-release.sh`로 승인
6. `$OFFSITE_DIR/.gshsapp-receipts`의 기존 receipt와 archive/metadata를 별도 기록의 receipt digest와 대조하고 빈 data root에 `import-backup.sh` 실행
7. 같은 후보와 검증된 fresh offsite 세대로 `restore-drill.sh` 실행
8. `systemctl start gshsapp-deploy.service`

운영 승인은 24시간 이내의 정확한 preproduction verification run ID도 요구합니다. 자세한 placeholder 명령은 [docs/root-operations-bootstrap.md](./docs/root-operations-bootstrap.md)에 있습니다.

## 7. SQLite, 백업, 복구

- 라이브 DB는 `/app/data/dev.db` 하나이며 raw `cp`로 백업하거나 복원하지 않습니다.
- 정기 백업은 writer를 quiesce한 뒤 canonical archive/metadata pair를 만들고 exact offsite mount에 복사한 뒤 root-owned receipt를 기록합니다.
- pre-deployment backup은 기존 web을 중지된 상태로 보존하면서 후보 migration을 격리 검증합니다.
- durable `schema-transition` 이후에는 구 바이너리를 새 스키마에 자동 재시작하지 않습니다.
- restore drill은 offsite 세대를 임시 격리 환경에서 migration·health·인증까지 검사하며 라이브 DB를 덮어쓰지 않습니다.
- fresh-host import만 빈 `/opt/gshsapp/data`에 검증된 세대를 원자 승격하고 bootstrap marker를 만듭니다.

배포 실패 후 임의로 `docker compose up`하거나 과거 digest를 재시작하지 않습니다. lifecycle phase와 recovery 결과를 확인한 뒤 같은 강화 후보를 재실행하거나 별도 승인된 stopped-service 복구를 수행합니다.

## 8. 배포 전 체크리스트

- [ ] 모든 노출 credential과 세션이 회전·폐기됨
- [ ] 공개 Git 이력 정리와 full-history/working-tree secret scan이 완료됨
- [ ] 과거 self-hosted runner 서비스·등록 토큰·배포 자격증명이 제거됨
- [ ] `main`의 review/strict CI/conversation/admin enforcement와 force-push/deletion 금지가 구성됨
- [ ] `publish`, `preproduction-verification`, `production-verification`이 `main` only와 required reviewer로 보호되고, `production-monitor`는 `main` only·reviewer 없음으로 무인 실행 가능함
- [ ] OOB bootstrap digest와 설치된 control manifest가 검증됨
- [ ] exact SSH/admin CIDR의 UFW 정책과 proxy CIDR의 UFW/`DOCKER-USER` 정책이 두 번째 key-only 세션에서 검증됨
- [ ] runtime `.env`와 root config의 소유권·mode·origin이 정확함
- [ ] offsite archive/metadata, `$OFFSITE_DIR/.gshsapp-receipts`, 별도 기록의 receipt digest가 검증됨
- [ ] 동일 후보의 fresh approval, import marker, restore-drill receipt가 존재함

## 관련 문서

- [GitHub Actions CI/CD 설정](./docs/cicd-setup.md)
- [Root operations 신뢰 부트스트랩](./docs/root-operations-bootstrap.md)
- [운영 배포 런북](./docs/production-launch-runbook.md)
- [인프라 보안 런북](./docs/infrastructure-security-runbook.md)
- [배포 자산 안내](./deploy/README.md)
