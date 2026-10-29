# Session frontier 有限模型

本资源检查 Session 历史前缀、冻结解除与权威缺口的有限并发行为。行为依据是本成员 [FR-01 至 FR-07](../../../SPEC.md#fr-01)、[PM-02](../../../SPEC.md#pm-02)、PA-08、PA-09、EC-01/02、SL12–14、I-F3/I-F4。源采用基线为 `55f9d3e31afe07b9938e61034e0ac31d0c7070ca`，文件来源与 SHA-256 见 [source-manifest.json](source-manifest.json)。

| 模型 | 范围与前提 | 配置数 |
| --- | --- | --- |
| [Frontier](frontier/README.md) | 原 taken 与 Session 解释分离、完整捕获前缀、最终根、终态与解除 | 40 |
| [PM02](pm02/README.md) | 首条 invoke 拒收且没有 execution，冻结时精确解除其余输入 | 19 |
| [GapIsolation](gap-isolation/README.md) | 权威缺口生效后，旧准备、新解释者和新命令受共享隔离门约束 | 10 |
| [FrozenActive](frozen-active/README.md) | 已有 execution 的 frozen active Run 在准备期间接收新输入 | 17 |

四个模型分别检查不同的有限接缝。它们没有形式 refinement 或完整直积证明，结果不能相加为完整组合或产品实现证明。[动作映射](mapping.md)列出实现必须接续的义务。[配置目录](case-catalog.md)逐项列出具名目标。[integrity.json](integrity.json)固定全部模型、配置及 case 元数据，执行前核对这些字节。

## 工具与复跑

需要 Python 3.9 及以上、POSIX 进程组和 TLA2Tools 1.7.4。采用运行环境使用 Java 21，执行器记录实际版本；其他 Java 版本尚未核验。采用的 JAR SHA-256 是 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`。TLC 对应 2.19 / `5a47802`。设置 `TLA2TOOLS_JAR` 指向该 JAR，`JAVA_BIN` 可指定 Java 可执行文件。缺工具或 hash 不符时失败，不下载或安装工具。

下面从显式仓库与成员路径调用。`OUT` 必须是仓库 `tmp/` 下尚不存在的目录。每次复跑换一个目录名，执行器拒绝覆盖。完整 TLC 运行须使用仓库共享名额，等待超时退出 75 表示没有执行。

```sh
REPO=/path/to/omne-harness-lite
MEMBER="$REPO/packages/session/session-contract"
RESOURCE="$MEMBER/verification/models/frontier"
OUT="$REPO/tmp/session-frontier-run-unique-id"
export TLA2TOOLS_JAR=/path/to/tla2tools-1.7.4.jar
export JAVA_BIN=/path/to/java
node "$REPO/scripts/with-test-slot.mjs" python3 -B "$RESOURCE/run.py" \
  --model frontier --output-dir "$OUT" --timeout 300 --heap 1536m
```

默认每 case 超时 300 秒、heap 1536m。该预算保留既有入口设置，覆盖已采用有限配置中约 211 秒的历史完成记录；机器负载或运行时变化仍可能超时。预算可显式增大，超时始终记未完成。

`--model` 接受 `frontier`、`pm02`、`gap-isolation` 或 `frozen-active`。省略 `--cases` 会运行该模型全部配置。用 `--cases positive-small negative-no-prefix witness-shrink` 选择 Frontier 的代表配置。`python3 -B "$RESOURCE/run.py" --model pm02 --list` 只列配置。

执行器固定单 worker、seed 1、fp 0、checkpoint 0、无色输出与 C locale。它移除 JVM 注入选项，记录 Java 路径与版本、JAR/source/config/runner hash、argv、时间、exit 和超时。模型/config 快照、TLC 日志、状态文件与 Java 临时文件都在 `OUT`。子进程超时先 TERM，五秒未退出则 KILL，并等待回收。包装进程收到 SIGTERM 或键盘中断时也清理所拥有的子进程。未完成、异常或错误目标均失败。未设置搜索深度截断，配置关闭 deadlock 检查；允许有限静止不等于证明无死锁或活性。

## 结果含义与测量自检

正控必须以 0 退出，报告完整搜索、queue 0 和深度，没有 error 或 invariant 违反。负控必须以 12 退出，只有指定 invariant 违反，且在反例横幅后有至少两个连续编号的状态块。每个状态必须有动作、相同且不重复的变量集合及完整变量值；空标题、缺值或截断状态均失败。见证也用具名 invariant 的反例寻路，但只证明目标可达。目标不可达时运行失败。

FrozenActive 的两个 `sensitivity-old-guard-*` 配置有单独用途：旧 guard 下完整搜索仍满足目标否定，说明对应见证不可达。它们不计为安全性正控，也不代表正常模型的见证。

```sh
python3 -B "$RESOURCE/classifier_selftest.py"
python3 -B "$RESOURCE/runner_selftest.py" --output-dir "$REPO/tmp/frontier-wrapper-unique-id"
python3 -B "$RESOURCE/audit_pm02.py" --run /path/to/pm02-run \
  --output "$REPO/tmp/pm02-audit-unique-id.json"
python3 -B "$RESOURCE/audit_frozen_active.py" --run /path/to/frozen-active-run \
  --output "$REPO/tmp/frozen-active-audit-unique-id.json"
```

分类器保留严格版原 19 项自检，并增加 18 项状态块完整性回归。Frontier 早期分类器接受过只有完成横幅、以及没有状态的反例标题两种合成输入；本入口收紧为拒绝。这个变化不改变 86 个采用配置的具名目标。原合成自检的历史预期不视为新入口的成功证据。

状态值检查只识别当前四模型使用的 TLC 打印形状：整数、整数区间、字符串、模型值、集合、序列和记录。无法识别的值失败，不以非空文本代替状态。检查器不重算业务转换，也不认证日志来源；模型动作的含义仍由具体模型与轨迹审计拥有。

分类器自检输出 JSON 到 stdout，不写源目录。包装自检使用标明身份的子进程替身，检查错误目标、无轨迹、不可达、异常、超时、工具缺失、输入变更及覆盖拒绝。它需要采用 JAR 通过工具完整性检查，但不执行 TLC，不是模型证据。

PM02 审计需要 `witness-pm02-frozen-accept-race` 与 `negative-pm02-frozen-stale-root`。FrozenActive 审计需要两个新输入见证、三个旧根/覆盖负控、drop-tail 负控、双方最终胜出及正常 ended/取消窗口见证，精确名称在 [case-catalog.md](case-catalog.md)。审计读取真实动作与状态，不从 phase/watch 推断成功。缺轨迹、轨迹不符或破坏样例未被拒绝时失败。不得使用 `-O` 或 `PYTHONOPTIMIZE` 禁用断言。

[fixtures/pm02-rejected-traces.json](fixtures/pm02-rejected-traces.json)只保存旧错误顺序的结构化测量反例，用于拒绝把 Prepare→Accept→Freeze 或 Prepare→Freeze 误当冻结后新受理竞争。来源日志 hash 见 source-manifest。这不是产品 fixture，也不是新模型运行证据。

## 方法来源与声明限度

方法来自固定工具基线 `eb62dc8c2c3a92d95101172431f4c4ba635fca7b` 的 [验证规则](../../../../../../docs/verification.md)、[verification-facility](../../../../../../.meta_harness/agents/skills/verification-facility/canonical/SKILL.md)与本成员验证拥有者。分类器核对具名目标与状态证据，轨迹函数与破坏断言保留原语义。来源台账供核对，不是运行时对原任务目录的依赖。

TLC 检查有限状态并使用 64 位指纹，不是定理证明。原子动作依赖真实提供者的共同根、原子发布、不可变连续日志及完整目录。尚未证明真实 CAS、数据库事务、磁盘耐久、跨进程恢复、完整第二租户、无界历史或无条件活性。P-5 最终资格与新 ended、Model ACK、Tool intent 完整字段、scope 初始化和所有产品入口另需实现证据。原运行日志、失败、超时与逐轮审阅材料留任务 tmp，不属于本资源。
