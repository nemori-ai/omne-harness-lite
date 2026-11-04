#!/usr/bin/env bash
# Runs the cfgs of this directory against RunLifecycle.tla with TLC inside WSL.
# Copies the sources into the WSL file system first (no build over /mnt/d), then
# copies the logs to OUT (default: the worktree's tmp/formal-agent). Exit codes and wall time per cfg land in out/summary.txt.
#
#   wsl.exe -d Ubuntu-24.04 --exec bash -l /mnt/d/.../run-lifecycle/run-tlc.sh [cfg-name ...]
#
# Without arguments every cfg runs. The WSL working copy is removed at the end.
set -u
SRC=${RUN_LIFECYCLE_SRC:-/mnt/d/dev_repos/omne-harness-lite/.worktrees/rw2-f-agent/packages/agent/agent/verification/run-lifecycle}
OUT=${RUN_LIFECYCLE_OUT:-$SRC/../../../../../tmp/formal-agent}
WORK=$HOME/formal-agent-run-lifecycle
JAR=/opt/tlaplus/tla2tools.jar
WORKERS=${TLC_WORKERS:-4}
BUDGET=${TLC_BUDGET_SECONDS:-600}
rm -rf "$WORK"; mkdir -p "$WORK/out"
cp "$SRC"/RunLifecycle.tla "$SRC"/*.cfg "$WORK"/
cd "$WORK" || exit 2
java -version > out/java-version.txt 2>&1
sha256sum "$JAR" RunLifecycle.tla *.cfg > out/sha256.txt
: > out/summary.txt
if [ $# -gt 0 ]; then
  cfgs=()
  for name in "$@"; do cfgs+=("$name.cfg"); done
else
  cfgs=(run-is.cfg run-ought.cfg run-wide.cfg live-ought.cfg bad-*.cfg)
fi
for cfg in "${cfgs[@]}"; do
  name=${cfg%.cfg}
  start=$(date +%s)
  timeout "$BUDGET" java -XX:+UseParallelGC -Xmx4g -cp "$JAR" tlc2.TLC -workers "$WORKERS" -deadlock \
    -metadir "out/meta-$name" -config "$cfg" RunLifecycle.tla > "out/$name.log" 2>&1
  rc=$?
  end=$(date +%s)
  echo "$name rc=$rc seconds=$((end-start))" >> out/summary.txt
done
rm -rf out/meta-*
mkdir -p "$OUT"
cp out/* "$OUT/"
rm -rf "$WORK"
echo done
