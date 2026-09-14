#!/usr/bin/env bash
set -euo pipefail

if (( $# )); then
    echo "Usage: $0" >&2
    exit 2
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
sandbox="$(mktemp -d "${TMPDIR:-/tmp}/omne-format-test.XXXXXX")"
trap 'rm -rf -- "$sandbox"' EXIT

fail() {
    echo "formatting test failed: $*" >&2
    exit 1
}

mkdir -p \
    "$sandbox/scripts" \
    "$sandbox/node_modules/.bin" \
    "$sandbox/packages/demo/src" \
    "$sandbox/packages/demo/upstream" \
    "$sandbox/spec" \
    "$sandbox/.vscode"
cp -- "$repo_root/scripts/format.sh" "$sandbox/scripts/format.sh"
cp -- "$repo_root/scripts/pre-commit-format" "$sandbox/scripts/pre-commit-format"
cp -- "$repo_root/scripts/install-format-hook.sh" "$sandbox/scripts/install-format-hook.sh"
cp -- "$repo_root/.prettierrc.json" "$sandbox/.prettierrc.json"
cp -- "$repo_root/.prettierignore" "$sandbox/.prettierignore"
ln -s -- "$(readlink -f "$repo_root/node_modules/prettier/bin/prettier.cjs")" \
    "$sandbox/node_modules/.bin/prettier"

git -C "$sandbox" init -q
git -C "$sandbox" config user.email formatting-test@example.invalid
git -C "$sandbox" config user.name "Formatting Test"

printf '%s\n' 'const value={nested:[1,2,3]}' >"$sandbox/packages/demo/src/space name.ts"
printf '%s\n' 'const upstream={must:"stay byte-identical"}' >"$sandbox/packages/demo/upstream/original.ts"
printf '%s\n' 'const specification={must:"stay byte-identical"}' >"$sandbox/spec/ignored.ts"
upstream_before="$(sha256sum "$sandbox/packages/demo/upstream/original.ts")"
spec_before="$(sha256sum "$sandbox/spec/ignored.ts")"

if "$sandbox/scripts/format.sh" check >/dev/null 2>&1; then
    fail "an unformatted maintained TypeScript file passed check"
fi
"$sandbox/scripts/format.sh" write >/dev/null
"$sandbox/scripts/format.sh" check >/dev/null
first_write="$(sha256sum "$sandbox/packages/demo/src/space name.ts")"
"$sandbox/scripts/format.sh" write >/dev/null
second_write="$(sha256sum "$sandbox/packages/demo/src/space name.ts")"
[[ "$first_write" == "$second_write" ]] || fail "a second write changed formatted output"
[[ "$upstream_before" == "$(sha256sum "$sandbox/packages/demo/upstream/original.ts")" ]] ||
    fail "upstream source was changed"
[[ "$spec_before" == "$(sha256sum "$sandbox/spec/ignored.ts")" ]] ||
    fail "spec source was changed"
if "$sandbox/scripts/format.sh" write spec/ignored.ts >/dev/null 2>&1; then
    fail "an explicit path escaped the maintained formatting scope"
fi

printf '%s\n' '# fixture' >"$sandbox/README.md"
git -C "$sandbox" add .
git -C "$sandbox" commit -qm baseline

# The staged blob is formatted while the worktree copy is not. A correct staged
# check reads the index, succeeds, and mutates neither side.
printf '%s\n' 'const staged = { ok: true }' >"$sandbox/packages/demo/src/space name.ts"
git -C "$sandbox" add "packages/demo/src/space name.ts"
printf '%s\n' 'const working={different:true}' >"$sandbox/packages/demo/src/space name.ts"
index_before="$(git -C "$sandbox" rev-parse ':packages/demo/src/space name.ts')"
worktree_before="$(sha256sum "$sandbox/packages/demo/src/space name.ts")"
"$sandbox/scripts/format.sh" staged >/dev/null
[[ "$index_before" == "$(git -C "$sandbox" rev-parse ':packages/demo/src/space name.ts')" ]] ||
    fail "staged check changed the index"
[[ "$worktree_before" == "$(sha256sum "$sandbox/packages/demo/src/space name.ts")" ]] ||
    fail "staged check changed the worktree"

# Reverse the contents: the index is unformatted and the worktree is formatted.
# This must fail, proving the check cannot report the commit as clean from the
# worktree copy.
printf '%s\n' 'const staged={ok:false}' >"$sandbox/packages/demo/src/space name.ts"
git -C "$sandbox" add "packages/demo/src/space name.ts"
printf '%s\n' 'const working = { different: false }' >"$sandbox/packages/demo/src/space name.ts"
index_before="$(git -C "$sandbox" rev-parse ':packages/demo/src/space name.ts')"
worktree_before="$(sha256sum "$sandbox/packages/demo/src/space name.ts")"
if "$sandbox/scripts/format.sh" staged >/dev/null 2>&1; then
    fail "an unformatted staged blob passed because the worktree was formatted"
fi
[[ "$index_before" == "$(git -C "$sandbox" rev-parse ':packages/demo/src/space name.ts')" ]] ||
    fail "failing staged check changed the index"
[[ "$worktree_before" == "$(sha256sum "$sandbox/packages/demo/src/space name.ts")" ]] ||
    fail "failing staged check changed the worktree"

git -C "$sandbox" commit -qm staged-fixture
printf '%s\n' '# documentation only' >"$sandbox/README.md"
git -C "$sandbox" add README.md
"$sandbox/scripts/format.sh" staged >/dev/null || fail "no matching staged file should pass"

"$sandbox/scripts/install-format-hook.sh" >/dev/null
hook_path="$(git -C "$sandbox" rev-parse --git-path hooks/pre-commit)"
if [[ "$hook_path" != /* ]]; then
    hook_path="$sandbox/$hook_path"
fi
cmp -s -- "$sandbox/scripts/pre-commit-format" "$hook_path" ||
    fail "installer did not copy the expected hook"
"$sandbox/scripts/install-format-hook.sh" >/dev/null || fail "reinstalling the same hook failed"
printf '%s\n' '#!/usr/bin/env sh' 'exit 0' >"$hook_path"
chmod +x "$hook_path"
hook_before="$(sha256sum "$hook_path")"
if "$sandbox/scripts/install-format-hook.sh" >/dev/null 2>&1; then
    fail "installer overwrote an existing hook"
fi
[[ "$hook_before" == "$(sha256sum "$hook_path")" ]] || fail "existing hook contents changed"

echo "Formatting scope, idempotence, staged-index, and hook-install tests passed."
