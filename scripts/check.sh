#!/usr/bin/env bash
set -euo pipefail

if (( $# )); then
    echo "Usage: $0 (optional BASELINE environment variable)" >&2
    exit 2
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_root"

# 整套检查占一个运行名额：同一台机器上别的全量检查在跑时排队，而不是一起把 CPU 压满。
if [[ -z "${OMNE_TEST_SLOT_HELD:-}" ]]; then
    exec ./scripts/with-test-slot.sh ./scripts/check.sh
fi

make --no-print-directory agents-check
make --no-print-directory docs-check
make --no-print-directory design-check
make --no-print-directory test
make --no-print-directory product-check
