#!/usr/bin/env bash
set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/git-environment.sh"
usage_text() {
    cat <<EOF
Usage: $0 [--admission] [--keep-going] [--resume-from <H1>] | $0 --preflight (optional BASELINE and FULL=1 environment variables)
Root scripts: pnpm run check runs it without flags, pnpm run admission adds --admission, pnpm run preflight adds --preflight.
It runs the check command of tools/test-runner/src/testing/cli.ts. Each step, and each tier of each member, takes cores from the machine token pool as its own job. --preflight takes no tokens and no other flag.
--admission (or OMNE_ADMISSION=1) writes the admission log tmp/admission/<time>-<short head>.log and its .json record.
--keep-going runs the other steps after a failure. --resume-from <H1> continues a failed admission on H1 and needs --admission.
BASELINE=<git-ref> sets the baseline. FULL=1 makes the plan full. Step logs are in tmp/check-run/<short head>/.
The step table, the log format and the token pool are specified in tools/test-runner/SPEC.md.
EOF
}
usage() {
    usage_text >&2
    exit 2
}
main() {
args=("$@")
for (( i = 0; i < ${#args[@]}; i++ )); do
    case "${args[i]}" in
        --admission|--keep-going|--preflight) ;;
        --help) usage_text; exit 0 ;;
        --resume-from)
            # 带一个值：接续的那个头。值缺失或为空就是用法错误，不交给正文去猜。
            (( i + 1 < ${#args[@]} )) && [[ -n "${args[i+1]}" ]] || usage
            i=$(( i + 1 ))
            ;;
        *) usage ;;
    esac
done

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repo_root"

# 检查自己不整程占令牌：每一步、每个成员的每一层各当一件活去整机的令牌池（scripts/with-test-slot.mjs）要令牌。
# 预检只起轻步骤，不要令牌。
# 正文在测试运行器的 check 命令里：取基线、算计划，再按步骤图跑全部检查（表在 tools/test-runner/src/testing/check-steps.ts：
# 无依赖的步骤同时跑，构建之后才跑类型检查、成员测试、验收与读 dist 的检查；一步失败其余终止）。
# --admission 或 OMNE_ADMISSION=1 为准入模式：构建、类型检查与成员测试不读缓存，并写准入日志与运行记录。--keep-going 失败后继续跑其余步骤。
# --resume-from <H1> 接续 H1 上快速失败的准入（全量或按影响面；只在准入模式下接受），规则见 omne-card 技能的 references/admission-evidence.md「增量准入」。
# --preflight 预检（根脚本 pnpm run preflight）：只跑准入里不依赖构建与全量测试的步骤，失败不终止其余，最后列出全部发现与修法；不写准入日志与记录。
# 启动段（check-bootstrap.mjs，只用 Node 标准库）先核对工具链、依赖目录与原生依赖：检查器静态导入依赖里的包，
# 依赖缺失时它加载不起来，到不了任何自愈。启动段失败就以它的退出码停下；成功时把结果（一行 JSON）经环境变量交给检查器，
# 检查器的 check 没有这份结果时拒绝运行。
bootstrap="$(node scripts/check-bootstrap.mjs)" || exit $?
OMNE_CHECK_BOOTSTRAP="$bootstrap" node --experimental-strip-types tools/test-runner/src/testing/cli.ts check "$@"
}
omne_repository_command main "$@"
