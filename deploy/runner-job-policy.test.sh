#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
POLICY="$SCRIPT_DIR/runner-job-policy.sh"
REPOSITORY="kkwjk2718/gshsapp"
MAIN_REF="refs/heads/main"
MAIN_SHA="0123456789abcdef0123456789abcdef01234567"

run_policy() {
  local role="$1"
  local workflow="$2"
  local event="$3"
  shift 3

  env -i \
    PATH="/usr/bin:/bin" \
    GITHUB_REPOSITORY="$REPOSITORY" \
    GITHUB_REF="$MAIN_REF" \
    GITHUB_REF_PROTECTED="true" \
    GITHUB_WORKFLOW_REF="$REPOSITORY/.github/workflows/$workflow@$MAIN_REF" \
    GITHUB_WORKFLOW_SHA="$MAIN_SHA" \
    GITHUB_SHA="$MAIN_SHA" \
    GITHUB_EVENT_NAME="$event" \
    GITHUB_HEAD_REF="" \
    GITHUB_BASE_REF="" \
    RUNNER_ENVIRONMENT="self-hosted" \
    RUNNER_OS="Linux" \
    "$@" \
    "$POLICY" "$role"
}

expect_denied() {
  local description="$1"
  shift
  local output
  if output="$("$@" 2>&1)"; then
    echo "Expected policy denial: $description" >&2
    exit 1
  fi
  [[ "$output" == *"runner trust policy denied"* ]] || {
    echo "Policy denial was not fail-closed for $description: $output" >&2
    exit 1
  }
}

run_policy test publish-and-deploy-test.yml push
run_policy test preproduction-rehearsal.yml workflow_dispatch
run_policy test scheduled-backup-test.yml schedule
run_policy test scheduled-backup-test.yml workflow_dispatch
run_policy prod deploy-prod.yml workflow_dispatch
run_policy prod scheduled-backup-prod.yml schedule
run_policy prod scheduled-backup-prod.yml workflow_dispatch

expect_denied "feature branch" run_policy test publish-and-deploy-test.yml push \
  GITHUB_REF=refs/heads/security/attacker \
  GITHUB_WORKFLOW_REF="$REPOSITORY/.github/workflows/publish-and-deploy-test.yml@refs/heads/security/attacker"

expect_denied "tag ref" run_policy prod deploy-prod.yml workflow_dispatch \
  GITHUB_REF=refs/tags/v9.9.9 \
  GITHUB_WORKFLOW_REF="$REPOSITORY/.github/workflows/deploy-prod.yml@refs/tags/v9.9.9"

expect_denied "pull request event" run_policy test publish-and-deploy-test.yml pull_request \
  GITHUB_REF=refs/pull/77/merge \
  GITHUB_HEAD_REF=attacker-branch \
  GITHUB_BASE_REF=main

expect_denied "wrong test workflow" run_policy test deploy-prod.yml workflow_dispatch
expect_denied "wrong production workflow" run_policy prod preproduction-rehearsal.yml workflow_dispatch
expect_denied "wrong repository" run_policy test publish-and-deploy-test.yml push \
  GITHUB_REPOSITORY=attacker/gshsapp \
  GITHUB_WORKFLOW_REF="attacker/gshsapp/.github/workflows/publish-and-deploy-test.yml@$MAIN_REF"
expect_denied "unprotected main" run_policy test publish-and-deploy-test.yml push GITHUB_REF_PROTECTED=false
expect_denied "workflow SHA mismatch" run_policy test publish-and-deploy-test.yml push \
  GITHUB_WORKFLOW_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
expect_denied "GitHub-hosted context" run_policy test publish-and-deploy-test.yml push RUNNER_ENVIRONMENT=github-hosted
expect_denied "missing event" run_policy test publish-and-deploy-test.yml push GITHUB_EVENT_NAME=
expect_denied "missing workflow ref" run_policy test publish-and-deploy-test.yml push GITHUB_WORKFLOW_REF=
expect_denied "unknown runner role" run_policy staging publish-and-deploy-test.yml push
expect_denied "imported shell function override" run_policy test publish-and-deploy-test.yml push \
  'BASH_FUNC_printf%%=() { :; }' \
  GITHUB_REF=refs/heads/attacker

echo "runner job policy tests: ok"
