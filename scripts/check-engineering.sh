#!/usr/bin/env bash
set -euo pipefail
runner="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
subject="${OMNE_SUBJECT_ROOT:-$runner}"
python=(uv run --project "$runner" --locked python)
export OMNE_SUBJECT_ROOT="$subject" OMNE_RUNNER_ROOT="$runner"
"${python[@]}" "$runner/.meta_harness/tooling/src/compile_agents.py" --source "$subject/.meta_harness/agents" --output "$subject/.meta_harness" --check
"${python[@]}" "$runner/.meta_harness/tooling/src/link_agents.py" --project-root "$subject" --check
"${python[@]}" -m omne_harness_lite_spec_tools.check_docs --root "$subject"
"${python[@]}" "$runner/.meta_harness/tooling/src/check_sources.py" --root "$subject/.meta_harness/design" --source-root "$subject"
"${python[@]}" "$runner/.meta_harness/tooling/src/domain_objects.py" --root "$subject/.meta_harness/design"
bash "$runner/scripts/format.sh" check
node --experimental-strip-types "$runner/tools/ts-checks/src/cli.ts" packages apps
node --experimental-strip-types "$runner/tools/ts-checks/src/loop/cli.ts" --out "$subject/tmp/engineering-loop-status"
printf '%s\n' 'Engineering scope: archived product builds/tests excluded; product sensor no-data remains reported, not a product quality pass.'
