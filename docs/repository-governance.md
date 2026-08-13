# 저장소 운영 규칙

이 문서는 저장소 보호와 릴리스 승격 규칙의 정본입니다. 배포 명령은 [운영 배포 런북](./production-launch-runbook.md), 신규 호스트 신뢰 설정은 [Root operations 신뢰 부트스트랩](./root-operations-bootstrap.md)을 따릅니다.

## 1. 신뢰 경계

모든 GitHub Actions job은 GitHub-hosted `ubuntu-latest`에서 실행합니다. Actions가 담당하는 범위는 CI, exact SHA 이미지 publish와 provenance, 공개 URL 검증, semver Release 생성뿐입니다.

- Actions는 테스트·운영 호스트에 로그인하지 않습니다.
- Actions는 호스트의 배포·백업·복원·import를 실행하지 않습니다.
- 테스트·운영 호스트에는 self-hosted runner나 Actions용 Docker 권한 계정을 두지 않습니다.
- 호스트 변경은 OOB로 인증한 root 콘솔과 설치된 `/usr/local/lib/gshsapp-operations` control/systemd unit만 수행합니다.
- 이미지 승격 기준은 mutable `latest`가 아니라 exact `sha-<40-hex>`와 `sha256:<64-hex>` digest입니다.

## 2. `main` 필수 보호 정책

아래 GitHub branch protection 또는 동등한 ruleset이 실제로 활성화되지 않았다면 릴리스 준비 미완료이며 테스트·운영 배포를 시작하지 않습니다.

- 변경은 Pull Request로만 반영
- approving review 최소 1개 필수
- 새 commit이 push되면 오래된 approval 무효화
- 최신 reviewable push 뒤 승인 요구
- 미해결 review conversation이 있으면 merge 금지
- branch가 최신 `main`과 동기화된 상태에서만 merge하는 strict status checks
- 필수 CI:
  - `lint` (`CI` workflow)
  - `test` (`CI` workflow)
  - `firewall-policy` (`CI` workflow)
  - `build` (`CI` workflow)
  - `gitleaks` (`Secret scan` workflow)
- force push 금지
- branch deletion 금지
- 관리자에게도 보호 정책 적용

GitHub UI에 표시되는 check context는 workflow 이름을 함께 표시할 수 있습니다. 규칙을 저장하기 전에 최근 정상 PR에서 위 다섯 job의 실제 context를 정확히 선택하고, 의도적으로 실패시킨 검증 PR이 merge되지 않는지 확인합니다.

## 3. 보호된 GitHub Environments

다음 네 environment를 정확한 이름으로 생성합니다.

| Environment | 사용 workflow | 필수 보호 |
| --- | --- | --- |
| `publish` | `Publish Candidate Image` | `main`만 허용, required reviewer 1명 이상, self-review 방지 |
| `preproduction-verification` | `Preproduction Public Verification` | `main`만 허용, required reviewer 1명 이상, self-review 방지 |
| `production-verification` | `Production Release Verification` | `main`만 허용, required reviewer 1명 이상, self-review 방지 |
| `production-monitor` | `Production Health Monitor` | `main`만 허용, required reviewer 없음(무인 10분 schedule) |

앞의 세 배포 environment에서 보호 규칙/reviewer가 비어 있거나 어느 environment든 `main` 이외 ref가 허용되면 launch blocker입니다. `production-monitor`에 reviewer를 추가해 schedule이 승인 대기 상태가 되는 경우도 운영 blocker입니다.

`.github/CODEOWNERS`의 두 owner가 실제 repository write 권한을 갖는 서로 다른 사람인지 확인하고, workflow·`deploy/`·인증·보안·migration 변경은 작성자가 아닌 CODEOWNER가 승인해야 합니다. 계정이 없거나 동일 운영자를 가리키면 protected-main 승인 근거가 성립하지 않으므로 launch blocker입니다.

`publish`에만 Docker Hub publish용 `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`을 둡니다. 선택적 alert webhook은 `production-monitor` environment secret으로만 두고 repository-scoped 사본은 삭제·회전합니다. 서버 SSH key, root token, runtime `.env`, backup·restore credential은 GitHub Environment나 repository secret에 두지 않습니다. `preproduction-verification`과 `production-verification`은 공개 URL만 검사하며 서버 credential이 필요하지 않습니다.

## 4. 우회 권한

기본 bypass 목록은 비워 둡니다. 저장소 소유자와 관리자도 PR, review, strict CI, conversation resolution을 따라야 합니다.

조직 정책상 비상 bypass가 불가피한 경우에만 다음을 모두 적용합니다.

- 개인이 아닌 최소 인원의 명명된 incident-response team으로 제한
- 평시 비활성 또는 시간 제한 access로 운영
- 사용 사유, 승인자, commit SHA, 시작·종료 시각을 외부 감사 기록에 남김
- 사용 직후 credential 회전, ruleset 복구, 독립 사후 review 수행

서비스 장애는 branch protection 해제 사유가 아닙니다. 호스트 장애는 root 운영 런북으로 복구하고, 긴급 코드 수정도 보호된 PR 흐름을 사용합니다.

## 5. 변경과 merge 흐름

1. 기능 branch에서 변경합니다.
2. 관련 로컬 검증을 실행합니다.
3. `main` 대상 Pull Request를 생성합니다.
4. 변경 설명에 사용자 영향, 보안 영향, 배포·백업 영향을 기록합니다.
5. required checks, 최신 `main` 동기화, review 승인, conversation resolution을 모두 충족합니다.
6. merge 후 `Publish Candidate Image`가 exact SHA 이미지를 만들고 GitHub provenance를 발행합니다.

기본 로컬 검증:

```bash
npm run lint
npm test
npm run build
```

공개 흐름, 인증, 배포에 영향이 있으면 다음도 실행합니다.

```bash
npm run test:e2e:smoke
```

CI가 실패했거나, 기능 회귀가 남았거나, 시크릿이 포함되었거나, 운영 변경이 문서화되지 않았다면 merge하지 않습니다.

## 6. 테스트에서 운영으로 승격

Actions의 검증과 호스트의 root 작업은 서로 다른 승인 경계입니다. 순서는 다음과 같습니다.

1. 보호된 PR을 `main`에 merge합니다.
2. 보호된 `publish` environment에서 exact SHA 이미지 publish와 provenance를 완료합니다.
3. 테스트 호스트 root 콘솔에서 후보를 승인하고, 검증된 offsite backup을 import하고, restore drill을 통과한 뒤 `gshsapp-deploy.service`를 시작합니다.
4. 보호된 `preproduction-verification` environment에서 동일 SHA·digest의 `test.gshs.app` 공개 검증을 완료합니다.
5. 운영 호스트 root 콘솔에서 그 run ID와 동일 SHA·digest를 승인하고, offsite import와 restore drill을 통과한 뒤 `gshsapp-deploy.service`를 시작합니다.
6. 보호된 `production-verification` environment에서 동일 SHA·digest의 테스트·운영 공개 상태를 검증하고 `vX.Y.Z` Release를 생성합니다.

Workflow 성공은 호스트 배포 성공을 의미하지 않습니다. 각 호스트의 approval, import marker, restore-drill receipt, deploy service 결과를 별도로 확인합니다. 같은 semver tag를 다른 SHA에 재사용하지 않습니다.

## 7. 신규 호스트와 자격증명 회전

과거 self-hosted runner를 사용한 호스트는 in-place 전환하지 않습니다. 신뢰 매체로 재이미징하고 다음을 launch blocker로 처리합니다.

- runner service·계정, checkout, Docker state, SSH key 삭제
- 과거 Docker Hub, GitHub, SSH, webhook, Brevo, E2E, runtime secret 전부 폐기·회전
- 새 OOB bootstrap digest 검증과 불변 `test|prod` host role 설치
- root-only config와 최소 read-only GitHub token 설치
- exact `$OFFSITE_DIR/.gshsapp-receipts` 세대 검증, import, restore drill
- branch protection과 세 protected environments의 실제 enforcement 확인

세부 절차는 [서버 신뢰 부트스트랩](./server-bootstrap.md)을 따릅니다.

## 8. 시크릿과 민감 데이터

절대 commit하지 않는 항목:

- `.env`, `.env.local`, 서버 config 원문
- API key, Docker Hub token, GitHub token, SSH private key
- 비밀번호와 E2E credential
- backup archive, receipt 원문, 테스트·운영 DB

문서와 예제에는 `REPLACE_WITH_...` placeholder만 사용합니다. 사고 대응 중에도 실제 값이나 digest가 포함된 private 운영 기록을 PR, Actions artifact, issue에 복사하지 않습니다.

## 9. 문서 갱신

환경 변수, workflow, root control, branch/environment protection, 배포·백업·복원, 서버 bootstrap, semver 정책을 바꾸는 PR은 관련 문서를 같은 PR에서 갱신합니다.

- [README.md](../README.md)
- [DEPLOY.md](../DEPLOY.md)
- [CI/CD 설정](./cicd-setup.md)
- [서버 신뢰 부트스트랩](./server-bootstrap.md)
- [Root operations 신뢰 부트스트랩](./root-operations-bootstrap.md)
- [운영 배포 런북](./production-launch-runbook.md)

AI 에이전트도 [AGENTS.md](../AGENTS.md)와 동일한 보호·검증·문서화 규칙을 따릅니다.
