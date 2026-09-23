#!/usr/bin/env bash
# W4-A 形式工件 run：正配置按 registry 登记的命令原样执行；九个否定配置只换 -config/-metadir，
# 八个变异各跑「无 -continue」与「-continue」两次，可达性核对只跑 -continue。
set -u
export JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java TLA2TOOLS_JAR=/opt/tlaplus/tla2tools.jar
ROOT=/data/qiwei/repos/omne-harness-lite/.worktrees/tenancy-leg-2-evidence
DESIGN=$ROOT/.meta_harness/design
OUT=$ROOT/tmp/w4a/formal/output
mkdir -p "$OUT"
F=spec/compositions/governance-center-entry/v1/formal
EXITS=$ROOT/tmp/w4a/formal/exit-codes.tsv
CMDS=$ROOT/tmp/w4a/formal/commands.txt
printf 'log\texit\n' > "$EXITS"
: > "$CMDS"
cd "$DESIGN"
tlc() {
  local log=$1; shift
  local cmd=("$JAVA_BIN" -cp "$TLA2TOOLS_JAR" tlc2.TLC "$@")
  echo "(cwd=.meta_harness/design) \${JAVA_BIN} -cp \${TLA2TOOLS_JAR} tlc2.TLC $*  > $log" >> "$CMDS"
  "${cmd[@]}" > "$OUT/$log" 2>&1
  printf '%s\t%s\n' "$log" "$?" >> "$EXITS"
}
# 正配置：与 registry/formal-tasks.json 的 governance-center-entry-v1-decision 命令逐项相同
tlc tlc-EntryDecision.log -metadir tmp/tlc/governance-center-entry-v1-decision -cleanup -noGenerateSpecTE -workers 1 -config $F/EntryDecision.cfg $F/EntryDecision.tla
# 可达性核对：-continue
tlc tlc-Validity_Reachability.continue.log -metadir tmp/tlc/w4a-validity-Reachability -cleanup -noGenerateSpecTE -workers 1 -continue -config $F/Validity_Reachability.cfg $F/EntryDecision.tla
for m in passthroughStateNotValid unavailableAsRejected readPresentationBeforeVersion inputBeforeAuth gateUnavailableAsDenied defectAsResult authBeforeEnvelope deriveBeforePayload; do
  tlc tlc-Validity_$m.log -metadir tmp/tlc/w4a-validity-$m -cleanup -noGenerateSpecTE -workers 1 -config $F/Validity_$m.cfg $F/EntryDecision.tla
  tlc tlc-Validity_$m.continue.log -metadir tmp/tlc/w4a-validity-$m-continue -cleanup -noGenerateSpecTE -workers 1 -continue -config $F/Validity_$m.cfg $F/EntryDecision.tla
done
echo done
