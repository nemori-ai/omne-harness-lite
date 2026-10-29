#!/bin/bash
# Per-session bootstrap for Claude Code on the web. setup.sh registers this file as
# a user-level SessionStart hook for startup and resume; the platform caches setup.sh,
# so work that must happen at every session start lives here. Outside cloud sessions it does nothing.
# Steps that fail print a diagnostic and the session still starts.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

NODE_ROOT=/opt/node26
export PATH="$NODE_ROOT/bin:/root/.local/bin:$PATH"
# Claude's Bash tool runs this file before each command.
# Node fetch connects directly unless NODE_USE_ENV_PROXY is set. Network secrets are
# added by the proxy, so a direct request gets 401. NO_PROXY keeps local hosts direct.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    printf '%s\n' "export PATH=$NODE_ROOT/bin:\$PATH" "export NODE_USE_ENV_PROXY=1" >> "$CLAUDE_ENV_FILE"
fi

warn() { printf 'session-start: %s\n' "$*" >&2; }

# CONTRIBUTING.md: author and committer are the responsible person. Values set in
# the cloud environment settings (GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL) win. A missing
# value comes from the GitHub account that started the session: its username, and
# its noreply address, because the API does not return a private email.
name=${GIT_AUTHOR_NAME:-}
email=${GIT_AUTHOR_EMAIL:-}
if [ -z "$name" ] || [ -z "$email" ]; then
    if identity=$(gh api user --jq '"\(.id) \(.login)"' 2>/dev/null) && [ -n "$identity" ]; then
        read -r gh_id gh_login <<<"$identity"
        name=${name:-$gh_login}
        email=${email:-${gh_id}+${gh_login}@users.noreply.github.com}
    fi
fi
if [ -n "$name" ] && [ -n "$email" ]; then
    if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
        printf 'export %s=%q\n' \
            GIT_AUTHOR_NAME "$name" GIT_AUTHOR_EMAIL "$email" \
            GIT_COMMITTER_NAME "$name" GIT_COMMITTER_EMAIL "$email" >> "$CLAUDE_ENV_FILE"
    fi
    printf 'session-start: git identity %s <%s>\n' "$name" "$email"
else
    warn "no git identity from the environment or gh api user; left as configured"
fi

root=$(cd "$(dirname "$0")" && git rev-parse --show-toplevel) || exit 0
cd "$root" || exit 0

# Bring main to the remote head. Local work is never discarded: a diverged main or
# a dirty checkout of main is reported and left as it is.
before=$(git rev-parse HEAD 2>/dev/null)
# Role evaluations check out pinned base commits, so a shallow clone gets full history.
depth=()
[ "$(git rev-parse --is-shallow-repository)" = "true" ] && depth=(--unshallow)
if git fetch --quiet --prune "${depth[@]}" origin; then
    branch=$(git symbolic-ref --quiet --short HEAD || true)
    if [ "$branch" = "main" ]; then
        git merge --ff-only --quiet origin/main || warn "main cannot fast-forward to origin/main; left unchanged"
    elif ! git fetch --quiet origin main:main 2>/dev/null; then
        git show-ref --verify --quiet refs/heads/main \
            && warn "local main cannot fast-forward to origin/main; left unchanged" \
            || git branch --quiet main origin/main
    fi
    printf 'session-start: main at %s, origin/main at %s\n' \
        "$(git rev-parse --short main 2>/dev/null)" "$(git rev-parse --short origin/main)"
else
    warn "git fetch origin failed"
fi

# Dependencies and agent projections follow the checked-out tree.
dependency_state=$(git rev-parse --git-path omne-cloud-dependencies.sha256)
fingerprint=$(sha256sum pnpm-lock.yaml uv.lock package.json pnpm-workspace.yaml pyproject.toml) || fingerprint=
if [ -z "$fingerprint" ] || [ "$fingerprint" != "$(cat "$dependency_state" 2>/dev/null)" ] \
    || [ "$(git rev-parse HEAD)" != "$before" ] || [ ! -d node_modules ] || [ ! -d .venv ]; then
    # A failed attempt must retry even if the next session returns to the old inputs.
    rm -f "$dependency_state"
    if uv sync --locked --quiet \
        && pnpm install --frozen-lockfile --ignore-scripts --reporter=silent \
        && pnpm -r rebuild node-pty >/dev/null; then
        if [ -n "$fingerprint" ]; then
            printf '%s\n' "$fingerprint" > "$dependency_state" || warn "dependency state could not be saved"
        fi
    else
        warn "dependency synchronization failed; will retry at next session start"
    fi
fi
agents() {
    PYTHONDONTWRITEBYTECODE=1 uv run --locked python \
        .meta_harness/tooling/src/initialize_agents.py --project-root . "$@" >/dev/null
}
if ! agents --check 2>/dev/null; then
    # The projections are gitignored build output; replace them with a fresh build.
    rm -rf .meta_harness/.claude .meta_harness/.agents .meta_harness/.codex
    find .meta_harness/.cursor -mindepth 1 -maxdepth 1 \
        ! -name Dockerfile ! -name environment.json ! -name install.sh -exec rm -rf {} +
    agents || warn "agent projections failed to build"
fi

# Unverified: if Claude Code loads plugins before this hook, updates apply from the next session.
claude plugin marketplace update pstack-claude >/dev/null || warn "pstack marketplace update failed"
claude plugin marketplace update mattpocock >/dev/null || warn "mattpocock marketplace update failed"
claude plugin update pstack@pstack-claude --scope user >/dev/null || warn "pstack update failed"
claude plugin update mattpocock-skills@mattpocock --scope user >/dev/null || warn "mattpocock-skills update failed"
# ub-mode is one SKILL.md, not a plugin. Replace it only after a complete download
# that names ub-mode. Otherwise keep the previous file.
ub_mode_dir="$HOME/.claude/skills/ub-mode"
ub_mode_tmp=
if mkdir -p "$ub_mode_dir" \
    && ub_mode_tmp=$(mktemp "$ub_mode_dir/SKILL.md.XXXXXX") \
    && curl -fsSL https://raw.githubusercontent.com/unclebob/ub-mode/master/SKILL.md -o "$ub_mode_tmp" \
    && grep -q '^name: ub-mode$' "$ub_mode_tmp" \
    && chmod 644 "$ub_mode_tmp" \
    && mv "$ub_mode_tmp" "$ub_mode_dir/SKILL.md"; then
    :
else
    if [ -n "$ub_mode_tmp" ]; then rm -f "$ub_mode_tmp"; fi
    warn "ub-mode update failed or the download is not a ub-mode SKILL.md; kept the previous file"
fi
exit 0
