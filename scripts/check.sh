#!/usr/bin/env bash
set -euo pipefail

if (( $# )); then
    echo "Usage: $0 (optional BASELINE environment variable)" >&2
    exit 2
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_root"

make --no-print-directory docs-check
make --no-print-directory spec-check
make --no-print-directory test
make --no-print-directory product-check
