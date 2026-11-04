#!/usr/bin/env bash
# Runs every configuration of this directory with TLC inside WSL (bash -l: Java and the JAR are
# on the login shell only). Sources are copied into the WSL file system first; the logs come
# back to the directory named by OUT (default: the repository tmp/formal/model-contract/).
# Exit codes and wall time per configuration land in OUT/summary.txt.
#   wsl.exe -d Ubuntu-24.04 --exec bash -l /mnt/d/.../run-tlc.sh [cfg-name ...]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$HERE/../../../../../tmp/formal/model-contract}
WORK=$HOME/formal-model
JAR=${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}
WORKERS=${FORMAL_WORKERS:-4}
BUDGET=${FORMAL_BUDGET_SECONDS:-600}
rm -rf "$WORK"; mkdir -p "$WORK/out"
cp "$HERE"/*.tla "$HERE"/*.cfg "$WORK"/
cd "$WORK" || exit 2
java -version > out/java-version.txt 2>&1
sha256sum "$JAR" ./*.tla ./*.cfg > out/sha256.txt
: > out/summary.txt
if [ $# -gt 0 ]; then names=("$@"); else
  names=(admission bad-recall-ignores-unknown-once bad-recall-ignores-unknown-authority \
         bad-admit-upserts bad-capacity-ignored bad-truncate-capacity bad-truncate-write \
         bad-tenant-leak \
         push push-wide push-live \
         bad-ack-without-saved bad-ack-without-adapter bad-release-before-ack \
         bad-foreign-receipt-saved bad-refusal-overwrites-unknown bad-refusal-loses-receiver \
         bad-repush-saved bad-retry-on-unavailable bad-accept-without-reservation \
         bad-reservation-never-released bad-keep-body bad-accounts-before-saved \
         bad-live-waiting-not-due bad-live-reservation-never-released)
fi
module_of() {
  case "$1" in
    admission|bad-recall-*|bad-admit-*|bad-capacity-*|bad-truncate-*|bad-tenant-*) echo Admission ;;
    *) echo ResultPush ;;
  esac
}
for name in "${names[@]}"; do
  module=$(module_of "$name")
  start=$(date +%s)
  timeout "$BUDGET" java -XX:+UseParallelGC -Xmx4g -cp "$JAR" tlc2.TLC -workers "$WORKERS" \
    -deadlock -metadir "out/meta-$name" -config "$name.cfg" "$module.tla" > "out/$name.log" 2>&1
  rc=$?
  end=$(date +%s)
  echo "$name module=$module rc=$rc seconds=$((end-start))" >> out/summary.txt
done
rm -rf out/meta-*
mkdir -p "$OUT"; rm -rf "$OUT"/*.log "$OUT"/summary.txt "$OUT"/sha256.txt "$OUT"/java-version.txt
cp out/* "$OUT"/
rm -rf "$WORK"
cat "$OUT/summary.txt"
