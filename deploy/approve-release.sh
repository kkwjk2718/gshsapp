#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/sbin:/usr/bin:/sbin:/bin
LC_ALL=C
export PATH LC_ALL
IFS=$' \t\n'
umask 077

CANDIDATE_SHA="${1:?Usage: approve-release.sh CANDIDATE_SHA IMAGE_DIGEST [PREPRODUCTION_RUN_ID]}"
IMAGE_DIGEST="${2:?Image digest is required}"
PREPRODUCTION_RUN_ID="${3:-}"
CONTROL_ROOT=/usr/local/lib/gshsapp-operations
DEPLOY_ROOT=/opt/gshsapp
TOKEN_FILE=/etc/gshsapp-operations/github-token
HOST_ROLE_FILE=/etc/gshsapp-operations/host-role
LOCK_ROOT=/run/lock/gshsapp
WORKFLOW_POLICY=$CONTROL_ROOT/workflow-policy.sha256
IMAGE_REPOSITORY=docker.io/kkwjk2718git/gshsapp
REPOSITORY=kkwjk2718/gshsapp

fail() { printf '%s\n' "Release approval refused: $1" >&2; exit 1; }
[[ "$(id -u)" == "0" ]] || fail "trusted root console is required"
current_script="$(readlink -f -- "${BASH_SOURCE[0]}")" || fail "approval control path cannot be resolved"
[[ "$current_script" == "$CONTROL_ROOT/approve-release.sh" ]] || fail "run only the installed authenticated approval control"
[[ -f "$current_script" && ! -L "$current_script" && "$(stat -c '%u:%g:%a:%h' "$current_script")" == "0:0:400:1" ]] || fail "installed approval control is unsafe"
/usr/bin/install -d -o root -g root -m 0700 "$LOCK_ROOT"
[[ -d "$LOCK_ROOT" && ! -L "$LOCK_ROOT" && "$(stat -c '%u:%g:%a' "$LOCK_ROOT")" == "0:0:700" ]] || fail "lifecycle lock directory is unsafe"
exec 9>"$LOCK_ROOT/lifecycle.lock"
/usr/bin/chown root:root "$LOCK_ROOT/lifecycle.lock"
/usr/bin/chmod 0600 "$LOCK_ROOT/lifecycle.lock"
[[ -f "$LOCK_ROOT/lifecycle.lock" && ! -L "$LOCK_ROOT/lifecycle.lock" && "$(stat -c '%u:%g:%a:%h' "$LOCK_ROOT/lifecycle.lock")" == "0:0:600:1" ]] || fail "lifecycle lock is unsafe"
/usr/bin/flock -n 9 || fail "another lifecycle operation is active"
/bin/bash "$CONTROL_ROOT/install-root-operations.sh" --verify-installed || fail "installed root controls failed verification"
[[ "$#" -ge 2 && "$#" -le 3 && "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ && "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "release identity is malformed"
[[ -f "$HOST_ROLE_FILE" && ! -L "$HOST_ROLE_FILE" && "$(stat -c '%u:%g:%a' "$HOST_ROLE_FILE")" == "0:0:400" ]] || fail "immutable host role is unavailable"
HOST_ROLE="$(<"$HOST_ROLE_FILE")"
[[ "$HOST_ROLE" == "test" || "$HOST_ROLE" == "prod" ]] || fail "immutable host role is invalid"
if [[ "$HOST_ROLE" == "prod" ]]; then
  [[ "$#" == "3" && "$PREPRODUCTION_RUN_ID" =~ ^[1-9][0-9]{0,19}$ ]] || fail "production approval requires the exact preproduction verification run ID"
else
  [[ "$#" == "2" ]] || fail "test approval does not accept a preproduction run ID"
fi
[[ -f "$TOKEN_FILE" && ! -L "$TOKEN_FILE" && "$(stat -c '%u:%g:%a' "$TOKEN_FILE")" == "0:0:600" ]] || fail "root GitHub read token is unavailable"
GH_TOKEN_VALUE="$(<"$TOKEN_FILE")"
[[ "$GH_TOKEN_VALUE" != *$'\n'* && ${#GH_TOKEN_VALUE} -ge 20 ]] || fail "root GitHub token is malformed"
safe_home="$(mktemp -d /run/gshsapp-release-home.XXXXXX)"
manifest="$(mktemp /run/gshsapp-manifest.XXXXXX)"
proof_zip="$(mktemp /run/gshsapp-proof.XXXXXX)"
protection_json="$(mktemp /run/gshsapp-protection.XXXXXX)"
checks_json="$(mktemp /run/gshsapp-check-runs.XXXXXX)"
candidate_controls="$(mktemp /run/gshsapp-candidate-controls.XXXXXX)"
trusted_runs="$(mktemp /run/gshsapp-trusted-runs.XXXXXX)"
candidate_workflow="$(mktemp /run/gshsapp-candidate-workflow.XXXXXX)"
workflow_directory="$(mktemp /run/gshsapp-workflow-directory.XXXXXX)"
trap 'rm -rf -- "$safe_home" "$manifest" "$proof_zip" "$protection_json" "$checks_json" "$candidate_controls" "$trusted_runs" "$candidate_workflow" "$workflow_directory"' EXIT

main_json="$(env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" /usr/bin/timeout 30 /usr/bin/gh api --method GET "repos/$REPOSITORY/git/ref/heads/main")" || fail "protected main ref could not be resolved"
main_sha="$(MAIN_JSON="$main_json" /usr/bin/python3 -c 'import json,os,re,sys; v=json.loads(os.environ["MAIN_JSON"]); s=v.get("object",{}).get("sha"); isinstance(s,str) and re.fullmatch(r"[0-9a-f]{40}",s) or sys.exit(1); print(s)')" || fail "main ref response is malformed"
[[ "$main_sha" == "$CANDIDATE_SHA" ]] || fail "candidate is not the current protected main tip"
env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" \
  /usr/bin/timeout 30 /usr/bin/gh api --method GET "repos/$REPOSITORY/branches/main/protection" \
  >"$protection_json" || fail "main protection could not be verified"
validate_main_protection() {
PROTECTION_FILE="$protection_json" /usr/bin/python3 - <<'PY'
import json, os, re
path=os.environ["PROTECTION_FILE"]
size=os.path.getsize(path)
if size < 2 or size > 262144: raise SystemExit(1)
with open(path,encoding="utf-8") as source: value=json.load(source)
if not isinstance(value,dict): raise SystemExit(1)
checks=value.get("required_status_checks")
reviews=value.get("required_pull_request_reviews")
enforce=value.get("enforce_admins")
conversations=value.get("required_conversation_resolution")
force=value.get("allow_force_pushes")
deletions=value.get("allow_deletions")
if not isinstance(checks,dict) or checks.get("strict") is not True: raise SystemExit(1)
contexts=set()
for item in checks.get("contexts",[]):
    if isinstance(item,str): contexts.add(item)
for item in checks.get("checks",[]):
    if isinstance(item,dict) and isinstance(item.get("context"),str) and item.get("app_id")==15368: contexts.add(item["context"])
required={"lint","test","firewall-policy","build","gitleaks"}
def present(job):
    return any(context==job or context.endswith(" / "+job) for context in contexts)
if not all(present(job) for job in required): raise SystemExit(1)
if not isinstance(reviews,dict) or not isinstance(reviews.get("required_approving_review_count"),int) or reviews["required_approving_review_count"] < 1: raise SystemExit(1)
if reviews.get("dismiss_stale_reviews") is not True or reviews.get("require_code_owner_reviews") is not True or reviews.get("require_last_push_approval") is not True: raise SystemExit(1)
bypass=reviews.get("bypass_pull_request_allowances")
if not isinstance(bypass,dict) or set(bypass)!={"users","teams","apps"}: raise SystemExit(1)
if any(not isinstance(bypass[key],list) or bypass[key] for key in ("users","teams","apps")): raise SystemExit(1)
if not isinstance(enforce,dict) or enforce.get("enabled") is not True: raise SystemExit(1)
if not isinstance(conversations,dict) or conversations.get("enabled") is not True: raise SystemExit(1)
if not isinstance(force,dict) or force.get("enabled") is not False: raise SystemExit(1)
if not isinstance(deletions,dict) or deletions.get("enabled") is not False: raise SystemExit(1)
PY
}
validate_main_protection || fail "main protection is weaker than the reviewed release policy"

env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" \
  /usr/bin/timeout 30 /usr/bin/gh api --method GET \
  -H 'Accept: application/vnd.github+json' \
  "repos/$REPOSITORY/commits/$CANDIDATE_SHA/check-runs?filter=latest&per_page=100" \
  >"$checks_json" || fail "candidate required checks could not be verified"
CHECKS_FILE="$checks_json" EXPECTED_SHA="$CANDIDATE_SHA" EXPECTED_REPOSITORY="$REPOSITORY" /usr/bin/python3 - "$trusted_runs" <<'PY' || fail "candidate did not complete the exact trusted required checks"
import json, os, re, sys
path=os.environ["CHECKS_FILE"]
if os.path.getsize(path)<2 or os.path.getsize(path)>1048576: raise SystemExit(1)
with open(path,encoding="utf-8") as source: value=json.load(source)
runs=value.get("check_runs") if isinstance(value,dict) else None
if not isinstance(runs,list) or len(runs)>100: raise SystemExit(1)
required={"lint","test","firewall-policy","build","gitleaks"}
seen=set()
details_prefix=f"https://github.com/{os.environ['EXPECTED_REPOSITORY']}/actions/runs/"
records=[]
for run in runs:
    if not isinstance(run,dict): continue
    name=run.get("name")
    app=run.get("app")
    if name not in required or name in seen: continue
    if not (
        run.get("head_sha")==os.environ["EXPECTED_SHA"]
        and run.get("status")=="completed"
        and run.get("conclusion")=="success"
        and isinstance(app,dict)
        and app.get("id")==15368
        and app.get("slug")=="github-actions"
        and isinstance(run.get("details_url"),str)
        and re.fullmatch(re.escape(details_prefix)+r"([1-9][0-9]{0,19})/job/[1-9][0-9]{0,19}",run["details_url"])
    ): raise SystemExit(1)
    run_id=int(re.fullmatch(re.escape(details_prefix)+r"([1-9][0-9]{0,19})/job/[1-9][0-9]{0,19}",run["details_url"]).group(1))
    seen.add(name)
    records.append({"job":name,"runId":run_id})
if seen!=required: raise SystemExit(1)
with open(sys.argv[1],"w",encoding="utf-8",newline="\n") as output:
    json.dump(records,output,separators=(",",":"));output.write("\n")
PY

TRUSTED_RUNS_FILE="$trusted_runs" EXPECTED_SHA="$CANDIDATE_SHA" EXPECTED_REPOSITORY="$REPOSITORY" \
  PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" \
  /usr/bin/python3 - <<'PY' || fail "required checks were not produced by the exact trusted workflows"
import json, os, subprocess
with open(os.environ["TRUSTED_RUNS_FILE"],encoding="utf-8") as source: records=json.load(source)
mapping={"lint":".github/workflows/ci.yml","test":".github/workflows/ci.yml","firewall-policy":".github/workflows/ci.yml","build":".github/workflows/ci.yml","gitleaks":".github/workflows/secret-scan.yml"}
cache={}
for record in records:
    run_id=record["runId"]
    if run_id not in cache:
        process=subprocess.run(
            ["/usr/bin/timeout","30","/usr/bin/gh","api","--method","GET",f"repos/{os.environ['EXPECTED_REPOSITORY']}/actions/runs/{run_id}"],
            check=True,capture_output=True,text=True,env={"PATH":os.environ["PATH"],"LC_ALL":"C","HOME":os.environ["HOME"],"XDG_CONFIG_HOME":os.environ["XDG_CONFIG_HOME"],"GH_TOKEN":os.environ["GH_TOKEN"]},
        )
        cache[run_id]=json.loads(process.stdout)
    run=cache[run_id]
    if not (
        run.get("path")==mapping[record["job"]]
        and run.get("event")=="push"
        and run.get("head_branch")=="main"
        and run.get("head_sha")==os.environ["EXPECTED_SHA"]
        and run.get("status")=="completed"
        and run.get("conclusion")=="success"
        and run.get("repository",{}).get("full_name")==os.environ["EXPECTED_REPOSITORY"]
        and isinstance(run.get("run_attempt"),int)
        and 1 <= run["run_attempt"] <= 1000
    ): raise SystemExit(1)
PY

env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" \
  /usr/bin/timeout 30 /usr/bin/gh api --method GET \
  -H 'Accept: application/vnd.github.raw+json' \
  "repos/$REPOSITORY/contents/deploy/control-assets.sha256?ref=$CANDIDATE_SHA" \
  >"$candidate_controls" || fail "candidate control manifest could not be retrieved"
[[ "$(( $(stat -c '%s' "$candidate_controls") ))" -ge 1 && "$(( $(stat -c '%s' "$candidate_controls") ))" -le 131072 ]] || fail "candidate control manifest size is unsafe"
cmp -s -- "$candidate_controls" "$CONTROL_ROOT/control-assets.sha256" || fail "candidate requires a different OOB root control bundle; reinstall reviewed controls first"

[[ -f "$WORKFLOW_POLICY" && ! -L "$WORKFLOW_POLICY" && "$(stat -c '%u:%g:%a:%h' "$WORKFLOW_POLICY")" == "0:0:400:1" ]] || {
  fail "installed hosted-workflow policy is missing or unsafe"
}
readonly -a REVIEWED_WORKFLOWS=(
  .github/workflows/ci.yml
  .github/workflows/deploy-prod.yml
  .github/workflows/preproduction-rehearsal.yml
  .github/workflows/production-health-monitor.yml
  .github/workflows/publish-and-deploy-test.yml
  .github/workflows/publish-production-release.yml
  .github/workflows/secret-scan.yml
)
env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" \
  /usr/bin/timeout 30 /usr/bin/gh api --method GET \
  -H 'Accept: application/vnd.github+json' \
  "repos/$REPOSITORY/contents/.github/workflows?ref=$CANDIDATE_SHA" \
  >"$workflow_directory" || fail "candidate workflow directory could not be listed"
EXPECTED_WORKFLOWS="$(printf '%s\n' "${REVIEWED_WORKFLOWS[@]}")" WORKFLOW_DIRECTORY="$workflow_directory" \
  /usr/bin/python3 - <<'PY' || fail "candidate workflow directory differs from the OOB-approved exact workflow set"
import json
import os

path = os.environ["WORKFLOW_DIRECTORY"]
size = os.path.getsize(path)
if size < 2 or size > 262144:
    raise SystemExit(1)
with open(path, encoding="utf-8") as source:
    values = json.load(source)
if not isinstance(values, list) or len(values) > 32:
    raise SystemExit(1)
expected = os.environ["EXPECTED_WORKFLOWS"].splitlines()
actual = []
for value in values:
    if not isinstance(value, dict) or set(value) & {"path", "type", "size"} != {"path", "type", "size"}:
        raise SystemExit(1)
    relative = value["path"]
    if (
        not isinstance(relative, str)
        or value["type"] != "file"
        or not isinstance(value["size"], int)
        or not 1 <= value["size"] <= 1048576
        or not relative.startswith(".github/workflows/")
        or "/" in relative[len(".github/workflows/"):]
        or not relative.endswith(".yml")
    ):
        raise SystemExit(1)
    actual.append(relative)
if sorted(actual) != sorted(expected) or len(actual) != len(set(actual)):
    raise SystemExit(1)
PY
mapfile -t workflow_policy_lines <"$WORKFLOW_POLICY"
[[ "${#workflow_policy_lines[@]}" == "${#REVIEWED_WORKFLOWS[@]}" ]] || fail "installed hosted-workflow policy is incomplete"
for workflow_index in "${!REVIEWED_WORKFLOWS[@]}"; do
  workflow_line="${workflow_policy_lines[$workflow_index]%$'\r'}"
  [[ "$workflow_line" =~ ^([0-9a-f]{64})\ \ (\.github/workflows/[A-Za-z0-9._-]+\.yml)$ ]] || {
    fail "installed hosted-workflow policy is malformed"
  }
  expected_workflow_digest="${BASH_REMATCH[1]}"
  workflow_path="${BASH_REMATCH[2]}"
  [[ "$workflow_path" == "${REVIEWED_WORKFLOWS[$workflow_index]}" ]] || fail "installed hosted-workflow policy contains an unexpected path"
  : >"$candidate_workflow"
  env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" \
    /usr/bin/timeout 30 /usr/bin/gh api --method GET \
    -H 'Accept: application/vnd.github.raw+json' \
    "repos/$REPOSITORY/contents/$workflow_path?ref=$CANDIDATE_SHA" \
    >"$candidate_workflow" || fail "candidate security workflow could not be retrieved"
  actual_workflow_digest="$(/usr/bin/python3 - "$candidate_workflow" <<'PY'
import hashlib
import os
import sys

path = sys.argv[1]
size = os.path.getsize(path)
if size < 1 or size > 1048576:
    raise SystemExit(1)
with open(path, "rb") as source:
    contents = source.read(1048577)
if len(contents) != size or b"\r" in contents:
    raise SystemExit(1)
contents.decode("utf-8")
print(hashlib.sha256(contents).hexdigest())
PY
)" || fail "candidate security workflow bytes are unsafe"
  [[ "$actual_workflow_digest" == "$expected_workflow_digest" ]] || {
    fail "candidate security workflow differs from the OOB-approved workflow policy"
  }
done

repository_path="${IMAGE_REPOSITORY#docker.io/}"
token_json="$(env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" /usr/bin/curl --disable --silent --show-error --fail --max-time 30 --proto '=https' --tlsv1.2 --noproxy '*' --get --data-urlencode service=registry.docker.io --data-urlencode "scope=repository:$repository_path:pull" https://auth.docker.io/token)" || fail "registry token retrieval failed"
registry_token="$(TOKEN_JSON="$token_json" /usr/bin/python3 -c 'import json,os,sys; v=json.loads(os.environ["TOKEN_JSON"]).get("token"); isinstance(v,str) and len(v)>20 or sys.exit(1); print(v)')" || fail "registry token is malformed"
headers="$(env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" /usr/bin/curl --disable --silent --show-error --fail --max-time 60 --proto '=https' --tlsv1.2 --noproxy '*' --dump-header - --output "$manifest" --header "Authorization: Bearer $registry_token" --header 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' "https://registry-1.docker.io/v2/$repository_path/manifests/sha-$CANDIDATE_SHA")" || fail "registry manifest retrieval failed"
header_digest="$(HEADERS="$headers" /usr/bin/python3 -c 'import os,re,sys; v=[x.split(":",1)[1].strip() for x in os.environ["HEADERS"].splitlines() if ":" in x and x.split(":",1)[0].lower()=="docker-content-digest"]; len(set(v))==1 and re.fullmatch(r"sha256:[0-9a-f]{64}",v[0]) or sys.exit(1); print(v[0])')" || fail "registry digest is ambiguous"
actual_digest="sha256:$(sha256sum "$manifest" | awk '{print $1}')"
[[ "$header_digest" == "$IMAGE_DIGEST" && "$actual_digest" == "$IMAGE_DIGEST" ]] || fail "registry bytes do not match the requested digest"

env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" /usr/bin/timeout 60 /usr/bin/gh attestation verify "$manifest" --repo "$REPOSITORY" --signer-workflow "$REPOSITORY/.github/workflows/publish-and-deploy-test.yml" --source-ref refs/heads/main --source-digest "$CANDIDATE_SHA" --signer-digest "$CANDIDATE_SHA" --predicate-type https://slsa.dev/provenance/v1 --deny-self-hosted-runners >/dev/null || fail "signed image provenance verification failed"

PREPRODUCTION_RUN_ATTEMPT=""
if [[ "$HOST_ROLE" == "prod" ]]; then
  run_json="$(env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" /usr/bin/timeout 30 /usr/bin/gh api --method GET "repos/$REPOSITORY/actions/runs/$PREPRODUCTION_RUN_ID")" || fail "preproduction verification run could not be resolved"
  PREPRODUCTION_RUN_ATTEMPT="$(RUN_JSON="$run_json" EXPECTED_REPOSITORY="$REPOSITORY" EXPECTED_SHA="$CANDIDATE_SHA" EXPECTED_RUN_ID="$PREPRODUCTION_RUN_ID" /usr/bin/python3 -c '
import datetime,json,os,sys
try: v=json.loads(os.environ["RUN_JSON"])
except Exception: raise SystemExit(1)
now=datetime.datetime.now(datetime.timezone.utc)
try: updated=datetime.datetime.fromisoformat(v["updated_at"].replace("Z","+00:00"))
except Exception: raise SystemExit(1)
valid=(v.get("id")==int(os.environ["EXPECTED_RUN_ID"]) and v.get("event")=="workflow_dispatch" and v.get("status")=="completed" and v.get("conclusion")=="success" and v.get("head_sha")==os.environ["EXPECTED_SHA"] and v.get("head_branch")=="main" and v.get("path")==".github/workflows/preproduction-rehearsal.yml" and v.get("repository",{}).get("full_name")==os.environ["EXPECTED_REPOSITORY"] and isinstance(v.get("run_attempt"),int) and 1 <= v["run_attempt"] <= 1000 and updated <= now+datetime.timedelta(minutes=5) and now-updated <= datetime.timedelta(hours=24))
valid or sys.exit(1)
print(v["run_attempt"])
')" || fail "preproduction verification run is not an exact fresh successful main run"
  artifacts_json="$(env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" /usr/bin/timeout 30 /usr/bin/gh api --method GET "repos/$REPOSITORY/actions/runs/$PREPRODUCTION_RUN_ID/artifacts?per_page=100")" || fail "preproduction proof artifacts could not be listed"
  artifact_id="$(ARTIFACTS_JSON="$artifacts_json" EXPECTED_NAME="preproduction-proof-$PREPRODUCTION_RUN_ID-$PREPRODUCTION_RUN_ATTEMPT" /usr/bin/python3 -c '
import json,os,sys
try: values=json.loads(os.environ["ARTIFACTS_JSON"]).get("artifacts")
except Exception: raise SystemExit(1)
matches=[v for v in values or [] if isinstance(v,dict) and v.get("name")==os.environ["EXPECTED_NAME"] and v.get("expired") is False]
len(matches)==1 and isinstance(matches[0].get("id"),int) or sys.exit(1)
print(matches[0]["id"])
')" || fail "one exact unexpired preproduction proof artifact was not found"
  env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" /usr/bin/timeout 30 /usr/bin/gh api --method GET "repos/$REPOSITORY/actions/artifacts/$artifact_id/zip" >"$proof_zip" || fail "preproduction proof artifact download failed"
  PROOF_ZIP="$proof_zip" EXPECTED_REPOSITORY="$REPOSITORY" EXPECTED_SHA="$CANDIDATE_SHA" EXPECTED_DIGEST="$IMAGE_DIGEST" EXPECTED_RUN_ID="$PREPRODUCTION_RUN_ID" EXPECTED_RUN_ATTEMPT="$PREPRODUCTION_RUN_ATTEMPT" /usr/bin/python3 - <<'PY' || fail "preproduction proof artifact is invalid"
import datetime, json, os, stat, zipfile
path=os.environ["PROOF_ZIP"]
if os.path.getsize(path)>131072: raise SystemExit(1)
with zipfile.ZipFile(path) as bundle:
    entries=bundle.infolist()
    if len(entries)!=1 or entries[0].filename!="preproduction-proof.json" or entries[0].file_size>65536 or entries[0].is_dir() or stat.S_IFMT(entries[0].external_attr >> 16) not in (0,stat.S_IFREG): raise SystemExit(1)
    value=json.loads(bundle.read(entries[0]).decode("utf-8"))
required={"format","version","repository","workflow","runId","runAttempt","candidateSha","controlSha","imageDigest","verifiedAt"}
if set(value)!=required or value["format"]!="gshsapp-preproduction-public-proof" or value["version"]!=1 or value["repository"]!=os.environ["EXPECTED_REPOSITORY"] or value["workflow"]!=".github/workflows/preproduction-rehearsal.yml" or value["runId"]!=int(os.environ["EXPECTED_RUN_ID"]) or value["runAttempt"]!=int(os.environ["EXPECTED_RUN_ATTEMPT"]) or value["candidateSha"]!=os.environ["EXPECTED_SHA"] or value["controlSha"]!=os.environ["EXPECTED_SHA"] or value["imageDigest"]!=os.environ["EXPECTED_DIGEST"]: raise SystemExit(1)
verified=datetime.datetime.fromisoformat(value["verifiedAt"].replace("Z","+00:00")); now=datetime.datetime.now(datetime.timezone.utc)
if verified.tzinfo is None or verified>now+datetime.timedelta(minutes=5) or now-verified>datetime.timedelta(hours=24): raise SystemExit(1)
PY
fi

final_main_json="$(env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" /usr/bin/timeout 30 /usr/bin/gh api --method GET "repos/$REPOSITORY/git/ref/heads/main")" || fail "protected main ref could not be revalidated"
final_main_sha="$(MAIN_JSON="$final_main_json" /usr/bin/python3 -c 'import json,os,re,sys; v=json.loads(os.environ["MAIN_JSON"]); s=v.get("object",{}).get("sha"); isinstance(s,str) and re.fullmatch(r"[0-9a-f]{40}",s) or sys.exit(1); print(s)')" || fail "final main ref response is malformed"
[[ "$final_main_sha" == "$CANDIDATE_SHA" ]] || fail "candidate is no longer the current protected main tip"
env -i PATH="$PATH" LC_ALL=C HOME="$safe_home" XDG_CONFIG_HOME="$safe_home" GH_TOKEN="$GH_TOKEN_VALUE" \
  /usr/bin/timeout 30 /usr/bin/gh api --method GET "repos/$REPOSITORY/branches/main/protection" \
  >"$protection_json" || fail "main protection could not be revalidated"
validate_main_protection || fail "main protection changed before approval publication"

control_digest="$(sha256sum "$CONTROL_ROOT/control-assets.sha256" | awk '{print $1}')"
temporary="$(mktemp "$DEPLOY_ROOT/.approved-release.XXXXXX")"
CANDIDATE="$CANDIDATE_SHA" DIGEST="$IMAGE_DIGEST" CONTROL_DIGEST="$control_digest" HOST_ROLE_VALUE="$HOST_ROLE" RUN_ID_VALUE="$PREPRODUCTION_RUN_ID" RUN_ATTEMPT_VALUE="$PREPRODUCTION_RUN_ATTEMPT" /usr/bin/python3 - "$temporary" <<'PY'
import datetime,json,os,sys
with open(sys.argv[1],"w",encoding="utf-8",newline="\n") as output:
    run_id=int(os.environ["RUN_ID_VALUE"]) if os.environ["RUN_ID_VALUE"] else None
    run_attempt=int(os.environ["RUN_ATTEMPT_VALUE"]) if os.environ["RUN_ATTEMPT_VALUE"] else None
    json.dump({"format":"gshsapp-approved-release","version":2,"hostRole":os.environ["HOST_ROLE_VALUE"],"candidateSha":os.environ["CANDIDATE"],"imageDigest":os.environ["DIGEST"],"controlManifestSha256":os.environ["CONTROL_DIGEST"],"preproductionRunId":run_id,"preproductionRunAttempt":run_attempt,"approvedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")},output,separators=(",",":")); output.write("\n");output.flush();os.fsync(output.fileno())
PY
chmod 0400 "$temporary"; chown root:root "$temporary"; mv -fT "$temporary" "$DEPLOY_ROOT/approved-release.json"; sync -d "$DEPLOY_ROOT"
printf '%s\n' "Exact protected-main image and signed provenance approved for root deployment."
