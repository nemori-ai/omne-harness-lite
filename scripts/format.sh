#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 check|write [repository-relative-file ...]" >&2
    echo "       $0 staged" >&2
}

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
runner_root="$repo_root"
source "$runner_root/scripts/git-environment.sh"
oxfmt="$runner_root/node_modules/.bin/oxfmt"
config="$runner_root/.oxfmtrc.json"

if [[ ! -x "$oxfmt" ]]; then
    echo "oxfmt is not installed; run pnpm install --frozen-lockfile --ignore-scripts." >&2
    exit 2
fi

is_format_target() {
    local path="$1"
    local name="${path##*/}"

    case "$path" in
        /*|../*|*/../*|*/..)
            return 1
            ;;
        *.legacy/*|*/node_modules/*|*/dist/*|*/tmp/*|*/.worktrees/*|*/generated/*|*/upstream/*|spec/*|*.jsonl)
            return 1
            ;;
        .oxfmtrc.json|.vscode/settings.json|.vscode/extensions.json|.github/workflows/check.yml)
            return 0
            ;;
        examples/*|tools/*|scripts/*|packages/*|apps/*)
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

# oxfmt cannot combine --check with --stdin-filepath: format the text and compare the bytes.
check_text() {
    local source="$1" path="$2" formatted
    formatted="$(mktemp)"
    if ! (cd -- "$runner_root" && "$oxfmt" --config "$config" --stdin-filepath "$path" <"$source" >"$formatted") ||
        ! cmp -s -- "$source" "$formatted"; then
        rm -f -- "$formatted"
        return 1
    fi
    rm -f -- "$formatted"
}

run_formatter() {
    local mode="$1"
    shift
    if (( $# == 0 )); then
        echo "No formatting targets found."
        return 0
    fi
    # A tracked link to a missing file is an error, not an empty target. oxfmt drops an
    # unreadable path silently when other paths match (Prettier exited 2). Remove this guard when
    # oxfmt reports every unmatched explicit path.
    local path dangling=0 failed=0
    for path in "$@"; do
        if [[ -L "$path" && ! -e "$path" ]]; then
            echo "Dangling symbolic link in the formatting scope: $path" >&2
            dangling=1
        fi
    done
    (( dangling == 0 )) || return 2
    if [[ "$mode" == check && "$repo_root" != "$runner_root" ]]; then
        for path in "$@"; do
            if ! check_text "$repo_root/$path" "$path"; then
                echo "Formatting differs: $repo_root/$path" >&2
                failed=1
            fi
        done
        return "$failed"
    fi
    # The scope filter above admits only file types that oxfmt formats; ignorePatterns in the
    # config is a second guard for the same exclusions.
    case "$OSTYPE" in
        msys*|cygwin*)
            # The full target list exceeds the Windows command-line limit (32767 characters); xargs splits
            # it into runs that fit. xargs reports any failing run as 123, which is mapped to 1 so the
            # caller sees the same "formatting differs" status as on other platforms.
            local status=0
            printf '%s\0' "$@" | xargs -0 "$oxfmt" "--$mode" --config "$config" || status=$?
            (( status == 123 )) && status=1
            return "$status"
            ;;
        *)
            "$oxfmt" "--$mode" --config "$config" "$@"
            ;;
    esac
}

collect_default_targets() {
    local path
    while IFS= read -r -d '' path; do
        if is_format_target "$path" && [[ -e "$repo_root/$path" || -L "$repo_root/$path" ]]; then
            targets+=("$path")
        fi
    done < <(omne_repository_command git -C "$repo_root" ls-files --cached --others --exclude-standard -z)
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
        local staged
        staged="$(mktemp)"
        omne_staged_command git -C "$repo_root" show --no-textconv ":$path" >"$staged"
        if ! check_text "$staged" "$path"; then
            echo "Not formatted: $path" >&2
            failed=1
        fi
        rm -f -- "$staged"
    done < <(omne_staged_command git -C "$repo_root" diff --cached --name-only --diff-filter=ACMR -z)

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
    repo_root="$(omne_repository_command git -C "$OMNE_SUBJECT_ROOT" rev-parse --show-toplevel)"
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
        run_formatter "$mode" "${targets[@]}"
        ;;
    *)
        usage
        exit 2
        ;;
esac
