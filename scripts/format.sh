#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 check|write [repository-relative-file ...]" >&2
    echo "       $0 staged" >&2
}

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
prettier="$repo_root/node_modules/.bin/prettier"

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
        */node_modules/*|*/dist/*|*/tmp/*|*/.worktrees/*|*/generated/*|*/upstream/*|spec/*|*.jsonl)
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
    "$prettier" "--$mode" \
        --config "$repo_root/.prettierrc.json" \
        --ignore-path "$repo_root/.prettierignore" \
        --ignore-unknown \
        "$@"
}

collect_default_targets() {
    local path
    while IFS= read -r -d '' path; do
        if is_format_target "$path"; then
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
                --config "$repo_root/.prettierrc.json" \
                --ignore-path "$repo_root/.prettierignore" \
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
