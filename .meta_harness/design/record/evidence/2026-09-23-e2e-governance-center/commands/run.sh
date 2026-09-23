#!/usr/bin/env bash
# W4-D 证据 run：干净构建 → e2e 套件（证据写进本目录）→ 独立 grep 复核遮蔽 → 包的完整 test（含 e2e）→ 仓库级检查。
# 每一步一份日志，带命令、起止时刻与退出码；退出码汇总在 output/runner/exit-codes.tsv。
set -u
ROOT=/data/qiwei/repos/omne-harness-lite/.worktrees/tenancy-leg-2-e2e
RUN=$ROOT/.meta_harness/design/record/evidence/2026-09-23-e2e-governance-center
OUT=$RUN/output/runner
SECRETS=$(mktemp /tmp/omne-e2e-secrets-XXXXXX)   # 仓库之外；跑完即删
mkdir -p "$OUT"
cd "$ROOT"
unset OMNE_TEST_PG_URL OMNE_E2E_KEEP
printf 'step\texit\tseconds\n' > "$OUT/exit-codes.tsv"

step() {
  local name=$1; shift
  local log=$OUT/$name.log
  {
    echo "\$ (cwd=$ROOT) $*"
    echo "start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$log"
  local t0=$(date +%s)
  "$@" >> "$log" 2>&1
  local rc=$?
  local t1=$(date +%s)
  {
    echo "end: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "exit: $rc"
  } >> "$log"
  printf '%s\t%s\t%s\n' "$name" "$rc" "$((t1-t0))" >> "$OUT/exit-codes.tsv"
}

{
  echo "commit: $(git rev-parse HEAD)"
  echo "branch: $(git branch --show-current)"
  echo "git status --porcelain (before the run):"
  git status --porcelain
  echo "node: $(node --version)"
  echo "node openssl: $(node -p process.versions.openssl)"
  echo "system openssl: $(openssl version)"
  echo "pnpm: $(pnpm --version)"
  echo "vitest: $(pnpm --filter @omne-harness-lite/tenancy-host exec vitest --version)"
  echo "typescript: $(pnpm --filter @omne-harness-lite/tenancy-host exec tsc --version)"
  echo "kernel: $(uname -srm)"
  echo "cpus: $(nproc)"
  echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT/environment.txt" 2>&1

step build pnpm run build
step e2e env OMNE_E2E_EVIDENCE_DIR="$RUN" OMNE_E2E_SECRETS_OUT="$SECRETS" \
  pnpm --filter @omne-harness-lite/tenancy-host exec vitest run tests/e2e \
  --reporter=verbose --reporter=json --outputFile.json="$OUT/e2e.json"

# 独立复核：用套件交出的全部秘密（五种形式，一行一个）对整棵证据目录 grep；命中数应为 0
{
  echo "secret lines: $(grep -c . "$SECRETS")"
  echo "\$ grep -rFl -f <secrets> $RUN"
  hits=$(grep -rFl -f "$SECRETS" "$RUN" | wc -l)
  echo "files with a hit: $hits"
  # 对照：同一份秘密清单对一个故意写进秘密的文件必须命中，证明这次 grep 本身有效
  control=$(mktemp /tmp/omne-e2e-control-XXXXXX)
  head -n 1 "$SECRETS" > "$control"
  echo "control (a file holding the first secret line) hit: $(grep -Fc -f "$SECRETS" "$control")"
  rm -f "$control"
} > "$OUT/secret-grep.txt" 2>&1
rm -f "$SECRETS"

step tenancy-host-test pnpm --filter @omne-harness-lite/tenancy-host run test
step lint-rules pnpm run lint:rules
step format-check pnpm format:check
echo "finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT/environment.txt"
