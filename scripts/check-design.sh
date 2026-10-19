#!/usr/bin/env bash
# 根脚本 check:design 的入口：设计源核对，再核对领域对象；--stale <值> 只交给第二条。
set -euo pipefail
stale=()
while (( $# )); do
    case "$1" in
        --stale)
            (( $# >= 2 )) || { echo "--stale 要给值" >&2; exit 2; }
            stale=(--stale "$2")
            shift 2
            ;;
        *)
            echo "用法：pnpm run check:design [--stale <值>]" >&2
            exit 2
            ;;
    esac
done
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
export PYTHONDONTWRITEBYTECODE=1
uv run --locked python .meta_harness/tooling/src/check_sources.py --root .meta_harness/design --source-root .
uv run --locked python .meta_harness/tooling/src/domain_objects.py --root .meta_harness/design ${stale[@]+"${stale[@]}"}
