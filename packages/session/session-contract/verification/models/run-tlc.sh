#!/usr/bin/env bash
# Runs every cfg of one model directory with TLC inside WSL (Ubuntu-24.04, login shell).
#   wsl.exe -d Ubuntu-24.04 --exec bash -l <this script> <windows-side model dir as /mnt path> <out dir as /mnt path>
# The model and its cfgs are copied into the WSL file system first; nothing is built over /mnt.
# Each cfg names its expected result in expect.txt: "<cfg> pass" or "<cfg> <Property>".
# A negative control counts as a hit only when the log names that property; an exit code alone
# does not count. The summary lands in <out>/summary.txt; the WSL work directory is removed.
set -u
SRC=${1:?model directory}
OUT=${2:?output directory}
NAME=$(basename "$SRC")
WORK=$HOME/formal-session/$NAME
JAR=/opt/tlaplus/tla2tools.jar
rm -rf "$WORK"; mkdir -p "$WORK/out"
cp "$SRC"/*.tla "$SRC"/*.cfg "$SRC"/expect.txt "$WORK"/
cd "$WORK" || exit 2
MODULE=$(ls *.tla | head -n 1); MODULE=${MODULE%.tla}
java -version > out/java-version.txt 2>&1
sha256sum "$JAR" *.tla *.cfg > out/sha256.txt
: > out/summary.txt
fail=0
while read -r cfg expect; do
  [ -z "$cfg" ] && continue
  name=${cfg%.cfg}
  start=$(date +%s)
  timeout 600 java -XX:+UseParallelGC -Xmx4g -cp "$JAR" tlc2.TLC -workers 4 \
    -metadir "out/meta-$name" -config "$cfg" "$MODULE.tla" > "out/$name.log" 2>&1
  rc=$?
  secs=$(( $(date +%s) - start ))
  states=$(grep -Eo '[0-9,]+ states generated, [0-9,]+ distinct states found' "out/$name.log" | tail -n 1)
  depth=$(grep -Eo 'depth of the complete state graph search is [0-9]+' "out/$name.log" | grep -Eo '[0-9]+$')
  if [ "$expect" = pass ]; then
    if grep -q 'Model checking completed. No error has been found.' "out/$name.log"; then verdict=ok; else verdict=FAIL; fail=1; fi
  else
    # A liveness violation is reported as "Temporal properties were violated"; such a cfg declares
    # exactly one property, so the hit names it.
    if grep -Eq "(Invariant|Action property) $expect is violated" "out/$name.log" ||
       { grep -q 'Temporal properties were violated' "out/$name.log" && grep -Eq "^  $expect\$" "$cfg"; }; then
      verdict=hit; else verdict=MISS; fail=1; fi
  fi
  echo "$name expect=$expect verdict=$verdict rc=$rc seconds=$secs states=[$states] depth=${depth:-?}" >> out/summary.txt
done < expect.txt
rm -rf out/meta-*
rm -rf "$OUT"; mkdir -p "$OUT"; cp -r out/. "$OUT"/
rm -rf "$WORK"
cat "$OUT/summary.txt"
exit $fail
