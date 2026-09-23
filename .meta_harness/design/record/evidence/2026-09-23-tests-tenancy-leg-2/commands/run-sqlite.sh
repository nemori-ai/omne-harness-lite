#!/usr/bin/env bash
# W4-A 测试 run（sqlite 一侧）：按拓扑序逐成员 build → typecheck → test，每成员一份日志。
set -u
ROOT=/data/qiwei/repos/omne-harness-lite/.worktrees/tenancy-leg-2-evidence
OUT=$ROOT/tmp/w4a/tests/output
JSON=$ROOT/tmp/w4a/tests/json
mkdir -p "$OUT" "$JSON"
cd "$ROOT"
unset OMNE_TEST_PG_URL
DIRS=$(pnpm -r --workspace-concurrency=1 exec pwd)
SUMMARY=$ROOT/tmp/w4a/tests/exit-codes.tsv
printf 'member\tstep\texit\tseconds\n' > "$SUMMARY"
for dir in $DIRS; do
  name=$(node -p "require('$dir/package.json').name")
  short=${name#@omne-harness-lite/}
  log=$OUT/$short.log
  : > "$log"
  run_step() {
    local step=$1; shift
    {
      echo "===== [$short] $step ====="
      echo "\$ (cwd=$ROOT) $*"
      echo "start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } >> "$log"
    local t0=$(date +%s)
    "$@" >> "$log" 2>&1
    local rc=$?
    local t1=$(date +%s)
    {
      echo "end: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "exit: $rc"
      echo
    } >> "$log"
    printf '%s\t%s\t%s\t%s\n' "$short" "$step" "$rc" "$((t1-t0))" >> "$SUMMARY"
  }
  run_step build pnpm --filter "$name" run build
  run_step typecheck pnpm --filter "$name" run typecheck
  run_step test pnpm --filter "$name" exec vitest run --reporter=verbose --reporter=json --outputFile.json="$JSON/$short.json"
done
{
  echo "===== [workspace] lint:rules ====="
  echo "\$ (cwd=$ROOT) pnpm run lint:rules"
  pnpm run lint:rules; echo "exit: $?"
} > "$OUT/_lint-rules.log" 2>&1
{
  echo "===== [workspace] format:check ====="
  echo "\$ (cwd=$ROOT) pnpm format:check"
  pnpm format:check; echo "exit: $?"
} > "$OUT/_format-check.log" 2>&1
echo done
