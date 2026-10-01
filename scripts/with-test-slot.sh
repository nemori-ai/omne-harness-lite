#!/usr/bin/env bash
# 运行名额：同一台机器上同一时刻只让有限个重负载的检查在跑，其余排队。
# 多棵工作树、多个 agent 各自起全量测试时，CPU 被压满会让本来能过的用例超时；
# 这里用文件锁把它们排成队，而不是靠每个调用者自觉。
#
# 用法：scripts/with-test-slot.sh <命令> [参数…]
#
# 策略都可用环境变量覆盖，下面是初值：
#   OMNE_TEST_SLOTS                  名额数（1）
#   OMNE_TEST_SLOT_DIR               锁文件目录（/tmp/omne-test-slots-<uid>；同一用户的全部检出共用）
#   OMNE_TEST_SLOT_POLL_SECONDS      没有空名额时隔多久再看一次（5）
#   OMNE_TEST_SLOT_MAX_WAIT_SECONDS  最多等多久，超过即以 75 退出、命令不执行（7200）
#
# 已经持有名额的进程再调用本脚本（例如 make check 里嵌着的测试入口）直接放行，不重复排队。
# 名额随持有它的进程退出而释放，不会因为异常退出而卡死。
set -euo pipefail

if (( $# == 0 )); then
    echo "Usage: $0 <command> [args...]" >&2
    exit 2
fi

if [[ -n "${OMNE_TEST_SLOT_HELD:-}" ]]; then
    exec "$@"
fi

slots="${OMNE_TEST_SLOTS:-1}"
slot_dir="${OMNE_TEST_SLOT_DIR:-/tmp/omne-test-slots-$(id -u)}"
poll_seconds="${OMNE_TEST_SLOT_POLL_SECONDS:-5}"
max_wait_seconds="${OMNE_TEST_SLOT_MAX_WAIT_SECONDS:-7200}"

for name in slots poll_seconds max_wait_seconds; do
    if ! [[ "${!name}" =~ ^[0-9]+$ ]]; then
        echo "with-test-slot: ${name}=${!name} 须为非负整数" >&2
        exit 2
    fi
done
if (( slots < 1 || poll_seconds < 1 )); then
    echo "with-test-slot: 名额数与轮询间隔须至少为 1" >&2
    exit 2
fi

mkdir -p -- "$slot_dir"

waited=0
announced=0
while :; do
    for (( index = 1; index <= slots; index += 1 )); do
        exec {slot_fd}>>"$slot_dir/slot-$index.lock"
        if flock --nonblock "$slot_fd"; then
            if (( announced )); then
                echo "with-test-slot: 等了 ${waited} 秒，拿到名额 ${index}/${slots}" >&2
            fi
            # 不用 exec：让本进程持有锁直到命令结束，命令留下的后台进程不会把名额带走。
            status=0
            OMNE_TEST_SLOT_HELD="$slot_dir/slot-$index.lock" "$@" {slot_fd}>&- || status=$?
            exit "$status"
        fi
        exec {slot_fd}>&-
    done
    if (( waited >= max_wait_seconds )); then
        echo "with-test-slot: 等了 ${waited} 秒仍没有空名额（共 ${slots} 个，锁在 ${slot_dir}），命令没有执行" >&2
        exit 75
    fi
    if (( ! announced )); then
        echo "with-test-slot: ${slots} 个名额都在用，排队中（每 ${poll_seconds} 秒看一次，最多等 ${max_wait_seconds} 秒）" >&2
        announced=1
    fi
    sleep "$poll_seconds"
    waited=$(( waited + poll_seconds ))
done
