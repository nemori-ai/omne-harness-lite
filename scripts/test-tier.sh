#!/usr/bin/env bash
# 根脚本 test:tier 的入口：全部成员的某一层，先构建。层必须给：fast、slow 或 all（all 同 pnpm run test）。
set -euo pipefail
if (( $# != 1 )) || [[ "$1" != fast && "$1" != slow && "$1" != all ]]; then
    echo "用法：pnpm run test:tier fast|slow|all" >&2
    exit 2
fi
here="$(dirname -- "${BASH_SOURCE[0]}")"
exec "$here/with-test-slot.sh" node --experimental-strip-types "$here/../tools/test-runner/src/testing/cli.ts" run --all --tier "$1" --build
