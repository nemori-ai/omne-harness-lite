#!/usr/bin/env bash
set -euo pipefail

if (( $# )); then
    echo "Usage: $0" >&2
    exit 2
fi

# Compare physical paths. macOS TMPDIR is /var/folders, and /var is a symlink to /private/var.
physical_path() (
    cd -P -- "$1" && pwd -P
)
repo_root="$(physical_path "$(dirname -- "${BASH_SOURCE[0]}")/..")"
source "$repo_root/scripts/git-environment.sh"
git_root="$(physical_path "$(omne_repository_command git -C "$repo_root" rev-parse --show-toplevel)")"
if [[ "$git_root" != "$repo_root" ]]; then
    echo "Installer must live in the repository's scripts directory." >&2
    exit 2
fi
source_hook="$repo_root/scripts/pre-commit-format"
hook_path="$(omne_repository_command git -C "$repo_root" rev-parse --git-path hooks/pre-commit)"
if [[ "$hook_path" != /* && "$hook_path" != [A-Za-z]:* ]]; then
    hook_path="$repo_root/$hook_path"
fi

if [[ -e "$hook_path" || -L "$hook_path" ]]; then
    if cmp -s -- "$source_hook" "$hook_path"; then
        echo "Formatting pre-commit hook is already installed at $hook_path"
        exit 0
    fi
    echo "Refusing to overwrite existing pre-commit hook: $hook_path" >&2
    exit 1
fi

# A repository initialised without Git templates has no hooks directory yet.
mkdir -p -- "$(dirname -- "$hook_path")"
install -m 0755 -- "$source_hook" "$hook_path"
echo "Installed formatting pre-commit hook at $hook_path"
