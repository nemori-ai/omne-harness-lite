#!/usr/bin/env bash
# Runs every cfg named in expect.txt with TLC: "<cfg> pass" or "<cfg> <Invariant>".
# A control counts as a hit only when the log names its invariant. The model is bounded,
# so reaching the bounds is not a deadlock (-deadlock).
#   run-models.sh <output directory outside the repository>
set -u
cd "$(dirname "$0")" || exit 2
OUT=${1:?output directory}
JAR=${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}
rm -rf "$OUT"; mkdir -p "$OUT"; fail=0
while read -r cfg expect; do
  [ -z "$cfg" ] && continue
  name=${cfg%.cfg}
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -deadlock -workers 4 \
    -metadir "$OUT/meta-$name" -config "$cfg" WorkingDirectory.tla > "$OUT/$name.log" 2>&1
  rc=$?
  states=$(grep -Eo '[0-9,]+ states generated, [0-9,]+ distinct states found' "$OUT/$name.log" | tail -n 1)
  if [ "$expect" = pass ]; then
    if grep -q 'Model checking completed. No error has been found.' "$OUT/$name.log"; then verdict=ok; else verdict=FAIL; fail=1; fi
  else
    if grep -Eq "Invariant $expect is violated" "$OUT/$name.log"; then verdict=hit; else verdict=MISS; fail=1; fi
  fi
  echo "$name expect=$expect verdict=$verdict rc=$rc states=[$states]" | tee -a "$OUT/summary.txt"
done < expect.txt
rm -rf "$OUT"/meta-*
exit $fail
