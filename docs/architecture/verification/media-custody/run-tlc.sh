#!/usr/bin/env bash
# Runs every configuration of this directory with TLC. Logs go to the directory given as the
# first argument (default: the repository tmp/formal-media-custody/). A configuration named
# bad-* must end in a violation (TLC exit 12); the others must end clean (exit 0).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/../../../../tmp/formal-media-custody}"
jar="${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}"
workers="${TLC_WORKERS:-2}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$here" || exit 2

expected() {
  case "$1" in
    bad-*) echo 12 ;;
    *) echo 0 ;;
  esac
}

if [ $# -gt 1 ]; then
  shift
  cfgs=("$@")
else
  cfgs=(custody custody-live bad-ref-before-durable bad-sweep-check-then-act bad-log-before-hold bad-row-delete-first bad-dedupe-across-tenants bad-hold-skips-tenant)
fi

: > "$out/summary.txt"
failed=0
for cfg in "${cfgs[@]}"; do
  start=$(date +%s)
  java -XX:+UseParallelGC -Xmx4g -cp "$jar" tlc2.TLC -workers "$workers" -deadlock \
    -metadir "$out/meta-$cfg" -config "$cfg.cfg" MediaCustody.tla > "$out/$cfg.log" 2>&1
  rc=$?
  end=$(date +%s)
  want=$(expected "$cfg")
  [ "$rc" = "$want" ] || failed=1
  echo "$cfg rc=$rc expected=$want seconds=$((end-start))" >> "$out/summary.txt"
done
rm -rf "$out"/meta-*
shasum -a 256 "$jar" MediaCustody.tla ./*.cfg > "$out/sha256.txt"
cat "$out/summary.txt"
exit "$failed"
