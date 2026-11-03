# 同日志提交模型

本目录提供 [LogCommit.tla](LogCommit.tla) 的有限状态检查与负控。
它检查 Agent 原发布、Session 解释提交和未知结果认回之间的协议。
它不执行产品 TypeScript，也不证明 SQL 实现符合模型。

## 采用范围

模型版本为 1。
源码映射的基线为 `2e6fa47b1e95b8f0108fbe2032d9f9457f4b54a8`。
正式行为来源如下。

- [SL07、SL08](../../../session-contract/SPEC.md#日志提交与查询结果)规定 operation 认回与共同提交。
- [EC-01、EC-02](../../../session-contract/SPEC.md#ec-02)规定同日志解释、进度和后果同批保存。
- [FR-05](../../../session-contract/SPEC.md#fr-05)区分执行 head、head 回执、事件序号和事件来源。
- [AD-02](../../../session-adapters/SPEC.md#ad-02)规定 Agent 原事实先提交，Session 随后解释，以及同根索引的发布点。
- [存储成员 SPEC](../../SPEC.md#实现现状)说明基线能力和 K-5 缺口。
- `commitLog` 与同事务 K-5 读取须有正控与负控。`commitLog` 以可加方式进入 `SessionTransactionPort`。

基线提交的 `SessionTransactionPort` 尚无 `commitLog`。
本模型约束 `commitLog` 的目标行为。下文「源码映射」另列现在已有的实现，不把尚未核验的部分写成既有事实。
`reads.prefixes`、authority 主体类别和登记表缺席语义不在模型里取候选值。

## 状态与观察

| 状态 | 含义 |
| --- | --- |
| `head[e]` | execution 的 Agent 修订。一次发布可以发出零至两个事件。 |
| `facts[e]` | 已提交事件，保留原修订与事件序号。每个事件抽象成一个需要解释的后果。 |
| `indexHead[e]`、`indexFacts[e]` | K-5 同根索引。与原记录分开存放，以便检出半发布。 |
| `log` | Session 解释提交的历史封套。每项包含 observation、原 head、原根、提交前进度、是否产生新后果及回执。 |
| `progress[e]` | 已持久解释的事件序号，对应 `ExecutionRef.readThrough`。 |
| `records[op]` | 原 operation 的语义输入与回执。不是从 `log` 定义出的自动排重集合。 |
| `client[c]` | 观察、阶段、尝试次数、收到的回执及是否查到在途未知。 |
| `transaction` | 同租户写事务的拥有者、阶段与尚未发布的解释结果。 |
| `uncertain` | 曾向调用者表现为未知的 operation 集合，仅供检查使用。 |
| `sawChanged`、`sawReplay`、`sawLate` | 可达性见证，只记录发生过的交错，不约束动作。 |

`log` 是抽象的提交封套，不是 `sl_entry` 行的逐字副本。
`applied = FALSE` 的封套只记一次新 operation 的认回答案，不增加业务后果。
相同事件由另一 operation 重读时，可以记新答案，但不能重复后果或推进进度。
同一 operation 重试必须返回原答案，不能形成第二个封套。
本模型不规定空解释在 SQL 中是否需要物理事务或新增行。

`Root` 由产生新后果的 Session 封套数与 Agent 发布次数相加。
一个非空 Session 批次被压成一个根增量。
这只保留根的相等和先后关系，不验证实际条目数、摘要编码或 SQL 位置值。

`Semantic` 用 `execution/sequence` 表示固定的原事件与后果。
已建事件不会修改，故这个二元组在模型中唯一决定原语义。
根和 head 是重核材料，`Refresh` 可以更新它们。
这不是对实际 operation 摘要字段的规定。
真实实现仍须对完整语义输入作相等核对，不能只比较这两个字段。

## 动作与线性化点

| 动作 | 状态变化与保护 |
| --- | --- |
| `PublishAgent` | 在没有活动写事务时发布原记录和 K-5 索引。head 增加一次，事件数可以增加零、一或二。 |
| `Observe` | 客户端读取原事件、head 和共同根，确定 operation。读取后允许其他发布交错。 |
| `Begin` | 获得同租户写事务，进入核对阶段。两个客户端可以持有同根或不同根观察。 |
| `Judge` | 先核租户和受信入口，再认回 operation，然后核根、head 和解释序号。合法时只准备结果，不发布。 |
| `PublishSession` | 一次发布封套、后果、进度与 operation 回执。这是 Session 成功的线性化点。 |
| `Abort` | 在核对或准备之后中止。暂存结果消失，Agent 原事实与 Session 已提交状态不变。 |
| `LoseContact` | 客户端在等待时转为未知。事务可以尚未提交，也可以已经提交但未交回答案。 |
| `Deliver` | 交回已提交回执，不再次执行事务。 |
| `Query` | 有原记录则认回。原事务仍活着时保持未知。只有原事务已消失且没有记录时才允许同身份重试。 |
| `Refresh` | 收到 `changed` 后重读根与 head，保留原 operation 和事件语义。 |

`Judge` 的 `recovered` 分支先于根检查。
因此提交后新增 Agent 事实不会阻止原 operation 认回。
`Query` 不把在途的未命中当成未提交，旧事务仍能随后发布。
模型允许每次尝试在准备后回滚，也允许提交前失联、提交后丢答复与重复查询。

一个租户内的写事务串行，这是提供者需要兑现的前提。
模型没有用单客户端或“读完就提交”的环境假设排除竞争。
`Observe` 可以与 Agent 发布、另一个客户端的提交交错。
写事务内部暂存结果对读者不可见，由 `transaction` 与持久变量分离表达。
跨进程锁、Worker 和数据库隔离是否兑现这个前提，需要真实提供者验证。

## 性质与负控

所有正常配置检查 `TypeOK` 和下列性质。
[run-models.py](run-models.py) 为每个配置固定预期。
负控只检查具名目标，防止同一变异产生的其他不变量先截断轨迹。

| 要求 | 不变量 | 可解释负控 |
| --- | --- | --- |
| P1 同一 operation 至多提交一次 | `AtMostOnce` 按历史封套计数，不依靠集合去重 | `negative-forget-operation` 同时去掉事务入口和未知查询的 operation 认回，允许相同 operation 再次发布。 |
| P2 同事务可见 | `AtomicVisibility` 核对原记录与 K-5 索引、进度与后果、operation 记录与提交封套 | `negative-split-agent` 只发布原记录。`negative-split-session` 只发布解释封套。 |
| P3 未知后认回不重复 | `RecoveryStable` 核对曾未知的 operation 只有一个封套，成功答复引用原封套。`NoRepeatedEffects` 核对每个原事件至多产生一次后果。 | `negative-unknown-recommit` 去掉 operation 认回，产生未知后的重复提交。该反例允许 sequence 检查仍挡住重复业务后果。`negative-replay-sequence` 另去掉 sequence 防重，检出两个 operation 对同一事件重复产生后果。 |
| P4 禁止非法提交 | `LegalCommit` 从提交封套重新核对租户、入口、实际 head、实际根和序号 | `negative-skip-head`、`negative-skip-root`、`negative-skip-tenant`、`negative-skip-view` 各去掉一个保护。 |

`forget-operation` 删除的是协议的认回控制，包括回执查询和事务入口排重。
真实实现的 operation 唯一键、存储操作身份和纯层进度检查可能互相补强。
模型反例不声称删掉某一条 SQL 语句就必然击穿所有这些保护。
重复提交反例保留 sequence 防重，所以“第二次提交”与“第二次业务后果”分别报告。

五个 `witness-*` 配置使用未变异协议。
它们故意断言目标状态不可达，要求 TLC 给出违反轨迹。
目标分别是未知后认回、查到在途未知后晚到提交、旧根得到 changed、另一 operation 重读同一事件、head 与事件数不同。
这些是可达性证据，不是产品缺陷。

## 有限范围与前提

正常配置的参数如下，顺序为客户端、execution、operation、每执行最大发布数、每执行最大事件数、每客户端最多尝试数。

| 配置 | 参数 | 用途 |
| --- | --- | --- |
| `positive-race` | 2、1、2、1、2、2 | 两个解释者竞争，同身份和异身份重读，两个事件共享一个 head。 |
| `positive-head` | 1、1、1、2、2、2 | 零事件发布和读取后的 head 变化。 |
| `positive-boundaries` | 1、1、1、1、1、2 | owner/foreign、trusted/delegated 与错误 head 的全部组合。 |
| `positive-executions` | 2、2、2、1、1、1 | 不同 execution 的进度隔离，同 operation 异语义冲突。 |
| `positive-recovery` | 1、1、1、2、1、3 | 在途未知、晚到提交、回滚后重试、提交后认回。 |

所有配置最多容纳三个 Session 提交封套。
正常配置最多只有两个 operation，所以该上限不会先于 `AtMostOnce` 阻止正常提交。
负控在第二个重复封套处失败，也不受该上限遮挡。
尝试上限会截断更长的重试历史，结论仅覆盖所列范围。
没有使用 TLC 状态约束裁掉异常状态，也没有使用对称归约。

其他前提和未覆盖如下。

- 一个已建立的 Session，属于 owner 租户。foreign 是对该 Session 的跨租户请求。没有同时运行第二个租户的事务域。
- execution 到 Session/Run 的关系已建立且不变。模型保留 execution 身份，不验证路由建立、迁移或 historical Run 登记。
- 事件来源与 head 回执分别由不可变原记录决定。没有伪造回执或摘要碰撞。K-5 的批次、受理目录与后果种类被合并为 `indexFacts` 的完整原事实索引，不验证各表编码或字段翻译。
- 每个被解释事件都有一个业务后果。`observed` 跳过、entries/results 对账、sequence=null、压缩与终态业务规则不在本模型中。
- 没有资格撤销和主体重认证模型。trusted/delegated 表示端口入口资格，不代表 authority 主体类别的待裁答案。
- SQL 暂存写入被压成准备与原子发布。任意暂存语句失败映射为 `Abort`，模型不验证 SQL 回滚实现。
- `Query` 的“原事务已消失且没有记录”是完整排除事实的抽象。基线 R7 可能仍答 unknown，模型不声称现有端口已经能给出这一排除证明。
- 不建模断电、磁盘损坏、日志裁剪、回填、无限规模或外部服务的最终响应。
- 不加公平性，不声明终止或活性。允许环境永久失联、反复回滚或不再调度。TLC 关闭 deadlock 检查，因为有限尝试和资源上限可形成合法停机状态。

## 源码映射与实现义务

下表「已兑现」一列是现在已有源码实现的切点。
兑现指源码有对应实现并有 SQL 用例，不指模型与实现的符合性已经证明。
用例的范围见[存储成员 SPEC](../../SPEC.md#已知限制)第 12、16 条。

| 模型位置 | 来源 | 已兑现 | 尚需核验 |
| --- | --- | --- | --- |
| observation 与 `Judge` | [公开 observation](../../../session-contract/src/projection.ts)、[validateObservation](../../../session-contract/src/observation-validation.ts)、[事务端口](../../../session-contract/src/ports.ts)、[log 判定](../../src/worker/log.ts) | `commitLog` 在写事务内先按 operation 认回，再读 K-5 并调用纯层。错 head 答 `invalid(revision)`，跨租户与不存在的会话答相同的 `denied`，委派视图答 `denied`，`sequence ≤ readThrough` 认回覆盖它的原回执。LC-01 至 LC-10 在 `node:sqlite` 夹具与真实 sqlite-provider 上运行 | 模型的 `Refresh` 与 `changed`：SQL 写事务串行，交错的第二个提交在同一事务里读到新进度，按零条目认回，没有实际产生 `changed` 的用例 |
| `PublishAgent`、K-5 分量 | [execution-record.ts](../../src/worker/execution-record.ts) 的 `publish`、`writeIndex`；[history-index.ts](../../src/worker/history-index.ts) | 原事实与四张 `er_` 索引表同事务写入（既有）。读侧在 Session 的同一写事务里按键点查四张表，占位回执、未知 kinds 与解析不出的行不进入索引 | AD-02 生产发布点的 `kinds` 归一与非当前执行的占位回执归 session-adapters 的 AD-02 生产插件；`taken` 与已解释批次不进入索引 |
| `Root` 与 `Refresh` | [log-root.ts](../../src/worker/log-root.ts)、[history-index.ts](../../src/worker/history-index.ts) | 共同根与 K-5 分量在同一写事务里读出，根与索引同源 | 用旧根准备、在新根上重判的路径仍只由纯层的 `changed` 规则覆盖 |
| `Judge`、`PublishSession`、`Abort` | [log 判定](../../src/worker/log.ts)、[参加者](../../src/worker/participant.ts) 的 `publishSameLog` | 后果行、进度行、模型视图、快照、派生行、`log` 操作行与尾部同一事务发布。条目行、快照、操作行、尾部四处写失败注入后全部 `sl_` 表不变（`tests/log.spec.ts`） | 真实提供者上的写失败注入未运行，回滚只在 `node:sqlite` 夹具上观察 |
| `LoseContact`、`Query`、`Deliver` | [log.ts](../../src/log.ts)、[commit.ts](../../src/commit.ts) 的尝试代次结算；[SL07/08](../../../session-contract/SPEC.md#日志提交与查询结果) | 应答丢失答 `commit-unknown`，同 operation 重试认回原回执。`log` 记录对 `queryOperation` 与 `queryControlOperation` 都答 `conflict`，认回只走重试。认回别的 operation 不保存本身份的记录，查询答 `unknown` | 真实提供者上的杀进程后认回只对 `create` 运行（`tests/real-provider.spec.ts`），没有对 `commitLog` 运行 |
| execution 路由 | [执行索引](../../SPEC.md#执行索引) | 不变 | 建立和唯一关联归 generation-handoff 模型与产品符合性 |

既有 Session frontier 模型覆盖前缀、冻结与后继治理。
本目录增加事务发布和未知认回的具体保护，不修改旧模型。
Agent Finishing 与 model-reception 模型继续拥有动作与结果接收的范围。
本目录的通过不能替代它们或真实 SQLite、完整 Cordis 装配的证据。

## 运行

在 Windows 宿主 Git Bash，从仓库根运行。
TLC 使用 WSL，是本目录采用的工具环境。
运行器将本目录的模型、cfg 与自身复制到独立 WSL 临时目录。
TLC 不在 `/mnt/d` 上运行，临时目录在退出时清理。

```bash
export PYTHONUTF8=1
unset UV_DEFAULT_INDEX
export OMNE_TEST_SLOT_DIR="C:/Users/ALIENW~1/AppData/Local/Temp/omne-test-slots-ALIENWARE"
python packages/session/session-storage-sql/verification/log-commit/run-models.py --help
python packages/session/session-storage-sql/verification/log-commit/run-models.py --self-test
python packages/session/session-storage-sql/verification/log-commit/run-models.py --parse-only --output tmp/log-commit-parse
node scripts/with-test-slot.mjs python packages/session/session-storage-sql/verification/log-commit/run-models.py --workers 1 --heap-mb 1024 --timeout 120 --output tmp/log-commit-tlc
```

`--case <名称>` 可以重复，按给出的顺序运行所选配置。
默认串行运行全部配置。
`--backend native` 使用本机 Java，并仍把模型复制到独立临时目录。
`--jar` 指定实际 JAR，不下载安装依赖。

每个正常 cfg 必须返回 0，输出无错误完成语句、状态计数且队列为空。
负控和见证必须返回 12，输出指定 invariant 与行为轨迹。
错误 invariant、语法失败、Java 失败、超时和没有穷举证据都不算通过。
运行器退出码为 0 表示所有预期成立，1 表示至少一项不符，2 表示运行器或工具无法执行。
`summary.json` 保存各 cfg 的命令、实际退出码、状态数、耗时、Java 版本、JAR 摘要与模型字节摘要。
各 `.log` 保存原始 TLC 输出。

## 实际结果

2026-11-02 在 Windows 11 的 Git Bash 发起上述命令，WSL Ubuntu-24.04 执行 TLC。
运行器退出 0，19 个配置全部符合预期。
5 个正常配置穷举完成，9 个变异负控与 5 个见证分别命中指定 invariant。
SANY 静态解析退出 0。运行器的 8 项结果分类自测通过。

- TLC 实际横幅为 `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`。
- Java 为 Temurin `21.0.12.1+1-LTS`，Python 为 WSL `3.12.3`。
- JAR SHA-256 为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`。
- 参数为单 worker、`-Xmx1024m -XX:+UseSerialGC -fp 0 -seed 1 -cleanup`，每 cfg 最多 120 秒。
- 汇总与原始日志写入 `--output` 指定的目录，在工作树 `tmp/` 下，不入库。

| 配置 | 生成状态 | 不同状态 | 退出码 | 日志结论 |
| --- | ---: | ---: | ---: | --- |
| positive-boundaries | 364 | 258 | 0 | 无错误，队列为 0 |
| positive-executions | 79,309 | 36,749 | 0 | 无错误，队列为 0 |
| positive-head | 1,073 | 677 | 0 | 无错误，队列为 0 |
| positive-race | 86,836 | 35,880 | 0 | 无错误，队列为 0 |
| positive-recovery | 564 | 333 | 0 | 无错误，队列为 0 |
| negative-forget-operation | 179 | 112 | 12 | AtMostOnce |
| negative-unknown-recommit | 179 | 112 | 12 | RecoveryStable |
| negative-replay-sequence | 1,310 | 776 | 12 | NoRepeatedEffects |
| negative-split-agent | 2 | 2 | 12 | AtomicVisibility |
| negative-split-session | 13 | 12 | 12 | AtomicVisibility |
| negative-skip-head | 68 | 67 | 12 | LegalCommit |
| negative-skip-root | 843 | 500 | 12 | LegalCommit |
| negative-skip-tenant | 86 | 83 | 12 | LegalCommit |
| negative-skip-view | 89 | 86 | 12 | LegalCommit |
| witness-changed | 504 | 297 | 12 | NoChangedWitness |
| witness-distinct-head | 4 | 4 | 12 | NoDistinctHeadWitness |
| witness-late-commit | 25 | 18 | 12 | NoLateCommitWitness |
| witness-recovery | 28 | 20 | 12 | NoRecoveryWitness |
| witness-replayed-fact | 1,310 | 776 | 12 | NoReplayWitness |

未知重提交反例有 14 个状态。第一次发布产生回执 1，失联后查询绕过认回，重读根后再次发布回执 2。
第二个封套的 `applied` 为 FALSE，所以该反例没有伪称业务后果重复。
独立的 sequence 变异在第 10 个状态检出同一事件的两个实际后果。
晚到提交见证在第 8 个状态成立，顺序为 Begin、LoseContact、Query、Judge、PublishSession。

这些结果只支持所列有限抽象。正常通过、负控灵敏度、实现符合性和最终接受是不同事实。
