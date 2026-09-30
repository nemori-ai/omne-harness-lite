#!/usr/bin/env bash
# Runs every held-out task twice per model, interleaving the two models so that
# neither is systematically earlier. Already recorded runs are skipped.
# Usage: run-all.sh [parallelism]   (default 4)
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
log="$repo/tmp/role-model-sonnet55/run-all.log"
mkdir -p "$(dirname "$log")"
for repeat in 1 2; do
  for task in AD-1 TD-1 VD-1 QA-1 AD-2 TD-2 VD-2 QA-2 AD-3 TD-3 QA-3; do
    for arm in baseline candidate; do
      [ -e "$repo/tmp/role-model-sonnet55/runs/$task/$arm-r$repeat/run.json" ] || echo "$task $arm $repeat"
    done
  done
done | xargs -P "${1:-4}" -L 1 sh -c 'python3 "$0/evalrun.py" run "$1" "$2" "$3" 2>&1 | tail -3' "$here" >>"$log" 2>&1
echo "done; see $log"
