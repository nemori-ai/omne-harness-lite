#!/usr/bin/env bash
# 根脚本 test:affected 与 mutation 的入口：实际运行时占一个运行名额，带 --plan-only 只列范围时不占。
set -euo pipefail
for arg in "$@"; do
    if [[ "$arg" == --plan-only ]]; then
        exec "$@"
    fi
done
exec "$(dirname -- "${BASH_SOURCE[0]}")/with-test-slot.sh" "$@"
