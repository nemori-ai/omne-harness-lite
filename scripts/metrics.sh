#!/usr/bin/env bash
# 根脚本 metrics 的入口：结构度量，只报告。参数原样交给钉住的 omne-metrics，只有两处由这里处理：
# - 带 --coverage 时整条命令向令牌池要令牌，且覆盖采集要读计划：没给 --plan 就先用测试运行器算一份（--base 交给 plan，
#   缺省规则与 check:plan 相同，FULL=1 给全量），再以 --plan 交给 omne-metrics。
#   拿到令牌后再向测试运行器要覆盖率跨成员并行的并发度（按拿到的令牌数 OMNE_WORKER_BUDGET 分），
#   经环境变量 OMNE_METRICS_COVERAGE_PARALLEL 交下去：不认它的旧版本 omne-metrics 照旧串行。
#   调用方已设这个变量或给了 --coverage-parallel 时不另算。
# - 不带 --coverage 时不要令牌，也不算计划。
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# 令牌之内的那一段：本脚本经令牌池脚本以第一个参数 --in-slot 再起一次，推并发度后运行 omne-metrics。
if [[ "${1:-}" == --in-slot ]]; then
    shift
    if [[ -z "${OMNE_METRICS_COVERAGE_PARALLEL:-}" && " $* " != *" --coverage-parallel "* ]]; then
        OMNE_METRICS_COVERAGE_PARALLEL="$(node --experimental-strip-types tools/test-runner/src/testing/cli.ts coverage-parallel)"
        export OMNE_METRICS_COVERAGE_PARALLEL
    fi
    exec bash node_modules/.bin/omne-metrics "$@"
fi
coverage=false
plan=false
for arg in "$@"; do
    [[ "$arg" == --coverage ]] && coverage=true
    [[ "$arg" == --plan ]] && plan=true
done
if [[ "$coverage" == false ]]; then
    exec node_modules/.bin/omne-metrics "$@"
fi
if [[ "$plan" == true ]]; then
    exec ./scripts/with-test-slot.sh bash scripts/metrics.sh --in-slot "$@"
fi
base=()
rest=()
while (( $# )); do
    if [[ "$1" == --base ]]; then
        (( $# >= 2 )) || { echo "--base 要给值" >&2; exit 2; }
        base=(--base "$2")
        shift 2
    else
        rest+=("$1")
        shift
    fi
done
plan_dir="$(mktemp -d)"
trap 'rm -rf -- "$plan_dir"' EXIT
node --experimental-strip-types tools/test-runner/src/testing/cli.ts plan ${base[@]+"${base[@]}"} --json "$plan_dir/plan.json" >&2
./scripts/with-test-slot.sh bash scripts/metrics.sh --in-slot --plan "$plan_dir/plan.json" "${rest[@]}"
