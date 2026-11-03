#!/usr/bin/env bash
# Runs CP3 (cp3.spec.ts, slow tier) <runs> times in a row and prints each result and the reason of
# the first failed assertion. KL-146 in ../README.md uses it.
# Usage: cp3-repro-loop.sh <runs> <tag>
#   ROOT  the worktree to run in (default: the worktree of this script)
#   OUT   the log directory (default: $ROOT/tmp/cp3-repro/<tag>)
# Run it under ./scripts/with-test-slot.sh when other tests share the machine.
set -u
here=$(cd "$(dirname "$0")" && pwd)
ROOT=${ROOT:-$(git -C "$here" rev-parse --show-toplevel)}
runs=${1:?runs}
tag=${2:?tag}
OUT=${OUT:-$ROOT/tmp/cp3-repro/$tag}
mkdir -p "$OUT"
pnpm=pnpm
command -v pnpm.cmd >/dev/null 2>&1 && pnpm=pnpm.cmd
cd "$ROOT/packages/agent/agent-host-local" || exit 2
pass=0
fail=0
for i in $(seq 1 "$runs"); do
  log="$OUT/run-$i.log"
  if "$pnpm" exec vitest run --mode slow --typecheck.enabled=false tests/line-through/cp3.spec.ts >"$log" 2>&1; then
    pass=$((pass + 1))
    echo "run $i pass"
  else
    fail=$((fail + 1))
    reason=$(grep -m1 -E '^(AssertionError|Error)' "$log")
    signature=$(grep -o '"failure":{"kind":"[a-z-]*"[^}]\{0,160\}' "$log" | head -1)
    echo "run $i FAIL $reason ${signature}"
  fi
done
echo "pass=$pass fail=$fail logs=$OUT"
[ "$fail" -eq 0 ]
