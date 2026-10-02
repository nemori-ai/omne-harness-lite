#!/usr/bin/env bash
# Ground truth for the ten acceptance criteria in tasks/briefs/QA.md.
# Usage: qa-ground-truth.sh <checkout-root>
# Prints one line per criterion: "<id> pass|fail <detail>". Exit status is always 0
# unless the checkout cannot be run at all; the caller compares the lines.
set -u
root=${1:?checkout root}
cd "$root" || exit 64
omne=(node apps/cli/dist/main.js)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export LC_ALL=C.UTF-8
n=0

# run <name> <args...>: stdout/stderr/exit captured under $work/<name>.*
run() {
  local name=$1
  shift
  HOME="$work/home" "${omne[@]}" "$@" >"$work/$name.out" 2>"$work/$name.err" </dev/null
  echo $? >"$work/$name.rc"
}
rc() { cat "$work/$1.rc"; }
out() { cat "$work/$1.out"; }
err() { cat "$work/$1.err"; }
state() { n=$((n + 1)); echo "$work/state-$n"; }
# one-line JSON report with the given jq-free field checks (node does the parsing)
report() {
  node -e '
    const fs = require("node:fs")
    const text = fs.readFileSync(process.argv[1], "utf8")
    if (!text.endsWith("\n") || text.slice(0, -1).includes("\n")) process.exit(1)
    const doc = JSON.parse(text)
    const want = JSON.parse(process.argv[2])
    const get = (o, p) => p.split(".").reduce((v, k) => (v == null ? v : v[k]), o)
    for (const [path, value] of Object.entries(want))
      if (JSON.stringify(get(doc, path)) !== JSON.stringify(value)) process.exit(1)
  ' "$work/$1.out" "$2" 2>/dev/null
}
unopened='{"admission.status":"blocked","admission.reason":"invalid-input","remote.status":"not-attempted","remote.sendAttempted":false,"local.status":"not-requested","view.source":"none","use":"ended"}'
verdict() { echo "$1 $2 ${3:-}"; }
mkdir -p "$work/home"

# C1
ok=pass
for a in none help version; do
  case $a in none) run c1$a ;; help) run c1$a --help ;; version) run c1$a --version ;; esac
  [ "$(rc c1$a)" = 0 ] && [ -s "$work/c1$a.out" ] || ok=fail
done
grep -Eq '^omne 0\.0\.0 (development|[0-9a-f]{64})$' "$work/c1version.out" || ok=fail
[ -e "$work/home/.omne-harness-lite" ] && ok=fail
verdict C1 $ok

# C2
s=$(state)
run c2 center health --state-dir "$s"
ok=pass
[ "$(rc c2)" = 2 ] && [ "$(err c2)" = "omne: tty-required" ] && [ ! -s "$work/c2.out" ] && [ ! -e "$s" ] || ok=fail
verdict C2 $ok

# C3
ok=pass
s=$(state)
run c3a machine center health --state-dir "$s" --bogus 1
run c3b machine center health --state-dir "$s" --state-dir "$s"
run c3c machine center health extra --state-dir "$s"
run c3d machine no such command --state-dir "$s"
for c in c3a c3b c3c c3d; do
  [ "$(rc $c)" = 2 ] && report $c "$unopened" || ok=fail
  err $c | grep -Eqx 'omne: (invalid-options|invalid-command)' || ok=fail
done
[ -e "$s" ] && ok=fail
verdict C3 $ok

# C4
ok=pass
for a in help version; do
  run c4$a machine --$a
  [ "$(rc c4$a)" = 2 ] && report c4$a "$unopened" || ok=fail
done
verdict C4 $ok

# C5
ok=pass
i=0
for body in '{"a":1,"a":2}' '{"x":1.5}' '{"x":1e3}' '{"x":9007199254740993}' '[]' '{} trailing'; do
  i=$((i + 1))
  printf '%s' "$body" >"$work/p5-$i.json"
  run c5$i machine login --payload-file "$work/p5-$i.json" --state-dir "$(state)"
  [ "$(rc c5$i)" = 2 ] && [ "$(err c5$i)" = "omne: invalid-json" ] && report c5$i "$unopened" || ok=fail
  grep -q 'trailing\|9007199254740993' "$work/c5$i.out" "$work/c5$i.err" && ok=fail
done
verdict C5 $ok

# C6
ok=pass
printf '\xef\xbb\xbf{}' >"$work/p6-bom.json"
printf '{"x":"\xc0\xaf"}' >"$work/p6-bad.json"
for k in bom bad; do
  run c6$k machine login --payload-file "$work/p6-$k.json" --state-dir "$(state)"
  [ "$(rc c6$k)" = 2 ] && [ "$(err c6$k)" = "omne: invalid-encoding" ] && report c6$k "$unopened" || ok=fail
done
verdict C6 $ok

# C7
ok=pass
i=0
for body in '{"loginIdentifier":"p","credential":null}' '{"loginIdentifier":"p","credential":""}'; do
  i=$((i + 1))
  printf '%s' "$body" >"$work/p7-$i.json"
  run c7$i machine login --payload-file "$work/p7-$i.json" --state-dir "$(state)"
  [ "$(rc c7$i)" = 2 ] && [ "$(err c7$i)" = "omne: secret-source" ] && report c7$i "$unopened" || ok=fail
done
verdict C7 $ok

# C8: every machine call above produced exactly one JSON line and closed-code diagnostics
ok=pass
for f in "$work"/c3?.out "$work"/c5?.out "$work"/c6*.out "$work"/c7?.out; do
  name=$(basename "$f" .out)
  report "$name" '{"format":"governance-client/1"}' || ok=fail
  [ ! -s "$work/$name.err" ] || grep -Eqx 'omne: [a-z-]+' "$work/$name.err" || ok=fail
done
verdict C8 $ok

# C9
ok=pass
s=$(state)
run c9 tui --terminal-profile xterm-379 --state-dir "$s"
[ "$(rc c9)" = 2 ] && [ "$(err c9)" = "omne: tty-required" ] && [ ! -s "$work/c9.out" ] || ok=fail
run c9h tui --help
[ "$(rc c9h)" = 0 ] && grep -q 'machine' "$work/c9h.out" || ok=fail
[ -e "$s" ] || [ -e "$work/home/.omne-harness-lite" ] && ok=fail
verdict C9 $ok

# C10
ok=pass
s=$(state)
run c10 machine center health --state-dir "$s"
[ "$(rc c10)" = 2 ] && report c10 '{"admission.status":"blocked","admission.reason":"not-configured","remote.status":"not-attempted","remote.sendAttempted":false}' || ok=fail
verdict C10 $ok
