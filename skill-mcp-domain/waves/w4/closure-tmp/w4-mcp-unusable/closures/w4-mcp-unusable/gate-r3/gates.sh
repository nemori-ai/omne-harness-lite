#!/usr/bin/env bash
cd /data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable
G=tmp/closures/w4-mcp-unusable/gate-r3
echo "head $(git rev-parse HEAD)" > $G/summary.log
for c in typecheck lint:rules lint:oxlint lint:deps format:check check:docs; do
  f=$G/$(echo $c | tr ':' '-').txt
  pnpm run $c > $f 2>&1; rc=$?
  echo "$c exit=$rc end=$(date -u +%H:%M:%S) sha=$(sha256sum $f | cut -c1-12)" >> $G/summary.log
done
{ grep -rn lostOfNoAnswer packages/mcp/mcp/src; echo "--- lostOf("; git grep -n 'lostOf(' -- packages/mcp/mcp/src; echo "--- loseIfLost"; git grep -n 'loseIfLost\|lostOf' -- packages/mcp/mcp/src/calls.ts packages/mcp/mcp/src/tasks.ts; } > $G/accept1.txt 2>&1
echo "accept1 sha=$(sha256sum $G/accept1.txt | cut -c1-12)" >> $G/summary.log
echo done >> $G/summary.log
