# Cloud Agent image for omne-harness-lite.
# Cursor checks out the repository. Do not COPY the project into this image.
# NODE_VERSION must satisfy the root package.json engines range (>=24.18.0 <25).
# PNPM_VERSION must match the root package.json packageManager field.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHON=/usr/bin/python3

ARG NODE_VERSION=24.21.0
ARG PNPM_VERSION=10.28.1
ARG UV_VERSION=0.13.0
# Matt skills revision is owned by docs/engineering/skills.md. Do not float latest.
ARG MATT_SKILLS_REVISION=b0618bc436ad893b3c5e84e55fba86586d34a404
# skills CLI that copies a local tree for Cursor. 1.7.2 installs global Cursor skills
# under ~/.agents/skills. A tree URL is not used: that CLI treats the revision as a branch.
ARG SKILLS_CLI_VERSION=1.7.2
# GitHub account PanQiWei. This is the author on the squash commit that landed the
# previous image, not the Cursor Agent identity the host writes into ~/.gitconfig.
ARG GIT_HUMAN_NAME=潘其威(William)
ARG GIT_HUMAN_EMAIL=46810637+PanQiWei@users.noreply.github.com

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        git \
        python-is-python3 \
        python3 \
        rsync \
        sudo \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

RUN arch="$(dpkg --print-architecture)" \
    && case "$arch" in \
        amd64) node_arch=x64 ;; \
        arm64) node_arch=arm64 ;; \
        *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
        -o "/tmp/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
    && grep "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" /tmp/SHASUMS256.txt | (cd /tmp && sha256sum -c -) \
    && tar -xJf "/tmp/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -C /usr/local --strip-components=1 \
    && rm -f /tmp/SHASUMS256.txt "/tmp/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
    && node --version | grep -qx "v${NODE_VERSION}" \
    && npm install -g "pnpm@${PNPM_VERSION}" \
    && pnpm --version | grep -qx "${PNPM_VERSION}"

RUN curl -fsSL "https://astral.sh/uv/${UV_VERSION}/install.sh" | env UV_UNMANAGED_INSTALL=/usr/local/bin sh \
    && uv --version | grep -q "uv ${UV_VERSION}"

RUN git config --system --add safe.directory '*' \
    && id -u ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu \
    && usermod -aG sudo ubuntu \
    && printf '%s\n' 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu \
    && printf '%s\n' "$GIT_HUMAN_NAME" "$GIT_HUMAN_EMAIL" > /etc/git-human-identity \
    && python3 -c 'import base64, pathlib; path = pathlib.Path("/usr/local/bin/git"); path.write_text(base64.b64decode("IyEvYmluL3NoCiMgS2VlcCB0aGUgcmVzcG9uc2libGUgaHVtYW4gYXMgYXV0aG9yIGV2ZW4gYWZ0ZXIgQ3Vyc29yIHJld3JpdGVzIH4vLmdpdGNvbmZpZy4KIyBPdGhlciBrZXlzIGluIHRoYXQgZmlsZSwgaW5jbHVkaW5nIGNyZWRlbnRpYWwgVVJMIHJld3JpdGVzLCBzdGF5IGluIHBsYWNlLgpuYW1lPSQoc2VkIC1uICcxcCcgL2V0Yy9naXQtaHVtYW4taWRlbnRpdHkpCmVtYWlsPSQoc2VkIC1uICcycCcgL2V0Yy9naXQtaHVtYW4taWRlbnRpdHkpCnJlYWw9L3Vzci9iaW4vZ2l0CgphcHBseV9zY29wZSgpIHsKICBzY29wZT0kMQogIGN1cnJlbnQ9JCgiJHJlYWwiIGNvbmZpZyAiJHNjb3BlIiAtLWdldCB1c2VyLm5hbWUgMj4vZGV2L251bGwgfHwgdHJ1ZSkKICBjdXJyZW50X2VtYWlsPSQoIiRyZWFsIiBjb25maWcgIiRzY29wZSIgLS1nZXQgdXNlci5lbWFpbCAyPi9kZXYvbnVsbCB8fCB0cnVlKQogIHNpZ249JCgiJHJlYWwiIGNvbmZpZyAiJHNjb3BlIiAtLWJvb2wgLS1nZXQgY29tbWl0LmdwZ3NpZ24gMj4vZGV2L251bGwgfHwgdHJ1ZSkKICBpZiBbICIkY3VycmVudCIgIT0gIiRuYW1lIiBdIHx8IFsgIiRjdXJyZW50X2VtYWlsIiAhPSAiJGVtYWlsIiBdIHx8IFsgIiRzaWduIiAhPSAiZmFsc2UiIF07IHRoZW4KICAgICIkcmVhbCIgY29uZmlnICIkc2NvcGUiIHVzZXIubmFtZSAiJG5hbWUiIHx8IHJldHVybiAwCiAgICAiJHJlYWwiIGNvbmZpZyAiJHNjb3BlIiB1c2VyLmVtYWlsICIkZW1haWwiIHx8IHJldHVybiAwCiAgICAiJHJlYWwiIGNvbmZpZyAiJHNjb3BlIiBjb21taXQuZ3Bnc2lnbiBmYWxzZSB8fCByZXR1cm4gMAogIGZpCn0KCmlmIFsgIiQoaWQgLXUpIiAtZXEgMCBdOyB0aGVuCiAgYXBwbHlfc2NvcGUgLS1zeXN0ZW0gfHwgdHJ1ZQpmaQphcHBseV9zY29wZSAtLWdsb2JhbCB8fCB0cnVlCgpleHBvcnQgR0lUX0FVVEhPUl9OQU1FPSIkbmFtZSIKZXhwb3J0IEdJVF9BVVRIT1JfRU1BSUw9IiRlbWFpbCIKZXhwb3J0IEdJVF9DT01NSVRURVJfTkFNRT0iJG5hbWUiCmV4cG9ydCBHSVRfQ09NTUlUVEVSX0VNQUlMPSIkZW1haWwiCmV4cG9ydCBHSVRfQ09ORklHX0NPVU5UPTEKZXhwb3J0IEdJVF9DT05GSUdfS0VZXzA9Y29tbWl0LmdwZ3NpZ24KZXhwb3J0IEdJVF9DT05GSUdfVkFMVUVfMD1mYWxzZQpleGVjICIkcmVhbCIgIiRAIgo=").decode()); path.chmod(0o755)' \
    && test -x /usr/local/bin/git \
    && /usr/local/bin/git config --system --get user.name \
        | grep -Fqx "$GIT_HUMAN_NAME" \
    && /usr/local/bin/git config --system --get user.email \
        | grep -Fqx "$GIT_HUMAN_EMAIL"

ENV HOME=/home/ubuntu \
    GIT_AUTHOR_NAME=$GIT_HUMAN_NAME \
    GIT_AUTHOR_EMAIL=$GIT_HUMAN_EMAIL \
    GIT_COMMITTER_NAME=$GIT_HUMAN_NAME \
    GIT_COMMITTER_EMAIL=$GIT_HUMAN_EMAIL \
    GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0=commit.gpgsign \
    GIT_CONFIG_VALUE_0=false

USER ubuntu
WORKDIR /home/ubuntu

# Install the pinned Matt tree for Cursor. Do not run setup-matt-pocock-skills:
# that command writes a second glossary into the repository.
RUN git init /tmp/mattpocock-skills \
    && git -C /tmp/mattpocock-skills remote add origin https://github.com/mattpocock/skills.git \
    && git -C /tmp/mattpocock-skills fetch --depth 1 origin "$MATT_SKILLS_REVISION" \
    && git -C /tmp/mattpocock-skills checkout --detach FETCH_HEAD \
    && test "$(git -C /tmp/mattpocock-skills rev-parse HEAD)" = "$MATT_SKILLS_REVISION" \
    && CI=1 npx --yes "skills@${SKILLS_CLI_VERSION}" add /tmp/mattpocock-skills \
        -a cursor -g -s '*' -y --copy \
    && mkdir -p "$HOME/.cursor/skills" \
    && for dir in "$HOME/.agents/skills"/*/; do \
         ln -sfn "$dir" "$HOME/.cursor/skills/$(basename "$dir")"; \
       done \
    && test "$(find "$HOME/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l)" -eq 38 \
    && test -f "$HOME/.agents/skills/grill-with-docs/SKILL.md" \
    && test -f "$HOME/.agents/skills/to-spec/SKILL.md" \
    && test -f "$HOME/.agents/skills/to-tickets/SKILL.md" \
    && test -f "$HOME/.agents/skills/code-review/SKILL.md" \
    && test -f "$HOME/.agents/skills/codebase-design/SKILL.md" \
    && test -f "$HOME/.agents/skills/writing-for-agents/SKILL.md" \
    && test -f "$HOME/.cursor/skills/grill-with-docs/SKILL.md" \
    && printf '%s\n' "$MATT_SKILLS_REVISION" > "$HOME/.agents/matt-skills-revision" \
    && rm -rf /tmp/mattpocock-skills "$HOME/.npm" \
    && git config --global --get user.name | grep -Fqx "$GIT_HUMAN_NAME" \
    && git config --global --get user.email | grep -Fqx "$GIT_HUMAN_EMAIL" \
    && git config --global --bool --get commit.gpgsign | grep -Fqx false
