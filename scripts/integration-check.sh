#!/usr/bin/env bash
set -euo pipefail
runner="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "$runner/scripts/git-environment.sh"
main() {
subject="$(git -C "${OMNE_SUBJECT_ROOT:?OMNE_SUBJECT_ROOT is required}" rev-parse --show-toplevel)"
export OMNE_RUNNER_ROOT="$runner" OMNE_SUBJECT_ROOT="$subject"
if [[ -z "${OMNE_TEST_SLOT_HELD:-}" ]]; then
    exec "$runner/scripts/with-test-slot.sh" bash "$runner/scripts/integration-check.sh"
fi
cd -- "$subject"
mkdir -p "$subject/tmp"
plan_dir="$(mktemp -d "$subject/tmp/check-plan.XXXXXX")"
testing=(node --experimental-strip-types "$runner/tools/ts-checks/src/testing/cli.ts")
"${testing[@]}" plan ${BASELINE:+--base "$BASELINE"} --json "$plan_dir/plan.json"
step() { "${testing[@]}" step "$1" --plan "$plan_dir/plan.json"; }
python=(uv run --project "$runner" --locked python)
export PYTHONDONTWRITEBYTECODE=1
"${python[@]}" "$runner/.meta_harness/tooling/src/compile_agents.py" --source "$subject/.meta_harness/agents" --output "$subject/.meta_harness" --check
"${python[@]}" "$runner/.meta_harness/tooling/src/link_agents.py" --project-root "$subject" --check
"${python[@]}" -m omne_harness_lite_spec_tools.check_docs --root "$subject"
"${python[@]}" "$runner/.meta_harness/tooling/src/check_sources.py" --root "$subject/.meta_harness/design" --source-root "$subject"
"${python[@]}" "$runner/.meta_harness/tooling/src/domain_objects.py" --root "$subject/.meta_harness/design"
step python
bash "$runner/scripts/format.sh" check
bash "$runner/scripts/test-formatting.sh"
step build
step typecheck
step test
node --experimental-strip-types "$runner/tools/ts-checks/src/cli.ts" packages apps
step acceptance
node --experimental-strip-types "$runner/tools/ts-checks/src/loop/cli.ts" ${BASELINE:+--base "$BASELINE"} --out "$plan_dir/loop" --strict --scope engineering
}
omne_repository_command main "$@"
