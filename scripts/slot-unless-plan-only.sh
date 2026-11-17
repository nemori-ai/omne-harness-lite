#!/usr/bin/env bash
# 根脚本 test:affected 与 mutation 的入口：实际运行时整条命令向令牌池要令牌，带 --plan-only 只列范围时不要。
set -euo pipefail
for arg in "$@"; do
    if [[ "$arg" == --plan-only ]]; then
        exec "$@"
    fi
done
exec "$(dirname -- "${BASH_SOURCE[0]}")/with-test-slot.sh" "$@"
