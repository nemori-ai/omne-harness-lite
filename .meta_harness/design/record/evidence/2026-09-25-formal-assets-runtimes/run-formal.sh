#!/usr/bin/env bash
# 资产/运行时一程的形式工件 run：按 registry/formal-tasks.json 登记的命令逐项原样执行（只跑本程 8 个任务，
# 或 TASKS 指定的集合），把输入快照（模型 + 配置 + SHA256SUMS）、原始输出、命令行与退出码写进
# record/evidence/<RUN_ID>/<task-id>/{input,output}。不改 spec，不做摘要式改写。
# 用法：RUN_ID=2026-09-25-formal-assets-runtimes ROOT=<工作树> bash run-formal.sh
set -u
export JAVA_BIN=${JAVA_BIN:-/opt/java/jdk-21.0.12.1+1-jre/bin/java}
export TLA2TOOLS_JAR=${TLA2TOOLS_JAR:-/opt/tlaplus/tla2tools.jar}
ROOT=${ROOT:?}; RUN_ID=${RUN_ID:?}
DESIGN=$ROOT/.meta_harness/design
RUN=$DESIGN/record/evidence/$RUN_ID
TASKS=${TASKS:-"asset-transfer-v1-transfer asset-transfer-v1-share asset-transfer-v1-revival stream-assembly-v1-assembly model-request-runtime-v1-invocation model-request-runtime-v1-invocation-no-fallback tool-execution-runtime-v1-execution tool-execution-runtime-v1-execution-progress"}
mkdir -p "$RUN"
EXITS=$RUN/exit-codes.tsv; CMDS=$RUN/commands.txt
printf 'task\tlog\texit\tstarted_utc\tfinished_utc\n' > "$EXITS"; : > "$CMDS"
cp "$0" "$RUN/run-formal.sh"
{ echo "git_head=$(git -C "$ROOT" rev-parse HEAD)"; echo "git_branch=$(git -C "$ROOT" branch --show-current)";
  echo "java=$("$JAVA_BIN" -version 2>&1 | head -1)"; echo "tla2tools_sha256=$(sha256sum "$TLA2TOOLS_JAR" | cut -d' ' -f1)";
  echo "host=$(uname -srm)"; echo "date_utc=$(date -u +%FT%TZ)"; } > "$RUN/environment.txt"
cd "$DESIGN"
for t in $TASKS; do
  mapfile -t ARGS < <(python3 - "$t" <<'EOF'
import json,sys
tasks=json.load(open('registry/formal-tasks.json'))['tasks']
x=[x for x in tasks if x['id']==sys.argv[1]][0]
for a in x['command']: print(a)
EOF
)
  if [ ${#ARGS[@]} -eq 0 ]; then echo "task $t not found" >&2; continue; fi
  mkdir -p "$RUN/$t/input" "$RUN/$t/output"
  # 输入快照：命令里所有 spec/ 下的路径
  for a in "${ARGS[@]}"; do case "$a" in spec/*) cp "$a" "$RUN/$t/input/";; esac; done
  (cd "$RUN/$t/input" && sha256sum * > SHA256SUMS)
  # 展开变量
  CMD=(); for a in "${ARGS[@]}"; do a=${a//\$\{JAVA_BIN\}/$JAVA_BIN}; a=${a//\$\{TLA2TOOLS_JAR\}/$TLA2TOOLS_JAR}; CMD+=("$a"); done
  log=tlc-$t.log
  echo "(cwd=.meta_harness/design) ${ARGS[*]}  > $t/output/$log" >> "$CMDS"
  s=$(date -u +%FT%TZ)
  "${CMD[@]}" > "$RUN/$t/output/$log" 2>&1; rc=$?
  printf '%s\t%s\t%s\t%s\t%s\n' "$t" "$log" "$rc" "$s" "$(date -u +%FT%TZ)" >> "$EXITS"
  echo "$t exit=$rc"
done
echo done
