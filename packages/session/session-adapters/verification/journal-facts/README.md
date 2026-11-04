# Agent 事实族模型

本资源检查会话日志里的 Agent 事实族：一次 Journal 命令追加一批事实，视图是日志的折叠，答复由原批推导。行为模型是 [models/JournalOught.tla](models/JournalOught.tla)。运行器不调用产品代码。

上位不变式归[会话日志是唯一事实源](../../../../../docs/architecture/runtime/session-and-run.md#h1-two-families)：两个只追加族共享事务域与提交序列（R2-D292），Agent 事实族守住每步提交有界、不复制内容与量级传感器三条（R2-D294）。本模型是这些条款的行为规格，不改变它们。

## 资源

| 文件 | 内容 |
| --- | --- |
| [models/JournalOught.tla](models/JournalOught.tla) | 行为模型：一个 execution，每步三批，外加认回、材料保存、重试、崩溃、恢复与存储拒绝 |
| `models/journal.cfg`、`models/journal-wide.cfg` | 正控。两份检查同一组性质，`journal-wide` 放大步数、崩溃与重试 |
| `models/bad-*.cfg` | 十一个负控。每份打开一个故意的错误，只检查它应命中的性质 |
| [models/run-tlc.sh](models/run-tlc.sh) | 运行全部配置并判读，见[运行](#运行) |
| [formal-runs.md](formal-runs.md) | 运行记录：版本、参数、预算、结论与判读 |
| [proofs/README.md](proofs/README.md) | 手写证明：前提 A1 到 A5，命题 1 到 7 的无界推广 |
| [answer-derivation.md](answer-derivation.md) | 20 个 Journal 写操作的答复怎样由原批推导，以及要补的字段 |

## 性质

| 性质 | 含义 | 模型中的名字 | 负控 |
| --- | --- | --- | --- |
| P1 唯一事实源 | 进程内视图等于已提交日志的折叠 | `P1_ViewIsFold`、`P1_HeadIsTail` | `bad-cache-only-p1`：判定批只进视图，不追加 |
| P1 位置唯一来源 | 核心给下一批的位置等于发布计数加一；每个完成步的判定事实都到达日志 | `P1_OnePosition`、`P1_FactsPublished` | `bad-second-position-p1`、`bad-second-position-facts`：核心另持位置，提供者单独发布的 `preserve` 让它落后，下一批在存储越过的位置追加，提供者只存信封，事实丢失 |
| P2 只追加 | 已提交的批不改写、不删除 | `P2_AppendOnly`（动作性质） | `bad-upsert-p2`：判定批原地改写上一批 |
| P3 每步提交有界 | 一批只带本步新增事实，权重有与步数无关的常数上界 | `P3_NoFactRepeated`、`P3_BatchBounded` | `bad-whole-rewrite-p3`、`bad-whole-rewrite-p3-repeat`：每批带上全部游标与历史事实 |
| P4 自有部分线性于步数 | 自有权重 ≤ 显式系数 × 步数 + 常数，及其对日志内容的比值形式 | `P4_LinearInSteps`、`P4_RatioBound` | `bad-whole-rewrite-p4`、`bad-whole-rewrite-p4-ratio` |
| P5 恢复等价 | 重启后折叠出的视图等于崩溃前最后一次成功提交留下的视图 | `P5_Recovery`（动作性质） | `bad-cache-only-p5` |
| P6 幂等认回 | 一个操作一批，答复是本批的函数，同输入重试得到原答复 | `P6_OneBatchPerOp`、`P6_AnswerFromBatch`、`P6_RetryAgrees` | `bad-retry-reexecute-p6`：重试再执行一次 |
| 失败不静默 | 存储拒绝后槽位为 `failed`，或命令待重发 | `RejectVisible` | `bad-silent-stop`：拒绝后槽位仍为 `running` |
| 单推进者 | 每批由日志所记的当前代次写入 | `GenGuard` | 无负控 |

P4 对应 R2-D294 的第 3 条。那一条是传感器指标，不是不变式。模型用权重而不用字节，P4 只说明设计下自有部分的阶是线性的，系数显式。它不给出真实负载的比值。

## 模型与实现的对应

形式模型与实现之间的对应按 [docs/verification.md](../../../../../docs/verification.md#证明与实现证据) 记录。实现由 Journal 终态的各车道交付。落点取自存储车道提交 `65dd5503b` 与事实车道提交 `b107cade1`，两者尚未合入父分支 `PanQiWei/rw2-jo`。凡标「待车道确认」的，以合入后的文件为准，合入后更新本表。

### 状态

| 模型变量或定义 | 实现 | 落点 |
| --- | --- | --- |
| `log`（批序列） | `er_fact` 按 `(tenant, session, pub, ord)` 聚簇。一批是一个 `pub` | session-storage-sql 的 `src/worker/fact-blob-migration.ts`、`fact-rows.ts`、`execution-record-schema.ts`，待车道确认 |
| 批的 `op`、`digest`、`gen` | `ord = 0` 行的批信封；认回索引 `er_operation (tenant, operation) → (digest, pub)` | 同上，读口 `src/worker/read-execution-batches.ts`、`read-execution-operation.ts`，待车道确认 |
| 批的 `changed` | `cursor.moved` 事实所含的游标成员集合 | session-adapters 的 `src/journal/facts.ts`，待车道确认 |
| 批的 `intents`、`results`、`judged` | `call.intended`、`result.received`、`reply.judged` 事实 | 同上，待车道确认 |
| `view`、`Apply`、`FoldN` | 进程内会话视图 `SessionJournalView` 与纯折叠函数 `fold` | session-adapters 的 `src/journal/fold.ts`，待车道确认 |
| `head` | 视图已折叠到的 `pub`，即 `er_root.published` 的读数 | 同上，待车道确认 |
| `corePub` | 核心给下一批的位置：`append` 的 `pub = view.head + 1` | session-adapters 的 `src/testing/journal.ts`（`append`）与 `src/cordis/agent-journal.ts`（`restore`、`settleCommitted` 把 `view` 设为耐久折叠、清空 `log`） |
| `answers`、`DeriveAt` | 实现不存答复。答复由 `answer` 从批与视图的操作索引推导。模型只为检查记下首次返回值 | session-adapters 的 `src/journal/answer.ts`，待车道确认。推导规则与缺口见 [answer-derivation.md](answer-derivation.md) |
| `writerGen` | Authority 的代次 | Agent 契约的 `Authority.generation` |
| `slot`、`lastCommit` | 执行槽状态与最近一次提交结论 | `packages/agent/agent/src/provider.ts` 与 `run-failure.ts`（R2-D282，已合入） |
| `Weight` | 字节抽象为权重：`C0` 每批，`WMember` 每个变了的成员，`WFact` 每条事实 | 折叠定律测试 `tests/journal-laws.spec.ts` 已在事实车道；批字节守卫与传感器待车道确认 |
| `logContent` | Session 条目族的内容字节，每步加 `LogMin` 或 `LogBig` | 传感器的日志侧读数，待车道确认 |

### 动作

| 模型动作 | 实现步骤 | 提交点 |
| --- | --- | --- |
| `CommitIntend` | 发出外部效果之前的 commit（M0、A2）：`step.begun`、`request.adopted` 或 `call.intended`、`cursor.moved` | 一次存储事务 |
| `CommitReceive` | 结果接收方的接收共同提交：`result.received` 加保管块 | 一次存储事务 |
| `CommitJudge` | 回复准入的 commit（Ja）：`reply.judged` 加同事务的历史消息 | 一次存储事务，Session 参加者同事务写条目 |
| `Recognize` | 新操作认回已有事实：`op.recognized` 批，不推进 revision，`target` 指被认回的批 | 一次存储事务 |
| `Preserve` | 材料 `preserve`：核心的批，一条 `material.preserved` 事实（不在模型的三类事实集合里）加材料块，不动游标、不推进 revision | 一次存储事务 |
| `RetrySame`、`RetryConflict` | Agent SPEC「判定次序与失败映射」第 2 条：同语义输入认回原结果，异语义输入 `conflict` | 无写入 |
| `Crash`、`Recover` | 进程重启；继任者冷启动折叠，再 `attach`，追加 `exec.attached` | `attach` 一次存储事务 |
| `Refuse` | 存储在受理前拒绝（例如单命令上限），没有写入；驱动重发或把槽位改为 `failed` | 无写入 |

一个模型动作对应一次 Journal 命令。命令内部的判定、编码与写 Worker 往返抽象为这一个原子步。

### 抽象掉的部分

多个 execution、多个会话与租户；Session 参加者的判定与 `expected` 冲突；事件序号；保管块的字节（不计入自有部分）；Tool 的关联登记两段；认回的资格检查；推进资格快照读的窗口；大于单命令上限的内容先提交块、再提交引用事实的两步。

## 前提

前提的全文与用法在 [proofs/README.md](proofs/README.md#0-前提)。实现要满足它们才继承模型的结论。

| 前提 | 内容 | 谁强制 |
| --- | --- | --- |
| A1 原子追加 | 一批要么整体可见，要么都不可见 | 存储的单事务提交，待车道以注入失败的用例验证 |
| A2 折叠纯 | `fold` 不读时钟、随机数或 I/O | 事实车道的折叠定律属性测试 `tests/journal-laws.spec.ts`，待合入 |
| A3 批自描述 | 批的内容在提交时固定 | P2 与 A1 |
| A4 操作身份确定派生 | 同一帧同一转移在崩溃前后派生同一身份 | Agent SPEC「并发与提交」的派生规则 |
| A5 单写者在位 | 旧代次的写入被拒 | `published` 的条件提交与 `(tenant, session, pub, ord)` 主键 |

## 覆盖

| 性质 | TLC 有限范围 | 手写证明（无界） |
| --- | --- | --- |
| P1 | 正控通过，负控命中 | 命题 1：对日志长度归纳 |
| P2 | 正控通过，负控命中 | 命题 2：改写日志的动作只有追加 |
| P3 | 正控通过，两个负控命中 | 命题 3：上界只含常量 |
| P4 | 正控通过，两个负控命中 | 命题 4：线性上界与比值上界 |
| P5 | 正控通过，负控命中 | 命题 5：由 P1 与折叠的确定性得出 |
| P6 | 正控通过，负控命中 | 命题 6：答复是批的函数，批不变 |
| 失败不静默 | 正控通过，负控命中 | 命题 7：单步要求，不需要推广 |
| 单推进者 | 正控通过，没有负控 | 不在本资源范围 |

TLC 的范围：`journal` 为 3 步、1 次崩溃、1 次拒绝、1 次重试；`journal-wide` 为 4 步、2 次崩溃、1 次拒绝、2 次重试。范围之外的行为只由手写证明覆盖，证明的对象是模型，不是实现。

本资源没有覆盖：租户隔离；多 execution 与多会话交错；Session 参加者冲突；事件序号连续；保管块分提交；推进资格快照读的窗口。这些由存储与提供者车道的用例承担。

实现是否符合模型，本资源不证明。符合性由事实车道的折叠属性测试、批字节守卫与崩溃点扫描支持，它们尚未合入父分支。

## 运行

在 WSL 2 的 `Ubuntu-24.04` 里，用登录 shell 运行。先把本目录的 `models/` 复制到 WSL 自己的文件系统，再执行：

```sh
bash run-tlc.sh <WSL 里的 models 副本> <证据目录>
```

`run-tlc.sh` 再把模型复制到 `$HOME` 下的新目录，在那里运行 TLC，把日志与 `summary.txt` 复制到证据目录，最后删除自己的工作目录。证据目录放任务的 `tmp/`，不进本目录。退出码为 0 表示每个控制都通过。`TLA2TOOLS_JAR` 默认 `/opt/tlaplus/tla2tools.jar`。`FORMAL_BUDGET_SECONDS`（默认 1200）、`FORMAL_WORKERS`（默认 8）与 `FORMAL_HEAP`（默认 `-Xmx6g`）调整单案预算与资源。

判读：正控要求退出码 0 与 TLC 的完成结论行。负控要求退出码 12 或 13、只报告配置点名的那一条性质，并带反例轨迹。其他退出码、解析失败或超时都判失败。用例表与目录里的配置不一致时，运行器在运行前退出 2。

## 维护

上位不变式、Agent 事实种类或 Journal 判定次序变化时，复核模型的抽象，重跑全部配置，并更新 [formal-runs.md](formal-runs.md)。实现落点变化时，更新上面的对应表。
