#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/git-environment.sh"
main() {
for arg in "$@"; do
    case "$arg" in
        --admission|--keep-going) ;;
        *)
            echo "Usage: $0 [--admission] [--keep-going] (optional BASELINE and FULL=1 environment variables)" >&2
            exit 2
            ;;
    esac
done

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_root"

# 整套检查占一个运行名额：同一台机器上别的全量检查在跑时排队，而不是一起把 CPU 压满。
# 名额脚本用 Node 起命令，Windows 上起不了 shell 脚本本身，所以显式经 bash 再进来。
if [[ -z "${OMNE_TEST_SLOT_HELD:-}" ]]; then
    exec ./scripts/with-test-slot.sh bash ./scripts/check.sh "$@"
fi

# 正文在测试运行器的 check 命令里：取基线、算计划，再按步骤图跑全部检查（表在 tools/test-runner/src/testing/check-steps.ts：
# 无依赖的步骤同时跑，构建之后才跑类型检查、成员测试、验收与读 dist 的检查，回路状态最后；一步失败其余终止）。
# --admission 或 OMNE_ADMISSION=1 为准入模式：构建、类型检查与成员测试不读缓存，并写准入日志。--keep-going 失败后继续跑其余步骤。
node --experimental-strip-types tools/test-runner/src/testing/cli.ts check "$@"
}
omne_repository_command main "$@"
