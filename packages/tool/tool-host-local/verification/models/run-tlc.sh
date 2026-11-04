#!/usr/bin/env bash
# Runs every StartFence*.cfg and DeliveryBackoff*.cfg of this directory with TLC inside WSL
# (wsl.exe -d Ubuntu-24.04 --exec bash -l run-tlc.sh). The sources are copied into the WSL
# file system first (no build over /mnt/d); the logs land in the task tmp of the worktree.
# Arguments: <worktree root as seen from WSL> <output directory as seen from WSL>.
set -u
SRC=${1:?worktree root}/packages/tool/tool-host-local/verification/models
OUT=${2:?output directory}
WORK=$HOME/formal-tool
JAR=/opt/tlaplus/tla2tools.jar
rm -rf "$WORK"; mkdir -p "$WORK/out"
cp "$SRC"/StartFence.tla "$SRC"/StartFence*.cfg "$SRC"/DeliveryBackoff.tla "$SRC"/DeliveryBackoff*.cfg "$WORK"/
cd "$WORK" || exit 2
java -version > out/java-version.txt 2>&1
sha256sum "$JAR" ./*.tla ./*.cfg > out/sha256.txt
: > out/summary.txt
for cfg in StartFence.cfg StartFence-wide.cfg StartFence-unsafe-*.cfg DeliveryBackoff.cfg DeliveryBackoff-unsafe-*.cfg; do
  name=${cfg%.cfg}
  module=${name%%-*}
  start=$(date +%s)
  timeout 600 java -XX:+UseParallelGC -Xmx4g -cp "$JAR" tlc2.TLC -workers 4 -deadlock \
    -metadir "out/meta-$name" -config "$cfg" "$module.tla" > "out/$name.log" 2>&1
  rc=$?
  end=$(date +%s)
  echo "$name rc=$rc seconds=$((end-start))" >> out/summary.txt
done
rm -rf out/meta-*
mkdir -p "$OUT"; rm -rf "$OUT/out"; cp -r out "$OUT/out"
rm -rf "$WORK"
echo done
