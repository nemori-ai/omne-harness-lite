#!/bin/bash
# Claude Code on the web setup script for omne-harness-lite.
# The authored copy lives in .meta_harness/agents/cloud/claude-code/. Claude Code
# does not read it from the checkout: paste this whole file into the cloud
# environment's Setup script field. It runs as root before Claude Code starts,
# and the platform snapshots the result, so later sessions skip it. Work for every
# session start belongs to session-start.sh, which this script registers as a hook.
# NODE_VERSION must satisfy the root package.json engines range (>=24).
# PNPM_VERSION must match the root package.json packageManager field.
set -euo pipefail

NODE_VERSION=26.12.0
PNPM_VERSION=10.28.1
UV_VERSION=0.13.0
NODE_ROOT=/opt/node26
REPOSITORY=/home/user/omne-harness-lite

# rsync: role evaluations copy checkouts with it.
if ! command -v rsync >/dev/null 2>&1; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends rsync
fi

if [ "$("$NODE_ROOT/bin/node" --version 2>/dev/null || true)" != "v${NODE_VERSION}" ]; then
    tmp=$(mktemp -d)
    tarball="node-v${NODE_VERSION}-linux-x64.tar.xz"
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${tarball}" -o "$tmp/${tarball}"
    grep " ${tarball}\$" "$tmp/SHASUMS256.txt" | (cd "$tmp" && sha256sum -c -)
    mkdir -p "$NODE_ROOT"
    tar -xJf "$tmp/${tarball}" -C "$NODE_ROOT" --strip-components=1
    rm -f "$tmp/SHASUMS256.txt" "$tmp/${tarball}"
    rmdir "$tmp"
fi
export PATH="$NODE_ROOT/bin:$PATH"
node --version | grep -qx "v${NODE_VERSION}"
if [ "$(pnpm --version 2>/dev/null || true)" != "$PNPM_VERSION" ]; then
    npm install -g --no-fund --no-audit "pnpm@${PNPM_VERSION}"
fi
hash -r
pnpm --version | grep -qx "$PNPM_VERSION"

# The image puts /opt/node22/bin on PATH from /etc/profile.d/nodejs.sh. Put Node 26
# in front for login shells and for the shell that Claude's Bash tool snapshots.
printf '%s\n' "export PATH=$NODE_ROOT/bin:\$PATH" > /etc/profile.d/nodejs.sh
marker='# omne-harness-lite: Node 26 first'
if ! grep -Fqx "$marker" /root/.bashrc 2>/dev/null; then
    printf '\n%s\n%s\n' "$marker" "export PATH=$NODE_ROOT/bin:\$PATH" >> /root/.bashrc
fi

# The image has an older uv in /root/.local/bin. Replace it with the pinned one.
if ! uv --version 2>/dev/null | grep -q "^uv ${UV_VERSION}\b"; then
    curl -fsSL "https://astral.sh/uv/${UV_VERSION}/install.sh" \
        | env UV_UNMANAGED_INSTALL=/root/.local/bin INSTALLER_NO_MODIFY_PATH=1 sh
fi
/root/.local/bin/uv --version | grep -q "^uv ${UV_VERSION}\b"

# pstack, Matt and ub-mode track the upstream default branch. session-start.sh updates them.
claude plugin marketplace list 2>/dev/null | grep -q pstack-claude \
    || claude plugin marketplace add michael-denyer/pstack-claude
claude plugin marketplace list 2>/dev/null | grep -q mattpocock \
    || claude plugin marketplace add mattpocock/skills
claude plugin install pstack@pstack-claude --scope user
claude plugin install mattpocock-skills@mattpocock --scope user
# ub-mode is one SKILL.md, not a plugin. The file is replaced only after a complete
# download that names ub-mode. Otherwise setup prints a diagnostic, keeps the previous
# file and continues; session-start.sh retries it.
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
    printf 'setup: ub-mode download failed or is not a ub-mode SKILL.md; kept the previous file\n' >&2
fi

# Register the per-session bootstrap as a user-level SessionStart hook. The hook
# runs the script from the checkout, so it follows the branch that is checked out.
python3 - "$REPOSITORY" <<'PY'
import json, pathlib, sys
script = f"{sys.argv[1]}/.meta_harness/agents/cloud/claude-code/session-start.sh"
command = f'[ -x "{script}" ] && "{script}" || true'
path = pathlib.Path.home() / ".claude/settings.json"
settings = json.loads(path.read_text()) if path.exists() else {}
groups = settings.setdefault("hooks", {}).setdefault("SessionStart", [])
groups[:] = [g for g in groups if "omne-harness-lite" not in json.dumps(g)]
groups.append({"matcher": "startup|resume", "hooks": [{"type": "command", "command": command, "timeout": 300}]})
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(settings, indent=2) + "\n")
PY

# Install dependencies and agent projections when the checkout already exists.
# Do not run setup-matt-pocock-skills: it writes a second glossary into the repository.
if [ -f "$REPOSITORY/.meta_harness/tooling/src/initialize_agents.py" ]; then
    (
        cd "$REPOSITORY"
        /root/.local/bin/uv sync --locked
        pnpm install --frozen-lockfile --ignore-scripts
        pnpm -r rebuild node-pty
        PYTHONDONTWRITEBYTECODE=1 /root/.local/bin/uv run --locked python \
            .meta_harness/tooling/src/initialize_agents.py --project-root .
    )
fi
