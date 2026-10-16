#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/git-environment.sh"
main() {
if (( $# )); then
    echo "Usage: $0 (optional BASELINE and FULL=1 environment variables)" >&2
    exit 2
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${OMNE_SUBJECT_ROOT:-}" ]]; then
    exec bash "$repo_root/scripts/integration-check.sh"
fi
cd -- "$repo_root"

# 整套检查占一个运行名额：同一台机器上别的全量检查在跑时排队，而不是一起把 CPU 压满。
if [[ -z "${OMNE_TEST_SLOT_HELD:-}" ]]; then
    exec ./scripts/with-test-slot.sh ./scripts/check.sh
fi

# 工具成员经包入口导入 repo-toolchain 的 dist，先构建它（turbo 有缓存）。
pnpm run --silent build:tools

# 基线取 BASELINE；没给就用 origin/main，本地没有这个引用就用 main。影响面与回路状态共用它。
baseline="$(node --experimental-strip-types tools/dev-flow/src/integration/cli.ts baselines ${BASELINE:+--base "$BASELINE"} | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>process.stdout.write(JSON.parse(s).targetBase??""))')"
if [[ -z "$baseline" ]]; then
    baseline=main
    if git rev-parse --verify --quiet origin/main >/dev/null; then
        baseline=origin/main
    fi
fi
export BASELINE="$baseline"

# 先算影响面：基线以来改了什么、每一步跑还是跳、跑哪些成员、为什么（规则在 tools/test-runner/test-runs.config.json）。
# FULL=1 给全量计划；算不出（基线不存在、取不到改动、规则点名了不存在的成员）就在这里失败，不改判全量。
# 合并后没有自动补跑：负责人不定时让一个会话手动跑一次 make check FULL=1。
plan_dir=tmp/check-plan
rm -rf "$plan_dir"
test_runs=(node --experimental-strip-types tools/test-runner/src/testing/cli.ts)
"${test_runs[@]}" plan --base "$baseline" --json "$plan_dir/plan.json"
step() {
    "${test_runs[@]}" step "$1" --plan "$plan_dir/plan.json"
}

# 常驻：每次都跑。
make --no-print-directory agents-check
make --no-print-directory docs-check
make --no-print-directory design-check
# 按计划：Python 工具测试。
step python
pnpm run format:check
pnpm run test:format
# 按计划：构建（被选中的成员及其依赖，加上常驻检查要的成员）、类型检查、成员测试（快层再慢层）。
step build
# 常驻：成员用 TypeScript 7 构建，dist 里的声明要能被 TypeScript 6 读；读的是磁盘上现有的 dist。
pnpm run check:declarations
step typecheck
step test
# 常驻：结构规则、验收的覆盖声明与提交署名；它导入的成员已在上面构建。
pnpm run lint:rules
# 常驻：oxlint 的正确性规则与 dependency-cruiser 的环和 legacy 规则；dev tools 违反即失败，packages/ 与 apps/ 只报告。
pnpm run lint:oxlint
pnpm run lint:deps
# 按计划：可执行验收，驱动上面构建出来的 dist/；计划里没有带验收的成员时为当前提交记一份「跳过」的账本。
step acceptance

# 它只读源码、git 与验收的耗时记录，放在最后是让前面的失败先报。产物写进被 git 忽略的 tmp/，回路目录里什么都不写。
rm -rf tmp/loop-status-check
make --no-print-directory loop-status STRICT=1 BASE="$baseline" OUT=tmp/loop-status-check
}
omne_repository_command main "$@"
