#!/usr/bin/env bash
# 根脚本 metrics 的入口：结构度量，只报告。参数原样交给钉住的 omne-metrics，只有两处由这里处理：
# - 带 --coverage 时占一个运行名额，且覆盖采集要读计划：没给 --plan 就先用测试运行器算一份（--base 交给 plan，
#   缺省规则与 check:plan 相同，FULL=1 给全量），再以 --plan 交给 omne-metrics。
# - 不带 --coverage 时不占名额，也不算计划。
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
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
    exec ./scripts/with-test-slot.sh bash node_modules/.bin/omne-metrics "$@"
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
./scripts/with-test-slot.sh bash node_modules/.bin/omne-metrics --plan "$plan_dir/plan.json" "${rest[@]}"
