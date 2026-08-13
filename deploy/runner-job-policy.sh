#!/bin/bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
builtin unset -f printf 2>/dev/null || true
builtin unset BASH_ENV ENV CDPATH GLOBIGNORE

readonly EXPECTED_REPOSITORY="kkwjk2718/gshsapp"
readonly EXPECTED_REF="refs/heads/main"

deny() {
  printf '%s\n' "runner trust policy denied: $1" >&2
  exit 1
}

require_value() {
  local variable_name="$1"
  [[ -n "${!variable_name:-}" ]] || deny "required GitHub context is missing"
}

[[ "$#" -eq 1 ]] || deny "runner role is missing"
readonly runner_role="$1"

for required_variable in \
  GITHUB_REPOSITORY \
  GITHUB_REF \
  GITHUB_REF_PROTECTED \
  GITHUB_WORKFLOW_REF \
  GITHUB_WORKFLOW_SHA \
  GITHUB_SHA \
  GITHUB_EVENT_NAME \
  RUNNER_ENVIRONMENT \
  RUNNER_OS; do
  require_value "$required_variable"
done

[[ "$GITHUB_REPOSITORY" == "$EXPECTED_REPOSITORY" ]] || deny "repository is not trusted"
[[ "$GITHUB_REF" == "$EXPECTED_REF" ]] || deny "only the main branch is trusted"
[[ "$GITHUB_REF_PROTECTED" == "true" ]] || deny "the main ref is not protected"
[[ "$RUNNER_ENVIRONMENT" == "self-hosted" ]] || deny "runner environment is not self-hosted"
[[ "$RUNNER_OS" == "Linux" ]] || deny "runner operating system is not Linux"
[[ -z "${GITHUB_HEAD_REF:-}" && -z "${GITHUB_BASE_REF:-}" ]] || deny "pull request refs are not trusted"
[[ "$GITHUB_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || deny "job SHA is malformed"
[[ "$GITHUB_WORKFLOW_SHA" == "$GITHUB_SHA" ]] || deny "workflow SHA does not match the job SHA"

case "$runner_role" in
  test)
    case "$GITHUB_WORKFLOW_REF" in
      "$EXPECTED_REPOSITORY/.github/workflows/publish-and-deploy-test.yml@$EXPECTED_REF")
        [[ "$GITHUB_EVENT_NAME" == "push" ]] || deny "event is not allowed for the test deployment workflow"
        ;;
      "$EXPECTED_REPOSITORY/.github/workflows/preproduction-rehearsal.yml@$EXPECTED_REF")
        [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] || deny "event is not allowed for rehearsal"
        ;;
      "$EXPECTED_REPOSITORY/.github/workflows/scheduled-backup-test.yml@$EXPECTED_REF")
        [[ "$GITHUB_EVENT_NAME" == "schedule" || "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] || deny "event is not allowed for test backups"
        ;;
      *)
        deny "workflow is not allowlisted for the test runner"
        ;;
    esac
    ;;
  prod)
    case "$GITHUB_WORKFLOW_REF" in
      "$EXPECTED_REPOSITORY/.github/workflows/deploy-prod.yml@$EXPECTED_REF")
        [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] || deny "event is not allowed for production deployment"
        ;;
      "$EXPECTED_REPOSITORY/.github/workflows/scheduled-backup-prod.yml@$EXPECTED_REF")
        [[ "$GITHUB_EVENT_NAME" == "schedule" || "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] || deny "event is not allowed for production backups"
        ;;
      *)
        deny "workflow is not allowlisted for the production runner"
        ;;
    esac
    ;;
  *)
    deny "runner role is not recognized"
    ;;
esac

printf '%s\n' "runner trust policy accepted"
