#!/bin/sh
# Idempotent Cloud Agent install. The authored copy lives in
# .meta_harness/agents/cloud/; compile_agents.py projects it to .cursor/.
# Cursor runs the projection from the repository root while it prepares a Build.
# The first three commands match docs/development.md.
set -eu

root=$(git rev-parse --show-toplevel)
cd "$root"

uv sync --locked
pnpm install --frozen-lockfile --ignore-scripts
pnpm -r rebuild node-pty

# Agent compiler output is gitignored. make agents-check compares it with the source.
PYTHONDONTWRITEBYTECODE=1 uv run --locked python .meta_harness/tooling/src/compile_agents.py \
    --source .meta_harness/agents \
    --output .meta_harness
