#!/usr/bin/env bash
# 运行名额：同一台机器上同一时刻只让有限个重负载的检查在跑，其余按先来后到排队。
# 多棵工作树、多个 agent 各自起全量测试时，CPU 被压满会让本来能过的用例超时；
# 这里用文件锁把它们排成队，而不是靠每个调用者自觉。
#
# 用法：scripts/with-test-slot.sh <命令> [参数…]
#
# 策略都可用环境变量覆盖，下面是初值：
#   OMNE_TEST_SLOTS                  名额数（1）
#   OMNE_TEST_SLOT_DIR               锁文件目录（/tmp/omne-test-slots-<uid>；同一用户的全部检出共用）
#   OMNE_TEST_SLOT_POLL_SECONDS      没轮到时隔多久再看一次（5）
#   OMNE_TEST_SLOT_MAX_WAIT_SECONDS  最多等多久，超过即以 75 退出、命令不执行（7200）
#   OMNE_TEST_SLOT_LEDGER            运行账本（${XDG_STATE_HOME:-~/.local/state}/omne-test-slots/ledger.jsonl）
#
# 运行账本：每次用完名额、或等到超时放弃，都追加一行 JSON：命令、目录、等了多久、占了多久、
# 命令用掉的 CPU 时间、起止时的机器负载、退出码。它给「按任务大小分配名额」（#57 第二步）校准用，
# 所以跟名额同一个范围（同一用户的全部检出与克隆），放在重启也不清的用户状态目录；写不进去只提醒，不改退出码。
#
# 先来后到：进队时领一张票（ticket-<号>，号比队里所有活票都大），名额空出时只有号码最小的活票去拿。
# 票和名额持有者的登记（slot-<序号>.holder）都被登记它的进程 flock 住；进程一退出，被杀也一样，锁就随之失效，
# 失效的登记不挡后来者，由下一个看队列的进程删掉。这些文件只在队列锁（queue.lock）内增删。
# 已经持有名额的进程再调用本脚本（例如 make check 里嵌着的测试入口）直接放行，不重复排队。
# 名额随持有它的进程退出而释放，不会因为异常退出而卡死。
set -euo pipefail

# Wall-clock seconds. Bash 5 provides EPOCHSECONDS; macOS /bin/bash 3.2 does not.
unix_now() {
    if [[ -n ${EPOCHSECONDS+x} ]]; then
        printf '%s' "$EPOCHSECONDS"
    else
        date +%s
    fi
}

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
ledger="${OMNE_TEST_SLOT_LEDGER:-${XDG_STATE_HOME:-${HOME:-/tmp}/.local/state}/omne-test-slots/ledger.jsonl}"

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
mkdir -p -- "$(dirname -- "$ledger")" 2>/dev/null || true

command_line="$*"
command_line="${command_line//$'\n'/ }"
clock_ticks="$(getconf CLK_TCK)"

# 票与持有者登记同一格式：谁、从何时起、在哪个目录、跑什么命令。
describe() {
    printf 'pid=%s\nsince=%s\ncwd=%s\ncmd=%s\n' "$$" "$(unix_now)" "$PWD" "$command_line"
}

field() {
    local line
    while IFS= read -r line; do
        if [[ $line == "$2="* ]]; then
            printf '%s' "${line#*=}"
            return 0
        fi
    done <"$1"
}

# 登记还活着，就是登记它的进程还锁着它；锁已失效的顺手删掉。只在队列锁内调用。
# 描述符号固定，macOS 自带 bash 3.2 没有 {变量} 这种自动分配。
alive() {
    [[ -e $1 ]] || return 1
    exec 8<"$1"
    if flock --nonblock 8; then
        exec 8>&-
        rm -f -- "$1"
        return 1
    fi
    exec 8>&-
}

duration() {
    if (( $1 < 60 )); then
        printf '%d 秒' "$1"
    elif (( $1 < 3600 )); then
        printf '%d 分 %d 秒' $(( $1 / 60 )) $(( $1 % 60 ))
    else
        printf '%d 小时 %d 分' $(( $1 / 3600 )) $(( $1 % 3600 / 60 ))
    fi
}

# JSON 字符串字面量：转义反斜杠、引号、制表与回车，其余控制字符直接去掉。
json_string() {
    local value=$1
    value=${value//\\/\\\\}
    value=${value//\"/\\\"}
    value=${value//$'\t'/\\t}
    value=${value//$'\r'/\\r}
    value=${value//[$'\001'-$'\037']/}
    printf '"%s"' "$value"
}

# RFC 3339 时刻：%z 不带冒号（+0800），补上。bash 5 用内建；macOS bash 3.2 用 date。
json_time() {
    local at
    if (( BASH_VERSINFO[0] >= 4 )); then
        printf -v at '%(%Y-%m-%dT%H:%M:%S%z)T' "$1"
    else
        at="$(date -r "$1" '+%Y-%m-%dT%H:%M:%S%z')"
    fi
    printf '"%s:%s"' "${at:0:22}" "${at:22}"
}

# 机器负载（1、5、15 分钟平均），写成 JSON 数组。
json_load() {
    local one five fifteen rest raw
    if [[ -r /proc/loadavg ]]; then
        read -r one five fifteen rest </proc/loadavg
    else
        raw="$(sysctl -n vm.loadavg)"
        raw="${raw#\{ }"
        raw="${raw% \}}"
        read -r one five fifteen <<<"$raw"
    fi
    printf '[%s,%s,%s]' "$one" "$five" "$fifteen"
}

# 本进程已回收的子孙进程累计用掉的 CPU（用户态加内核态），单位是时钟滴答，写进 ticks。
read_child_ticks() {
    local stat fields
    read -r stat </proc/$$/stat
    read -ra fields <<<"${stat##*) }"
    ticks=$(( fields[13] + fields[14] ))
}

# 往运行账本追加一行；只在队列锁内调用，各进程的行不会交错。
# 没拿到名额（gave-up）时，名额、占用、CPU 与拿到时的负载都写 null。
record() {
    local event=$1 line
    line="{\"event\":\"${event}\",\"command\":$(json_string "${command_line:0:500}"),\"cwd\":$(json_string "$PWD")"
    line+=",\"pid\":$$,\"cores\":$(if command -v nproc >/dev/null 2>&1; then nproc; else getconf _NPROCESSORS_ONLN; fi),\"slots\":${slots},\"aheadOnArrival\":${ahead_on_arrival}"
    line+=",\"arrivedAt\":$(json_time "$started"),\"waitSeconds\":${waited}"
    if [[ $event == ran ]]; then
        line+=",\"slot\":${acquired},\"acquiredAt\":$(json_time "$acquired_at"),\"heldSeconds\":$(( ended_at - acquired_at ))"
        line+=",\"cpuSeconds\":$(( cpu_ticks / clock_ticks )).$(printf '%02d' $(( cpu_ticks * 100 / clock_ticks % 100 )))"
        line+=",\"loadAtAcquire\":${load_at_acquire}"
    else
        line+=",\"slot\":null,\"acquiredAt\":null,\"heldSeconds\":null,\"cpuSeconds\":null,\"loadAtAcquire\":null"
    fi
    line+=",\"endedAt\":$(json_time "$ended_at"),\"loadAtEnd\":$(json_load),\"exitCode\":${status}}"
    if ! { printf '%s\n' "$line" >>"$ledger"; } 2>/dev/null; then
        echo "with-test-slot: 运行账本写不进 ${ledger}，这次没记" >&2
    fi
}

# 在队列锁内走一轮：清掉失效的票、数出排在前面的活票；第一次来就领票；排到最前就试名额。
# 拿到名额时登记持有者并交还票，acquired 记名额序号；没拿到时把持有者一览写进 holders，
# 各持有者的身份（进程号与起始时刻）写进 holder_ids，用来判断队列有没有变。
ticket_number=0
acquired=0
take_turn() {
    local path number newest=0 index since cmd
    ahead=0
    for path in "$slot_dir"/ticket-*; do
        number="${path##*/ticket-}"
        if ! [[ $number =~ ^[0-9]+$ ]] || (( number == ticket_number )) || ! alive "$path"; then
            continue
        fi
        if (( number > newest )); then
            newest=$number
        fi
        if (( ticket_number == 0 || number < ticket_number )); then
            ahead=$(( ahead + 1 ))
        fi
    done

    if (( ticket_number == 0 )); then
        ticket_number=$(( newest + 1 ))
        ticket="$slot_dir/ticket-$ticket_number"
        exec 9>"$ticket"
        flock --nonblock 9
        describe >&9
    fi

    if (( ahead == 0 )); then
        for (( index = 1; index <= slots; index += 1 )); do
            exec 7>>"$slot_dir/slot-$index.lock"
            if flock --nonblock 7; then
                # 换一个新文件再改名过去：上一任退出时两把锁未必同时失效，旧文件可能还锁着。
                exec 6>"$slot_dir/slot-$index.holder.$$"
                flock --nonblock 6
                describe >&6
                mv -f -- "$slot_dir/slot-$index.holder.$$" "$slot_dir/slot-$index.holder"
                rm -f -- "$ticket"
                exec 9>&-
                acquired=$index
                return 0
            fi
            exec 7>&-
        done
    fi

    holders=()
    holder_ids=()
    for (( index = 1; index <= slots; index += 1 )); do
        path="$slot_dir/slot-$index.holder"
        if alive "$path"; then
            since="$(field "$path" since)"
            [[ $since =~ ^[0-9]+$ ]] || since=$(unix_now)
            cmd="$(field "$path" cmd)"
            (( ${#cmd} <= 160 )) || cmd="${cmd:0:160}…"
            holders+=("名额 ${index}/${slots} 正由「${cmd}」占着，已 $(duration $(( $(unix_now) - since )))（$(field "$path" cwd)，进程 $(field "$path" pid)）")
            holder_ids+=("$(field "$path" pid)@${since}")
        fi
    done
}

in_queue() {
    exec 5>>"$slot_dir/queue.lock"
    flock 5
    "$@"
    exec 5>&-
}

give_up() {
    rm -f -- "$ticket"
    record gave-up
}

finish() {
    rm -f -- "$slot_dir/slot-$acquired.holder"
    record ran
}

started=$(unix_now)
announced=0
last_seen=''
while :; do
    in_queue take_turn
    : "${ahead_on_arrival:=$ahead}"
    waited=$(( $(unix_now) - started ))
    if (( acquired )); then
        break
    fi
    if (( waited >= max_wait_seconds )); then
        status=75
        ended_at=$(unix_now)
        in_queue give_up
        echo "with-test-slot: 等了 ${waited} 秒仍没轮到（前面还有 ${ahead} 个，共 ${slots} 个名额，锁在 ${slot_dir}），命令没有执行" >&2
        exit 75
    fi
    # bash 3.2 with set -u treats an empty array expansion as unbound. bash 4.4+ does not.
    if (( ${#holder_ids[@]} )); then
        seen="${ahead}|${holder_ids[*]}"
    else
        seen="${ahead}|"
    fi
    if [[ $seen != "$last_seen" ]]; then
        if (( ! announced )); then
            echo "with-test-slot: 排队中，前面还有 ${ahead} 个（共 ${slots} 个名额；每 ${poll_seconds} 秒看一次，最多等 ${max_wait_seconds} 秒）" >&2
            announced=1
        else
            echo "with-test-slot: 前面还有 ${ahead} 个" >&2
        fi
        if (( ${#holders[@]} )); then
            for line in "${holders[@]}"; do
                echo "with-test-slot:   ${line}" >&2
            done
        fi
        if (( ${#holders[@]} == 0 && ahead == 0 )); then
            echo "with-test-slot:   名额的持有者没有登记（可能是旧版本的本脚本），用 fuser ${slot_dir}/slot-*.lock 查是谁" >&2
        fi
        last_seen=$seen
    fi
    # 关掉票的描述符再睡：本进程被杀时，票不会因为 sleep 还开着它而多活一轮。
    sleep "$poll_seconds" 9>&-
done

if (( announced )); then
    echo "with-test-slot: 等了 ${waited} 秒，拿到名额 ${acquired}/${slots}" >&2
fi
acquired_at=$(unix_now)
load_at_acquire="$(json_load)"
if [[ -r /proc/$$/stat ]]; then
    read_child_ticks
    ticks_before=$ticks
fi
# 不用 exec：让本进程持有锁直到命令结束，命令留下的后台进程不会把名额带走。
status=0
if [[ -r /proc/$$/stat ]]; then
    OMNE_TEST_SLOT_HELD="$slot_dir/slot-$acquired.lock" "$@" 7>&- 6>&- || status=$?
    read_child_ticks
    cpu_ticks=$(( ticks - ticks_before ))
else
    time_file="$(mktemp "${TMPDIR:-/tmp}/omne-slot-time.XXXXXX")"
    OMNE_TEST_SLOT_HELD="$slot_dir/slot-$acquired.lock" /usr/bin/time -p -o "$time_file" "$@" 7>&- 6>&- || status=$?
    cpu_ticks="$(awk -v clk="$clock_ticks" '$1=="user"{u=$2} $1=="sys"{s=$2} END {printf "%d", (u+s)*clk}' "$time_file")"
    rm -f -- "$time_file"
fi
ended_at=$(unix_now)
in_queue finish
exit "$status"
