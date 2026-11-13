#!/usr/bin/env bash
set -u
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/../../../../tmp/formal-recovery}"
jar="${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}"
workers="${TLC_WORKERS:-2}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$here" || exit 2

expected() {
  case "$1" in
    bad-wait-*) echo 13 ;;
    bad-*) echo 12 ;;
    *) echo 0 ;;
  esac
}

if [ $# -gt 1 ]; then
  shift
  cfgs=("$@")
else
  cfgs=(ought live bad-wait-after-restart bad-wait-on-lost-callee bad-failure-completes bad-input-dropped bad-budget-in-memory bad-rerun-started wide)
fi

: > "$out/summary.txt"
for cfg in "${cfgs[@]}"; do
  start=$(date +%s)
  java -XX:+UseParallelGC -Xmx4g -cp "$jar" tlc2.TLC -workers "$workers" -deadlock \
    -metadir "$out/meta-$cfg" -config "$cfg.cfg" SystemRecovery.tla > "$out/$cfg.log" 2>&1
  rc=$?
  want=$(expected "$cfg")
  verdict=match
  [ "$rc" = "$want" ] || verdict=MISMATCH
  echo "$cfg rc=$rc expected=$want $verdict seconds=$(( $(date +%s) - start ))" | tee -a "$out/summary.txt"
done
rm -rf "$out"/meta-*
if grep -q MISMATCH "$out/summary.txt"; then exit 1; fi
exit 0
