#!/usr/bin/env bash
# Runs the positive and negative controls of OpenSet.tla with TLC and judges each result.
#
# Usage (inside a Linux login shell with Java and tla2tools):
#   run-tlc.sh <models-dir> <evidence-dir>
# <models-dir> is this directory. The script copies the model and the configurations into a new
# directory under $HOME, runs TLC there, copies the logs and summary.txt to <evidence-dir>, and
# removes its work directory. The exit code is 0 only when every control passed.
#
# A positive control passes when TLC exits 0 and prints the completion line. A negative control
# passes when TLC reports exactly the named property as violated, with a trace. Another exit code,
# a parse error or a timeout fails the control.
set -u
SRC=${1:?models directory}
OUT=${2:?evidence directory}
# The work below runs in another directory: name the evidence directory absolutely first.
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd) || exit 2
JAR=${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}
BUDGET=${FORMAL_BUDGET_SECONDS:-1200}
WORKERS=${FORMAL_WORKERS:-8}
HEAP=${FORMAL_HEAP:--Xmx6g}

# config name -> expected violated property; "-" means no violation is expected.
CASES="
open-set -
bad-keep-closed P5_OpenBound
bad-projection-lags P2_ProjectionCurrent
bad-no-closed-index P3_Reachable
bad-absent-as-never P4_DecisionsTrue
bad-mix-pages P1_SnapshotIsOpenSet
bad-unchecked-commit P4_DecisionsTrue
bad-store-unchecked P6_KeyOpensOnce
"

WORK=$(mktemp -d "$HOME/journal-open-set.XXXXXX") || exit 2
trap 'rm -rf "$WORK"' EXIT
cp "$SRC"/OpenSet.tla "$SRC"/*.cfg "$WORK"/ || exit 2
mkdir -p "$WORK/out"
cd "$WORK" || exit 2

# Every configuration in the directory must have a case, and every case a configuration.
listed=$(printf '%s\n' "$CASES" | awk 'NF {print $1}' | sort)
present=$(ls *.cfg | sed 's/\.cfg$//' | sort)
if [ "$listed" != "$present" ]; then
  echo "case table and configurations differ" >&2
  diff <(printf '%s\n' "$listed") <(printf '%s\n' "$present") >&2
  exit 2
fi

java -version > out/java-version.txt 2>&1
{ sha256sum "$JAR" OpenSet.tla *.cfg 2>/dev/null || shasum -a 256 "$JAR" OpenSet.tla *.cfg; } > out/sha256.txt
: > out/summary.txt
failed=0
while read -r name expected; do
  [ -z "$name" ] && continue
  start=$(date +%s)
  timeout "$BUDGET" java -XX:+UseParallelGC "$HEAP" -cp "$JAR" tlc2.TLC -workers "$WORKERS" \
    -deadlock -metadir "out/meta-$name" -config "$name.cfg" OpenSet.tla > "out/$name.log" 2>&1
  rc=$?
  seconds=$(( $(date +%s) - start ))
  log="out/$name.log"
  if [ "$expected" = "-" ]; then
    if [ "$rc" -eq 0 ] && grep -q "Model checking completed. No error has been found." "$log"; then
      verdict=pass
    else
      verdict=FAIL
    fi
  else
    hits=$(grep -oE "(Invariant|Action property) [A-Za-z0-9_]+ is violated" "$log" | awk '{print $(NF-2)}' | sort -u)
    if { [ "$rc" -eq 12 ] || [ "$rc" -eq 13 ]; } && [ "$hits" = "$expected" ] \
      && grep -q "The behavior up to this point is:" "$log"; then
      verdict=pass
    else
      verdict=FAIL
    fi
  fi
  [ "$verdict" = pass ] || failed=1
  states=$(grep -oE "[0-9,]+ states generated, [0-9,]+ distinct states found" "$log" | tail -1)
  depth=$(grep -oE "depth of the complete state graph search is [0-9]+" "$log" | awk '{print $NF}')
  echo "$name expected=$expected rc=$rc seconds=$seconds verdict=$verdict states=[$states] depth=${depth:--}" >> out/summary.txt
done <<< "$CASES"
rm -rf out/meta-*
mkdir -p "$OUT" && cp out/* "$OUT"/
cat out/summary.txt
exit "$failed"
