#!/usr/bin/env bash
# Guard acceptance 3: the exact command of negative-control.sh, run on the final head.
cd /data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable
G=tmp/closures/w4-mcp-unusable/gate-r2
export NO_COLOR=1 FORCE_COLOR=0 VITEST_MAX_WORKERS=4
echo "head $(git rev-parse HEAD) start $(date -u +%H:%M:%S) load $(cut -d' ' -f1-3 /proc/loadavg)" > $G/same-command.txt
pnpm turbo run build --filter=@omne-harness/mcp --force > $G/same-build.log 2>&1
echo "build exit $? end $(date -u +%H:%M:%S) sha $(sha256sum $G/same-build.log | cut -c1-16)" >> $G/same-command.txt
pnpm turbo run test --filter=@omne-harness/mcp --force > $G/same-test.log 2>&1
echo "test exit $? end $(date -u +%H:%M:%S) sha $(sha256sum $G/same-test.log | cut -c1-16) load $(cut -d' ' -f1-3 /proc/loadavg)" >> $G/same-command.txt
