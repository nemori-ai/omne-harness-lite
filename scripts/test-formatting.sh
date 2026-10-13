#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/git-environment.sh"
main() {

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

node -e '
  const fs = require("node:fs")
  const settings = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  const prettierPackage = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
  if (settings["prettier.prettierPath"] !== "./node_modules/prettier") process.exit(1)
  if (settings["prettier.resolveGlobalModules"] !== false) process.exit(1)
  if (prettierPackage.version !== "3.9.6") process.exit(1)
' "$repo_root/.vscode/settings.json" "$repo_root/node_modules/prettier/package.json" ||
    fail "editor settings do not resolve the pinned workspace Prettier"

mkdir -p \
    "$sandbox/scripts" \
    "$sandbox/node_modules/.bin" \
    "$sandbox/packages/demo/src" \
    "$sandbox/packages/demo/upstream" \
    "$sandbox/tools/ts-helper/src" \
    "$sandbox/examples/demo/src" \
    "$sandbox/spec" \
    "$sandbox/.vscode"
cp -- "$repo_root/scripts/format.sh" "$sandbox/scripts/format.sh"
cp -- "$repo_root/scripts/git-environment.sh" "$sandbox/scripts/git-environment.sh"
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
printf '%s\n' 'export const example={interactive:true}' >"$sandbox/examples/demo/src/index.ts"
printf '%s\n' 'export const helper={ready:true}' >"$sandbox/tools/ts-helper/src/index.ts"
printf '%s\n' '{"compilerOptions":{"strict":true}}' >"$sandbox/tsconfig.test.json"
printf '%s\n' 'const upstream={must:"stay byte-identical"}' >"$sandbox/packages/demo/upstream/original.ts"
printf '%s\n' 'const specification={must:"stay byte-identical"}' >"$sandbox/spec/ignored.ts"
printf '%s\n' '{"scripts":{"format:staged":"./scripts/format.sh staged"}}' >"$sandbox/package.json"
mkdir -p "$sandbox/packages/nested/archive.legacy/src" "$sandbox/tools/extra.legacy"
printf '%s\n' 'const legacy={stay:unformatted}' >"$sandbox/packages/nested/archive.legacy/src/ignored.ts"
printf '%s\n' 'const legacy={stay:unformatted}' >"$sandbox/tools/extra.legacy/ignored.ts"
legacy_before="$(sha256sum "$sandbox/packages/nested/archive.legacy/src/ignored.ts")"
upstream_before="$(sha256sum "$sandbox/packages/demo/upstream/original.ts")"
spec_before="$(sha256sum "$sandbox/spec/ignored.ts")"

if "$sandbox/scripts/format.sh" check >/dev/null 2>&1; then
    fail "an unformatted maintained TypeScript file passed check"
fi
"$sandbox/scripts/format.sh" write >/dev/null
"$sandbox/scripts/format.sh" check >/dev/null
"$sandbox/scripts/format.sh" check examples/demo/src/index.ts >/dev/null
# Default collection must ignore tracked paths already deleted from the worktree.
printf '%s\n' 'export const deleted = true' >"$sandbox/packages/demo/src/deleted.ts"
git -C "$sandbox" add packages/demo/src/deleted.ts
rm -- "$sandbox/packages/demo/src/deleted.ts"
"$sandbox/scripts/format.sh" check >/dev/null || fail "a deleted tracked file was passed to Prettier"
git -C "$sandbox" rm --cached -q -- packages/demo/src/deleted.ts
# A dangling link still exists and must reach Prettier's rejection path.
ln -s missing-target.ts "$sandbox/packages/demo/src/dangling.ts"
git -C "$sandbox" add packages/demo/src/dangling.ts
if "$sandbox/scripts/format.sh" check >/dev/null 2>&1; then
    fail "a dangling tracked symlink disappeared from the default formatting scope"
fi
git -C "$sandbox" rm --cached -q -- packages/demo/src/dangling.ts
rm -- "$sandbox/packages/demo/src/dangling.ts"
[[ "$legacy_before" == "$(sha256sum "$sandbox/packages/nested/archive.legacy/src/ignored.ts")" ]] || fail "nested legacy source was formatted"
if "$sandbox/scripts/format.sh" check packages/nested/archive.legacy/src/ignored.ts >/dev/null 2>&1; then
    fail "an explicit legacy target was accepted"
fi
mkdir -p "$sandbox/packages/nested/archive.legacy-not/src"
printf '%s\n' 'const active={must:beFormatted}' >"$sandbox/packages/nested/archive.legacy-not/src/active.ts"
if "$sandbox/scripts/format.sh" check >/dev/null 2>&1; then
    fail "a similar active directory was excluded"
fi
"$sandbox/scripts/format.sh" write >/dev/null
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

# Exercise the installed hook through Git itself. The first commit must be
# rejected from the unformatted index even though its worktree copy is clean.
printf '%s\n' 'const staged={hook:false}' >"$sandbox/packages/demo/src/space name.ts"
git -C "$sandbox" add "packages/demo/src/space name.ts"
printf '%s\n' 'const working = { hook: true }' >"$sandbox/packages/demo/src/space name.ts"
index_before="$(git -C "$sandbox" rev-parse ':packages/demo/src/space name.ts')"
worktree_before="$(sha256sum "$sandbox/packages/demo/src/space name.ts")"
if git -C "$sandbox" commit -qm hook-must-reject >/dev/null 2>&1; then
    fail "Git commit accepted an unformatted staged blob"
fi
[[ "$index_before" == "$(git -C "$sandbox" rev-parse ':packages/demo/src/space name.ts')" ]] ||
    fail "rejected Git commit changed the index"
[[ "$worktree_before" == "$(sha256sum "$sandbox/packages/demo/src/space name.ts")" ]] ||
    fail "rejected Git commit changed the worktree"

# A formatted index must commit while a different unformatted worktree copy
# remains untouched and unstaged.
printf '%s\n' 'const staged = { hook: true }' >"$sandbox/packages/demo/src/space name.ts"
git -C "$sandbox" add "packages/demo/src/space name.ts"
printf '%s\n' 'const working={hook:"preserved"}' >"$sandbox/packages/demo/src/space name.ts"
worktree_before="$(sha256sum "$sandbox/packages/demo/src/space name.ts")"
git -C "$sandbox" commit -qm hook-must-allow >/dev/null 2>&1 ||
    fail "Git commit rejected a formatted staged blob"
committed_blob="$(git -C "$sandbox" show HEAD:'packages/demo/src/space name.ts')"
[[ "$committed_blob" == 'const staged = { hook: true }' ]] ||
    fail "Git commit did not preserve the formatted staged blob"
[[ "$worktree_before" == "$(sha256sum "$sandbox/packages/demo/src/space name.ts")" ]] ||
    fail "successful Git commit changed the unstaged worktree copy"

printf '%s\n' '#!/usr/bin/env sh' 'exit 0' >"$hook_path"
chmod +x "$hook_path"
hook_before="$(sha256sum "$hook_path")"
if "$sandbox/scripts/install-format-hook.sh" >/dev/null 2>&1; then
    fail "installer overwrote an existing hook"
fi
[[ "$hook_before" == "$(sha256sum "$hook_path")" ]] || fail "existing hook contents changed"

echo "Formatting scope, idempotence, staged-index, real-commit, editor-path, and hook-install tests passed."
}
omne_fixture_command main "$@"
