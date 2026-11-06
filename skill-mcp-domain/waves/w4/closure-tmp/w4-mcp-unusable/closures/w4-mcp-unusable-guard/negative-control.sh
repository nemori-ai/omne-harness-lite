#!/usr/bin/env bash
# Negative control of P15: lostOf rule 3 loses on an unmarked not-sent or no-answer too.
# Runs: positive (head as committed), mutated, restored. Each run builds @omne-harness/mcp first.
set -u
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
DIR=tmp/closures/w4-mcp-unusable-guard
LOGS=$DIR/logs
FILE=packages/mcp/mcp/src/internal/lost.ts
export NO_COLOR=1 FORCE_COLOR=0 VITEST_MAX_WORKERS=4
cp "$FILE" "$DIR/lost.ts.orig"

run() {
  local name=$1
  pnpm turbo run build --filter=@omne-harness/mcp --force > "$LOGS/$name-build.log" 2>&1
  echo "$name build exit $?" | tee -a "$LOGS/negative-control.txt"
  pnpm turbo run test --filter=@omne-harness/mcp --force > "$LOGS/$name-test.log" 2>&1
  local code=$?
  echo "$name test exit $code sha256 $(sha256sum "$LOGS/$name-test.log" | cut -c1-16) head $(git rev-parse --short=9 HEAD)" | tee -a "$LOGS/negative-control.txt"
}

: > "$LOGS/negative-control.txt"
run positive
python3 - "$FILE" <<'EOF'
import sys
path = sys.argv[1]
text = open(path).read()
old = 'return unusableOf(answer.unusable)\n'
assert text.count(old) == 2, text.count(old)
open(path, 'w').write(text.replace(old, "return unusableOf(answer.unusable ?? 'stream-broken')\n"))
EOF
git diff -- "$FILE" > "$LOGS/mutation.diff"
run mutated
cp "$DIR/lost.ts.orig" "$FILE"
if git diff --quiet -- "$FILE"; then echo "restored byte for byte" | tee -a "$LOGS/negative-control.txt"; else echo "NOT RESTORED" | tee -a "$LOGS/negative-control.txt"; fi
run restored
