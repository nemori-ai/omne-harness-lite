#!/usr/bin/env bash
# Runs every configuration of this directory with TLC. Logs go to the directory given as the
# first argument (default: the repository tmp/formal-canvas-place/). A configuration named
# bad-* must end in a violation: TLC exit 12 for an invariant, 13 for a liveness property.
# The others must end clean (exit 0).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/../../../../tmp/formal-canvas-place}"
jar="${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}"
workers="${TLC_WORKERS:-2}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$here" || exit 2

expected() {
  case "$1" in
    bad-no-admit-limit) echo 13 ;;
    bad-*) echo 12 ;;
    *) echo 0 ;;
  esac
}

if [ $# -gt 1 ]; then
  shift
  cfgs=("$@")
else
  cfgs=(place place-live bad-commit-before-admit bad-admit-before-limit bad-no-recheck-ref bad-no-recheck-limit bad-no-recheck-kind bad-withdraw-without-drain bad-no-admit-limit)
fi

: > "$out/summary.txt"
failed=0
for cfg in "${cfgs[@]}"; do
  start=$(date +%s)
  java -XX:+UseParallelGC -Xmx4g -cp "$jar" tlc2.TLC -workers "$workers" -deadlock \
    -metadir "$out/meta-$cfg" -config "$cfg.cfg" CanvasPlace.tla > "$out/$cfg.log" 2>&1
  rc=$?
  end=$(date +%s)
  want=$(expected "$cfg")
  [ "$rc" = "$want" ] || failed=1
  echo "$cfg rc=$rc expected=$want seconds=$((end-start))" >> "$out/summary.txt"
done
rm -rf "$out"/meta-*
shasum -a 256 "$jar" CanvasPlace.tla ./*.cfg > "$out/sha256.txt"
cat "$out/summary.txt"
exit "$failed"
