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

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        build-essential \
        ca-certificates \
        curl \
        git \
        python-is-python3 \
        python3 \
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
    && chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu
WORKDIR /home/ubuntu
