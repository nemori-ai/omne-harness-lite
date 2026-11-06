#!/usr/bin/env bash
# One hand mutation: replace one exact text in one source file, rebuild, run the named test files
# with a vitest JSON report, restore the file byte for byte, rebuild, and check the restore.
# Usage: mutate.sh <id> <file> <old-text-file> <new-text-file> <build-filters> <test-dir> <vitest args...>
# <build-filters>: space-separated turbo filters, rebuilt in order after the change and after the restore.
set -u
root=/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable
out=$root/tmp/closures/w4-mcp-unusable-fix/mut
id=$1 file=$2 old=$3 new=$4 filters=$5 dir=$6
shift 6
log=$out/$id.log
json=$out/$id.json
backup=$(mktemp)
cp "$root/$file" "$backup"
build() {
  local args=()
  for f in $filters; do args+=(--filter="$f"); done
  (cd "$root" && pnpm turbo run build "${args[@]}" >/dev/null 2>&1)
}
{
  echo "id: $id"
  echo "head: $(git -C "$root" rev-parse --short HEAD)"
  echo "time: $(date -u +%FT%TZ)"
  echo "file: $file"
  node -e '
    const fs = require("node:fs")
    const [file, oldFile, newFile] = process.argv.slice(1)
    const text = fs.readFileSync(file, "utf8")
    const from = fs.readFileSync(oldFile, "utf8").replace(/\n$/, "")
    const to = fs.readFileSync(newFile, "utf8").replace(/\n$/, "")
    const at = text.indexOf(from)
    if (at < 0 || text.indexOf(from, at + 1) >= 0) { console.error("old text not found exactly once"); process.exit(2) }
    fs.writeFileSync(file, text.slice(0, at) + to + text.slice(at + from.length))
  ' "$root/$file" "$old" "$new" || { echo "replace failed"; exit 2; }
  echo "--- diff"
  git -C "$root" diff -- "$file"
  build
  echo "build after change: $?"
  echo "--- command: (cd $dir && NO_COLOR=1 VITEST_MAX_WORKERS=4 pnpm exec vitest run $* --reporter=default --reporter=json --outputFile.json=$json)"
  (cd "$root/$dir" && NO_COLOR=1 VITEST_MAX_WORKERS=4 pnpm exec vitest run "$@" --reporter=default --reporter=json --outputFile.json="$json") > "$out/$id.vitest.txt" 2>&1
  code=$?
  echo "exit: $code"
  echo "--- failed (from JSON report)"
  node -e '
    const r = require(process.argv[1])
    for (const f of r.testResults) {
      if (f.status === "failed" && f.assertionResults.every(a => a.status !== "failed"))
        console.log("FILE FAILED:", f.name, (f.message || "").slice(0, 300))
      for (const a of f.assertionResults) if (a.status === "failed") console.log(a.fullName)
    }
  ' "$json"
  cp "$backup" "$root/$file"
  cmp "$backup" "$root/$file" && echo "restored: byte-identical"
  git -C "$root" diff --quiet -- "$file" && echo "git diff --quiet: clean"
  build
  echo "build after restore: $?"
} > "$log" 2>&1
rm -f "$backup"
echo "$id exit=$(grep '^exit:' "$log" | cut -d' ' -f2) sha=$(sha256sum "$log" | cut -c1-12)"
