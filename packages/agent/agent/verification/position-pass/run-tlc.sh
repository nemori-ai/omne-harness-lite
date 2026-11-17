#!/usr/bin/env bash
# Runs every configuration in expect.txt and compares the result with the expectation.
# Usage: TLA2TOOLS_JAR=/path/to/tla2tools.jar ./run-tlc.sh [log-directory]
set -u
cd "$(dirname "$0")"
JAR="${TLA2TOOLS_JAR:?set TLA2TOOLS_JAR to the pinned tla2tools.jar}"
LOGS="${1:-$(mktemp -d)}"
mkdir -p "$LOGS"
failed=0
while read -r cfg want; do
  [ -z "$cfg" ] && continue
  meta="$(mktemp -d)"
  log="$LOGS/${cfg%.cfg}.log"
  # -deadlock: the pass ends in a terminal state by design, so a state without a successor is legal.
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -deadlock -workers 1 -seed 1337 -fp 0 \
    -config "$cfg" -metadir "$meta" PositionPass.tla >"$log" 2>&1
  rm -rf "$meta"
  if grep -q 'Model checking completed. No error has been found' "$log"; then
    got=pass
  else
    got="$(grep -o -E 'Invariant [A-Za-z]+ is violated' "$log" | head -1 | awk '{print $2}')"
    [ -z "$got" ] && got=error
  fi
  states="$(grep -o -E '[0-9]+ distinct states found' "$log" | tail -1)"
  if [ "$got" = "$want" ]; then verdict=ok; else verdict=MISMATCH; failed=1; fi
  printf '%-28s want=%-22s got=%-22s %-8s %s\n' "$cfg" "$want" "$got" "$verdict" "$states"
done <expect.txt
echo "logs: $LOGS"
exit "$failed"
