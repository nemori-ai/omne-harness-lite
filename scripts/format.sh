#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 check|write [repository-relative-file ...]" >&2
    echo "       $0 staged" >&2
}

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
runner_root="$repo_root"
prettier="$runner_root/node_modules/.bin/prettier"

if [[ ! -x "$prettier" ]]; then
    echo "Prettier is not installed; run pnpm install --frozen-lockfile --ignore-scripts." >&2
    exit 2
fi

is_format_target() {
    local path="$1"
    local name="${path##*/}"

    case "$path" in
        /*|../*|*/../*|*/..)
            return 1
            ;;
        packages.0.0.1.legacy/*|apps.0.0.1.legacy/*|*/node_modules/*|*/dist/*|*/tmp/*|*/.worktrees/*|*/generated/*|*/upstream/*|spec/*|*.jsonl)
            return 1
            ;;
        .prettierrc.json|.vscode/settings.json|.vscode/extensions.json|.github/workflows/check.yml)
            return 0
            ;;
        packages/*|apps/*|examples/*|tools/*|scripts/*)
            case "$name" in
                *.js|*.jsx|*.cjs|*.mjs|*.ts|*.tsx|*.mts|*.cts|package.json|tsconfig*.json|vitest.config.*)
                    return 0
                    ;;
            esac
            ;;
        *)
            if [[ "$path" != */* ]]; then
                case "$name" in
                    *.js|*.jsx|*.cjs|*.mjs|*.ts|*.tsx|*.mts|*.cts|package.json|pnpm-workspace.yaml|tsconfig*.json|vitest.config.*)
                        return 0
                        ;;
                esac
            fi
            ;;
    esac
    return 1
}

run_prettier() {
    local mode="$1"
    shift
    if (( $# == 0 )); then
        echo "No formatting targets found."
        return 0
    fi
    if [[ "$mode" == check && "$repo_root" != "$runner_root" ]]; then
        node - "$runner_root" "$repo_root" "$@" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [runner, subject, ...files] = process.argv.slice(2)
const prettier = require(path.join(runner, 'node_modules/prettier'))
async function check() {
    const config = await prettier.resolveConfig(path.join(runner, '.prettierrc.json'))
    let failed = false
    for (const file of files) {
        const policyPath = path.join(runner, file)
        const info = await prettier.getFileInfo(policyPath, { ignorePath: path.join(runner, '.prettierignore') })
        if (info.ignored || info.inferredParser === null) continue
        if (!await prettier.check(fs.readFileSync(path.join(subject, file), 'utf8'), { ...config, filepath: policyPath })) {
            process.stderr.write(`Formatting differs: ${path.join(subject, file)}\n`)
            failed = true
        }
    }
    process.exitCode = failed ? 1 : 0
}
check().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2 })
NODE
        return "$?"
    fi
    "$prettier" "--$mode" \
        --config "$runner_root/.prettierrc.json" \
        --ignore-path "$runner_root/.prettierignore" \
        --ignore-unknown \
        "$@"
}

collect_default_targets() {
    local path
    while IFS= read -r -d '' path; do
        if is_format_target "$path" && [[ -e "$repo_root/$path" || -L "$repo_root/$path" ]]; then
            targets+=("$path")
        fi
    done < <(git -C "$repo_root" ls-files --cached --others --exclude-standard -z)
}

run_staged_check() {
    local path
    local failed=0
    local matched=0

    while IFS= read -r -d '' path; do
        if ! is_format_target "$path"; then
            continue
        fi
        matched=1
        echo "Checking staged $path"
        if ! git -C "$repo_root" show --no-textconv ":$path" |
            "$prettier" --check \
                --config "$runner_root/.prettierrc.json" \
                --ignore-path "$runner_root/.prettierignore" \
                --stdin-filepath "$repo_root/$path"; then
            failed=1
        fi
    done < <(git -C "$repo_root" diff --cached --name-only --diff-filter=ACMR -z)

    if (( matched == 0 )); then
        echo "No staged formatting targets found."
    fi
    return "$failed"
}

if (( $# == 0 )); then
    usage
    exit 2
fi

mode="$1"
shift
if [[ "$mode" == check && -n "${OMNE_SUBJECT_ROOT:-}" ]]; then
    repo_root="$(git -C "$OMNE_SUBJECT_ROOT" rev-parse --show-toplevel)"
    echo "Formatting subject $repo_root with rules from $runner_root"
fi
if [[ "${1:-}" == "--" ]]; then
    shift
fi
case "$mode" in
    staged)
        if (( $# != 0 )); then
            usage
            exit 2
        fi
        run_staged_check
        ;;
    check|write)
        declare -a targets=()
        if (( $# == 0 )); then
            collect_default_targets
        else
            for path in "$@"; do
                path="${path#./}"
                if ! is_format_target "$path" || [[ ! -f "$repo_root/$path" ]]; then
                    echo "Outside the maintained formatting scope or not a file: $path" >&2
                    exit 2
                fi
                targets+=("$path")
            done
        fi
        cd -- "$repo_root"
        run_prettier "$mode" "${targets[@]}"
        ;;
    *)
        usage
        exit 2
        ;;
esac
