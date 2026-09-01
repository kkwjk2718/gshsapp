# GitHub Actions CI/CD 설정 가이드

이 문서는 현재 workflow와 GitHub 설정을 설명합니다. 핵심 원칙은 **GitHub-hosted verification, OOB-authenticated root deployment**입니다. Actions는 호스트를 변경하지 않습니다.

## 1. Workflow 역할

| Workflow | Trigger | 역할 |
| --- | --- | --- |
| `ci.yml` | PR, push | lint, test, build, 운영 control 검증 |
| `secret-scan.yml` | PR, push, 수동 | 전체 Git 이력과 checkout gitleaks scan |
| `publish-and-deploy-test.yml` | 보호된 `main` push | exact SHA 이미지 publish와 build provenance 생성 |
| `preproduction-rehearsal.yml` | 수동 | 이미 배포된 테스트 origin의 exact 후보 공개 검증과 proof 생성 |
| `deploy-prod.yml` | 수동 | 이미 배포된 운영 origin 검증과 SHA-bound semver Release 생성 |
| `production-health-monitor.yml` | 10분 schedule | 선택적으로 공개 운영 URL만 조회하고 실패 알림 |

모든 job은 `runs-on: ubuntu-latest`입니다. workflow 이름에 남은 역사적 파일명과 관계없이 `publish-and-deploy-test.yml`은 publish만, `deploy-prod.yml`은 production release verification만 수행합니다.

다음 기능은 GitHub Actions에 없습니다.

- 테스트 또는 운영 호스트 SSH/배포
- Docker socket 또는 `/opt/gshsapp` 접근
- SQLite backup, offsite export, import, restore drill
- root control 설치 또는 systemd 시작

정기 백업은 호스트의 `gshsapp-backup.timer`가 담당합니다. 공개 health monitor schedule과 백업 schedule을 혼동하지 않습니다.

## 2. Docker Hub와 `publish` environment

Docker Hub repository는 `docker.io/kkwjk2718git/gshsapp`입니다. `publish` GitHub Environment에만 다음 secret을 둡니다.

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Token은 해당 repository에 image를 push하는 최소 권한으로 발급하고 일반 repository secret이나 호스트에 복제하지 않습니다. `publish` environment에는 `main` only deployment branch rule, required reviewer 1명 이상, self-review 방지를 설정합니다.

`main` push가 publish하는 유일한 배포 후보 태그는 다음 형식입니다.

```text
sha-<40 lowercase hex commit>
```

Workflow output의 `sha256:<64 lowercase hex>` digest와 GitHub attestation을 함께 기록합니다. mutable `latest` 또는 `main` 태그를 승격 근거로 사용하지 않습니다.

## 3. Protected branch와 environment

`main` branch protection은 최소한 다음을 강제합니다.

- approving review 1개 이상, stale approval dismissal, latest reviewable push 승인
- `ci.yml`의 `lint`, `test`, `firewall-policy`, `build`와 `secret-scan.yml`의 `gitleaks`를 strict required checks로 설정
- review conversation resolution
- force push와 branch deletion 금지
- 관리자에게도 보호 정책 적용, 기본 bypass 목록 비움

현재 workflow가 사용하는 environment 이름은 정확히 다음 넷입니다.

- `publish`
- `preproduction-verification`
- `production-verification`
- `production-monitor`

`publish`, `preproduction-verification`, `production-verification`에는 `main` only branch rule, required reviewer 1명 이상, self-review 방지를 적용합니다. `production-monitor`는 `main` only로 제한하되 10분 schedule이 무인 실행되도록 required reviewer를 두지 않습니다. 하나라도 이 정책과 다르거나 다른 ref가 허용되면 publish·검증·배포를 시작하지 않습니다.

과거 문서의 `test`/`production` deployment environment secret, host deploy gate 변수, E2E 관리자 자격증명은 현재 workflow에서 사용하지 않습니다. 공개 검증 Playwright는 익명 페이지만 실행합니다.

## 4. Publish Candidate Image

보호된 `main` push에서 다음 순서로 실행됩니다.

1. `npm ci`, lint, Vitest, production build
2. exact `${{ github.sha }}` checkout
3. Docker Hub 로그인
4. `sha-${{ github.sha }}` image build/push
5. `org.opencontainers.image.revision=${{ github.sha }}` label 기록
6. GitHub OIDC 기반 build provenance attestation 생성
7. workflow summary에 tag/digest와 `Host deployment performed: no` 기록

이 완료는 후보를 publish했음을 뜻할 뿐 테스트 호스트에 설치됐음을 뜻하지 않습니다.

## 5. 테스트 호스트와 Preproduction Public Verification

Root 운영자가 [Root operations 신뢰 부트스트랩](./root-operations-bootstrap.md)의 순서로 테스트 호스트를 먼저 배포합니다. 그 다음 `Preproduction Public Verification`을 `main`에서 수동 실행합니다.

입력:

- `candidate_sha`: 40자리 commit SHA
- `image_digest`: publish가 출력한 exact digest

Workflow는 다음을 확인합니다.

1. 입력 SHA가 현재 `main` ancestry에 있고 이미지 provenance가 정확함
2. `test.gshs.app/api/health`의 version과 image digest가 입력과 같음
3. `/`, `/menu`, `/notices`가 test origin을 벗어나지 않음
4. 익명 public Playwright suite가 통과함
5. exact run ID/attempt/SHA/control SHA/digest를 담은 7일 보존 proof artifact를 생성함

Host deploy, restore 또는 root operation은 수행하지 않습니다. 운영 승인은 완료 후 24시간 이내의 이 run ID를 사용합니다.

## 6. 운영 호스트와 Production Release Verification

Root 운영자가 preproduction run ID로 운영 후보를 승인하고 운영 호스트의 import·restore drill·systemd deploy까지 완료한 뒤 `Production Release Verification`을 수동 실행합니다.

입력:

- `image_tag=sha-<40-hex commit>`
- `image_digest=sha256:<64-hex>`

Workflow는 같은 후보가 `test.gshs.app`과 `gshs.app` 양쪽에 배포됐는지 확인하고 익명 public E2E를 실행한 뒤 exact proof만 게시합니다. 기본 브랜치에 고정된 별도 `workflow_run` publisher가 성공 run·현재 `main`·proof·provenance·공개 production identity를 다시 검증한 뒤에만 `package.json` version의 `vX.Y.Z` Release를 exact commit에 생성하거나 갱신합니다. 같은 semver tag가 다른 commit에 묶여 있으면 중단합니다.

이 workflow도 호스트를 변경하지 않습니다. `production-verification` 승인은 이미 수행된 root 배포를 공개 검증하고 Release를 허용하는 gate입니다.

## 7. Public health monitor

Repository variable `PRODUCTION_MONITOR_ENABLED=true`일 때만 `production-health-monitor.yml`이 `https://gshs.app/api/health`와 `/`를 조회합니다. 실패 알림이 필요하면 `main` only·required-reviewer 없음 정책의 `production-monitor` environment에만 environment secret `MONITOR_ALERT_WEBHOOK_URL`을 설정합니다. 같은 이름의 repository secret은 삭제하고 기존 값은 회전합니다.

이 schedule은 공개 HTTPS GET만 수행합니다. 앱 host, DB, backup 또는 systemd에 접근하지 않습니다.

## 8. 호스트 측 GitHub read token

`approve-release.sh`는 Actions secret이 아니라 각 호스트의 root-only 파일을 읽습니다.

```text
/etc/gshsapp-operations/github-token  root:root 0600
```

이 token은 현재 보호된 `main`, branch protection, workflow run/artifact, attestation을 읽는 데 필요한 최소 read 권한만 가집니다. Docker Hub push 권한과 repository write 권한을 부여하지 않습니다. 값은 secret manager에서 root 콘솔로 전달하며 문서, command line, shell history 또는 Actions log에 쓰지 않습니다.

## 9. 첫 수동 실행 전 차단 조건

다음 항목이 하나라도 남으면 publish 이후의 운영 절차를 시작하지 않습니다.

- 과거 노출 credential/session 회전과 Actions artifact 삭제 미완료
- 공개 Git 이력 정리 및 full-history gitleaks scan 미완료
- 과거 self-hosted runner service, 등록 토큰, deploy key 또는 broker credential 미폐기
- `main`의 review/strict CI/conversation/admin enforcement, 세 배포 environment의 reviewer 보호, 또는 monitor environment의 `main` only 무인 정책 미구성
- Docker Hub publish token 최소 권한/회전 미완료
- fresh host의 OOB control bootstrap, SSH/UFW, runtime config 미검증
- `$OFFSITE_DIR/.gshsapp-receipts` 세대와 별도 receipt digest 기록, fresh import marker, restore-drill receipt 미확보

호스트 실행 순서는 [운영 배포 런북](./production-launch-runbook.md)을 따릅니다.

## 10. 문제 확인 순서

Publish 문제:

1. `ci.yml`/`secret-scan.yml` required check
2. `publish` environment approval/branch rule
3. Docker Hub secret과 repository 권한
4. image digest 및 attestation

공개 verification 문제:

1. workflow input과 현재 protected `main` SHA
2. `/api/health` version/digest
3. test/production origin redirect 경계
4. protected environment approval

호스트 배포 문제는 Actions runner 상태가 아니라 다음을 확인합니다.

1. `systemctl status gshsapp-deploy.service`
2. `journalctl -u gshsapp-deploy.service`
3. 설치된 control manifest와 `/etc/gshsapp-operations/deploy.env`
4. lifecycle phase와 offsite receipt
5. Docker/health 응답

## 관련 문서

- [DEPLOY.md](../DEPLOY.md)
- [Root operations 신뢰 부트스트랩](./root-operations-bootstrap.md)
- [운영 배포 런북](./production-launch-runbook.md)
- [배포 자산 안내](../deploy/README.md)
