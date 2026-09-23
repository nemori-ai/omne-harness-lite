#!/usr/bin/env bash
# W4-A 测试 run（pg 一侧）：postgres:16 临时容器 omne-pg-w4（127.0.0.1:55439），三个 pg 测试文件各用一个独立空库。
# 口令只从文件读，日志里的命令行把口令写成 ***。
set -u
ROOT=/data/qiwei/repos/omne-harness-lite/.worktrees/tenancy-leg-2-evidence
OUT=$ROOT/tmp/w4a/tests/output-pg
JSON=$ROOT/tmp/w4a/tests/json-pg
mkdir -p "$OUT" "$JSON"
PW=$(cat "$ROOT/tmp/w4a/pg-password")
BASE=127.0.0.1:55439
EXITS=$ROOT/tmp/w4a/tests/exit-codes-pg.tsv
printf 'run\texit\tseconds\n' > "$EXITS"
cd "$ROOT"
pgrun() {
  local label=$1 pkg=$2 db=$3 file=$4
  local log=$OUT/$label.log
  {
    echo "===== [$label] pg ====="
    echo "\$ (cwd=$ROOT) OMNE_TEST_PG_URL=postgres://postgres:***@$BASE/$db pnpm --filter @omne-harness-lite/$pkg exec vitest run $file --reporter=verbose --reporter=json --outputFile.json=<json>"
    echo "start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$log"
  local t0=$(date +%s)
  OMNE_TEST_PG_URL="postgres://postgres:$PW@$BASE/$db" pnpm --filter "@omne-harness-lite/$pkg" exec vitest run "$file" --reporter=verbose --reporter=json --outputFile.json="$JSON/$label.json" >> "$log" 2>&1
  local rc=$?
  local t1=$(date +%s)
  { echo "end: $(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "exit: $rc"; } >> "$log"
  printf '%s\t%s\t%s\n' "$label" "$rc" "$((t1-t0))" >> "$EXITS"
}
pgrun storage-sql.conformance.postgres storage-sql w4a_conformance tests/conformance.postgres.spec.ts
pgrun storage-sql.upgrade.postgres storage-sql w4a_upgrade tests/upgrade.postgres.spec.ts
pgrun tenancy-host.pg tenancy-host w4a_host_admin tests/pg.spec.ts
# 口令不许进日志
if grep -rl -- "$PW" "$OUT" "$JSON"; then echo "PASSWORD LEAKED INTO LOGS"; fi
echo done
