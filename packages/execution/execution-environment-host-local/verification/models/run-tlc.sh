#!/usr/bin/env bash
# Runs every configuration of the models in this directory with TLC.
#   <Module>.cfg and <Module>-<name>.cfg (not -unsafe-): must pass.
#   <Module>-unsafe-<name>.cfg: must violate one of the invariants it lists,
#   or, when it lists only properties, one of those properties.
#   Never* operators of <Module>.tla: each must be violated from <Module>.cfg,
#   so that the property it backs cannot hold vacuously.
# WindowsCustody.tla instances ProcessCustody.tla of the contract member; the
# script copies that one source next to the models and keeps no second copy.
# Usage: run-tlc.sh <output directory>
# Environment: TLA2TOOLS_JAR (required), JAVA_BIN (default: java), TLC_WORKERS (default: 4).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
CONTRACT_MODELS="$HERE/../../../execution-environment-contract/verification/models"
mkdir -p "${1:?output directory}" || exit 2
OUT=$(cd "$1" && pwd)
JAVA=${JAVA_BIN:-java}
JAR=${TLA2TOOLS_JAR:?TLA2TOOLS_JAR is not set}
JAR=$(cd "$(dirname "$JAR")" && pwd)/$(basename "$JAR")
WORKERS=${TLC_WORKERS:-4}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cp "$HERE"/*.tla "$HERE"/*.cfg "$WORK"/
cp "$CONTRACT_MODELS/ProcessCustody.tla" "$WORK"/
cd "$WORK" || exit 2
"$JAVA" -version > "$OUT/java-version.txt" 2>&1
sha256sum "$JAR" ./*.tla ./*.cfg > "$OUT/sha256.txt"
: > "$OUT/summary.txt"
failures=0

# tlc <module> <cfg> <name>: runs TLC, leaves the log in $OUT/<name>.log.
tlc() {
  local start rc
  start=$(date +%s)
  timeout 1800 "$JAVA" -XX:+UseParallelGC -Xmx6g -cp "$JAR" tlc2.TLC -workers "$WORKERS" \
    -deadlock -metadir "meta-$3" -config "$2" "$1.tla" > "$OUT/$3.log" 2>&1
  rc=$?
  rm -rf "meta-$3"
  SECONDS_USED=$(( $(date +%s) - start ))
  STATES=$(grep -oE '[0-9]+ distinct states found' "$OUT/$3.log" | tail -1 | cut -d' ' -f1)
  VIOLATED=$(grep -oE 'Invariant [A-Za-z0-9_]+ is violated' "$OUT/$3.log" | head -1 | cut -d' ' -f2)
  grep -qE 'Temporal properties were violated|Action property .* is violated' "$OUT/$3.log" &&
    VIOLATED=${VIOLATED:-property}
  return $rc
}

# expected <cfg>: the invariant names the cfg lists, inline or as a block,
# plus "property" when it lists properties.
expected() {
  awk '
    /^[A-Z_]+/ { section = $1; sub(/^[A-Z_]+[ \t]*/, "") }
    section ~ /^INVARIANTS?$/ { for (i = 1; i <= NF; i++) print $i }
  ' "$1"
  grep -qE '^PROPERT(Y|IES)' "$1" && echo property
}

report() { # report <name> <expect> <result> <ok>
  echo "$1 expect=$2 result=$3 ok=$4 seconds=$SECONDS_USED states=${STATES:-?}" >> "$OUT/summary.txt"
  [ "$4" = yes ] || failures=$((failures + 1))
}

for cfg in *.cfg; do
  name=${cfg%.cfg}
  module=${name%%-*}
  case $name in
    *-unsafe-*)
      expected=$(expected "$cfg")
      tlc "$module" "$cfg" "$name"
      ok=no
      for inv in $expected; do [ "${VIOLATED:-}" = "$inv" ] && ok=yes; done
      report "$name" "violation:$(echo $expected | tr ' ' '|')" "violated:${VIOLATED:-none}" $ok
      ;;
    *)
      tlc "$module" "$cfg" "$name"; rc=$?
      if [ $rc -eq 0 ] && [ -z "${VIOLATED:-}" ]; then report "$name" pass pass yes
      else report "$name" pass "rc=$rc violated:${VIOLATED:-none}" no; fi
      ;;
  esac
done

for tla in *.tla; do
  module=${tla%.tla}
  [ -f "$module.cfg" ] || continue
  for witness in $(grep -oE '^Never[A-Za-z0-9_]+' "$tla"); do
    cfg="$module-witness-$witness.cfg"
    sed -n '1,/^\(INVARIANT\|PROPERT\)/p' "$module.cfg" | grep -vE '^(INVARIANT|PROPERT)' > "$cfg"
    printf 'INVARIANT %s\nCHECK_DEADLOCK FALSE\n' "$witness" >> "$cfg"
    tlc "$module" "$cfg" "$module-witness-$witness"
    if [ "${VIOLATED:-}" = "$witness" ]; then ok=yes; else ok=no; fi
    report "$module-witness-$witness" "violation:$witness" "violated:${VIOLATED:-none}" $ok
  done
done

echo "failures=$failures" >> "$OUT/summary.txt"
cat "$OUT/summary.txt"
[ $failures -eq 0 ]
