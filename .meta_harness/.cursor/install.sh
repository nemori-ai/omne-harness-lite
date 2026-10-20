#!/bin/sh
# Idempotent Cloud Agent install. The authored copy lives in
# .meta_harness/agents/cloud/cursor/; compile_agents.py projects it to .cursor/.
# Cursor runs the projection from the repository root while it prepares a Build.
# The first three commands match docs/development.md.
# Git author identity belongs to the image wrapper at /usr/local/bin/git.
set -eu

root=$(git rev-parse --show-toplevel)
cd "$root"

uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
pnpm -r rebuild node-pty

# Agent compiler output is gitignored. pnpm run check:agents compares it with the source.
PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/compile_agents.py \
    --source .meta_harness/agents \
    --output .meta_harness

# An environment build can reuse a base image and only run this script.
# Repeat the Dockerfile install for the ubuntu cloud user. Other accounts stay unchanged.
if [ "$(id -un)" = "ubuntu" ] && sudo -n true 2>/dev/null; then
    dockerfile="$root/.cursor/Dockerfile"
    revision=$(sed -n 's/^ARG MATT_SKILLS_REVISION=//p' "$dockerfile")
    cli=$(sed -n 's/^ARG SKILLS_CLI_VERSION=//p' "$dockerfile")
    human_name=$(sed -n 's/^ARG GIT_HUMAN_NAME=//p' "$dockerfile")
    human_email=$(sed -n 's/^ARG GIT_HUMAN_EMAIL=//p' "$dockerfile")
    b64=$(sed -n 's/.*base64\.b64decode("\([A-Za-z0-9+/=]*\)").*/\1/p' "$dockerfile")
    test -n "$revision"
    test -n "$cli"
    test -n "$human_name"
    test -n "$human_email"
    test -n "$b64"
    printf '%s\n' "$human_name" "$human_email" | sudo tee /etc/git-human-identity >/dev/null
    printf '%s' "$b64" | base64 -d | sudo tee /usr/local/bin/git >/dev/null
    sudo chmod 755 /usr/local/bin/git
    installed=$(cat "$HOME/.agents/matt-skills-revision" 2>/dev/null || true)
    if [ "$installed" != "$revision" ] || [ ! -f "$HOME/.agents/skills/grill-with-docs/SKILL.md" ]; then
        tmp=$(mktemp -d)
        git init "$tmp"
        git -C "$tmp" remote add origin https://github.com/mattpocock/skills.git
        git -C "$tmp" fetch --depth 1 origin "$revision"
        git -C "$tmp" checkout --detach FETCH_HEAD
        test "$(git -C "$tmp" rev-parse HEAD)" = "$revision"
        CI=1 npx --yes "skills@${cli}" add "$tmp" -a cursor -g -s '*' -y --copy
        mkdir -p "$HOME/.cursor/skills"
        for dir in "$HOME/.agents/skills"/*/; do
            ln -sfn "$dir" "$HOME/.cursor/skills/$(basename "$dir")"
        done
        printf '%s\n' "$revision" > "$HOME/.agents/matt-skills-revision"
        rm -rf "$tmp" "$HOME/.npm"
    fi
    git config --global --get user.name | grep -Fqx "$human_name"
    git config --global --get user.email | grep -Fqx "$human_email"
fi
