# @omne-harness/session-storage-sql 行为规格

状态：存储成员，`draft`。已实现事务端口、两个参加者 `session` 与 `execution-record`、共同日志根、`session` 的只读核对、`./participants` 子路径、静态材料与读 handler，见[实现现状](#实现现状)与[参加者模块与材料](#参加者模块与材料)。事件通道的解释提交 `commitLog`、K-5 同根索引读取、观察尾部前缀与准入记录见[已知限制](#已知限制)第 12、16、17 条。本成员只经 [sql-contract](../../storage/sql-contract/SPEC.md) 的公开形状使用 SQL；本页其余条款是设计目标，实现覆盖范围见下文[实现现状](#实现现状)。本成员是 Session 组里唯一接触介质的成员。它用 SQL 表兑现 [session-contract](../session-contract/SPEC.md) 声明的 `SessionTransactionPort`：提交、权威读、原操作查询、控制操作查询、模型选择读、历史读、epoch 视图读、待办扫描、引用查询与已释放作用域读。治理规则不在本页，本页只写表、索引、写路径、读路径、符合性与介质差异。

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。表与索引的列、键与约束在 [docs/object-model.md](docs/object-model.md)，写路径、压缩提交与派生重建的时序在 [docs/flows.md](docs/flows.md)，验证义务在 [docs/verification-obligations.md](docs/verification-obligations.md)。

## 范围与依据

本成员拥有四类东西：

1. 权威表与派生索引的 SQL 形状，以及它们的迁移片段。
2. 存储契约的两个参加者模块。`session` 在存储提供者的 Worker 内、在一次 `commit` 的事务里执行 Session 的事实语句。`execution-record` 在同一租户事务域里保存执行记录提供者（Agent Journal）的记录，不解释 Agent 的业务。
3. `SessionTransactionPort<P>` 的 SQL 实现：把 Session 的命令翻译成存储契约的一次提交，把读操作翻译成 SQL 读取。
4. 读路径 R1 至 R11 的算法与符合性套件。

本成员不拥有：治理规则与领域服务（归 [session-contract](../session-contract/SPEC.md#领域服务与归约)）、命令处理流水线的事务外部分（归 [session](../session/SPEC.md#cp-命令处理器流水线)）、邻域翻译（归 [session-adapters](../session-adapters/SPEC.md)）、提交协议与回执（归存储契约）、条目缓存与快照缓存（归 `session`）、视图前缀摘要缓存（归 `session-adapters`）。

本页依据下列正文。本页只细化存储，不削弱它们。

| 依据                                                                   | 位置                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日志不变量 SL01 至 SL14、提交与查询结果、读取与恢复                    | [session-contract SPEC](../session-contract/SPEC.md#session-log-的长期不变量)                                                                                                |
| `SessionTransactionPort` 的义务、端口表                                | [构造依赖端口与出站端口](../session-contract/SPEC.md#构造依赖端口与出站端口)                                                                                                 |
| 历史面四个读操作、`SessionReconciliation` 的三个读操作                 | [SessionHistory](../session-contract/SPEC.md#sessionhistory)、[SessionReconciliation](../session-contract/SPEC.md#sessionreconciliation)                                     |
| 共同提交表 JC-01 至 JC-28、参加者流水线                                | [共同提交与共享事务域](../session-contract/SPEC.md#共同提交与共享事务域)                                                                                                     |
| 事件封套、九族 38 类、效力、不进入日志的内容                           | [事件目录](../session-contract/docs/object-model/session-log-events.md)                                                                                                      |
| 解释进度随解释提交保存                                                 | [EC-02](../session-contract/SPEC.md#ec-02)                                                                                                                                   |
| 引用查询的索引维护与引用定义                                           | [常驻工具与会话冻结](../session-contract/SPEC.md#常驻工具与会话冻结)                                                                                                         |
| 已释放作用域的账本                                                     | [ScopeReleasePort](../session-contract/SPEC.md#scopereleaseport)                                                                                                             |
| 推理续接状态不建索引                                                   | [推理续接状态](../session-contract/SPEC.md#推理续接状态)                                                                                                                     |
| 压缩记录形状、保留名单与模型视图 CM-01 至 CM-06                        | [message SPEC 模型视图](../../common/message/SPEC.md#模型视图)                                                                                                               |
| 历史源读口与 epoch 视图 H1 至 H5                                       | [request-context-contract](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图)                                                                           |
| 公开形状                                                               | [session-contract public-api](../session-contract/docs/public-api.md)                                                                                                        |
| 存储契约：操作身份、提交、查询、响应证据、参加者端口、读入口、关闭协议 | [sql-contract 规格](../../storage/sql-contract/SPEC.md)、[sqlite-provider 规格](../../storage/sqlite-provider/SPEC.md)                                                       |
| 技术选择：Kysely 加 `node:sqlite`，经配置切换 PostgreSQL，没有内存实现 | [技术基础](../../../docs/architecture/technical-foundations.md#共同技术选择)、[基础设施政策](../../../docs/architecture/deployment/infrastructure-policy.md)                 |
| 耐久边界与 SQL-T01                                                     | [已确认保存的耐久边界](../../../docs/architecture/data-and-state.md#已确认保存的耐久边界)、[SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) |
| 组内落位                                                               | [组架构](../docs/architecture.md)、[组流程](../docs/key-flows.md)                                                                                                            |

### 实现现状

<a id="实现现状"></a>

本节记录 head `80852180e` 的源码事实。「已实现」指 `src/` 里有对应代码并有用例；用例的覆盖范围见[自有义务的验证](#自有义务的验证)。本页其余章节写的是设计目标，与本节不一致处以本节为准，直到该条款被实现或被拥有者改写。

| 条款                                  | 现状                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根入口导出                            | `createSessionStorage`、`createSessionStoragePair`、`createSessionPrincipalBindings`、`sessionStorageMaterials`、`SESSION_PARTICIPANT` 和它们的类型（含 `SessionStorageMaterialsOptions`）。子路径 `./participants` 导出两个参加者的词汇，见[对外部提交方的词汇](#对外部提交方的词汇)。没有 `./cordis` 子路径，也没有该源文件。会话存储组合由应用承担，本成员不建 Cordis 服务、目录或组合登记                                                                                                                                                                    |
| SQL 依赖                              | 只从 `@omne-harness/sql-contract` 与 `@omne-harness/sql-contract/worker` 导入。不导入 `packages/storage/**` 内部，`dependencies` 不含 `@omne-harness/sqlite-provider`，源码里没有 `node:sqlite`。`devDependencies` 有 sqlite-provider，只供 `tests/real-provider.spec.ts` 用它的公开入口                                                                                                                                                                                                                                  |
| 端口操作                              | `commit`、`readWork`、`readInput`、`queryOperation`、`queryControlOperation`、`readModelSelection`、`commitEntries`、`commitLog`、`history`（`begin`、`next`、`since`、`readModelView`）、`pending`、`references`、`releasedScopes` 已实现。`commitEntries` 的步骤见[已知限制](#已知限制)第 1 条，`commitLog` 的步骤见第 16 条。`readWork` 的快照带同一快照里读出的 `historyIndex`，见第 12 条                                                                                                                                                                                                                                       |
| 静态材料                              | 两个参加者 `execution-record` 与 `session`（`grouping` 都为 `singleton`）；十个迁移 `session/001-session-log`、`session/002-execution-index`、`session/003-operation-evidence`、`session/004-state-items`、`execution-record/001-execution-record`、`execution-record/002-preadmission`、`execution-record/003-admission-attempt`、`execution-record/004-state-parts`、`execution-record/005-fact-body` 与 `execution-record/006-fact-blob`；二十个 `snapshot` 读 handler：`session.work`、`session.work-version`、`session.binding`、`session.work-index`、`session.work-reads`、`session.input`、`session.model-selection`、`session.history`、`session.model-view`、`session.pending`、`session.references`、`session.released-scopes`、`session.history-root`、`session.execution`、`execution-record.facts`、`execution-record.open-executions`、`execution-record.events`、`execution-record.operation`、`execution-record.blob`、`execution-record.preadmission`。`session.work` 另读 `sl_state_item`、`sl_entry` 与 `er_` 同根索引表；`session.work-version` 只读 `sl_journal` 与 `er_root` 两次主键点查（[RT-04](#rt-04)）；`session.binding` 只读 `sl_journal` 的主键点查与 `sl_entry` 里第一批（修订 1）的条目，不读 `sl_state`（[BD-01](#bd-01)）。每个模块带文件摘要。参加者与迁移的材料变化改变组合的清单摘要，读 handler 不进清单，见第 17 条   |
| 当前表                                | `sl_journal`、`sl_entry`、`sl_operation`、`sl_state`、`sl_state_item`、`sl_input`、`sl_model_view`、`sl_annotation_idx`、`sl_pending_idx`、`sl_resident_idx`、`sl_released_scope_idx`，另有 `sl_kind_idx` 与 `sl_operation_revision_idx` 两个二级索引。执行索引 `sl_execution_idx` 也归 `session`，见[执行索引](#执行索引)。操作的访问证据 `sl_operation_evidence` 也归 `session`，见[操作记录的访问证据](#操作记录的访问证据)。`execution-record` 拥有 `er_root`、`er_operation`、`er_execution`、`er_fact`、`sl_blob`、`er_admission_idx`、`er_admission_attempt_idx`、`er_preadmission`，二级索引 `er_execution_session_idx`、`er_fact_execution`，唯一索引 `er_preadmission_entry_idx`、`er_fact_event`、`er_fact_operation`。迁移 006 删除了 `er_state`、`er_state_part`、`er_fact_idx`、`er_fact_body` 与 `er_batch_idx`，见[已知限制](#已知限制)第 18 条。列见[对象模型](docs/object-model.md)   |
| 尚未实现的设计                        | `sl_batch`、`sl_ref_idx`、`sl_rebuild`；TB-04 在条目一侧的内联阈值与 `payload_ref`（`sl_blob` 已落地，只由 `execution-record` 写入）；R9 的追赶与重建、`fold_version`、解释版本记录与隔离；R4 的按关联定位；PostgreSQL；`maxScanPerPage` 与读路径的逐条披露核对；配置项「内联阈值」「大对象去向」「快照重建方式」。`sl_state` 落后时 handler 返回 `behind`，端口映射为 `unavailable`，没有自动追赶                                                                                                                                                                               |
| 与设计的差异                          | 提交身份的 `protocolVersion` 为 `2`，`scope` 为租户域，`operationKey` 为 `<SessionOperationId>#<代次>`。待办原因有八个，含 `initialization`（与 `PendingReason` 一致，下文 W3 与 R8 写「七个」处按八个读）。`sl_operation.form` 有 `batch`、`control`、`answer`、`entries`、`log` 五种，`answer` 行没有 `revision`。尝试代次上限初值为 8，游标有效期初值为 15 分钟。`commit` 先对各代次调用存储 `query`，不先点查 `sl_operation`；参加者模块不另核对材料集合，交给 `decide`；提交结果从回执的响应证据取出，不读回 `sl_operation` |
| R7 的现状（Reduce R1-D23 按源码改写） | 未命中 `sl_operation` 的操作，在代次 1 得到存储 `not_committed` 时，`queryOperation` 与 `queryControlOperation` 对外答 `unknown`，与上文 R7 正文一致。源码里 `exclusion()` 仍构造 `not-committed` 与排除证据，但 `unfound()` 把它映射为 `unknown`，这份证据不到达调用方，见[已知限制](#已知限制)。真实 sqlite-provider 对从未使用的身份答带五项证明的 `not_committed`，`queryOperation` 仍答 `unknown`（`tests/real-provider.spec.ts`）                                                                                   |
| R10、R11 系统读游标的现状 | R10 的续读游标绑定种类、目录修订与 `key`（载荷的可选字段 `key`，ResidentKey 文本）。验证时 `key` 缺省按 null 比较，不等时答 `invalid`，`field` 为 `cursor`，reason 为 `issued for another key`。R11 的游标不带 `key`，也不带目录修订。`key` 不放进租户或会话字段，因为系统读的这两个字段按协议为空。实现升级前签发、没有 `key` 的 R10 游标按新规则答 `invalid`；游标有效期 15 分钟且 M2 没有发行，按可接受的协议收紧处理。真实 sqlite-provider 上的系统读用例见 `tests/real-system-reads.spec.ts`；索引行直接写入域文件，只验证读取路径，不验证 W3 对索引的维护 |

### 已知限制

<a id="已知限制"></a>

K-n 编号是 Session 组各成员共用的一套序列：本页用 K-1 至 K-5 与 K-7，[session-adapters](../session-adapters/SPEC.md#已知限制) 用 K-6 与 K-8 至 K-22，缺号不表示遗漏。无 K 编号的条目按位置号引用。

1. `commitEntries` 的实现与它的限制。规则与失败类别归 session-contract 的 [entries 通道的解释提交](../session-contract/docs/same-log-pure.md#entries-通道的解释提交)。本成员按下列步骤兑现：
   - 端口侧（`src/entries.ts`）不问访问检查，因为调用者是受信的解释者。租户不是 legal-identity 铸造的时返回 `invalid`（字段 `tenant`），不调用存储。其余输入编码为意图 `entries` 的参加者事实，按 `commit` 的同一套尝试代次提交。应答摘要用 `digestSessionEntries`，摘要不同的同一身份答 `conflict`。
   - 参加者侧（`src/worker/entries.ts` 判定，`src/worker/participant.ts` 写入）在同一写事务里读 `sl_journal`、`sl_state` 与该身份的 `sl_operation` 行，调用 `projectSessionEntries`，`saved` 取快照的 `entriesProgress`。没有该会话的日志时答 `denied`。拒绝时答停止响应，事务回滚。合法时分配位置与修订，调用 `reduce`。`reduce` 隔离时答 `quarantined`，不写任何行。
   - 写入顺序：`sl_entry`（后果行与进度行）、`sl_model_view`、`sl_state`（快照含 `entriesProgress`）、派生索引、`sl_operation`（`form` 为 `entries`，回执是普通 `CommitReceipt`，结果是 `SessionEntriesReceipt`），最后有条件地更新 `sl_journal.tail`。任一步抛出或失败，存储回滚整个事务。
   - 不改表结构，不加迁移，提交路径不读历史行。RD-1 至 RD-3 只在提交路径逐批核对，因为 R9 的快照重建尚未实现。
   - 同一通道两次同 `start` 的并发提交只有一次成功，这项保证来自租户事务域的串行写，不来自本成员。
   - 验证：`tests/entries.spec.ts` 在 `node:sqlite` 夹具上对后果行写入后、`sl_state` 写入前、尾部更新时与操作记录写入时各注入一次写失败，核对四张表都不变，再用同一输入只提交一次；另核对应答丢失时答 `commit-unknown`，查询答 `committed`，重发得到原回执。共用用例 `sessionEntriesConformance` 在夹具上（`tests/conformance.spec.ts`）与真实 sqlite-provider 上（`tests/real-provider.spec.ts`）各跑一次。夹具的回滚是 `node:sqlite` 上的模型，负控「把夹具的 ROLLBACK 改成 COMMIT」只证明用例能观察到回滚，不证明真实提供者的回滚。真实提供者上没有运行写失败注入，未执行。
2. 两套测试夹具。`tests/fixtures/sqlite-storage.ts` 在 `node:sqlite` 的内存库上运行本成员真实的 participant 与 handler 模块，每个事务域一个库。它与真实读端口一样拒绝没有 `LIMIT` 的读语句。它不覆盖 Worker、持久、受理队列、关闭与限额，通过只说明模块的 SQL 语义成立。`tests/fixtures/real-provider.ts` 经 sqlite-provider 的公开入口在临时目录的文件库上组合真实存储，`tests/real-provider.spec.ts` 覆盖：Worker 下提交与读回；回执返回后杀进程，新提供者按原身份 `query` 得 `committed`；从未提交的身份得 `not_committed`，不当作 `committed`，`queryOperation` 答 `unknown`；关闭（租约归还，关闭后写入为 `commit-unknown`，`query` 为 `unknown`）；`command_limit` 与 `queue_full` 两种限额。迁移里建索引在真实提供者上可用。未覆盖：断电耐久、WAL 维护与读暂停、跨进程写者、读 Worker 崩溃、`lockWaitMs` 超时。组提交计数见第 6 条。
3. 本批新增行为（读路径路由、控制答案、模型选择、游标绑定）没有先红后绿的记录，R10 游标的 `key` 绑定除外。本成员以负控用例代替：租户隔离、跨租户域目录、游标篡改与未授权访问各有反例用例。负控只说明这些反例被拒绝，不说明旧实现曾失败。R10 的 `key` 绑定有先红后绿记录：`tests/system-reads.spec.ts`「a references cursor of one key is invalid for another key」在实现之前红，实现之后绿。
4. 上一节「尚未实现的设计」各项都是已知限制。它们在实现之前不得写成已验证。
5. 偏离：材料集合核对（W1 第 3 步；session-contract「SessionTransactionPort」义务 1、2）。现行条款要求按命令种类核对 `guards` 的完整材料集合，缺一项或多一项答「不支持」。共同提交表的「参加者」列只有文字，没有可核对的 `owner`、`participant`、`protocol` 取值，身份桥、证据桥与 Context 输入在生产中也尚未实现，所以本成员现在只执行契约已固定的两处核对：`create` 与 `completeInitialization` 的 `session-initialization` 材料；`startRun` 的登录门见 W4b，不经守卫；其余命令的 `guards` 原样带入，不核对集合。退出条件：真实身份桥、证据桥与 Context 输入接入 Session 时，由 session-contract 的拥有者补导出逐命令材料表，本成员随之核对缺项与多项。条款原文不改（Reduce 裁定，#1000）。
6. 组提交计数：`tests/real-provider.spec.ts` 并发提交 8 个会话的 `create`，原操作数 8，物理写事务数 8（读 WAL 提交帧得到，没有读提供者内部计数）。两者相等，记为零合并：参加者 `session` 标 `singleton`，按提供者规格 §4.5 单独成组。本成员不声称 G2-P 在这条路径上生效。这是 Windows 上 Node 26.12 的一次观察。
7. `exclusion()` 构造的 `not-committed` 排除证据（`record`、`digest`）是死数据：`unfound()` 不把它交给调用方。要么删除，要么等辨认参加操作的入口补上后启用，见[明确缺项](#明确缺项)。
8. K-1 大载荷：执行记录的一次写入超过存储的 `maxCommandBytes` 时，提交方答 `unavailable`。一批事实有上界（第 18 条），所以只有内容块会让一次写入超限。块可以用 `blobs` 意图先于引用它的事实单独提交。单个块仍受 `maxCommandBytes` 限制，超过它的块没有分段链路。触发条件：真实材料超过上限。读口上限：每个读 handler 的 `maxOutputBytes` 是装配参数，本成员没有默认值，也没有源码常量。`sessionStorageMaterials({ readOutputLimitBytes })` 必填该参数，类型 `SessionStorageMaterialsOptions`，必须是正安全整数；缺参数、0、负数、小数、`NaN`、无穷、超出安全范围或不是数字，构造时抛 `TypeError`（`readOutputLimitBytes must be a positive safe integer`），不读任何文件。推荐值 20 MiB（20971520，R2-D81：长会话的快照每轮增长，不能停在 1 MiB，见 [session SN-1](../session/SPEC.md#sn-1)；harness-server 的发行构建写明这个值，见第 19 条）。该值与装配的 `maxCommandBytes` 无关。上限由装配保证：本成员看不到提供者的配置，不核对它。提供者读时答 `handler_unavailable`，这是可见的失败；装配期另有 sqlite-provider 的启动核对（R2-D89）：构造期核对每个读 handler 的 `maxOutputBytes` 不超过 `maxReadResultBytes`，见 [sqlite-provider 的构造与域打开](../../storage/sqlite-provider/SPEC.md#53-do-1构造与域打开)与[配置](../../storage/sqlite-provider/SPEC.md#121-配置)。提供者不为输出上限超过自己 `maxReadResultBytes` 的 handler 服务（读时答 `handler_unavailable`），并按这个上限为每次读预留 `globalReadResultBytes`（含只读几行的读），所以装配把 `maxReadResultBytes` 配到至少 `readOutputLimitBytes`，`globalReadResultBytes` 至少是同时在途的读数乘它，不足时多出来的并发读答 `queue_full`。`maxRowsRead` 仍是 2000，`session.work` 是 4000：它的索引最多读 1000 行，快照的分块每行至多 16 KiB，20 MiB 的快照约 1300 行（[快照的存储形态](#快照的存储形态)）。事实读口一页最多读 513 行。所以行数上限不先于字节上限挡住长会话。一个块由 `execution-record.blob` 整块读出。输出是块加一个很短的外壳。写入块的命令是同一个块加摘要、标识与事实（至少数百字节）。所以只要 `maxCommandBytes` 不超过 `readOutputLimitBytes`，能写入的块一定读得回。`tests/real-joint.spec.ts` 在 `maxCommandBytes` 为 1 MiB 的真实 provider 上写入恰好等于上限的命令（多一字节被拒为 `command_limit`），再读回同一个块。`tests/read-output-limit.spec.ts` 在写入上限放大的真实 provider 上写入 2 MiB 与几乎填满读上限的块并整块读回。输出超过 `readOutputLimitBytes`（该用例传 20 MiB）时读口答 `read_limit`，不交出任何部分。事实读口按整批分页（第 18 条），所以一个会话的事实总量不受 1 MiB 限制。装配把 `maxCommandBytes` 配到超过 `readOutputLimitBytes` 时这个保证不再成立。读口上限必须随之放大，否则块写得进、读不回，引用它的读者答 `unavailable`。
9. K-2 线性序依赖单写者：共同根的严格递增依赖 SQLite 每个事务域只有一个写事务。PostgreSQL 或跨进程写者要另做串行化，例如锁住 `er_root` 与 `sl_journal` 两行。触发条件：PostgreSQL 提供者或跨进程写者进入范围。
10. K-3 Agent 读形状：Agent 的读口只能用通用索引列。读形状要按别的字段过滤或排序时，要新增 `execution-record/00N` 迁移，由本成员的串行写者写。在此之前提供者不能用全量扫描代替。触发条件：Agent 契约改读口形状。
11. K-4 执行顺序依赖名字：共同提交里 `session` 读到本批 `er_` 写入，这依赖名字序（`execution-record` 在 `session` 之前）。触发条件：任一参加者改名，或任一方声明事实依赖（依赖图先于名字序决定顺序）。`tests/execution-record.spec.ts` 断言当前顺序。
12. K-5 同根索引的读取（R3、R2-D28 候选 C）。`src/worker/history-index.ts` 是唯一的组装处。`session` 的命令、`commitLog` 的判定与读 handler `session.work` 都调用它，在同一写事务或同一读快照里读两方的行。
    - 范围：只读本次决定涉及的关系（session-contract FR-01）。起点是本次的输入范围与本次点名的执行（`commitLog` 的观察执行）。输入经 `er_admission_idx` 找到原受理的执行，执行经 `er_fact` 里未解释的 input-taken 事件找到批次的成员输入，直到闭合。每张 `er_` 表都按键点查或范围查，`er_execution` 按 `(tenant, execution, session)` 点查，不读该会话的全部执行。全部语句共用一个行数上界（提交里 100 000 行，`session.work` 里 1 000 行）。超出上界时提交答「失败」，`session.work` 的快照不带 `historyIndex`。
    - 执行边界：`run` 与 `started` 来自同会话的 `run.started` 条目。`revision`、`emittedThrough`、`ended` 取 `er_execution` 的列，`executionEvidence` 取回执列。`readThrough` 取快照里该执行的进度，`interpreted` 是该 Run 最后一条带执行进度的 `history.annotated` 条目的证据（与 `commitLog` 回执的 `interpreted` 用同一函数）。下列执行整条不进入索引，纯层对它答 `unavailable`：没有同会话的 SE13；回执是占位（`digest` 为 `unknown`）或解析不出；`ended` 解析不出；某个事实行的 `kinds` 含未知种类（延后标记 `deferred` 是已知种类，见 session-contract FR-01）；进度大于 0 却找不到解释条目。
    - 事实边界：按事件索引 `er_fact_event` 读 `(readThrough, emittedThrough]` 的事件行，另加 `commitLog` 观察序号那一行（纯层对已解释序号也按原行核对）。序号取 `eseq`，种类取 `kinds`，来源取事件投影 `event` 的 `source`。来源解析不出的行按缺行处理。
    - 批次：同一次事件读取里，事件投影带 `batch` 的行是 input-taken 批次。只列未解释的批次与观察序号的批次。当前不填 `taken`，已解释的批次若列出而没有对应的 taken，纯层判为矛盾，所以不列。
    - 原受理：按 `(input, ordinal)` 组成一页。Run 由原执行的 SE13 给出。attempt 取回执等于 `grant` 的 SE15，否则取该 Run 唯一的 SE15（attempt 不会删除，Run 只有一个 SE15 时受理用的就是它）。任一条对不上时，该输入整个不进入索引与读取，纯层答 `unavailable`。闭合之外的已路由输入只在该会话没有任何受理行时以空目录列出，这时空目录由行的缺席证明。
    - 原受理的 attempt：`er_admission_idx` 不加列。sqlite-provider 的迁移端口对 STRICT 表的 `ALTER TABLE ADD COLUMN` 放行不足（见[操作记录的访问证据](#操作记录的访问证据)），所以原 attempt 另存一张表 `er_admission_attempt_idx (tenant, session, input, ordinal, attempt)`，主键与 `er_admission_idx` 相同，迁移 `execution-record/003-admission-attempt`（依赖 001，`CREATE TABLE IF NOT EXISTS`，可重复执行；`verify` 核对表存在）。`submit` 的受理行把 Agent 提交回执写进 `grant`，它不是 SE15 的回执，`grant` 的含义不变。写入方在受理行里写出原 attempt（`ExecutionAdmissionRecord.attempt`，可选），`writeIndex` 在写受理行的同一事务里写这一行；未写 attempt 时不写行。`closeOver` 按 `(tenant, session, input)` 范围读出这张表，`attemptOf` 先按它在该 Run 的 SE15 里精确匹配，所名 attempt 不在该 Run 里则该输入不可证。没有 attempt 行（迁移前的旧行，或写入方未写）时保持原逻辑：`grant` 是该 Run 某个 SE15 的回执，或该 Run 只有一个 SE15，否则该输入的判定答 `unavailable`，不猜。**存储侧已就绪，写入方由 session-adapters 补**：`src/cordis/agent-journal.ts` 的 `publish` 组装 `admissions` 时尚未写 `attempt`，在它落地前 session-adapters 的 `tests/session-log-journal-replay.spec.ts` 的「replay cancelled-1」两个用例（durable copy、kept copy）仍在 `submit` 后的交接答 `unavailable`（`history.inputs.<input>`）。`session.work` 读这张表，所以它的 `requiresMigrations` 含 003，`session` 参加者的 `readTables` 含它。
    - 控制来源：同一次 `sl_entry` 读取另取 `control.requested` 与 `run.terminal` 行，按位置推出每个 Session 控制提出时 active Run 的 execution，放进 reads 的 `controls`，供纯层判定延后控制事实。
    - 前缀（R2-D28 候选 C）：只对 `readThrough` 小于 `emittedThrough` 的执行构造。取最长的连续前缀 `(readThrough, k]`：序号无缺、`kinds` 非空且全为 `observed`、来源完整。不新增列。是否覆盖所需上界由纯层判断。判定是纯函数 `observedPrefix`。
    - 读取计数：在 `node:sqlite` 夹具上，每轮 `startRun` 读 `er_` 行 0 行，`commitLog` 读 2 行（`er_execution` 1 行、`er_fact` 1 行），第 1、20、200 轮相同。五种 Session 行只读 Worker 保留的游标之后的行（[Worker 内的两处保留](#worker-retention)）：没有新行的读不读这五种行，一次提交之后的读只读这次提交写的行。冷启动、淘汰与游标指纹不符时从第一行重建，这一次的读量随会话的行数增长。保留的索引在 Worker 内按游标并入新行。游标处的行指纹（锚）与游标之后的空洞检测保证并入的结果与读全部行相同。未提交的行不保留，这依赖 `session` 参加者是 `singleton`（第 21 条，R2-D103）。
    - 验证：`tests/history-index.spec.ts` 核对索引字段与 `er_` 行一致、同一 Run 有两个 SE15 时按 attempt 行指回原 attempt（无 attempt 行或指名别的 Run 的 attempt 时该输入不进索引；真实提供者上写入并读回，慢层）、占位回执的执行不进索引且 `commitLog` 答 `unavailable`、R2-D28 反例（取消后的后继 `startRun` 在完整观察尾部时通过，缺行、空 `kinds`、未知种类、混入非 observed 时答 `unavailable`，非 observed 后果经 `commitLog` 提交后重试通过）、前缀判定的穷举小规模表，以及读取计数：20 轮与 200 轮的对应轮次读到相同的 `er_` 行数，且每轮相同；三轮固定用例里后继 `startRun` 读到的事实行数等于未解释事件数。增量保留的读取由 `tests/history-index-incremental.spec.ts` 核对：没有新行的第二次读不读五种行，一次提交之后的读只读它写的行。本成员不宣称重建那一次的读量与会话长度无关。
    - 尚未覆盖：`taken` 与已解释批次；真实 sqlite-provider 上的 K-5 读取只经 `tests/log-conformance.spec.ts` 的 `commitLog` 用例经过；适配器的 kinds 归一与生产 AD-02 发布点归 session-adapters。
13. K-7 额外的 `changed`：每次 Agent 发布都使共同根前进。用旧根准备的 Session 提交会在新根上重判，即使这次 Agent 发布与它无关。触发条件：实测的重试次数超过 `perf-baseline.md` 的阈值。
14. N-P5-8 重建写口：本成员不提供同根索引的重建或回填写路径。`execution-record` 没有「不推进修订、只写索引」的意图，中立迁移也补不出由 Agent 语义派生的列。触发条件：K-3 或 K-5 的回填，或 SL14 判定索引缺项要重建。届时由本成员提出一个只写索引的意图，交负责人裁定。
15. 真实组合待复跑：共同提交、冲突回滚与杀进程后认回在真实 sqlite-provider 上运行（`tests/real-joint.spec.ts`）。生产组合（应用的材料目录与登记）等 L-APP 的组合声明合入后复跑。
16. `commitLog` 的实现与它的限制。规则归 session-contract 的[事件通道的解释提交](../session-contract/docs/same-log-pure.md)。
    - 端口侧（`src/log.ts`）不问访问检查。租户不是 legal-identity 铸造的时返回 `invalid`，不调用存储。观察编码为意图 `log` 的参加者事实，按 `commit` 的同一套尝试代次提交，摘要用 `digestSessionLog`。委派视图答 `denied`（`action` 为 `commitLog`）。
    - 判定（`src/worker/log.ts`）：在写事务里读 `sl_journal`、`sl_state` 与该身份的 `sl_operation` 行。没有该会话的日志时答 `denied`。同身份的 `log` 记录摘要相同时认回原回执，否则答 `conflict`，这一步先于历史核对。然后读 K-5 历史索引（第 12 条），调用 `projectSessionLog` 与 `reduce`。纯层的拒绝原样答复，不写任何行。
    - 零条目：纯层不给条目时，序号不大于已存进度的观察认回覆盖它的 `log` 记录（进度最小的那条），`recovered` 为真，不写行；没有这样的记录时答 `unavailable`。其余观察答 `invalid`（字段 `consequences`）。延后控制事实是例外：Session 判定后只有 `observed` 时，纯层仍交出进度行，这次提交只写解释进度，不是失败（session-contract FR-03、FR-05）。零条目的处理与 session-contract `./testing` 的内存实现一致。认回不保存本身份的记录，回复带 `recorded: false`，所以 `queryOperation` 对这个身份仍答 `unknown`。
    - 发布：与 `commitEntries` 共用写入步骤（`sl_entry`、`sl_model_view`、`sl_state`、派生索引、`sl_operation`、尾部），全部在同一事务。操作行的 `form` 为 `log`，`receipt` 与 `result` 两列都保存 `SessionLogReceipt`，其 `interpreted` 是本批执行进度条目的证据。
    - 查询：`queryOperation` 与 `queryControlOperation` 对 `log` 记录都答 `conflict`。结果不明时，调用方用同一 operation 重试 `commitLog` 认回原回执。
    - 并发：同一事务域的写事务串行，所以不会产生 `changed`。两个 operation 交错解释同一事件时，后到者在同一事务里看到新进度，按零条目认回。
    - 验证：`tests/log-conformance.spec.ts` 在 `node:sqlite` 夹具与真实 sqlite-provider 上运行 LC-01 至 LC-10。`tests/log.spec.ts` 在条目行、快照、操作行与尾部各注入一次写失败，核对全部 `sl_` 表不变，同一观察随后只提交一次；另核对同身份认回、异内容冲突、另一 operation 认回原回执、两个查询答 `conflict`、应答丢失后重试认回、命令身份冲突、未铸租户不到存储，以及另一租户与不存在的会话答相同的 `denied`。真实提供者上没有运行写失败注入。
17. 准入记录（M-GENERATION 的 SaveIntent、Commit、Lookup）。`execution-record` 的第二个意图 `preadmission`，表 `er_preadmission`，迁移 `execution-record/002-preadmission`（依赖 001），读 handler `execution-record.preadmission`。
    - 列：`tenant` 与 `handoff`（H）为主键；`entry`（Ki）可空，`(tenant, entry)` 唯一（SQLite 与 PostgreSQL 的唯一索引都把 NULL 视为互不相同）；`session`、`execution` 可空，存储不推断；`intent` 与 `outcome` 是不透明的规范 JSON，`intent_digest`、`outcome_digest` 是参加者对规范 JSON 计算的摘要。
    - 意图阶段（`phase` 为 `intent`）：意图必须带 `request`、`origin`、`principal`、`qualification`、`adoption`、`materials` 六个成员。同 Ki 已有记录时原样答复，不写，不论 H。同 H 已有记录时摘要相同则认回，不同答「冲突」。都没有时插入。答复在提交之后到达，带 `created` 与完整记录。
    - 结果阶段（`phase` 为 `outcome`）：`kind` 为 `prepared` 或 `rejected`。没有意图记录时答「冲突」，依据为 `invalid`。已有结果时摘要相同则认回，不同答「冲突」。否则写入一次。
    - 读取：按 `tenant` 加 H 或 `tenant` 加 Ki 读回一条或 `null`。每条语句带租户条件。
    - 词汇：子路径导出 `preadmissionFacts`、`decodePreadmissionReply`、`decodePreadmissionRecord` 与类型 `PreadmissionIntentWrite`、`PreadmissionOutcomeWrite`、`PreadmissionRead`、`PreadmissionRecord`，handler 名为 `EXECUTION_RECORD_HANDLERS.preadmission`。
    - 清单摘要：新迁移（校验和与依赖）、参加者的拥有表与读表、参加者模块摘要都改变组合的 `manifestDigest`。读 handler 不进清单，新增 handler 本身不改变它；handler 带来的新迁移或新表才改变。当前值由 `combinationManifest` 加 `manifestDigest` 计算，归 Reduce 的组合声明；应用的材料目录与 `combinationVersion` 本成员不改。
    - 验证：`tests/preadmission.spec.ts` 核对意图的全部成员与摘要、同 Ki 答原记录与原 H、同 H 异内容冲突、表对同租户同 Ki 的第二行拒绝写入、结果只固定一次、无意图答 `invalid`、另一租户按同 H 或同 Ki 读不到，以及真实提供者上写入后杀子进程、新提供者按原 H 读回完整记录。

18. Agent 事实族（R2-D292、R2-D294）。会话日志由两个只追加族组成：Session 条目族（`sl_entry`）与 Agent 事实族（`er_fact`）。两族在同一事务域里，用同一次提交与同一次 fsync。`execution-record` 只保存提供者准备好的事实，不解释 Agent 的业务。
    - 迁移 `execution-record/006-fact-blob` 依赖 001、004 与 005。它删除 `er_state`、`er_state_part`、`er_fact_idx`、`er_fact_body` 与 `er_batch_idx`，重建不带 `answer` 列的 `er_operation`，再建 `er_fact` 与 `sl_blob`。它不迁移旧数据。被删的表名仍在参加者的 `ownedTables` 里，因为全新库先跑 001、004 与 005，而迁移只能删除拥有者自己的表。参加者与读 handler 的语句不碰这些表。
    - `er_fact` 一事实一行，主键 `(tenant, session, pub, ord)`，STRICT，WITHOUT ROWID。`pub` 是该批的发布序号，等于写入后的 `er_root.published`。`ord` 是事实在批内的位置。`ord` 为 0 的行是批信封，只有它带操作身份 `op`。`eseq` 是事件序号，不是事件的事实为 NULL。`kinds` 是事件的 Session 后果种类，不是事件时为空数组。`event` 是事件投影（`source`、`consequences`、`control`，input-taken 事件另有 `batch`），不是事件时为 NULL。`body` 是事实的 JSON，对本成员不透明。表上的 CHECK 约束保证这三组对应关系。
    - 索引：`er_fact_event (tenant, execution, eseq) WHERE eseq IS NOT NULL` 唯一，一个事件序号只写一次。`er_fact_operation (tenant, op) WHERE ord = 0` 唯一，一个操作只有一批。`er_fact_execution (tenant, execution, pub, ord)` 供冷启动按 execution 读。
    - 写入（意图 `publish`）：一批有 1 到 256 条事实（`EXECUTION_BATCH_MAX_FACTS`）。每条事实的 `body` 不超过 4096 个 UTF-8 字节（`EXECUTION_FACT_MAX_BYTES`），与它引用的内容大小无关。同一批里同一 execution 的两个事件不能同序号。违反任一条时答「不支持」，不写任何行。
    - 两道闸：第一道是 `er_root.published` 等于写入的 `published`，且执行行的修订号等于 `expected`，否则答「冲突」并带当前值。第二道是 `er_fact` 的主键。通过第一道却撞上已占位置的写入，语句失败，存储回滚整个提交。同一操作的第二批由 `er_fact_operation` 拒绝，即使 `er_operation` 的行丢了也一样。
    - 认回：`er_operation (tenant, operation)` 只存摘要与 `published`（该批的 `pub`）。已有这一行时答「冲突」，依据带原摘要与原 `published`。本成员不存答复。提供者由原批推导答复。
    - 内容块：一批可以带它需要的块。块按 `(tenant, digest)` 存一行，同租户同摘要只存一行，重复写入不改原行。`digest` 必须等于 `sha256:` 加 `payload` 的 UTF-8 字节的十六进制 SHA-256（`blobDigest`），否则答「不支持」。`size` 由本成员计算。意图 `blobs` 只写块，不写事实，不推进发布序号。它用于一个块放不进带事实的命令的情形。没有引用事实的块不是事实。
    - 原子性：事实、块、`er_operation`、执行行、受理行与 `er_root` 在同一事务里写入。任一语句失败，存储回滚全部，批与块都不可见。
    - 读口：每个读口的每条语句都带租户条件。会话读口先核会话：该租户没有这个会话时答 `{ kind: 'denied' }`，与会话不存在的答复相同，所以另一租户得不到任何信息。会话有发布却没有发布序号 1 的批，说明它的记录早于迁移 006，读口答 `{ kind: 'missing', published }`，读者答 `unavailable`。
      - `execution-record.facts`：输入 `tenant`、`session`、`after`（发布序号）与可选的 `execution`。输出 `pub > after` 的整批，按 `(pub, ord)` 排序。一页最多读 513 行，被行数截断的末批留给下一页。一页累计文本到 256 KiB 之前停下，但至少含一批。`next` 是下一页的 `after`。不带 `execution` 时，发布序号必须从 `after + 1` 连续到 `published`，每批的 `ord` 从 0 连续，否则答 `missing`。带 `execution` 时只给该 execution 的事实，一批可能只含它的一部分。
      - `execution-record.open-executions`：输入 `tenant`、`session` 与可选的 `after`。输出没有终止事件的执行行与同一快照的发布序号，按 execution 分页，一页 200 个。
      - `execution-record.events`：输入 `tenant`、`session`、`execution` 与 `after`（事件序号）。输出执行行的头与 `eseq > after` 的事件，按事件索引分页，一页 200 个。该会话里没有这个 execution 时答 `denied`。读的行数与会话长度和 `after` 之前的事件数无关。
      - `execution-record.operation`：输入 `tenant` 与 `operation`。输出该操作的摘要、会话、execution、`published` 与该批的全部事实，没有时为 null。另一租户的同名操作同样为 null。
      - `execution-record.blob`：输入 `tenant` 与 `digest`。输出块的 `media`、`size` 与 `payload`。该租户没有这个摘要时答 `denied`，另一租户持有同摘要也一样。
    - 不迁移旧数据：0.0.x 不承诺旧字节兼容（[当前演进政策](../../../docs/engineering/publication.md#当前演进与消费者)）。迁移前写入的会话保留 `er_root` 与执行行，没有事实，读口答 `missing`。
    - 清单摘要：迁移 006 与参加者模块摘要改变组合的 `manifestDigest`。读 handler 不进清单。当前值由 `combinationManifest` 加 `manifestDigest` 对构建后的 `dist` 材料计算，归 Reduce 的组合声明。应用的材料目录与 `combinationVersion` 本成员不改。
    - 验证：`tests/fact-family.spec.ts` 核对迁移的依赖与结果、批的行形状、后一次发布的语句字节不多于前一次、六种畸形写入不写任何行、两个写者竞争时后到者答「冲突」并在新头上追加、主键撞位回滚、丢了操作键时信封索引拒绝第二批、事件序号只写一次、五个写入点注入失败后批与块都不可见并且同一写入随后只成功一次、同租户同摘要只一行、`pub > after` 增量读、整批分页、缺口与旧会话答 `missing`、按 execution 读与开着的 execution、按事件序号读、操作读出原批，以及两个租户共用一个库时各读各的、没有该名字的租户得到「不存在」的答复。`tests/execution-record.spec.ts` 核对共同提交与守卫，`tests/history-index.spec.ts` 核对 K-5 读 `er_fact`。
19. 读口上限的覆写（R2-D81、R2-D89）。读口上限是 `sessionStorageMaterials` 的必填参数（第 8 条）。harness-server 的发行构建在 `src/rows/storage/catalog.ts` 里用具名常量 `DISTRIBUTION_SESSION_READ_OUTPUT_LIMIT_BYTES`（20971520）传入。运维者暂时不能在 `serve.distribution.json` 里覆写这个值，要改只能改源码并重新构建；覆写的配置通道归 Reduce。触发条件：运维者需要不同的上限。
    - 验证：`tests/materials-options.spec.ts` 核对缺参数、`undefined`、`null`、0、负数、小数、`NaN`、无穷、超出安全范围与数字文本都在构造时抛 `TypeError`，传入的值成为每个读 handler 的 `maxOutputBytes`，两次构建的值互不共享；`tests/read-output-limit.spec.ts` 与 `tests/work-read-limit.spec.ts` 经参数传入 20 MiB 并用真实 provider 读回。
20. 事实体（R2-D90）并入 `er_fact`。迁移 `execution-record/005-fact-body` 仍在材料里，全新库先建 `er_fact_body`，再由迁移 006 删除。事件的后果与延后控制证据在事件投影里（第 18 条）。`execution-record.events` 读出它们：`consequences` 为 null 表示后果未定，`control` 为 null 表示不是延后的控制事实。
21. 历史索引的 Session 行在 Worker 模块里增量保留（[Worker 内的两处保留](#worker-retention)）。`src/worker/history-index.ts` 的 `sessionRows` 按会话保留五种行（`intake.routed`、`run.started`、`run.attempt-started`、`run.terminal`、`control.requested`）折出的索引，下次只读游标之后的行；游标处的行指纹不符就从第一行重建，游标之后有空洞就丢掉保留的索引并让本次调用失败。修订大于日志尾部的行是未提交事务的行，只折进本次调用的副本，从不保留。修订不大于尾部就当作已提交，这只在 `session` 参加者是 `grouping: 'singleton'` 时成立：每个写事务只有一个操作，参加者在推进尾部之前读索引。组提交里后一个操作会看到同组前一个操作推进的尾部，从而保留同组仍可能回滚的行。把 `session` 改成 `groupable` 之前，必须先重新设计这份保留。验证：`tests/history-index-incremental.spec.ts`（其中「rows of an open transaction folded over a kept index are folded into a copy」覆盖副本分支：保留索引之上读到未提交的第 2、3 行，回滚后另一事务提交不同的第 2 行与相同的第 3 行，得到 `in-1`、`in-X`、`in-3`；把副本改成直接用保留的索引时这条用例变红）。
22. 具名差额「待 Reduce 重算」：迁移 `execution-record/005-fact-body`（第 20 条）与 `execution-record/006-fact-blob`（第 18 条）、写 Worker 的解析快照与历史索引的 Session 行保留（[Worker 内的两处保留](#worker-retention)）、工作缓存的折叠（[RT-04](#rt-04)）改变参加者模块或迁移的摘要，因而改变组合的 `manifestDigest`。新增的 `session.work-index`、`session.work-reads` 两个 handler 不进清单，本身不改变它。本成员不改 apps，也不改 `serve.spec`，由集成方统一重算。Reduce 批次 D 已重算一次（R2-D127），`apps/harness-server/config/serve.distribution.json` 的 `agent-journal` 行现在钉的是包含上述改动的摘要。本成员材料以后再变时，集成方要再重算。

### 两个「事务端口」

存储契约把参加者模块在 Worker 内拿到的语句端口叫 `TransactionPort`，只有一个方法 `execute(sql, params)`。Session 契约把本成员要实现的端口叫 `SessionTransactionPort<P>`，它是进程内的服务对象，有提交、读与查询操作。两者不是同一个接口。本页写「语句端口」指前者，写「事务端口」指后者。

| 事务端口的操作                                   | 本成员怎样兑现                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `commit`                                         | 翻译为存储契约的一次 `commit`。参加者模块 `session` 在 Worker 内经语句端口写事实，见 [W1](#w1)            |
| `readWork`                                       | R1                                                                                                        |
| `readInput`                                      | R3                                                                                                        |
| `queryOperation`                                 | R7                                                                                                        |
| `queryControlOperation`                          | R7，同一路径，只认控制答案                                                                                |
| `readModelSelection`                             | 读 handler `session.model-selection`                                                                      |
| `commitEntries`                                  | 翻译为存储契约的一次 `commit`，参加者事实的意图为 `entries`。不问访问检查（[已知限制](#已知限制)第 1 条） |
| `commitLog`                                      | 翻译为存储契约的一次 `commit`，参加者事实的意图为 `log`。不问访问检查（[已知限制](#已知限制)第 16 条）    |
| `history.begin`、`history.next`、`history.since` | R2                                                                                                        |
| `history.readModelView`                          | R5                                                                                                        |
| `pending`                                        | R8                                                                                                        |
| `references`                                     | R10                                                                                                       |
| `releasedScopes`                                 | R11                                                                                                       |

### 存储契约入口的采用

存储契约现在是 [sql-contract](../../storage/sql-contract/SPEC.md)，它的公开形状已经提供本成员原先期望的六项入口。本成员只经这些公开形状使用 SQL，不依赖提供者实现。表中编号保留，因为其他条款引用它们。

<a id="xp-table"></a>

| 编号 | 入口                      | 采用方式                                                                                                                                                  |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XP-1 | 参加者模块登记            | `sessionStorageMaterials({ readOutputLimitBytes })` 返回 `ParticipantDescriptor`，应用把它并入材料目录并声明组合。本成员不登记                                                    |
| XP-2 | 参加者业务响应通道        | 模块返回 `participated`、`conflict`（带依据）、`unsupported`、`failed`。响应证据与回执同事务保存，端口从证据还原结果，不在事务外重算（[W1 第 9 步](#w1)） |
| XP-3 | 事务外读入口              | `SqlStorage.read`，八个 handler，`ordering` 为 `snapshot`，每页一个有界事务。每次读带随机 `requestKey`                                                    |
| XP-4 | `SqlValue` 与 `QueryRows` | 位置列以 `bigint` 读写，其余为文本。形状见 sql-contract §10                                                                                               |
| XP-5 | 迁移挂接                  | `MigrationModule` 由提供者在原子迁移里执行。每个迁移的 `verify` 核对它建的表都在                                                                          |
| XP-6 | 事务域目录                | 应用提供 `TenantDomainAccess`。每次调用先 `resolve` 本租户的域；系统读用 `snapshot` 枚举。目录项指向别的租户或别的作用域时拒绝使用                        |

存储对 SQLite 提供者的独立读连接由 sql-contract 的 `read` 入口闭合，不再是缺项。读与提交是否在同一个 Worker 内串行是提供者的事，见 [sqlite-provider 规格](../../storage/sqlite-provider/SPEC.md)。

`sl_blob` 已落地，由 `execution-record` 写入（[已知限制](#已知限制)第 18 条）。条目一侧的 `payload_ref` 尚未实现。超过 `maxCommandBytes` 的内容的保管链路仍是 Session 契约记下的[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)。

### 参加者模块与材料

本成员向存储契约登记两个参加者。两个参加者属于同一个组合，在同一个租户事务域（契约 P-1，R1-D2）。只含 `session` 的组合不成立：`session` 的 `readTables` 引用 `execution-record` 的表，存储契约对它答 `combination_invalid`（sql-contract §4.3）。

`session` 在三种提交里出现：

- Session 为提交方的命令（JC-01 至 JC-05、JC-07、JC-08、JC-10、JC-13 至 JC-24、JC-28，以及 JC-11 的「Agent 记录已删除」分支）：本成员的 `commit` 把 `SessionCommand` 与全部 `GuardCommand` 放进同一条 `FactCommand`，`participant` 为 `session`，`facts` 为 `{ intent: 'command', command, guards }`。桥交来的材料由 `session` 模块在事务里核对，不翻译成各自独立的存储参加者。
- 执行记录提供者为提交方的四种交接（JC-06、JC-09、JC-11、JC-12）：执行记录提供者的提交里有一条 `participant` 为 `session` 的命令，`facts` 与上一项相同，用 `./participants` 的 `sessionCommandFacts` 构造。
- 执行记录提供者为提交方的两个只读参加（JC-26、JC-27）：`facts` 为 `{ intent: 'check', check }`，用 `sessionCheckFacts` 构造。行为见[只读核对](#只读核对)。

`combinationVersion` 与 `manifestDigest` 由应用在装配时声明，经 `SessionStorageOptions.combination` 交入，本成员原样放进每次提交请求。执行记录提供者用同一个声明组合的这两项（装配给，Q5-2）。值不一致时存储答 `manifest_mismatch`，提交方失败关闭。本成员不计算清单摘要。桥的材料不是存储参加者。

#### `execution-record` 参加者

`execution-record` 只保存提供者事先准备好的事实，不导入 agent-contract，不解释 Agent 的业务。判定次序、认回与修订规则留在提供者（session-adapters 的 Journal 提供者）。每张 `er_` 表与 `sl_blob` 带 `tenant` 列，模块与读 handler 的每条语句都带租户条件。

一次发布的 `facts` 为 `{ intent: 'publish', write }`，用 `executionRecordFacts` 构造。模块在事务里做六件事：

1. 按 `(tenant, operation)` 点查 `er_operation`。这一行已经存在时，响应「冲突」，依据带原摘要与原批的 `published`。提供者按摘要认回，并由原批推导答复，或答 `conflict`。
2. 读该会话的发布计数 `er_root.published`，按 `(tenant, execution)` 读执行行的 head 修订号。
3. 计数不等于 `write.published`、修订号不等于 `write.expected`，或执行行属于另一个会话时，响应「冲突」，依据带当前修订号与当前计数。模块不写任何行。这是第一道闸。
4. 在发布序号 `published + 1` 追加这一批事实（`er_fact`），第一条在位置 0，是批信封。主键是第二道闸。再按 `(tenant, digest)` 写这一批需要的块（`sl_blob`），已有的块不再写。
5. 写操作键 `er_operation`（摘要与发布序号，不存答复），再写提供者准备的同根索引行：执行边界（`er_execution`）与原受理目录（`er_admission_idx`）。
6. 把 `er_root.published` 加 1，响应「参加」。回复带新计数与本次写入的摘要。

记录模型分三类列。通用索引列是 `tenant`、`session`、`execution`、发布序号、批内位置、事件序号、操作键与摘要，模块只做相等比较与排序。不透明载荷（事实的 `body`、事件投影里的 `consequences`、`control` 与 `batch`）是提供者编码的 JSON，模块不解码。同根索引用 Session 的词：执行边界、事实边界、批次与原受理。写入不带自身执行的边界行时，只受发布计数守卫。索引内容是否正确由提供者负责。

执行边界行的回执列（`er_execution.receipt`）：提供者在写入的答案带有该执行的 `CommandReceipt` 时，把它的证据写进这一列。答案不带回执、或回执属于另一个执行时，提供者写一个占位证据：`owner` 为 `session-log-journal`，`record` 为 `<execution>/head`，`revision` 为该执行本次的修订，`digest` 为 `unknown`。占位不是回执证据，`digest` 为 `unknown` 的行不能当作 Agent 回执核验或引用。当前会产生占位的写入，是核心 Journal 套件和 AG-23 回放里观察到的 `detach` 与 `recordControl`：它们的答案不是 `CommandReceipt`（`tests/agent-journal-provider.spec.ts` 观察，没有穷举其余写入）。读执行边界的一方（K-5）把占位行按「没有回执」处理：该执行不进入历史索引，依赖它的判定答 `unavailable`（[已知限制](#已知限制)第 12 条）。

#### 操作记录的访问证据

<a id="操作记录的访问证据"></a>

session-contract 的访问契约要求：一次提交带着的访问裁定证据，与该操作的记录放在一起（[当前操作的访问裁定](../session-contract/SPEC.md#当前操作的访问裁定)）。委派视图提交时，证据是视图绑定的证据；公开端口提交时，证据是该次调用裁定得到的证据。

- 写入：`commit` 把本次得到的证据放进命令事实的 `evidence` 成员。`session` 参加者在写 `sl_operation` 行的同一事务里写一行 `sl_operation_evidence`：`(tenant, session, operation)` 对应证据的 JSON。批次、控制与答案三种行都这样写；`completeInitialization` 认回时新写的操作行也带证据。证据不是 `owner`、`record`、`revision`、`digest` 四个文本成员时，参加者答「不支持」，事务回滚，不写任何行。外部提交方不带 `evidence` 时，操作行照写，不写证据行。`commitEntries` 不取访问裁定，其操作行没有证据行。
- 认回：同一操作的再次提交认回原记录，不写第二行，原证据不变。
- 读回：意图为 `query` 的提交，命中操作记录时在响应里带 `evidence`，没有证据行为 `null`。会话属于另一租户或不存在时答 `no-session`，不带任何记录。
- 迁移：`session/003-operation-evidence` 建表，依赖 `session/002-execution-index`。证据另存一张表，不加 `sl_operation` 的列：sqlite-provider 的迁移授权对 `ALTER TABLE` 的放行不足以加列（SQLite 对 STRICT 表加列后做的校验用到 `pragma_quick_check`，迁移端口禁止），`tests/real-provider.spec.ts` 在真实提供者上经过这个迁移。已发布迁移的文件与摘要不变。
- 不提供回填：0.0.x 没有在本迁移之前写入、需要证据的操作记录（[当前演进政策](../../../docs/engineering/publication.md#当前演进与消费者)）。
- 验证：`tests/delegated.spec.ts` 对 SQL 提供者运行契约套件用例「a view commit stores the bound evidence with the operation record」，夹具的 `decisionOf` 读这张表；`tests/operation-evidence.spec.ts` 核对公开端口也存证据、认回不改原证据、提交在操作行之后失败时没有证据行、无证据的提交方没有证据行、畸形证据被拒、另一租户读不到；`tests/real-provider.spec.ts` 在真实提供者上读回。

#### 执行索引

<a id="执行索引"></a>

`AgentJournal` 的调用只带租户与 execution，不带会话。Session 在 `startRun` 时分配 execution，写进 SE13（session-contract JC-05）。执行索引把 execution 对应到会话，供 Journal 提供者路由一次调用（[决策记录 w1-c19-q1](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6563847140)）。它是 session-adapters「同根读取与原记录索引」表第一行中 execution 到会话与 Run 的部分。同一行的 attempt 与原 grant（SE15）不在本索引里，归 K-5。

- 写入：`session` 参加者写入一条 `run.started`（SE13）条目时，在同一事务里写一行 `sl_execution_idx`：`(tenant, execution)` 对应会话、Run 与该 SE13 的位置。`startRun` 被拒绝、失败或回滚时，这一行也不存在。
- 唯一：execution 在租户内唯一。该 execution 已有一行时，不论指向哪个会话，参加者答「失败」，诊断说明已有索引。存储回滚整个批次，原行不变，不覆盖。Session 的 `commit` 对外答 `unavailable`。
- 读取：读 handler `session.execution` 的输入是 `tenant` 与 `execution`。有这一行时输出会话、Run 与位置；没有时输出 `null`。另一租户的 execution 与没有 Run 的 execution 都得到 `null`。输入缺 `tenant` 或 `execution` 时 handler 失败，不输出 `null`。
- 迁移：`session/002-execution-index` 建这张表，依赖 `session/001-session-log`。读 handler 只依赖这个迁移。
- 解释提交（`commitEntries`）的批次不带 SE13：session-contract 里产生 `run.started` 的只有 `startRun` 的决定，解释提交的后果行都不是它。`publishEntries` 仍经同一个写入步骤建索引，所以万一批次带了 SE13，同样不覆盖已有的行、整批失败；这条防御路径没有 SQL 层用例，因为经公开入口构造不出这样的批次。触发条件：解释能产生 SE13 时，先补用例。
- 不提供重建：本成员不回填已有 SE13 的索引行。0.0.x 没有在本迁移之前写入的 SE13 需要保留（[当前演进政策](../../../docs/engineering/publication.md#当前演进与消费者)）。
- 验证：`tests/execution-index.spec.ts` 在 `node:sqlite` 夹具上核对：写入的行与 SE13 位置一致；两个会话各有自己的行；在索引行写入时与操作记录写入时各注入一次失败，没有行也没有 SE13，同一命令随后只提交一次；Session 拒绝的 `startRun` 不写行；预置一行指向另一会话时 `startRun` 失败，原行不变；迁移 002 的 `requires` 恰是 001，001 没有依赖；另一租户在自己的域与本租户的域里都读到 `null`。真实 sqlite-provider 上的迁移与写入由 session-adapters 的 `tests/agent-journal-provider.spec.ts` 慢层用例经过，本成员没有对它单独的用例。

#### 共同日志根

<a id="共同日志根"></a>

每个 `(tenant, session)` 有一个逻辑根。它在物理上是两个归属不同的行：`sl_entry` 的最大位置与 `er_root.published`。

- `position` 是 `MAX(sl_entry.position)` 与 `er_root.published` 之和。Session 发布使前一项增加，Agent 发布使后一项加 1。SQLite 每个事务域只有一个写事务，所以发布是一条线性序列，和数严格递增，FR-01 成立。`root.source` 的摘要覆盖两项与 Session 修订。
- 提交里：`session` 模块在同一事务里组出根，交给 `decide`（`src/worker/log-root.ts`，经 `history-index.ts`）。
- 提交外：读 handler `session.history-root` 在一个快照里组出同一个根（FR-03 第 2 步）。调用方不从两个读口分别取值再拼。
- 执行顺序：两条命令之间没有事实格依赖，存储按名字升序执行，`execution-record` 先、`session` 后（sql-contract §7.4）。所以共同提交里 `session` 读到本批刚写的 `er_` 行与新计数。事实格表达不了这个顺序：Session 单独提交时没有 `execution-record` 命令，事实没有提供者。
- 失效：用旧根准备的 Session 提交，在事务里按新根重判，答纯层对应的非成功答复（P5 决策第 6 条）。

#### 只读核对

<a id="只读核对"></a>

`session` 的只读意图读同一事务的权威行，不写任何行。核对成立时响应「参加」，结果是 `{ kind: 'checked', attempt, advance }`，回复带核对摘要。核对不成立时响应「冲突」，依据是下表的 Session 失败。提供者按 session-adapters 的 AD-01 对应表翻译。

| 核对                      | 规则                                                                                                                                                                | 不成立时的依据                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `open`（PA-01 第 1 条）   | 来源依据是本会话已提交 SE13 的回执（批次回执的来源，或 SE13 条目的证据）。该 SE13 记的执行是本执行，首条输入是 `initial` 的输入。消息与 Session 受理时相同。`grant` 指向本执行的 SE15（批次回执的来源，或 SE15 条目的证据）。该执行是当前 Run 的执行，attempt 是当前 `advance` | 来源依据或输入不符，或 `grant` 不指向本执行的 SE15：`denied`。Run 已终态：`terminal`。attempt 已被取代：`stale-advance` |
| `submit`（PA-01 第 2 条） | 来源依据是该输入已提交 SE11 的回执（批次回执的来源，或 SE11 条目的证据）。消息与 Session 受理时相同。当前 Run 是该执行的 Run | 来源依据或输入不符：`denied`。Run 已终态：`terminal`。其他情形：`stale-advance` |
| `attach`（PA-01 第 3 条） | 普通推进同 `open` 的后两项。取消收束：该执行所属的 Run 是 cancelled 终态，`grant` 指向该 Run 在取消批次之前最后授予的 attempt                                       | 同 `open`                                                                                                   |
| `finish`（PA-02）         | `judgeCompletion` 为 `allowed`。为 `cancelled` 时，结论是 cancelled，且取消控制等于 SE26 引用的控制                                                                 | 待交输入或控制不符：`changed`。其他终态：`terminal`                                                         |

来源依据只与本会话已提交条目的回执比较，不与输入的 `origin` 比较。`initial.origin` 与 `value.origin` 带 Agent `AcceptedInput` 的 `source`，即来源依据。另一会话、另一租户、另一输入或未提交批次的回执都不成立。

取消收束只核对 SE26 所在批次之前的最后一个 attempt，不另核对 SE16 行。读到的历史行超过界限（10 000 行）时，模块答「失败」。

#### 对外部提交方的词汇

<a id="对外部提交方的词汇"></a>

子路径 `@omne-harness/session-storage-sql/participants` 导出两个参加者的数据格式词汇（P5 决策第 5 条）。它只导入编码函数与类型，不引入 `createSessionStorage` 等提供者实现（IC-5）。本成员的 `commit.ts` 与 `entries.ts` 也用它，成员内只有一份编解码。

- 名字与版本：`SESSION_PARTICIPANT`、`EXECUTION_RECORD_PARTICIPANT`、`SESSION_LOG_PARTICIPANTS`（按执行顺序）、两个协议版本，以及读 handler 名 `SESSION_HISTORY_ROOT_HANDLER`、`SESSION_WORK_HANDLER`、`SESSION_INPUT_HANDLER`、`SESSION_EXECUTION_HANDLER`、`EXECUTION_RECORD_HANDLERS`。
- 构造：`sessionCommandFacts`、`sessionCheckFacts`、`sessionCheckDigest`、`executionRecordFacts`、`executionRecordBlobFacts`、`preadmissionFacts`，以及块摘要 `blobDigest` 与两个上界 `EXECUTION_BATCH_MAX_FACTS`、`EXECUTION_FACT_MAX_BYTES`。`executionRecordFacts` 只编码标识与索引成员，事实的 `body` 与事件投影里的 `consequences`、`control`、`batch` 原样传递。`preadmissionFacts` 只编码租户，意图与结果原样传递。
- 解码：`decodeSessionReply` 给出参加（结果、是否认回、摘要）、停止（Session 失败）、失败或不支持。调用方用 session-contract 的 `commandDigest` 比较摘要：相等是同一命令的认回，不等是同身份的另一命令。`decodeExecutionRecordReply`、`decodeExecutionBlobsReply`、`decodeExecutionRecordFacts`、`decodeExecutionRecordOpen`、`decodeExecutionRecordEvents`、`decodeExecutionRecordBlob`、`decodeExecutionRecordOperation`、`decodeSessionHistoryRoot`、`decodeSessionWork`、`decodeSessionInput`、`decodeSessionExecution`、`decodePreadmissionReply`、`decodePreadmissionRecord` 解码对应的回复与读输出。`decodeSessionExecution` 区分没有这一行（`null`）与输出损坏（`malformed`）。

0.0.x 阶段这组导出按[当前演进政策](../../../docs/engineering/publication.md#当前演进与消费者)演进：被取代的导出随真实消费者一起删除。R2-D292 删除了 `decodeExecutionRecordParts` 与 handler 名 `parts`、`executionFacts`，由事实族的读口取代。

## 结果与不变量

### 记号

N 为该会话条目总数。K 为本页实际扫描条目数。B 为本页读出字节。k 为过滤的 `kind` 数。p 为本页返回行数。D 为检查点之后的条目数。M 为所查索引的规模。T 为本部署的事务域数。全部复杂度按有序索引（B 树）估，SQLite 与 PostgreSQL 相同。

### 表、索引与位置

本节与下文 W3、R9 写的是设计目标表集。head 已实现的表集是[实现现状](#实现现状)的「当前表」，缺少 `sl_batch`、`sl_blob`、`sl_ref_idx` 与 `sl_rebuild`，并多出 `sl_input`；`sl_operation` 多 `form` 与 `result` 两列。以实现现状为准，直到差异被实现或被拥有者改写。`sl_operation` 的访问证据不在该表的列里，另存 `sl_operation_evidence`（一个操作一行，键相同，同一事务写入），原因见[操作记录的访问证据](#操作记录的访问证据)。

<a id="tb-01"></a>

**TB-01 权威五表与 blob。**下列表在共同提交内写入，是会话日志的权威形状。列、键与约束见[对象模型](docs/object-model.md#当前实现的表)。

| 表             | 每行                                                                       | 键                              |
| -------------- | -------------------------------------------------------------------------- | ------------------------------- |
| `sl_journal`   | 一个会话：租户、来源身份、`tail`、提交序号、当前 epoch 与它的基位置        | `(tenant, session)`             |
| `sl_batch`     | 一次提交：操作身份、首末位置、条目数、字节数、提交时间、解释版本、回执证据 | `(tenant, session, commit_seq)` |
| `sl_entry`     | 一个条目：封套各字段、载荷或载荷引用、字节数、内容摘要                     | `(tenant, session, position)`   |
| `sl_operation` | 一个 Session 操作：规范化参数摘要、提交序号、原回执；该操作的访问证据在同键的 `sl_operation_evidence` | `(tenant, session, operation)`  |
| `sl_state`     | 一个会话的 `WorkSnapshot` 物化的头：集合与大对象成员之外的部分、`covered` | `(tenant, session)`             |
| `sl_state_item` | 同一快照的一个集合分块或一个大对象成员（[快照的存储形态](#快照的存储形态)） | `(tenant, session, path, seq)` |
| `sl_blob`      | 一个内容块：载荷文本、UTF-8 字节数、媒体类型。由 `execution-record` 拥有并写入 | `(tenant, digest)`              |

设计目标：快照只物化未结状态：`pending`、`handed`、`waiting`、未释放的 `consumptions`、停在 propagating 的 `controls`、`tasks`、`unresolved`、`idle`、`run`、`frozen`、`residents` 与声明修订。已释放的消费与已对账的控制只留在日志里。

实现现状：快照随 Run 增长。session-contract 的 `reduce` 不从快照移出下列各项，它们在 Run 结束后仍留在快照里：

- `consumptions`：Model 结果的交付责任解除停在 MODEL-ACK-ARRIVAL，Tool 结果停在 JC-RELEASE-TOOL-PATH，所以 `release` 一直是 pending（[JC-Release](../session-contract/SPEC.md#jc-release)）。按现行条款它们是未结责任，不能移出。`release` 为 confirmed 的结果版本也不移出，这与上一段的设计目标不符。
- `callRegistrations`：已关联的记录与 `consumptions` 重复一份绑定。
- `executions`、`entriesProgress`：每个 Run 一项或几项。
- `workEntryIndex.calls`：每个调用一项。

测量（agent-host-local 的 W2 世界，带一次工具调用的轮，R2-D292）：快照每轮增长约 14 KB，第 200 轮约 2.8 MB；每轮有 22 次 Session 参加的提交。整行重写时，200 轮的快照写入累计约 6 GB。移出这些项要改 session-contract 的归约与上述具名偏离，不归本成员。本成员保证的是写入量：见下一节。

<a id="快照的存储形态"></a>

**快照的存储形态（R2-D292）。**快照分成一个头行与若干行，一次提交只写变了的行。

- 集合：快照的数组成员，以及对象成员里的数组成员（例如 `workEntryIndex.calls`）。头里该位置写空数组，所以读者仍能分清空集合与缺省。
- 分块：一个集合的一段相邻项是 `sl_state_item` 的一行，路径为集合名，值为 JSON 数组，文本不超过 16 KiB（`CHUNK_BYTES`），单项超过时独占一行。按 `seq` 升序拼接得到原数组。
- 大对象成员：去掉集合后文本超过 1 KiB（`MEMBER_BYTES`）的对象成员单独一行，路径为 `=成员名`。头里该位置写 `{"$row":true}`。文本不变时不重写。
- 令牌：头的 `$items` 成员是令牌，等于前一令牌、头与本次分块变化的摘要。头文本相等，则整个快照相等。本成员只在写头的同一次写入里写分块。本成员之外的写入方写分块时，必须同时写新头。
- 写入：分块里的项全部保留、次序不变且彼此相邻时，该行不重写。项按对象同一性比较；对象不同时，与上一项的文本相等也算保留（`reduce` 复制了未变的项）。新项写入新行，序号落在保留的邻居之间；没有空位，或小分块过多时，整个集合重写一次。追加按二进制计数器的进位合并尾部小分块：小分块不超过新段两倍且合计不超过上限时并入。所以追加只写新项，偶尔加几个小分块，不重写满的分块。
- 界：一次提交写入的快照字节是头、变了的大对象成员、含变动项的分块与追加时合并的尾部小分块之和，与会话已有的项数无关。例外：序号没有空位或小分块过多时，该集合整段重写一次，这一次与该集合的长度成正比。
- 读：整读按 `(path, seq)` 顺序读出全部分块，最多 100000 行（`MAX_STATE_CHUNKS`），超过时读失败，不交出部分快照。
- 旧行：头里仍内联的集合（迁移前写的行）照常读出。下一次提交把它整段写成分块。
- 验证：`tests/state-rows.spec.ts`。模块层用固定种子的随机序列核对写入后读回相等，并核对追加、大对象成员与无布局时整写。会话层用真实参加者跑 200 步，每步受理一条输入并登记一次 Model 调用；断言快照总文本增长到第 20 步的 5 倍以上，而第 181～200 步每次提交写入的快照文本，均值不超过第 11～30 步均值加 2 KiB，最大值不超过前者最大值加一个分块。负控：去掉按布局比较（每次整写）时第 200 步写入约 250 KB，用例变红；去掉文本相等的保留时均值超出，用例变红；去掉大对象成员行时对应用例变红。

<a id="tb-02"></a>

**TB-02 派生七索引。**下列索引在同一提交内维护，可以从 `sl_entry` 重建。它们不是第二份权威。

| 索引                    | 键                                                                      | 为谁服务                       |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| `sl_kind_idx`           | `(tenant, session, kind, position)`                                     | R2 的 `kinds` 过滤             |
| `sl_ref_idx`            | `(tenant, session, ref_kind, ref_id, position)`                         | R3、R4、R10 的 shape 定位      |
| `sl_model_view`         | `(tenant, session, epoch, seq)` 加 `position`、`bytes`、`prefix_digest` | R5                             |
| `sl_annotation_idx`     | `(tenant, session, target_from, target_to, position)`                   | R6，即 R2 每页的 `annotations` |
| `sl_pending_idx`        | `(tenant, reason, session)`                                             | R8                             |
| `sl_resident_idx`       | `(resident_key, tenant, session)` 加 `capability`、`admitted_position`  | R10                            |
| `sl_released_scope_idx` | `(tenant, session, scope)` 加 `task`、`position`                        | R11                            |

本成员不为推理续接状态部件建任何索引，也不建推理回放索引。部件随 SE10 的内容块留在 `sl_entry.payload` 里。

<a id="tb-03"></a>

**TB-03 位置是 64 位整数。**`position` 在一个会话内严格递增，相邻提交的位置连续，批内按条目顺序递增。`commit_seq` 从 1 起每次提交加一。SQLite 用 `INTEGER` 并以 BigInt 读写，PostgreSQL 用 `bigint`。契约层的 `EntryId` 与 `SessionRevision` 仍是品牌字符串：`EntryId` 是该条目 `position` 的十进制文本，`SessionRevision` 是会话 `tail` 的十进制文本。编解码只发生在本成员的边界，`session` 与 `session-adapters` 不解析它们。`seq` 与 `epoch` 同样是 64 位整数，在 `ModelViewBasis` 与 `ModelViewRow` 里是十进制文本。

<a id="tb-04"></a>

**TB-04 载荷的内联与外置。**载荷的 UTF-8 字节数不超过内联阈值时写在 `sl_entry.payload`，超过时写入 `sl_blob`，条目只存 `payload_ref`（摘要）与 `payload_bytes`。阈值是策略配置，初值 16 KiB，由装配给出。blob 与条目在同一事务里写入，先写 blob 再写条目。对象存储作为去向待[对象或文件存储契约](https://github.com/nemori-ai/omne-harness-lite/issues/541)，闭合前只有同库 blob 表。实现现状：`sl_blob` 由迁移 `execution-record/006-fact-blob` 建表，列为 `tenant`、`digest`、`media`、`size` 与 `payload`。`execution-record` 写入它，Agent 的保管块与进入历史的消息共用同一行。条目一侧的内联阈值与 `payload_ref` 尚未实现。一次提交里 `facts` 的总字节受存储契约的 `maxCommandBytes` 限制。超过它的内容不能走本成员的内联或 blob，必须先由内容拥有者可靠保管，再以耐久引用进入条目（[SL08](../session-contract/SPEC.md#日志提交与查询结果)）。

### 写路径

<a id="w1"></a>

**W1 Session 为提交方的提交。**`SessionTransactionPort.commit` 按下列步骤执行。`session` 的流水线（[CP-01](../session/SPEC.md#cp-01)）在事务外完成它的第 1 至第 4 步，本成员从 CP-01 的第 5 步接手。时序见[写路径](docs/flows.md#写路径session-为提交方)。

1. 选尝试代次并构造存储操作身份。代次的规则见下文的[尝试代次](#w1-attempts)。身份的 `scope` 与 `transactionDomain` 取自应用目录里该租户的事务域，`operation` 为 `SessionOperationId`，`operationKey` 为 `<SessionOperationId>#<代次>`，`protocolVersion` 为 `2`。规范化 `{ command, guards }` 为 JSON 值：位置、序号与 epoch 都是十进制文本，租户与工作区经 legal-identity 的编码写成带标记的文本，没有 BigInt、`undefined`、`Date` 或函数。Session 操作的输入摘要由 `commandDigest` 给出，写进 `sl_operation.input_digest`。调用前先向访问裁定取一次当前决定，访问不指名该命令的租户与会话时直接 `denied`。经委派视图提交时不取决定，改为核对视图绑定的请求与本次命令（租户、Session、命令摘要），不一致答 `denied`，证据取自绑定。两条路径取得的证据（公开端口的当次裁定，或视图的绑定证据）都随命令事实交给参加者，参加者在同一事务里写入 `sl_operation_evidence`，见[操作记录的访问证据](#操作记录的访问证据)。
2. 调用存储契约的 `commit`，命令数组只有一条 `participant` 为 `session` 的命令。`rejected_before_accept` 映射为 `unavailable`，不改写为业务拒绝；其中 `writer_not_current` 映射为 `commit-unknown`。`unknown` 映射为 `commit-unknown`。`identity_conflict` 说明同一 Session 操作的另一次尝试已经用了这个代次：已有回执为 `committed` 时，端口从该回执的响应证据取出原结果，摘要相同则返回，`recovered` 为真，摘要不同则返回 `conflict`；已有回执为 `rolled_back` 时，回到第 1 步选下一个代次。
3. Worker 内，`session` 模块收到 `facts` 与语句端口。先核对材料：每个 `GuardCommand` 的 `owner`、`participant`、`protocol` 与该命令种类要求的材料集合一致。集合按[共同提交表](../session-contract/SPEC.md#共同提交与共享事务域)的「参加者」列固定在本成员的材料表里。缺一项或多一项，响应「不支持」，不写任何行。
4. 点查 `sl_operation`，得到该操作的 `OperationRecord`，没有时为 null。认回由第 6 步的 `decide` 判定，本步只读行。
5. 锁住并读 `sl_journal`，再读 `sl_state` 的头行。头文本与写 Worker 保留的快照相同时复用它，否则读出全部分块拼成快照（[Worker 内的两处保留](#worker-retention)）。PostgreSQL 下用 `SELECT ... FOR UPDATE` 锁住该会话的 `sl_journal` 行，同一会话后到的事务在这里等待，前一个事务提交后才读到新尾部。SQLite 只有一个写者，事务本来就串行，不另加锁。`sl_state.covered` 不等于 `sl_journal.tail`，或归约版本不是当前版本：响应「失败」，原因为 `unavailable`，`owner` 为本成员，由 R9 追赶后重试。核对通过时，交给 `decide` 的快照的 `revision` 等于 `tail`。
6. 调用 `session-contract` 的 `decide(快照, command, guards, 操作记录)`（[领域服务与归约](../session-contract/SPEC.md#领域服务与归约)）。`decide` 认回原操作，按命令调用领域服务与守卫。命令带 `expected` 时，`decide` 还比较 `expected` 与快照的 `revision`。带 `expected` 的命令只有七种：`reload`、`release`、`finishRun`、`recordIdle`、`bindExternalCall`、`completeExternalConsumption` 与 `commitDerived(context-reminder)`。其余命令不带 `expected`，`decide` 按 `sl_state` 的当前状态重新裁定，不产生 `changed`。本成员不另调用领域服务，也不另写允许或拒绝的规则。按 `Decision` 的三种结果处理：
   - `recovered`：响应「参加」，不写行。提交方的提交照常成立，`commit` 之后读回原回执，`recovered` 为真。
   - `rejected`：响应「冲突」，依据为其中的 `SessionFailure`。带 `expected` 的命令在 `expected` 不等于 `tail` 时得到 `changed`，并带当前 `revision`。同操作不同输入摘要时得到 `conflict`。
   - `entries`：继续第 7 步。
7. 为 `decide` 产出的 `EncodedEntry` 逐条分配 `position`，补上 `id` 与 `revision`（[TB-03](#tb-03)）。先写 blob，再写 `sl_entry`，再写 [TB-02](#tb-02) 的派生行，见 [W3](#w3)。调用 `reduce(前状态, 本批次)`，得到新快照。`decide` 与 `reduce` 共用同一解释版本，`reduce` 解释 `decide` 的批次必须得到命令要求的后态。`reduce` 返回 `quarantined` 说明两者不互逆，这是契约实现的缺陷：响应「失败」，不写任何行。按[快照的存储形态](#快照的存储形态)写头行与变了的分块，比较新旧快照维护 `sl_pending_idx`。写 `sl_batch`、`sl_operation`，最后以 `UPDATE sl_journal ... WHERE tail = 第 5 步读到的 tail` 更新 `tail` 与 `commit_seq`。这条更新影响 0 行时响应「失败」，结果映射为 `unavailable`，并记诊断。第 5 步的锁在位时这不应发生，发生即说明违反了不变量。
8. 提供者 `COMMIT`。本成员在事务外读回 `sl_operation` 得到 `CommitReceipt`，返回给 `session`。
9. 存储契约返回 `rolled_back` 时，端口读取回执里停止该操作的那条响应，不在事务外重算（SQL r2 第 11 节）：
   - `conflict`：依据里保存了原 `SessionFailure`，原样返回。带 `expected` 的命令在尾部已变时，这就是 `changed`。
   - `unsupported`：映射为 `invalid`，字段为 `command`。
   - `failed`：映射为 `unavailable`，诊断带失败类别。
   - 回执没有停止响应：`unavailable`，说明回执缺少依据。

   `unknown` 原样映射为 `commit-unknown`，不改写，不换身份。事务外重算拒绝原因的退路已经删除。

`attempt-rejected`：存储契约的 `writer_not_current` 与锁等待超时属于本次尝试未生效，但在五项证明齐全之前，存储对该身份的查询返回未知。本成员把它们映射为 `commit-unknown`，不映射为 `not-committed`。R7 怎样区分「本次尝试未生效」与「原操作明确未提交」，见 [R7](#r7)。

<a id="w1-attempts"></a>

**尝试代次。**一个 Session 操作可以有多次存储提交尝试，每次尝试用一个新的存储操作身份 `<SessionOperationId>#<代次>`，代次是从 1 起的十进制文本。存储契约规定同身份同摘要返回已保存的回执，`rolled_back` 回执也持久保存，所以一个存储身份只能承载一次尝试。本成员不为代次另存状态，代次由存储回执推出。第 1 步之前按下列顺序选代次：

1. 点查 `sl_operation`。命中时返回原回执，`recovered` 为真，不提交。
2. 未命中时，按代次 1、2、… 逐个调用存储契约的 `query`，读法与 [R7](#r7) 相同：
   - 该代次为 `not_committed`，即五项证明齐全且没有回执：本次尝试用这个代次。
   - 该代次为 `rolled_back`：存储契约规定这是持久的终态，该代次不会再生效。继续查下一个代次。
   - 该代次为 `committed`：重读 `sl_operation`，返回原回执，`recovered` 为真，不开新代次。仍没有行时，这是存储缺陷（[C-01](#c-01)），返回 `unavailable`。
   - 该代次为 `unknown`，包括仍在受理队列或仍在执行的尝试：不开新代次，返回 `commit-unknown`。原操作按 [SL09](../session-contract/SPEC.md#日志提交与查询结果) 由 `session` 的 S4 经 R7 认回。
3. 前面的代次全部为 `rolled_back`，且代次数已达到配置的「尝试代次上限」：返回 `unavailable`，`owner` 为本成员，不提交。上限是策略字段，初值只是配置初值（[配置](docs/public-api.md#配置)）。

这就是围栏：新代次只在前面每个代次都有 `rolled_back` 回执时才开，所以旧代次不会与新代次同时生效，也不会晚到生效。两次并发尝试选中同一个代次时，存储的身份唯一性只让其中一个成立。另一个得到该代次已保存的回执，或在存储输入摘要不同时得到 `identity_conflict`，按第 2 步处理。

正常路径下，一次提交在 `commit` 之前多一次 `sl_operation` 点查与一次存储 `query`。每多一次被回滚的尝试，后续提交就多一次 `query`，次数不超过代次上限。

Session 操作的输入摘要写在 `sl_operation.input_digest`，`decide` 用它区分认回与 `conflict`。摘要只覆盖命令的语义参数：

- 去掉调用身份 `principal` 的认证封套。
- 去掉 `expected`。
- `guards` 的每项材料只取材料拥有者 `participant` 与材料身份 `owner`，也就是第 3 步核对材料集合所用的取值。`protocol` 与 `facts` 不进摘要。

所以同一意图的重试摘要相同：`changed` 之后带新 `expected` 的重做、`startRun` 换了候选材料的重试、两个消费者对同一事件的 `receive`，都由 `decide` 认回原回执或继续提交，不得到 `conflict`。存储契约按整条命令计算的输入摘要只在同一代次内起作用，本成员不用它比较意图。

<a id="w1-cost"></a>

**W1 的代价与退化。**每次提交读 `sl_state` 的头行。写 Worker 保留着该快照时不读分块，否则读出全部分块。`reduce` 之后编码头，只写变了的分块与大对象成员，再比较新旧快照维护 `sl_pending_idx`。写入量与快照里已有的项数无关。比较的代价是 O(快照的项数) 次对象比较，加上变了的项的编码。快照本身随待处理输入、未结工作、常驻集合（`residents` 只追加）与上文列出的 Run 历史项增大而线性增长，这影响整读与内存，不影响每次提交的写入量。退化条件：一个会话积累 P 条待处理输入而没有 Run 消费它们时，每次 `accept` 的代价是 O(P)，累计 O(P²)。约束它要靠 `accept` 的上限或背压策略，策略字段的初值只是配置初值。现有配置与契约都没有这一项，见[明确缺项](#明确缺项)。

<a id="w2"></a>

**W2 Session 为参加者的提交。**执行记录提供者发起的提交里，`session` 模块按 [W1](#w1) 第 3 至第 7 步执行，差别如下。同一次提交里还有一条 `execution-record` 命令，它先执行（[共同日志根](#共同日志根)）。时序见[参加者路径](docs/flows.md#写路径session-为参加者)。

- 第 3 步的材料是带 `Participation` 的 Session 命令与版本化载荷。`joint` 不是四种之一，或缺项：响应「不支持」。
- 第 4 步的操作身份按 OP-00 从 execution、提交方操作身份与 `joint` 派生。
- 参加的命令没有 `expected`。事务本身保证提交方读到的状态与写入的状态一致。
- 第 6 步的 `decide` 走参加分支，在其中调用 `judgeAdvance`。压缩分支的判定也在 `decide` 里，本成员只备齐它需要的历史输入（[W4](#w4)）。
- 第 7 步的批次与新快照同时更新 `ExecutionRef.revision` 与 `evidence`。
- 只读参加（JC-26、JC-27）只读权威行，不写行，不更新快照。规则见[只读核对](#只读核对)。
- 本成员不调用 `COMMIT`，也不能结束提供者的事务。提交方失败时两侧都不保存。

<a id="w3"></a>

**W3 派生行与条目同事务。**下表是每类条目必须同批写入的派生行。没有「条目有、索引无」的可见状态。

| 条目                                                                           | 派生行                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 任何条目                                                                       | `sl_kind_idx` 一行                                                                                                                                                  |
| `refs` 里有 `input`、`consumption`、`run`、`attempt`、`card`、`control` 的条目 | `sl_ref_idx` 每个引用一行                                                                                                                                           |
| SE10 且内容块有 `toModel` 为真的部分，且不是压缩记录                           | `sl_model_view` 当前 epoch 追加一行，`seq` 加一，`prefix_digest = H(上一行 prefix_digest ‖ 本条目 digest)`                                                          |
| SE10 压缩记录                                                                  | `sl_model_view` 新 epoch，见 [W4](#w4)                                                                                                                              |
| `refs.target` 非空的条目（SE33，以及其他指向旧条目的标注）                     | `sl_annotation_idx` 一行，`target_from` 与 `target_to` 为引用范围的首末位置，单条目时两者相等                                                                       |
| SE08                                                                           | `sl_resident_idx`：把该会话的行集合替换为本次记下的登记键集合，每个键一行，`capability` 取自登记键所属的能力身份，`admitted_position` 为该能力 SE36 的位置          |
| SE26                                                                           | 会话已归档时，删除该会话在 `sl_resident_idx` 的全部行                                                                                                               |
| SE27                                                                           | 删除该会话在 `sl_resident_idx` 的全部行。归档同批以 SE26 取消未终结 Run，所以已归档的会话没有未终结 Run                                                             |
| SE28                                                                           | 按最近一条 SE08 的登记键集合重建该会话在 `sl_resident_idx` 的行。删除该会话在 `sl_released_scope_idx` 的全部行，因为这个索引只收已归档会话的释放读回                |
| SE25 且载荷是作用域释放的读回，处置含 `released`，会话已归档                   | `sl_released_scope_idx` 每个已释放作用域一行，`task` 为原任务操作身份。同一 `(tenant, session, scope)` 重复读回只保留首次位置                                       |
| 快照里进入或离开某个待办原因                                                   | `sl_pending_idx` 增删，原因按 `PendingReason` 的八个取值：`initialization`、`unresolved`、`controls`、`tasks`、`inputs`、`run`、`idle-armed`、`release`。规则见下文 |
| 载荷超过内联阈值                                                               | `sl_blob` 一行，条目只存引用                                                                                                                                        |

常驻工具与会话冻结的三类事件：SE36 写 `sl_kind_idx` 与 `sl_ref_idx(run)`（随 `startRun` 或 `reload` 时），快照的 `residents` 追加一项。SE37 写 `sl_kind_idx`，快照的 `frozen` 置为非空，`sl_resident_idx` 不变。SE38 写 `sl_kind_idx` 与 `sl_ref_idx(input)`，快照的 `pending` 移除对应输入。

`sl_pending_idx` 的每个原因只由快照决定，不读时间，所以提交时就能准确维护（[`PendingReason`](../session-contract/SPEC.md#sessionreconciliation)）。本成员对新旧快照逐个原因求值：旧快照不满足、新快照满足时加一行，反过来删一行，两者相同时不动。

| 原因         | 新快照满足的条件                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `unresolved` | `unresolved` 非空                                                                                 |
| `controls`   | 有停在 propagating 的控制                                                                         |
| `tasks`      | `tasks` 非空                                                                                      |
| `inputs`     | 待处理输入非空                                                                                    |
| `run`        | 有未终结的 Run                                                                                    |
| `idle-armed` | 自动归档已启用、未豁免，且没有未终结的 Run。是否到期由扫描时的 `judgeIdle` 裁定，本成员不判断到期 |
| `release`    | 任一 `ResultConsumption` 的 `custody` 或 `completion` 非空且 `release` 为 pending                 |

同一会话可以同时有几个原因，每个原因一行。归档提交同批取消未终结 Run，`run` 原因随之离开；归档不另有增删规则。

<a id="w4"></a>

**W4 压缩提交开新 epoch。**`commitDerived(compaction)` 的参加者在同一事务里按下列顺序执行。时序见[压缩提交](docs/flows.md#压缩提交)。

1. 备齐压缩判定的历史输入：覆盖范围 `covers` 内的全部条目、`covers.to` 之后到压缩点之前的消息，以及未结工作所在的条目引用。前两组从 `sl_entry` 按范围读，O(log N + |covers| + |after|)；第三组经 [R4](#r4) 按关联定位。三组输入经 `DecideReads.compaction` 交入 `decide`（[契约](../session-contract/SPEC.md#领域服务与归约)）。
2. 调用 `decide`。压缩判定（`openWork` 与 message 包的 `judgeCompaction`）在 `decide` 里执行，本成员不另调用。结果为 `rejected` 时响应「冲突」，依据为判定结果，不写任何行。
3. 写 `decide` 产出的 SE10 压缩记录与 SE33 标注。标注的 `refs.target` 是 `covers` 范围，`sl_annotation_idx` 一行。
4. 计算新 epoch 的行序列：`rows = retained（按原日志顺序）‖ C ‖ 旧 epoch 中 position > covers.to 的行`。为 `rows` 从 1 重编 `seq`，重算 `prefix_digest`，写入 `sl_model_view` 的新 epoch。只复制索引行（`position`、`bytes`、摘要），不复制内容。
5. `sl_journal.epoch` 加一，`epoch_base` 记为 C 的 `position`。

旧 epoch 的行不删除，供审计与人侧读取。写成本是 O(|retained| + 保留尾长度) 行索引复制，两者都由压缩策略有界，策略归 Request Context。

第 1 步在写事务里读 `covers` 内的全部条目，代价是 O(log N + |covers| + |after|) 加这些条目的字节。它的上界是一个具名前提：`covers` 由 Request Context 的压缩计划确定（[RQ-06](../../context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界)）。现行条款规定覆盖范围从历史起点开始、到压缩点之前结束，并限定了计划的步数上界与保留预算，但没有给出覆盖范围的条目数上界。所以 `|covers|` 可以随历史长度增长，这是一条[明确缺项](#明确缺项)。SQLite 下同一事务域只有一个写者，长压缩提交持有写连接期间，同一事务域的其他提交等待。PostgreSQL 下只有同一会话的提交在 `sl_journal` 行锁上等待。

<a id="w4b"></a>

**W4b `startRun` 的登录门在同一事务里读。**`startRun` 的参加者在调用 `decide` 之前，按快照第一条待处理输入的身份从 `sl_input` 读出它保存的普通输入，把 `{ input, origin }` 经 `DecideReads.firstInput` 交入（[契约](../session-contract/SPEC.md#领域服务与归约)，R2-D198）。这是一次按主键的点读。没有这一行时不交这一项，`decide` 对 `interactive` 入口返回 `login-required`。读与提交在同一事务里，所以登录门与 Run 开始看到的是同一条首条输入。

<a id="w5"></a>

**W5 解释进度随解释提交保存。**快照内每个执行的 `ExecutionRef.readThrough` 是 Session 对 Agent 事件的解释进度（[EC-02](../session-contract/SPEC.md#ec-02)）。它与同日志解释产生的后果、该次 Session 操作的答案在同一次解释提交中保存。不产生后果的事件不单独提交，持久进度随下一次解释提交前进。`receive` 不接收 Agent 事件，不推进 `readThrough`。序号不大于快照当前 `readThrough` 的事件已经随它的后果提交过，重读时按原 execution 与事实身份认回，`readThrough` 不回退。`readThrough` 与会话状态在 `sl_state` 同一行，没有单独的进度表。

<a id="w6"></a>

**W6 并发写的裁定。**同一会话的两次提交只允许一个后继。SQLite 由单写连接与 `BEGIN IMMEDIATE` 串行化。PostgreSQL 由 [W1 第 5 步](#w1) 对 `sl_journal` 该行的 `SELECT ... FOR UPDATE` 串行化：后到的事务等前一个提交，再读到新尾部。所以两种介质下后到的事务都在新尾部上执行 `decide`：带 `expected` 的七种命令在 `expected` 不等于新尾部时得到 `changed`；其余命令按新状态重新裁定，不产生 `changed`。第 7 步的 `UPDATE ... WHERE tail = 第 5 步读到的 tail` 是最后一道核对，影响 0 行按「失败」处理并映射为 `unavailable`。本成员不用进程内锁或内存 CAS 代替这条核对。

### 读路径

每条读路径先按身份与披露边界核权，再读取。核权失败返回 `denied` 或 `invalid`，不返回空页。提供者不可用、索引重建中或读入口缺席返回 `unavailable`，不返回空页。读路径不写任何行，不发通知。

**读路径路由**（SQL r2 第 17 节）。每个公开读先向访问裁定取一次当前决定；经委派视图的读不取决定，只核租户与 Session 等于绑定，再按调用指名的租户向应用目录取事务域，随后经 `SqlStorage.read` 交给 handler。租户与会话随输入送入 handler，handler 的每条语句都按两者过滤。路由如下：

| 公开入口                                                                                                                            | 路由                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit`                                                                                                                            | 写路径，参加者 `session`，响应证据保存原失败依据                                                                                                                     |
| `readWork`、`readInput`、`readModelSelection`、`history.begin`、`history.next`、`history.since`、`history.readModelView`、`pending` | `snapshot` 读，每页一个有界事务                                                                                                                                      |
| `references`、`releasedScopes`                                                                                                      | 系统读：按租户顺序逐个租户域各做一次 `snapshot` 读。不声称跨域的单一快照。目录枚举失败、目录项不属于任何租户、任一域读失败，整次读返回 `unavailable`，不返回较短的页 |
| `queryOperation`、`queryControlOperation`                                                                                           | 写路径先查原回执（一次意图为 `query` 的提交），未命中再按原归属对各代次调用存储 `query`（[R7](#r7)）                                                                 |

handler 回答 `absent`（会话不属于该租户）时端口返回 `denied`，与另一租户的会话同形。handler 回答 `behind`（`sl_state` 未覆盖 `tail`）时返回 `unavailable`。读失败、取消都返回 `unavailable`，不返回空页。

<a id="r1"></a>

**R1 治理读：`readWork`。**

```text
readWork(access):
    head ← sl_journal[tenant, session]                       O(log M)
    row  ← sl_state[tenant, session]                         O(log M)
    若 row.covered == head.tail 且 row.fold_version == 当前归约版本:
        返回 row.snapshot，revision = head.tail，source = head.source
    否则返回 unavailable，带 R9 的追赶进度
```

正常路径两次点查，与 N 无关。`loadRecovery` 走同一路径，它要的 `unresolved` 与 `tasks` 本来就在快照里。退化：归约版本升级或 `sl_state` 校验失败，一次性 O(N log M) 重建，期间返回 `unavailable`。

<a id="r2"></a>

**R2 历史分页：`begin`、`next`、`since`。**

```text
begin(access, kinds, from, direction, pageBytes):
    H ← sl_journal[tenant, session].tail                      固定上界
    pos ← from ?? (direction == forward ? 0 : H + 1)
    cursor ← sign({ tenant, session, source, H, kindsDigest, direction, principalDigest, pos })
    返回 next(access, cursor)

next(access, cursor):
    校验签名、租户、会话、来源、过滤摘要、主体摘要与当前读取资格；任一不符 → invalid 或 denied
    若 kinds 为空:
        流 ← sl_entry 范围 (tenant, session, pos < position ≤ H)，backward 时为 (position < pos)   O(log N + K)
    否则:
        每个 kind 在 sl_kind_idx 上取范围流                                                   O(k log M)
        流 ← k 路按 position 归并，backward 时逆序                                          O(K log k)
    逐条按 kind 核该主体的披露资格；不可见则跳过，仍计入 K
    累计 bytes ≤ pageBytes 且 K ≤ maxScanPerPage 时继续
    annotations ← R6(本页 entries 的位置范围, H)
    返回 { entries, annotations, scannedThrough = 最后检查的 position, next = 未到边界时的新 cursor, exhausted = 已到 H 或起点 }

since(access, after, kinds, pageBytes):
    H ← sl_journal.tail；同 next，pos = after，direction = forward，只返回一页，next 为 null
```

复杂度 O(k log M + K log k + B)，无过滤 O(log N + K + B)，另加 R6 的标注读取。同一轮内新追加不出现。空页仍带 `scannedThrough` 推进。退化：过滤极稀疏或主体几乎无权时，K 达到 `maxScanPerPage` 仍没有可见条目，返回空页与进度，不声称恒定耗时。`maxScanPerPage` 与 `pageBytes` 的上限是策略配置。

页预算按 `sl_entry.payload_bytes` 累计。内联与外置载荷都填这一列，所以判断截断不需要先读出载荷。外置在 `sl_blob` 的载荷只在条目确定进入本页之后才读取，不为被截断的条目读 blob。载荷里指向内容拥有者的耐久引用只以引用返回，读者按需向内容拥有者另取，本成员不代取。`session` 的条目缓存（[CA-1](../session/SPEC.md#ca-1)）不绕过本路径：分页、逐条披露核对与位置仍由本路径完成，缓存命中只省去已核权条目的载荷读取。

游标是签名的自描述值，服务端不保存读会话。签名载荷含游标种类（`history`、`model-view`、`pending`、`references`、`released-scopes`）、租户、会话（系统读与待办为空）、过期时间与续读状态；历史游标的续读状态含边位置、固定上界、方向、`kinds` 与 `pageBytes`。`references` 的游标另带可选字段 `key`（ResidentKey 文本）。验证时依次核对：签名密钥可读（不可读为 `unavailable`）、签名有效、种类、租户与会话与本次调用一致、R10 游标的 `key` 与本次调用的键一致、未过期。任一不符为 `invalid`。游标不含主体摘要：每次续读都重新向访问裁定取当前决定。过期时间由 `cursorTtlMs` 给出，初值 15 分钟。签名密钥归装配，经 `sessionCursorSigning` 注入。

<a id="r3"></a>

**R3 单条输入读：`readInput`。**`sl_ref_idx(input = InputId)` 定位该输入的 SE11 条目，再读条目载荷里的原输入。两次点查加内容读取，O(log M + B)。输入不存在或不属于该会话返回 `invalid`。没有退化条件。

<a id="r4"></a>

**R4 按关联定位。**内部读路径，供参加者模块核对原关联、压缩的未结工作映射与 R10 取 shape 使用：`sl_ref_idx(ref_kind, ref_id)` 给出该关联的全部条目位置，每个位置一次 `sl_entry` 点查。O(log M + p log N)。没有公开操作直接暴露它。

<a id="r5"></a>

**R5 epoch 视图读：`readModelView`。**

```text
readModelView(access, basis, after, pageBytes):
    核对 access；缺主体、租户或会话 → invalid；跨租户或无读取资格 → denied
    head ← sl_journal[tenant, session]
    若 basis 为 null: basis ← { epoch: head.epoch, upper: head.tail }
    若 basis.epoch ≠ head.epoch: 返回 epoch-changed，current = { epoch: head.epoch, upper: head.tail }
    rows ← sl_model_view 范围 (tenant, session, basis.epoch, seq > after) 且 position ≤ basis.upper   O(log M + p)
    按 bytes 累加到 pageBytes 截断
    每行按 position 读 sl_entry，解码为 Message                                                     O(p log N + B)
    返回 { kind: page, basis, rows: [{ seq, entry, bytes, prefixDigest, message }], next = 还有行时的最后 seq }
```

视图在压缩提交时物化（[W4](#w4)），读取不重算模型视图。同一 `basis` 下各页属于同一 epoch 且上界固定。`basis.upper` 大于当前 `tail` 或小于该 epoch 的基位置时返回 `invalid`。前缀对齐由读者比较 `prefixDigest`，本成员保证同一 epoch 内同一 `seq` 的摘要永不改变。退化：没有。压缩的写成本见 [W4](#w4)。

<a id="r6"></a>

**R6 填充页内标注：`HistoryPage.annotations`。**R2 每返回一页都执行 R6。给定本页条目的位置范围 `[lo, hi]`，在 `sl_annotation_idx` 上取 `target_to ≥ lo`、`target_from ≤ hi` 且 `position ≤ H` 的行，去掉位置已在本页 `entries` 里的行，再按位置读出这些标注条目，放进 `annotations`（[SessionHistory](../session-contract/SPEC.md#sessionhistory)）。标注条目与 `entries` 一样逐条按 `kind` 核该主体的披露资格，不可见的不放进 `annotations`。O(log M + a log N + B_a)，a 为命中的标注数，B_a 为它们的字节数。空页没有 `[lo, hi]`，`annotations` 为空。

R6 让从中间位置跳转的读取也能看到后来的更正与标注，服务对人时间线的「已压缩进摘要」「保留」「已更正」标记。从尾部向起点分页时，标注多数已经在更早的页里，R6 仍按上面的规则放入不在本页的标注，读者可以按条目身份去重。退化：一个条目被大量标注指向时 a 大，`annotations` 不受 `pageBytes` 截断，代价随 a 线性。

<a id="r7"></a>

**实现状态：**`queryOperation` 与 `queryControlOperation` 共用同一条查找路径：先经一次意图为 `query` 的提交读 `sl_operation`，会话不存在时 `denied`；命中后按 `form` 区分：`queryOperation` 认 `batch` 与 `entries`，`queryControlOperation` 只认 `control` 与 `answer`，认错种类返回 `conflict`（SL07）。`log` 记录两者都答 `conflict`。存储回执已提交、但回复带 `recorded: false`（`commitLog` 认回别的 operation）的身份按未命中处理，答 `unknown`。未命中时才对各代次调用存储 `query`。代次 1 的差异见[实现现状](#实现现状)的 R7 一行。

**R7 原操作认回：`queryOperation`。**

```text
queryOperation(access, operation):
    row ← sl_operation[tenant, session, operation]                     O(log M)
    命中: 返回 committed，带原回执
    未命中且 operation 是参加操作: 返回 unknown，不查存储
    未命中且 operation 是 Session 提交的操作:
        对 k = 1, 2, …（不超过尝试代次上限）: q ← 存储契约 query(<operation>#k)
            q 为 committed: 返回 unavailable。存储有回执而本成员没有行，这是存储缺陷，见 C-01
            q 为 unknown（含在途尝试）: 返回 unknown
            q 为 rolled_back: 继续 k + 1
            q 为 not_committed（五项证明齐全）:
                k = 1: 返回 not-committed，依据为五项证明
                k > 1: 返回 attempt-rejected，原因为第 k − 1 代次的回滚
        全部代次都是 rolled_back: 返回 attempt-rejected
```

两种「未提交」的区分：

- `attempt-rejected`：最新的代次是 `rolled_back`，此前没有 `committed` 或未知的代次。回滚的原因可以是 `changed`、冲突、拒绝或参加者「失败」。它说明本次尝试未生效，原操作可以用同一身份重试，重试开新的代次（[W1 的尝试代次](#w1-attempts)）。
- `not-committed`：存储对全部已探查的代次都给出带五项证明的 `not_committed`，也就是代次 1 就没有回执。它说明原操作明确未提交。

本成员不自己构造「明确未提交」。旧写代际未排除、队列里仍有该操作、恢复未完成时，提供者只给 `unknown`，本成员照传。

参加操作是执行记录提供者发起的共同提交里 Session 一侧的操作，它的 `SessionOperationId` 从 execution、提交方操作身份与提交种类派生（[OP-00](../session-contract/SPEC.md#op-00)）。这类提交的存储操作身份归 Agent，不是 `<SessionOperationId>#<代次>`。用 Session 身份查存储只会查到从未用过的身份，可能得到带证明的 `not_committed`，而携带 Session 事实的 Agent 提交之后仍可能成立。所以 R7 对未命中的参加操作只返回 `unknown`，它的认回走 Agent 的原操作查询（[PA-05](../session-contract/SPEC.md#pa-05)）。

辨认参加操作要从 `SessionOperationId` 看出派生种类。契约的 `SessionOperationId` 是不透明的品牌字符串，本成员不解析它（[TB-03](#tb-03) 同理）。辨认入口是一条[明确缺项](#明确缺项)。补上之前，R7 对 `sl_operation` 未命中的操作一律按 Session 提交的操作探查代次，只改一处：代次 1 为 `not_committed` 时返回 `unknown`，不返回 `not-committed`。理由如下：

- 参加操作从不使用 `<SessionOperationId>#<代次>` 这个存储身份，所以探查它只会在代次 1 得到 `not_committed`，现在返回 `unknown`，不会误判为未提交。
- 探查到 `committed`、`rolled_back` 或 `unknown` 的身份一定是 Session 提交过的操作，`attempt-rejected` 与 `unknown` 照常给出。
- 代价是 Session 提交的操作在代次 1 从未受理时也只得到 `unknown`。原发起者仍可用同一身份重做命令，[W1 的尝试代次](#w1-attempts)按回执选代次，不依赖 R7 的辨认。

复杂度：命中时一次点查。未命中时每个代次一次存储 `query`，次数不超过尝试代次上限。退化：没有。

<a id="r8"></a>

**R8 待办扫描：`pending`。**

```text
pending(principal, tenant, after, limit, reason):
    若 reason 给定: 行 ← sl_pending_idx 范围 (tenant, reason, session > after)，取 limit 行      O(log M + limit)
    否则: 八个 reason 各取范围 (tenant, reason, session > after)，按 session 归并去重，取 limit 个会话  O(8 log M + 8·limit)
    返回 { sessions, next = 最后一个 session 或 null }
```

游标是最后一个会话身份的签名值，绑定租户与 `reason`。索引行在共同提交里随快照增删（[W3](#w3)），八个原因的条件都只由快照决定。`idle-armed` 只说明会话在自动归档的计时范围内，是否到期由扫描方调用 `judgeIdle` 裁定。读取不删待办。退化：没有。索引重建中返回 `unavailable`。

<a id="r9"></a>

**实现状态：R9 的追赶与重建尚未实现。**handler 在 `sl_state` 未覆盖 `tail` 时回答 `behind`，端口返回 `unavailable`。隔离会话与解释版本记录同样没有实现。以下算法是设计目标。

**R9 追赶与重建。**

```text
追赶(tenant, session):
    state ← sl_state；head ← sl_journal
    若 state.fold_version ≠ 当前版本，或 state 的摘要校验失败: state ← 空（从创建批次起）
    批 ← sl_batch 范围 (commit_seq > state.covered_commit)                            O(log N + D)
    逐批读条目，按该批 sl_batch.interpreter 选解释版本 reduce
        本构建不支持该解释版本: 该会话 quarantined，停止追赶
    每批后把新快照与 covered 写回 sl_state（独立的小写事务）
    追平 head.tail 之后，治理读才返回快照

重建派生索引(tenant, session 或全库, 索引名):
    记录重建进度行；期间对应读路径返回 unavailable 并带进度
    逐个会话：锁住该会话的 sl_journal 行，清空该索引里该会话的行，按 sl_entry 顺序重算并写入，提交
    完成后删除进度行
```

每批按自己的解释版本解释：`sl_batch.interpreter` 记录写入时 `decide` 与 `reduce` 共用的版本，追赶时 `reduce` 用同一版本解释这一批，不用最新规则改变旧结论（[编码与归约的拥有者](#编码与归约的拥有者)）。本构建不支持某批的解释版本时，该会话按下文隔离，返回 `quarantined`。派生索引的重建按会话在该会话的 `sl_journal` 行锁内进行，与 [W1 第 5 步](#w1) 用同一把锁。[W3](#w3) 的在线写因此不会与重建交错，不会重复或漏掉行。SQLite 只有一个写者，两者本来就串行。

D 在正常运行中为 0，因为每次提交都物化。只有归约版本升级或 `sl_state` 损坏时 D = N，复杂度 O(N log M) 加内容读取，内存只需快照大小。重建期间 R1、R8、R10、R11 返回 `unavailable`，不用旧快照或旧索引授予资格；R2、R3、R5、R7 不依赖被重建的索引时照常。重建只解释事实，不调用模型、工具或外部效果。`sl_entry` 本身缺口、损坏或 `sl_journal.tail` 与最后一条条目不一致时，隔离该会话：`readWork` 与 `loadRecovery` 返回 `quarantined`（[SessionWork](../session-contract/SPEC.md#sessionwork) 的读结局），其余读返回 `unavailable`，`owner` 为本成员，写被拒绝，不清空、不静默丢弃尾部。

<a id="r10"></a>

**R10 引用查询：`references`。**

```text
references(principal, scope = system, key, after, limit):
    核对系统作用域的读取资格；无资格 → denied
    对本部署的每个事务域（XP-6）: 行 ← sl_resident_idx 范围 (key, (tenant, session) > after)   O(T log M + limit)
    每行读 sl_entry[admitted_position] 取 SE36 的 shape（条目不可变，可缓存）                       O(limit · log N)
    返回 { sessions: [{ tenant, session, capability, shape }], next }
```

引用的定义归契约：会话当前记下的登记键含该键且会话未归档；冻结而未归档的会话算引用；已归档的会话不算引用，因为归档同批取消未终结 Run。索引行按 [W3](#w3) 在 SE08、SE26、SE27、SE28 提交时维护，所以读取不扫描日志。游标绑定 `key` 与系统作用域，按 `(tenant, session)` 排序。游标同时绑定目录修订（既有行为），R11 的游标不绑定。退化：事务域数 T 大时每页 O(T log M)，由 XP-6 的目录决定遍历顺序，游标记当前事务域。索引重建中或任一事务域不可读时返回 `unavailable`，不返回部分结果冒充没有引用。

<a id="r11"></a>

**R11 已释放作用域读：`releasedScopes`。**

```text
releasedScopes(principal, scope = system, after, limit):
    核对系统作用域的读取资格
    对每个事务域: 行 ← sl_released_scope_idx 范围 ((tenant, session, scope) > after)             O(T log M + limit)
    返回 { scopes: [{ tenant, session, task, scope }], next }
```

账本是会话日志的 SE25。索引只收已归档会话的释放读回（[W3](#w3)）。退化与 R10 相同。

<a id="worker-retention"></a>

**Worker 内的两处保留。**每个 Worker 模块实例保留两种可重算的派生物。它们不是权威，每次使用都先核对存储里的行。它们与主线程里端口侧的工作缓存（[RT-04](#rt-04)）是不同的层：端口侧的缓存按版本点查，命中时不读 `sl_state`；本节两处在 Worker 内，命中前仍读头行并核对内容。

- 参加者的解析快照（`src/worker/participant.ts` 的 `ParsedSnapshots`，只在写 Worker 里使用）：
  - 作用：同一会话的提交读到相同的 `sl_state` 头文本时，不再读分块，也不再做 `JSON.parse` 与解码。读 Worker 不使用它。
  - 键：租户加会话。
  - 核对：每次提交仍读该会话的 `sl_state` 头行，并核对 `covered` 等于尾部。只有头文本与保留项的头文本逐字相等时才复用，否则读出分块并重新解析。头带着分块的令牌，所以头文本相等时分块也相等。命中时只读头行，并做一次与头长度成正比的字符串比较。
  - 与技术设计的差别：技术设计 v2 §6.1 在 `covered` 等于尾部时复用，不读该行。本实现按内容核对（R2-D96 接受这项偏离），理由有三条：修订号不区分数据库，一个模块实例可服务多个库，进程内测试提供者即如此；回滚的写入可能留下一个修订，后来的提交以别的内容再写同一修订；组提交里后一个操作会看到前一个操作暂存的行。头文本相等时快照相等，所以命中不会回答行里没有的快照。
  - 保留的对象：事务读到的快照，以及提交写出的快照（连同它写的头文本）。参加者看不到事务是否提交：事务回滚时存储里仍是旧头，与保留项不等，所以下一次提交不用它。保留的快照深冻结：写入它的调用抛 `TypeError`，提交失败并回滚，下一位读者仍得到存储里的快照。
  - 失败：头行没有覆盖尾部时答 `behind` 并丢掉该项；头或分块解析失败、分块没有对应的集合时抛错，该会话不保留任何项。
  - 上界：每个 Worker 最多保留 256 个会话（`PARTICIPANT_SNAPSHOT_SESSIONS`），保留的存储文本（头与全部分块）总长最多 64 Mi 个 UTF-16 码元（`PARTICIPANT_SNAPSHOT_TEXT`），按最近最少使用淘汰；单个快照超过总长上界时不保留；会话上界为 0 时不保留任何项。保留项只影响速度，不影响答案。
  - 验证：`tests/participant-snapshot-cache.spec.ts`。
- 历史索引的 Session 行（`src/worker/history-index.ts` 的 `sessionRows`，写 Worker 与读 Worker 各保留一份）：
  - 作用：Session 日志只追加，已存的行不变，所以折出的索引下次只需读游标之后的行。折入五种行：`intake.routed`、`run.started`、`run.attempt-started`、`run.terminal`、`control.requested`。答案与读全部行的答案相等。
  - 键与核对：租户加会话。使用前核对游标处日志行的指纹；不符（库被替换或回滚，或一个模块实例服务多个库）时，从第一行重建。游标之后的行必须连续；出现空洞表示日志不只是追加，此时丢掉保留项，本次调用失败（提交回滚，读答 `unavailable`），下一次调用重建。
  - 未提交的行：修订大于日志尾部的行属于未提交的事务，只折进本次调用的副本，不保留。修订不大于尾部的行当作已提交，这依赖 `session` 参加者是 `singleton`，见[已知限制](#已知限制)第 21 条。
  - 上界：最多保留 256 个会话，保留的行数总和最多 262144；单个会话超过行数上界时不保留。保留的行也计入 K-5 的行数上界（第 12 条），超过时答案是 `too-many`，与读全部行相同。
  - 读取计数：见[已知限制](#已知限制)第 12 条的读取计数。
  - 验证：`tests/history-index-incremental.spec.ts`。

### 保留与缓存

<a id="rt-01"></a>

**RT-01 不删除。**本成员没有删除条目、批次、操作回执或旧 epoch 行的操作。归档、冻结、压缩、交付责任解除与格式演进都不删除。存储维护（VACUUM、重建索引、迁移）可以改变物理字节，不改变 `sl_entry` 的身份、内容与顺序。

<a id="rt-02"></a>

**RT-02 交付责任解除不改变保留。**`receive(release)` 把 `ResultConsumption.release` 改为 confirmed 之后，生产者可以释放它的副本。此时 SE20 保存的内容或引用是消费侧唯一可恢复的来源（[EC-06](../session-contract/SPEC.md#ec-06)）。本成员对 SE20 的内联载荷与 blob 不做任何清理。引用指向的外部内容由其拥有者按保留责任维护，本成员只保证引用本身与条目一起保留。

<a id="rt-03"></a>

**RT-03 blob 随引用保留。**`sl_blob` 的行只要被任一条目的 `payload_ref` 或任一 `er_fact` 的块引用引用就保留。同一租户内同摘要内容只存一份，不跨租户去重。回滚的事务写的块随回滚撤下。意图 `blobs` 先于引用事实提交的块在引用事实提交之前没有引用，它不是事实。本成员没有删除块的操作，第一版不回收任何块。

<a id="bd-01"></a>

**BD-01 会话归属读口。**`createSessionPrincipalBindings` 的答复语义不变：`bound` 只带记录里的租户、会话与来源证据；未知会话与别的租户的会话都答 `not-bound`，两者相同；租户未登记、目录答了别的租户、存储读失败、读口已停止，都答 `unavailable`，不答 `not-bound`。

- 读：按（事务域、租户、会话）调用 `session.binding`。它在一个读快照里点查 `sl_journal` 的主键，没有则答 `absent`；有则读 `sl_entry` 里修订为 1 的条目（创建该会话的那一批，按位置取到第一个修订不为 1 的条目之前），交 session-contract 导出的 `batchEvidence` 算出建立证据。证据格式只此一份，本成员不复制。它不读 `sl_state`，所以行数与字节与快照大小无关。日志行存在而没有修订 1 的条目时答 `unestablished`，读口答 `unavailable`。
- `source` 是建立该会话那一批的证据，之后的提交不改变它。`WorkSnapshot.source` 是最近一批的证据，二者不同；契约写的是「已成立的身份」，所以读口取前者。
- 记忆：`bound` 在进程内按（事务域、租户文本、会话）记住，不再核版本，因为租户归属与建立证据不变；上限 `BINDING_MEMO_SESSIONS`，超过时丢最早的一项再读。`not-bound` 与 `unavailable` 不记：会话可能随后才创建。记住的答案对所有读者共享，已冻结。
- 状态落后：`session.work` 的 `behind`（快照行还没覆盖到尾部）不再出现在归属读里，因为窄读取不读快照行，也就不需要等折叠。
- 停止：`stop()` 之后每次读都答 `unavailable`，诊断含 `closing`，记住的答案也不例外，不再触及存储。
- 验证：[binding-narrow.spec.ts](tests/binding-narrow.spec.ts)、[principal-bindings.spec.ts](tests/principal-bindings.spec.ts) 与 harness-server 的 `tests/rows/session-storage/principal-bindings.spec.ts`。

<a id="rt-04"></a>

**RT-04 存储侧缓存。**本成员缓存不可变或可重算的派生物：预编译语句、每个事务域的迁移版本与归约版本、R10 取 shape 时按 `(tenant, session, position)` 缓存的 SE36 载荷，以及下面的工作缓存。`sl_journal` 的读数本身不缓存，R7 不缓存。条目缓存与 CA-3 的命令处理器快照槽归 `session`，视图前缀摘要缓存归 `session-adapters`，本成员不持有它们。写 Worker 内的 `session` 参加者另复用已解析的快照：每次提交仍读该会话的 `sl_state` 头行，头文本与保留项逐字相等时才复用（R2-D96），见[Worker 内的两处保留](#worker-retention)。

工作缓存（`src/work-cache.ts`）。R1 的回答可以由端口从进程内缓存给出，但每次都先核对存储，缓存永远不是权威：

- 范围：每个数据库一份。身份由 `storeOf` 取：先穿过 Cordis 服务代理（`Symbol.for('cordis.original')`）到被包装的对象，再取它自有的 `read` 函数；`read` 不是自有函数（类方法，各实例共用）时取对象本身。提供者为自己的库建一个 `read` 闭包，复制方法的包装（把端口登记为服务）复制的是同一个闭包，所以同一个库的公开端口、委派视图、会话归属读口、经 `./participants` 的 `readCachedSessionWork` 读的调用方（session-adapters 的 Journal 提供者）与各插件拿到的代理共用一份缓存；不同的库没有相同的自有 `read`，绝不共用，即使事务域名、租户、会话与版本都相同。键是事务域、租户文本与会话；`SessionId` 只在租户内唯一，所以两个租户的同名会话是两个键。缓存不是核权点：端口先取访问裁定、再按调用指名的租户取事务域，之后才查缓存。
- 单飞：读到同一版本的并发读共用一次整读（以键与版本登记进行中的整读，结束即清除）；整读失败时所有等待者拿到同一个 `unavailable`，下一次读重新回源。版本点查失败的读不合并。
- 版本：`(sl_journal.tail, er_root.published)`。`session.work` 的回答依赖这两个计数：快照行只在推进 `tail` 的事务里替换，`historyIndex` 读的 `er_` 行只在推进 `published` 的事务里写。两者只增不减。
- 读：先经 `session.work-version` 点查当前版本（`sl_journal` 与 `er_root` 各一次主键点查，只读 `tail` 与 `published`，不读 `sl_state`：SQLite 取 `covered` 要走完快照正文的溢出页，代价随快照增长。行数与字节与会话大小无关）。会话不存在答 `denied`；版本与缓存项相等时返回缓存的已解析快照（缓存项只从核对过 `covered == tail` 的整读登记，快照行只在推进 `tail` 的事务里替换，所以 `tail` 相等时仍覆盖它）；不相等、没有缓存项、点查失败或回答不可解析时整读 `session.work`，按它在同一读快照里给出的版本登记。整读失败或解码失败时删除该项并返回失败。`tail` 或 `published` 任一项小于缓存项时（两者分别比较）删除该项并答 `unavailable`，诊断写 backwards（日志倒退，例如库被换成备份），不当作一次普通读。
- 返回的快照是深冻结的同一对象：调用方写入会抛 `TypeError`，不会改变下一位读者所见。
- 上界：按 LRU 淘汰，会话数上限 `WORK_CACHE_SESSIONS`（256）、快照文本字节上限 `WORK_CACHE_BYTES`（64 MiB），可经 `SessionStorageOptions.workCache` 覆盖，`0` 表示不缓存；单个快照超过字节上限时不登记。同一存储对象上第一个读者的上界生效。被淘汰的会话再读时整读一次。
- 提交不读缓存：提交在参加者里按事务内的当前状态裁定，`expected` 与尾部在事务内核对，缓存不参与。其他进程的提交由下一次读的版本点查发现。
- 本进程的提交折叠进缓存。提交回复把本次批次交给工作缓存：`session` 参加者在推进尾部的两条写路径（命令批次、同日志批次）的回复里带 `work`，含新版本 `(tail, published)`（`published` 在同一事务里点读 `er_root`）、快照正文长度、本批首末位置，以及本批归约所依据的历史读取的输入范围与焦点（`basis`）。`basis` 的 JSON 文本超过 `WORK_BASIS_BYTES`（16 KiB）时不带；entries 通道在没有索引与读数的快照上归约，只标 `indexed: false`。认回不带 `work`。端口只在回复新鲜且已提交（不是认回、不是 `recovered`）、缓存持有的版本正是 `(tail − 1, published)` 时折叠，依次：经 `session.history` 读本批条目（O(k)，核对位置连续、修订等于 `tail`）；经 `session.work-reads` 在读 Worker 里按「位置不超过本批首位减一、`published` 相等」复现参加者的历史索引与读数（Session 行写后不变，`er_` 行只随 `published` 变；该 handler 核对 `published` 与该位置行的修订，Worker 保留的索引已越过该位置时也答 `stale`）；在持有的快照上换入这份索引，用同一个 `reduce` 与这份读数归约；经 `session.work-index` 按与 `session.work` 相同的函数和上界（`workIndexOf`）算新快照的索引，该 handler 先核对存储的 `tail` 仍等于折叠的 `tail`，不等答 `stale`；发布计数小于所问也答 `stale`，大于所问时按当前计数算索引；答复都给出当前计数，索引超过行上界答 `too-many` 时也给出。快照行只在推进 `tail` 的事务里替换（见上文「版本」），所以折叠期间插入的发布只改变索引：全部成立就以 `(tail, 答复的 published)` 登记，`too-many` 时登记不带索引的快照，与该版本的整读相同。没有持有项、版本不衔接、`basis` 缺席、`reduce` 隔离、条目读不全或 `stale` 时都不登记，只计数，下一次读照旧点查加整读。折叠进行期间，点查到同一版本的读等折叠结束再取登记项。折叠从不改变提交的回答，也从不抛错。
- 本进程的 Agent 发布只换索引：Journal 提供者在发布提交后调用 `registerSessionWorkIndex`，缓存持有该会话时，按持有的 `tail` 经 `session.work-index` 重算索引，换掉持有项的索引并以答复的版本登记（计数可能已越过这次发布，同上）；快照行只随 `tail` 变，所以快照本身沿用。`tail` 已变（`stale`）或没有持有项时不登记。
- 本进程的 Journal 共同提交也折叠：Journal 提供者的一次发布里带 Session 参加（命令批次）时，Session 参加者的回复同样带 `work`。同一事务里 `execution-record` 参加者先运行（名字序，见已知限制第 11 条），把发布计数加一，Session 参加者随后点读到的就是加一后的计数。所以这条提交只在缓存持有的版本正是 `(tail − 1, published − 1)` 时折叠，复现读数与读新索引都用回复里的计数；其余步骤与端口提交相同。只取这次调用发出、已提交、不是认回、Session 回答不是 `recovered` 的回复；回滚的提交没有 `work`。Journal 提供者调用 `registerSessionWorkIndex` 时带上这份 `work` 就折叠，不带就只换索引。
- 计数：`workFoldCounts(storage)` 给出该库（按 `storeOf` 取身份）的 `folded`、`indexed`、`skipped`、`quarantined`、`stale`，以及其中按越过的计数登记的 `republished`，供测量使用。`folded`、`indexed` 只在缓存确实留下登记项时加一。
- 回复会落盘：sqlite-provider 把参加者回复连同收据写进 `_sql_receipt`，单份回复超过 `maxResponseBytes`（初值 64 KiB）时提交回滚。所以 `basis` 有 16 KiB 的界，每次提交的收据至多多出这么多；`basis` 只是输入范围与焦点，通常几百字节。
- 已知限制：整读仍是 O(|S|)，冷启动、淘汰、外部提交、`basis` 超界与折叠不成立时付一次。`session.work-index` 与 `session.work-reads` 的输入带全部 Run 的执行引用，长度随 Run 数增长。主线程的 `reduce` 对持有快照做顶层浅拷贝，代价未单独测。

<a id="rt-04-owner"></a>

当前状态的拥有者与直接读者。工作缓存（下称 WorkHolder）是一个进程里 Session 当前状态 `session.work` 的唯一内存拥有者。它不是权威：权威仍在存储，每个答案都带一个在存储快照里读到的版本，资格由事务内的裁定决定。

- 只有 WorkHolder 调用 `session.work` 与 `session.work-version` 两个 handler。其余读当前状态的调用方都经 WorkHolder：Session 核心的面操作经端口 `readWork`（`src/reads.ts`），session-adapters 的插件经核心面 `session.work.readWork`，不经核心的读者（session-adapters 的 Journal 提供者）经 `readCachedSessionWork`；会话归属读口 `src/bindings.ts` 不读工作快照，也不用工作缓存（[BD-01](#bd-01)）。`tests/direct-reads.spec.ts` 用 `git grep` 核对这条边界：全仓 `packages`、`apps` 的产品源码里以文本点名这两个 handler 的文件，只有定义它们的 `src/worker/read-work.ts` 与 `src/worker/read-work-version.ts`、登记材料的 `src/materials.ts`、声明常量的 `src/participants.ts` 与 `src/work-cache.ts`。
- 保留直接读 Session log 存储的有五类，另有一处已知限制（`session.model-selection`，见本条末尾）。它们读的不是当前状态，或者本身就是某份状态的拥有者：
  1. WorkHolder 自己：版本点查、整读，以及折叠用的 `session.history` 批读、`session.work-reads` 与 `session.work-index`。
  2. 按不可变坐标分页的读：`session.history` 按 `position` 分页（服务入口的历史读与核权、CP-01 第 6 步取本次提交的条目、AD-03 回放刚提交的批次），`session.model-view` 按 `(epoch, seq)` 读后缀。每页 O(页)，无状态，与会话长度无关。
  3. Journal 提供者的 `sync`：它是 Agent 执行记录的内存拥有者（每个会话一份副本），按 `session.history-root` 点查，再经 `execution-record.facts` 只读 `pub > head` 的批增量折叠；AD-05、AD-06 经它的条目面读，不直接读存储。
  4. AD-02 的事件后缀读：`execution-record.events` 只读 `eseq > readThrough` 的只追加行，O(k)。
  5. 提交路径在写事务里的读：参加者读快照行、历史索引与操作记录，`queryOperation` 的认回读操作记录。CAS、`decide` 与认回必须读事务内的当前值，不读缓存。

  按主键的点查（`session.execution` 的路由、`execution-record.operation` 的认回）与会话大小无关，归各自的调用方。

  五类之外还有一处直接读快照行：`session.model-selection`（`src/worker/read-model-selection.ts`，端口的 `readModelSelection`）读 `sl_state.snapshot` 的头并 `JSON.parse`，只为取出保存的模型选择与修订。它不经 WorkHolder。头不含集合与大对象成员，所以代价不随 Run 增长。`creation` 是大对象成员时，它另按主键读出该成员行，不读分块。`tests/direct-reads.spec.ts` 另用 `git grep` 核对 `sl_state` 只出现在表声明、迁移、提交路径、WorkHolder 的整读、这处读者，以及只在注释或数据里点名它的文件中；清单外新出现的读者使用例变红。
- 已知限制：
  - AD-07（session-adapters `message-handoff.ts`）取交接记录与权限时整读该 execution 的分区，O(|x|)。处置方向：随分区拆细改为向 Journal 提供者查询，需要 session-cordis-contract 新增服务键。
  - AD-04（session-adapters `history-source.ts`）为压缩窗口翻完全部历史，O(n)。处置方向：改为窗口函数。

### 符合性

<a id="c-01"></a>

**C-01 派生表等于重算。**对任一已提交前缀，下列等式必须成立。不成立是 `StorageDefect`，不是可忽略的告警。

| 派生物                                                 | 重算方式                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sl_kind_idx`、`sl_ref_idx`、`sl_annotation_idx`       | 从 `sl_entry` 逐条按 [W3](#w3) 的规则重新生成行集合                                                                                                                                                                                                                   |
| `sl_model_view` 的每个 epoch                           | 从 `sl_entry` 的 SE10 序列按 CM-01 朴素推导模型视图，再按 [W4](#w4) 重算 `seq` 与 `prefix_digest`                                                                                                                                                                     |
| `sl_pending_idx`                                       | 从重算的 `sl_state` 按 [W3](#w3) 的八个原因重新生成                                                                                                                                                                                                                   |
| `sl_resident_idx`                                      | 从每个会话最近一条 SE08 的登记键集合，按归档状态过滤                                                                                                                                                                                                                  |
| `sl_released_scope_idx`                                | 只取当前已归档的会话：从它最近一次归档之后的 SE25 释放读回逐条重新生成。撤销归档的会话没有行                                                                                                                                                                          |
| `sl_state`、`sl_state_item`                            | 从创建批次起 `reduce` 全部批次，再按[快照的存储形态](#快照的存储形态)拆分；比较拼出的快照，不比较分块边界与令牌                                                                                                                                                       |
| `sl_journal.tail`、`commit_seq`、`epoch`、`epoch_base` | 分别等于最后一条条目的位置、`sl_batch` 的行数、`sl_model_view` 的最大 epoch 与该 epoch 首个压缩记录行的位置                                                                                                                                                           |
| `sl_operation` 的每一行                                | 与提供者的已提交回执对应：Session 提交的操作，每行至少有一个代次的已提交回执，身份为 `<operation>#<代次>`。`decide` 认回时响应「参加」不写行，这样的代次也有已提交回执；参加操作的行对应执行记录提供者那次提交的回执。反过来，每个已提交回执去掉代次后都有 Session 行 |

检查方式：符合性套件把重算结果写入同形的影子表，再按主键做集合差。差为空才通过。全量检查在验证计划里按会话抽样执行，每次提交后的增量检查只比对本批触及的键。

<a id="c-02"></a>

**C-02 固定上界下的分页完整。**对任一 H，`begin` 到 `exhausted` 的全部页拼接后，等于 H 内该主体获准读取的条目全集，不重不漏。并发追加不进入本轮。

<a id="c-03"></a>

**C-03 游标不可篡改。**换会话、换租户、换种类、过期、篡改任一字节或用已轮换密钥签名的游标一律 `invalid`；扩过滤、改 H、改方向要改续读状态，状态在签名之内，所以同样 `invalid`。

<a id="c-04"></a>

**C-04 前缀摘要可比较。**同一 epoch 内同一 `seq` 的 `prefix_digest` 永不改变。两段不同的前缀以压倒性概率摘要不同。摘要函数是 SHA-256，输入是上一行摘要与本条目内容摘要的字节拼接。

## 所有权、失败与生命周期

### 身份与所有权

- 租户是每一行的列，也是每条语句的条件。本成员不从连接、事务域或装配树推断租户。事务域由应用目录按租户给出，每次调用都查。同一事务域只服务一个租户，这是存储契约的规则；本成员仍在每张表保留 `tenant` 列，跨租户访问在语句层被拒绝。
- 会话身份、位置、`commit_seq`、`epoch` 与 `seq` 由本成员分配。`SessionOperationId` 由 `session` 按 OP-00 派生后交入，本成员不生成操作身份。
- `CommitReceipt.source` 是本成员在提交时生成的证据：`owner` 为本成员名，`record` 为 `(tenant, session, commit_seq)` 的编码，`revision` 为 `tail`，`digest` 为本批条目摘要的链式散列。认回时返回同值。
- 条目载荷的语义归事件目录与各事实拥有者。本成员只核对 JSON 形状与封套必填字段，不解释业务含义。

### 编码与归约的拥有者

参加者模块在 Worker 内运行，不能回调 `session` 进程。它用 `session-contract` 导出的三组纯函数：OP-00 的身份派生、`decide` 与 `reduce`（[领域服务与归约](../session-contract/SPEC.md#领域服务与归约)）。

- `decide` 是命令到条目批次的唯一编码。它认回原操作，调用九个领域服务与守卫，产出 `EncodedEntry` 批次、原回执或拒绝结局。本成员不另写编码，也不在 `decide` 之外调用领域服务。
- `reduce` 是同一编码的解码。`decide` 与 `reduce` 共用一个解释版本，`sl_batch.interpreter` 记录每批的解释版本。同一解释版本下，`reduce` 解释 `decide` 的批次得到命令要求的后态。
- 本成员只做 `decide` 不能做的事：读出它的输入（快照、操作记录、压缩的历史输入），为它产出的条目分配位置与身份，写行，维护派生物。

本成员不直接依赖 message 包的判定函数。压缩判定经 `decide` 传递到 message 包。本成员只用 message 包的类型解码 SE10 载荷里的消息与压缩记录（[R5](#r5)、[W4](#w4) 第 4 步），C-01 的视图重算按 CM-01 推导。

### 事务、并发与取消

- 一次 `commit` 只有一个存储事务。参加者模块不开始、不提交、不回滚事务，语句端口拒绝这些语句。
- 参加者语句失败后，提供者关闭本次语句端口，本成员不再执行语句，响应「失败」。
- 读路径在事务外执行。读经 `SqlStorage.read` 的 `snapshot` 读，只读已提交状态。读与提交在提供者内部怎样排队归 [sqlite-provider 规格](../../storage/sqlite-provider/SPEC.md)。PostgreSQL 没有实现。
- `commit` 没有取消。调用方取消观察时，原操作仍有结果拥有者，按原身份经 R7 对账。读路径的取消只释放调用方。
- 同一会话的提交由 [W6](#w6) 串行化。不同会话的提交在同一事务域内仍经同一条写连接串行（SQLite），这是提供者的规则。

### 失败分类

| 情形                                                     | 本成员的结果                                                                                           | 谁处置                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 存储契约 `rejected_before_accept`                        | `unavailable`，`owner` 为存储参加者，带原因                                                            | 装配或存储契约拥有者                                          |
| `identity_conflict`，已有回执为 `committed`              | Session 输入摘要相同时返回原回执，`recovered` 为真；不同时 `conflict`（[W1](#w1) 第 2 步）             | 调用方                                                        |
| `identity_conflict`，已有回执为 `rolled_back`            | 选下一个代次重新提交                                                                                   | 本成员                                                        |
| 选代次时某代次为 `unknown`                               | `commit-unknown`，不开新代次（[尝试代次](#w1-attempts)）                                               | `session` 的 S4 按原身份 R7                                   |
| 代次达到尝试代次上限，全部为 `rolled_back`               | `unavailable`，`owner` 为本成员                                                                        | 装配调整上限或维护者处置                                      |
| `rolled_back`，停止响应为 `conflict`                     | 响应证据里保存的原 `SessionFailure`。带 `expected` 的命令在尾部已变时是 `changed`                      | 调用方；`changed` 由 `session` 重做                           |
| `rolled_back`，停止响应为 `unsupported` 或 `failed`      | `unsupported` 为 `invalid`（字段 `command`）；`failed` 为 `unavailable`，诊断带类别                    | 调用方                                                        |
| `unknown`、`writer_not_current`、锁等待超时              | `commit-unknown`                                                                                       | 调用方按原身份 R7                                             |
| 材料缺项或多项                                           | 「不支持」，明确回滚，映射为 `invalid`                                                                 | 调用方                                                        |
| 第 7 步的 `sl_journal` 条件更新影响 0 行                 | 「失败」，`unavailable`，记诊断。这违反第 5 步行锁下的不变量                                           | 诊断                                                          |
| `sl_state` 落后或归约版本不符                            | `unavailable`，`owner` 为本成员。追赶尚未实现，没有自动追赶                                            | R9 自动追赶                                                   |
| `sl_entry` 缺口、损坏、`tail` 不一致                     | 该会话隔离：`readWork` 与 `loadRecovery` 返回 `quarantined`，其余读与写返回 `unavailable`（[R9](#r9)） | 运维按 [SL14](../session-contract/SPEC.md#日志读取投影及恢复) |
| 派生索引重建中                                           | 依赖它的读 `unavailable`，带进度                                                                       | 等待重建                                                      |
| 读失败、读被取消、事务域目录没有该租户、目录答了别的租户 | `unavailable`，`owner` 为本成员，诊断带原因                                                            | 读：存储提供者；目录：应用装配                                |
| 游标签名密钥缺席                                         | 带游标的读（R2、R5、R8、R10、R11）在生成或验证游标时返回 `unavailable`                                 | 装配                                                          |
| 任何 SQL 异常                                            | 不转成业务拒绝；写路径响应「失败」，读路径 `unavailable`                                               | 诊断                                                          |

### 迁移与生命周期

- 迁移片段分两类。权威表的迁移只增列或增表、不改旧列含义、不改位置与身份（`sl_operation` 的访问证据因提供者不允许对 STRICT 表执行 `ALTER TABLE` 而增表，见[操作记录的访问证据](#操作记录的访问证据)）；派生表的迁移可以整体重建。两类都随提供者的原子迁移执行：DDL、数据与迁移标记同事务，失败回到迁移前（[XP-5](#xp-table)）。
- 归约版本升级是一次 `sl_state` 全量重建（R9），不是迁移。它在格式迁移之后、开放写准入之前完成，或在首次治理读时按会话惰性完成。两种方式都是策略配置。
- 本成员没有 Cordis 入口，也没有关闭函数：`createSessionStorage` 返回的端口只持有应用交入的存储、目录、访问裁定与游标签名，不持有连接。应用在装配时把 `sessionStorageMaterials({ readOutputLimitBytes })` 并入材料目录并声明组合，端口在提供者就绪后才可用。会话归属读口 `createSessionPrincipalBindings` 只收存储与目录，不收访问裁定；应用用公开端口的同一存储与同一目录构造它，交给受信服务键 `sessionPrincipalBindings`，所以它按同一目录解析租户；它不读工作快照，不用工作缓存（[BD-01](#bd-01)）。应用在行停止时调用它的 `stop()`。已提交的条目不因端口被丢弃而变得可撤回。
- 提供者关闭期间，写路径可能得到 `commit-unknown` 或 `unavailable`，两者都不当作未提交：`commit` 先对代次 1 调 `query`，关闭后 `query` 答 `unknown`（诊断 `closing`），写路径直接返回 `commit-unknown`；直接走到 `commit` 的路径得到 `closing` 映射的 `unavailable`。真实提供者下实测为前者。在途的语句跑完。读入口随提供者关闭而不可用。

### SQLite 与 PostgreSQL

| 事项       | SQLite（`node:sqlite`）                                             | PostgreSQL（`pg`）                                   | 本成员的处理                                                                                                        |
| ---------- | ------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 64 位位置  | `INTEGER`，以 BigInt 读写                                           | `bigint`                                             | 边界编解码为十进制文本（[TB-03](#tb-03)）                                                                           |
| JSON 载荷  | `TEXT`                                                              | `text`                                               | 两边都用 `text` 加应用层 schema 校验，不用 `jsonb`，避免方言分叉                                                    |
| blob       | `BLOB`                                                              | `bytea`                                              | 同一列名，Kysely 类型映射                                                                                           |
| 写并发     | 单写连接，`BEGIN IMMEDIATE`，事务本来串行                           | `SELECT ... FOR UPDATE` 锁住该会话的 `sl_journal` 行 | 两边都在锁内读尾部，最后做 `tail` 条件更新（[W6](#w6)）                                                             |
| 读连接     | sql-contract 的 `read` 入口                                         | 独立连接，读事务看一致快照                           | 读经 `read` 入口；排队归提供者                                                                                      |
| 部分索引   | 支持                                                                | 支持                                                 | `sl_pending_idx` 等先用普通表保持同形，不用部分索引                                                                 |
| 耐久       | `journal_mode=WAL`、`synchronous=FULL` 由提供者读回；不等于断电试验 | `fsync` 与复制配置                                   | 耐久证据归 [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 的承接方，本成员不宣称 |
| 迁移       | 同连接事务内 DDL 可回滚                                             | 事务性 DDL                                           | 两边都走原子迁移                                                                                                    |
| 大对象去向 | 同库 `sl_blob`                                                      | 同库 `sl_blob`，或对象存储                           | 阈值与去向是策略配置                                                                                                |

## 组合与验证

### 消费的承诺

| 承诺                                                         | 精确位置                                                                                                                                                                            | 本成员怎样消费                                                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit`、`query`、`read` 的结果模型与拒绝顺序，响应证据     | [sql-contract §7 commit](../../storage/sql-contract/SPEC.md#7-commit)、[§8 query](../../storage/sql-contract/SPEC.md#8-query)、[§9 read](../../storage/sql-contract/SPEC.md#9-read) | W1 的映射与读路径路由                                                                                                                                                       |
| 参加者端口、事实格与语句限制                                 | [sql-contract §7.4](../../storage/sql-contract/SPEC.md#74-参加者端口与事实格)                                                                                                       | 参加者模块只用 `execute`，`params` 只用允许的类型                                                                                                                           |
| SQLite 提供者的启动、受理队列、两段回滚、未知条件            | [sqlite-provider 规格](../../storage/sqlite-provider/SPEC.md)                                                                                                                       | 失败分类表                                                                                                                                                                  |
| `SessionTransactionPort` 六条义务                            | [SessionTransactionPort](../session-contract/SPEC.md#sessiontransactionport)                                                                                                        | W1 第 3 步核对完整材料；W1 第 6 步与 W6 对带 `expected` 的七种命令返回 `changed`；TB-04 的保管前提；W1 的尝试代次与 R7 的 `attempt-rejected`；读路径逐页核权；W5 的游标同存 |
| 历史面四个读操作与三个对账读操作的结果与拒绝原因             | [SessionHistory](../session-contract/SPEC.md#sessionhistory)、[SessionReconciliation](../session-contract/SPEC.md#sessionreconciliation)                                            | R2、R5、R8、R10、R11                                                                                                                                                        |
| 事件目录的封套与 38 类                                       | [事件目录](../session-contract/docs/object-model/session-log-events.md#原生事实类别)                                                                                                | `sl_entry` 列与 W3 的派生规则                                                                                                                                               |
| `decide`、`reduce` 与 OP-00 的纯函数，以及它们共用的解释版本 | [领域服务与归约](../session-contract/SPEC.md#领域服务与归约)、[OP-00](../session-contract/SPEC.md#op-00)                                                                            | W1 第 6、7、9 步；W2；W4 第 2 步；R9                                                                                                                                        |
| 模型视图 CM-01 至 CM-06 与消息类型                           | [message SPEC](../../common/message/SPEC.md#模型视图)                                                                                                                               | W4 第 4 步的新 epoch 行；R5 的消息解码；C-01 的视图重算。压缩判定经 `decide` 传递，本成员不直接调用                                                                         |
| `HistoryPage.annotations` 的含义                             | [SessionHistory](../session-contract/SPEC.md#sessionhistory)                                                                                                                        | R2 每页经 R6 填充                                                                                                                                                           |
| 历史源读口 H1 至 H5                                          | [request-context-contract](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图)                                                                                  | R5                                                                                                                                                                          |

### 自有义务的验证

每条义务的验证方法、前提与未覆盖写在 [docs/verification-obligations.md](docs/verification-obligations.md)。下表只给对应关系。全部义务都是后继实现必须通过的可观察结果，不是已执行的测试。例外是真实 sqlite-provider 上的 `tests/real-provider.spec.ts`，它已执行的范围见[已知限制](#已知限制)第 2 条，只覆盖下表「尝试代次与 R7」与「失败分类表」两行里的存储应答部分（未提交身份、关闭、两种限额）。

| 义务                      | 验证                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C-01 派生等于重算         | 影子表集合差，随机命令序列                                                                                     |
| C-02、C-03 分页完整与游标 | 属性测试与篡改用例                                                                                             |
| C-04 前缀摘要             | 属性测试                                                                                                       |
| W1 至 W6 写路径           | 每个 JC 行一个用例，核对派生行与 `sl_state`                                                                    |
| `decide` 往返             | `reduce(前状态, decide(...) 的批次)` 等于命令要求的后态与提交后的 `sl_state`                                   |
| R6 页内标注               | 跳转读取，`annotations` 与按 SE33 全量扫描的集合比较                                                           |
| R1 至 R11 复杂度与退化    | 基准：N 从 10³ 到 10⁶，R1、R3、R5、R7、R8 不随 N 增长，R2 随 K 与 B 线性                                       |
| W6 并发写裁定             | 两个进程并发提交同一会话：后到者在新尾部上裁定，带 `expected` 的命令得到 `changed`，其余命令按新状态裁定       |
| 尝试代次与 R7             | 每种代次回执组合一个用例，核对选中的代次、`recovered`、`commit-unknown`、`attempt-rejected` 与 `not-committed` |
| 断电耐久                  | 故障注入，介质声明；归 SQL-T01                                                                                 |
| 失败分类表                | 每行一个注入用例                                                                                               |

### 明确缺项

| 缺什么                                                                                                                                                  | 谁来补                                                                                                           | 补上之前本成员怎样表现                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 本节「实现现状」列出的尚未实现的设计：`sl_batch`、条目一侧的 `payload_ref`、`sl_ref_idx`、R9 追赶与重建、PostgreSQL                                                    | 本成员                                                                                                           | 见[实现现状](#实现现状)；这些条款不得写成已验证                                                                                                                                                                                                                          |
| 对象存储作为 blob 去向                                                                                                                                  | [issue 541](https://github.com/nemori-ai/omne-harness-lite/issues/541)                                           | 只有同库 `sl_blob`                                                                                                                                                                                                                                                       |
| 超过 `maxCommandBytes` 的内容先由内容拥有者保管、再以耐久引用进入条目的链路（Session 契约的[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)） | 存储的拥有者与各内容拥有者                                                                                       | 条目只带已达到耐久条件的引用（[TB-04](#tb-04)）。拿不到耐久引用时命令返回 `unavailable`                                                                                                                                                                                  |
| 数值目标：每页延迟、每秒提交数、重建时长、`maxScanPerPage` 与 `pageBytes` 的初值                                                                        | 本成员，按验证计划实测后写进本页的声明边界                                                                       | 不声明任何数值。策略配置没有默认值时装配必须给出                                                                                                                                                                                                                         |
| 断电耐久                                                                                                                                                | [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 的承接方                       | 本成员只声明进程级持久依赖提供者读回的 `synchronous=FULL`，不宣称断电耐久                                                                                                                                                                                                |
| 登记键到能力身份的绑定（R10 的 `capability` 列）                                                                                                        | Tool 契约与事件目录对 SE08 载荷的细化                                                                            | 本成员假定 SE08 的登记键按能力身份列出；不成立时 `ResidentReference.capability` 不可填，R10 不可用                                                                                                                                                                       |
| 从 `SessionOperationId` 辨认参加操作的入口，例如身份编码带派生种类，或 `queryOperation` 的输入带种类（[R7](#r7)）                                       | Session 契约拥有者                                                                                               | R7 对未命中的操作一律探查代次，代次 1 为 `not_committed` 时返回 `unknown`，不给 `not-committed`。Session 提交的操作仍可用同一身份重做命令，由 [W1 的尝试代次](#w1-attempts)选代次。协调器与调度器发起的操作停在 `unknown` 时，靠 S1、S3 等触发者以同一身份再次触发才收敛 |
| `accept` 的上限或背压策略：一个会话的待处理输入数上限，与超限时的拒绝原因（[W1 的代价与退化](#w1-cost)）                                                | 本成员提出字段与初值；超限的拒绝原因归 Session 契约拥有者                                                        | 没有上限。积累 P 条待处理输入的会话，每次 `accept` 的代价是 O(P)                                                                                                                                                                                                         |
| 压缩覆盖范围的条目数上界（[W4](#w4)）                                                                                                                   | [request-context-contract](../../context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界) 的拥有者 | W4 在写事务里读出 `covers` 的全部条目，代价随覆盖范围线性增长。SQLite 下同一事务域的其他提交在此期间等待                                                                                                                                                                 |
| 撤销归档之后，作用域引用会不会被复用（[W3](#w3) 的 SE28 行）                                                                                            | 执行环境契约的拥有者                                                                                             | 撤销归档时删除该会话在 `sl_released_scope_idx` 的行，R11 不再返回这些作用域。作用域引用若被复用，本成员不区分新旧两次使用                                                                                                                                                |
