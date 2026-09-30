#!/usr/bin/env bash
# Revision 2: Fable at high effort on the six implementation tasks, plus the
# Opus high-effort baseline for the three AD tasks (TD already ran at high).
# Usage: run-all-r2.sh [parallelism]   (default 4)
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
log="$repo/tmp/role-model-sonnet55/run-all-r2.log"
mkdir -p "$(dirname "$log")"
for repeat in 1 2; do
  for task in AD-1 TD-1 AD-2 TD-2 AD-3 TD-3; do
    arms="fable-high"
    case $task in AD-*) arms="opus-high fable-high" ;; esac
    for arm in $arms; do
      [ -e "$repo/tmp/role-model-sonnet55/runs/$task/$arm-r$repeat/run.json" ] || echo "$task $arm $repeat"
    done
  done
done | xargs -P "${1:-4}" -L 1 sh -c 'python3 "$0/evalrun_r2.py" run "$1" "$2" "$3" 2>&1 | tail -3' "$here" >>"$log" 2>&1
echo "done; see $log"
