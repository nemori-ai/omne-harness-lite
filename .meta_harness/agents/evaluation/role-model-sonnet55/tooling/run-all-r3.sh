#!/usr/bin/env bash
# Revision 3: acceptance tasks, strictly one run at a time, models alternating and
# swapping who goes first on each task. Waits for any earlier batch to finish first.
set -u
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
log="$repo/tmp/role-model-sonnet55/run-all-r3.log"
mkdir -p "$(dirname "$log")"
while pgrep -f "[e]valrun(_r2)?\.py run" >/dev/null; do sleep 30; done
echo "start $(date -u +%FT%TZ)" >>"$log"
while read -r task arm repeat; do
  [ -e "$repo/tmp/role-model-sonnet55/runs/$task/$arm-r$repeat/run.json" ] && continue
  python3 "$here/evalrun_r3.py" run "$task" "$arm" "$repeat" 2>&1 | tail -3 >>"$log"
done <<'EOF'
QA-1 opus-serial 1
QA-1 sonnet-serial 1
QA-2 sonnet-serial 1
QA-2 opus-serial 1
QA-3 opus-serial 1
QA-3 sonnet-serial 1
QA-1 sonnet-serial 2
QA-1 opus-serial 2
QA-2 opus-serial 2
QA-2 sonnet-serial 2
QA-3 sonnet-serial 2
QA-3 opus-serial 2
EOF
echo "done $(date -u +%FT%TZ)" >>"$log"
