#!/usr/bin/env bash
# Reruns each member's unscorable mutants (survived with no test completed, and timeouts) one member
# at a time with a fresh Stryker runner, then merges the verdicts into the first pass.
# usage: recheck-unscored.sh <worktree> <ledger run dir> <out dir>
set -u
worktree=$1
ledger=$2
out=$3
here=/data/qiwei/repos/omne-harness-lite/tmp/shell-process-lifetime/g16
mkdir -p "$out"
for slug in packages__mcp__mcp packages__mcp__mcp-contract; do
  member=${slug//__//}
  ids=$(node -e '
const r = require(process.argv[1]); const ids = []
for (const v of Object.values(r.files)) for (const m of v.mutants)
  if ((m.status === "Survived" && m.testsCompleted === 0) || m.status === "Timeout") ids.push(m.id)
process.stdout.write(ids.join(","))' "$ledger/$slug.mutation.json")
  [ -z "$ids" ] && continue
  echo "== $member ($ids)"
  node "$here/rerun-notrun.mjs" "$worktree" "$member" "$ledger/$slug.mutation.json" "$out/$slug" "$ids" | head -1
done
node "$here/merge-recheck.mjs" "$ledger" "$out"
