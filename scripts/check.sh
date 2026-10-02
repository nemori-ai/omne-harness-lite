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

# 回路状态的严格模式：方向与环、验收锁、开着的传感器都有数据。它只读源码与 git、不依赖构建产物，
# 放在最后是让前面的失败先报。基线取 BASELINE；没给就用 origin/main，本地没有这个引用就用 main。
# 产物写进被 git 忽略的 tmp/，回路目录里什么都不写。
baseline="${BASELINE:-}"
if [[ -z "$baseline" ]]; then
    baseline=main
    if git rev-parse --verify --quiet origin/main >/dev/null; then
        baseline=origin/main
    fi
fi
rm -rf tmp/loop-status-check
make --no-print-directory loop-status STRICT=1 BASE="$baseline" OUT=tmp/loop-status-check
