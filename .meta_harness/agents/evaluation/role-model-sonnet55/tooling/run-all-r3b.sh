#!/usr/bin/env bash
# Revision 3b: the acceptance runs revision 3 still lacks, all at once, each in its
# own PID namespace so that no run can see or signal another run's processes.
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
log="$repo/tmp/role-model-sonnet55/run-all-r3b.log"
mkdir -p "$(dirname "$log")"
echo "start $(date -u +%FT%TZ)" >>"$log"
for repeat in 1 2; do
  for task in QA-1 QA-2 QA-3; do
    for arm in opus-serial sonnet-serial; do
      [ -e "$repo/tmp/role-model-sonnet55/runs/$task/$arm-r$repeat/run.json" ] || echo "$task $arm $repeat"
    done
  done
done | xargs -P 9 -L 1 sh -c 'unshare -Ur --pid --fork --mount-proc python3 "$0/evalrun_r3.py" run "$1" "$2" "$3" 2>&1 | tail -3' "$here" >>"$log" 2>&1
echo "done $(date -u +%FT%TZ)" >>"$log"
