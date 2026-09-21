#!/usr/bin/env bash
# 跨家统一口径的非交互启动实测。刻意不测 TUI 首帧——见报告局限说明。
set -uo pipefail
OUT=/data/qiwei/repos/omne-harness-lite/tmp/research-cli-tui/measure-raw.txt
: > "$OUT"
exec 3>&1

declare -A CMD=(
  [codex]="/data/qiwei/.local/bin/codex"
  [claude]="/run/user/1001/fnm_multishells/126085_1789971991441/bin/claude"
  [cursor-agent]="/data/qiwei/.local/bin/cursor-agent"
  [kimi]="/data/qiwei/.kimi-code/bin/kimi"
)

run_n() { # $1=bin $2=arg $3=n  -> prints "min median max" in ms
  local bin=$1 arg=$2 n=$3 i t0 t1 ms; local -a xs=()
  for ((i=0;i<n;i++)); do
    t0=$(date +%s%N)
    timeout 30 "$bin" "$arg" >/dev/null 2>&1 </dev/null
    t1=$(date +%s%N)
    xs+=( $(( (t1-t0)/1000000 )) )
  done
  printf '%s\n' "${xs[@]}" | sort -n | awk -v n="$n" '{a[NR]=$1} END{printf "%d %d %d", a[1], a[int((NR+1)/2)], a[NR]}'
}

for k in codex claude cursor-agent kimi; do
  bin=${CMD[$k]}
  echo "=== $k ($bin) ===" | tee -a "$OUT" >&3
  "$bin" --version </dev/null 2>&1 | head -2 | sed 's/^/  version: /' | tee -a "$OUT" >&3
  for arg in --version --help; do
    # 2 次预热
    for i in 1 2; do timeout 30 "$bin" "$arg" >/dev/null 2>&1 </dev/null; done
    read -r mn md mx <<<"$(run_n "$bin" "$arg" 10)"
    printf '  %-10s n=10 min=%sms median=%sms max=%sms\n' "$arg" "$mn" "$md" "$mx" | tee -a "$OUT" >&3
  done
  /usr/bin/time -v timeout 30 "$bin" --help </dev/null >/dev/null 2>/tmp/t.$$ ; \
    grep -E "Maximum resident set size|Elapsed \(wall|User time|System time|Voluntary|Involuntary" /tmp/t.$$ | sed 's/^\s*/  /' | tee -a "$OUT" >&3
  rm -f /tmp/t.$$
done
