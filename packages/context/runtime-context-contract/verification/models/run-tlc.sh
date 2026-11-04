#!/usr/bin/env bash
# Runs every TLC configuration of this directory. Run it in a WSL login shell
# (Java and /opt/tlaplus/tla2tools.jar are only there), from a copy of this
# directory on the WSL file system:
#   wsl.exe -d Ubuntu-24.04 --exec bash -l <copy>/run-tlc.sh <copy> <out>
# The verdict of each run is the conclusion line of its log, not the exit code.
set -u
here=${1:?model directory}
out=${2:?output directory}
jar=${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}
workers=${FORMAL_WORKERS:-4}
budget=${FORMAL_BUDGET_SECONDS:-600}
mkdir -p "$out"
cd "$here" || exit 2
java -version > "$out/java-version.txt" 2>&1
sha256sum "$jar" *.tla *.cfg > "$out/sha256.txt"
: > "$out/summary.txt"
for cfg in *.cfg; do
  name=${cfg%.cfg}
  case $name in
    rc-commit | bad-apply-* | bad-ignore-* | bad-id-* | probe-seen-*) spec=RcCommit ;;
    *) spec=RcRead ;;
  esac
  start=$(date +%s)
  timeout "$budget" java -XX:+UseParallelGC -Xmx4g -cp "$jar" tlc2.TLC \
    -workers "$workers" -deadlock -metadir "$out/meta-$name" \
    -config "$cfg" "$spec.tla" > "$out/$name.log" 2>&1
  code=$?
  echo "$name $spec exit=$code seconds=$(( $(date +%s) - start ))" >> "$out/summary.txt"
  rm -rf "$out/meta-$name"
done
cat "$out/summary.txt"
