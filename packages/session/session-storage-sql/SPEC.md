# @omne-harness/session-storage-sql 行为规格

状态：存储成员，`draft`。head `80852180e` 已实现事务端口、参加者模块、八个读 handler 与静态材料，只经 [sql-contract](../../storage/sql-contract/SPEC.md) 的公开形状使用 SQL；本页其余条款是设计目标，实现覆盖范围见下文[实现现状](#实现现状)。本成员是 Session 组里唯一接触介质的成员。它用 SQL 表兑现 [session-contract](../session-contract/SPEC.md) 声明的 `SessionTransactionPort`：提交、权威读、原操作查询、控制操作查询、模型选择读、历史读、epoch 视图读、待办扫描、引用查询与已释放作用域读。治理规则不在本页，本页只写表、索引、写路径、读路径、符合性与介质差异。

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。表与索引的列、键与约束在 [docs/object-model.md](docs/object-model.md)，写路径、压缩提交与派生重建的时序在 [docs/flows.md](docs/flows.md)，验证义务在 [docs/verification-obligations.md](docs/verification-obligations.md)。

## 范围与依据

本成员拥有四类东西：

1. 权威表与派生索引的 SQL 形状，以及它们的迁移片段。
2. 存储契约的参加者模块 `session`。它在存储提供者的 Worker 内、在一次 `commit` 的事务里执行 Session 的事实语句。
3. `SessionTransactionPort<P>` 的 SQL 实现：把 Session 的命令翻译成存储契约的一次提交，把读操作翻译成 SQL 读取。
4. 读路径 R1 至 R11 的算法与符合性套件。

本成员不拥有：治理规则与领域服务（归 [session-contract](../session-contract/SPEC.md#领域服务与归约)）、命令处理流水线的事务外部分（归 [session](../session/SPEC.md#cp-命令处理器流水线)）、邻域翻译（归 [session-adapters](../session-adapters/SPEC.md)）、提交协议与回执（归存储契约）、条目缓存与快照缓存（归 `session`）、视图前缀摘要缓存（归 `session-adapters`）。

本页依据下列正文。本页只细化存储，不削弱它们。

| 依据 | 位置 |
| --- | --- |
| 日志不变量 SL01 至 SL14、提交与查询结果、读取与恢复 | [session-contract SPEC](../session-contract/SPEC.md#session-log-的长期不变量) |
| `SessionTransactionPort` 的义务、端口表 | [构造依赖端口与出站端口](../session-contract/SPEC.md#构造依赖端口与出站端口) |
| 历史面四个读操作、`SessionReconciliation` 的三个读操作 | [SessionHistory](../session-contract/SPEC.md#sessionhistory)、[SessionReconciliation](../session-contract/SPEC.md#sessionreconciliation) |
| 共同提交表 JC-01 至 JC-28、参加者流水线 | [共同提交与共享事务域](../session-contract/SPEC.md#共同提交与共享事务域) |
| 事件封套、九族 38 类、效力、不进入日志的内容 | [事件目录](../session-contract/docs/object-model/session-log-events.md) |
| 解释进度随解释提交保存 | [EC-02](../session-contract/SPEC.md#ec-02) |
| 引用查询的索引维护与引用定义 | [常驻工具与会话冻结](../session-contract/SPEC.md#常驻工具与会话冻结) |
| 已释放作用域的账本 | [ScopeReleasePort](../session-contract/SPEC.md#scopereleaseport) |
| 推理续接状态不建索引 | [推理续接状态](../session-contract/SPEC.md#推理续接状态) |
| 压缩记录形状、保留名单与模型视图 CM-01 至 CM-06 | [message SPEC 模型视图](../../common/message/SPEC.md#模型视图) |
| 历史源读口与 epoch 视图 H1 至 H5 | [request-context-contract](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图) |
| 公开形状 | [session-contract public-api](../session-contract/docs/public-api.md) |
| 存储契约：操作身份、提交、查询、响应证据、参加者端口、读入口、关闭协议 | [sql-contract 规格](../../storage/sql-contract/SPEC.md)、[sqlite-provider 规格](../../storage/sqlite-provider/SPEC.md) |
| 技术选择：Kysely 加 `node:sqlite`，经配置切换 PostgreSQL，没有内存实现 | [技术基础](../../../docs/architecture/technical-foundations.md#共同技术选择)、[基础设施政策](../../../docs/architecture/deployment/infrastructure-policy.md) |
| 耐久边界与 SQL-T01 | [已确认保存的耐久边界](../../../docs/architecture/data-and-state.md#已确认保存的耐久边界)、[SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) |
| 组内落位 | [组架构](../docs/architecture.md)、[组流程](../docs/key-flows.md) |

### 实现现状

<a id="实现现状"></a>

本节记录 head `80852180e` 的源码事实。「已实现」指 `src/` 里有对应代码并有用例；用例的覆盖范围见[自有义务的验证](#自有义务的验证)。本页其余章节写的是设计目标，与本节不一致处以本节为准，直到该条款被实现或被拥有者改写。

| 条款 | 现状 |
| --- | --- |
| 根入口导出 | `createSessionStorage`、`sessionStorageMaterials`、`SESSION_PARTICIPANT` 和类型 `SessionStorageOptions`、`SessionStorageMaterials`。没有 `./cordis` 子路径，也没有该源文件。会话存储组合由应用承担，本成员不建 Cordis 服务、目录或组合登记 |
| SQL 依赖 | 只从 `@omne-harness/sql-contract` 与 `@omne-harness/sql-contract/worker` 导入。不导入 `packages/storage/**` 内部，不依赖 `@omne-harness/sqlite-provider`，源码里没有 `node:sqlite` |
| 端口操作 | `commit`、`readWork`、`readInput`、`queryOperation`、`queryControlOperation`、`readModelSelection`、`history`（`begin`、`next`、`since`、`readModelView`）、`pending`、`references`、`releasedScopes` 已实现。`commitEntries` 恒返回 `unavailable`，见[已知限制](#已知限制) |
| 静态材料 | 一个参加者 `session`（`grouping` 为 `singleton`）、一个迁移 `session/001-session-log`、八个 `snapshot` 读 handler：`session.work`、`session.input`、`session.model-selection`、`session.history`、`session.model-view`、`session.pending`、`session.references`、`session.released-scopes`。每个模块带文件摘要 |
| 当前表 | `sl_journal`、`sl_entry`、`sl_operation`、`sl_state`、`sl_input`、`sl_model_view`、`sl_annotation_idx`、`sl_pending_idx`、`sl_resident_idx`、`sl_released_scope_idx`，另有 `sl_kind_idx` 与 `sl_operation_revision_idx` 两个二级索引。列见[对象模型](docs/object-model.md) |
| 尚未实现的设计 | `sl_batch`、`sl_blob`、`sl_ref_idx`、`sl_rebuild`；TB-04 的内联阈值与外置载荷；R9 的追赶与重建、`fold_version`、解释版本记录与隔离；R4 的按关联定位；PostgreSQL；`maxScanPerPage` 与读路径的逐条披露核对；配置项「内联阈值」「大对象去向」「快照重建方式」。`sl_state` 落后时 handler 返回 `behind`，端口映射为 `unavailable`，没有自动追赶 |
| 与设计的差异 | 提交身份的 `protocolVersion` 为 `2`，`scope` 为租户域，`operationKey` 为 `<SessionOperationId>#<代次>`。待办原因有八个，含 `initialization`（与 `PendingReason` 一致，下文 W3 与 R8 写「七个」处按八个读）。`sl_operation.form` 有 `batch`、`control`、`answer` 三种，`answer` 行没有 `revision`。尝试代次上限初值为 8，游标有效期初值为 15 分钟。`commit` 先对各代次调用存储 `query`，不先点查 `sl_operation`；参加者模块不另核对材料集合，交给 `decide`；提交结果从回执的响应证据取出，不读回 `sl_operation` |
| R7 的差异（待裁定） | 规格要求辨认参加操作的入口缺席时，代次 1 为 `not_committed` 返回 `unknown`。源码在代次 1 返回 `not-committed`，依据为本成员生成的排除证据。两者不一致，本成员没有采用任何一边：拥有者裁定之前，调用方不得把这里的 `not-committed` 当作参加操作也未提交的证明 |

### 已知限制

<a id="已知限制"></a>

1. `commitEntries` 目前返回 `unavailable`（`owner` 为本成员）。原因是 session-contract 还没有 entries 解释的纯范围检查，本成员无法判断范围，所以拒绝，不对未检查的范围返回成功。session-adapters 的内存提供者对同一操作做同样的拒绝。
2. 测试夹具在 `node:sqlite` 的内存库上运行本成员的真实 participant 与 handler 模块，每个事务域一个库。它不覆盖 sqlite-provider 的 Worker、持久、受理队列、关闭与限额。夹具通过只说明模块在 SQL 语义上成立，不证明提供者行为。
3. 本批新增行为（读路径路由、控制答案、模型选择、游标绑定）没有先红后绿的记录。本成员以负控用例代替：租户隔离、跨租户域目录、游标篡改与未授权访问各有反例用例。负控只说明这些反例被拒绝，不说明旧实现曾失败。
4. 上一节「尚未实现的设计」各项都是已知限制。它们在实现之前不得写成已验证。
5. 偏离：材料集合核对（W1 第 3 步；session-contract「SessionTransactionPort」义务 1、2）。现行条款要求按命令种类核对 `guards` 的完整材料集合，缺一项或多一项答「不支持」。共同提交表的「参加者」列只有文字，没有可核对的 `owner`、`participant`、`protocol` 取值，身份桥、证据桥与 Context 输入在生产中也尚未实现，所以本成员现在只执行契约已固定的两处核对：`create` 与 `completeInitialization` 的 `session-initialization` 材料，`startRun` 的 `login-entry` 材料；其余命令的 `guards` 原样带入，不核对集合。退出条件：真实身份桥、证据桥与 Context 输入接入 Session 时，由 session-contract 的拥有者补导出逐命令材料表，本成员随之核对缺项与多项。条款原文不改（Reduce 裁定，#1000）。


### 两个「事务端口」

存储契约把参加者模块在 Worker 内拿到的语句端口叫 `TransactionPort`，只有一个方法 `execute(sql, params)`。Session 契约把本成员要实现的端口叫 `SessionTransactionPort<P>`，它是进程内的服务对象，有提交、读与查询操作。两者不是同一个接口。本页写「语句端口」指前者，写「事务端口」指后者。

| 事务端口的操作 | 本成员怎样兑现 |
| --- | --- |
| `commit` | 翻译为存储契约的一次 `commit`。参加者模块 `session` 在 Worker 内经语句端口写事实，见 [W1](#w1) |
| `readWork` | R1 |
| `readInput` | R3 |
| `queryOperation` | R7 |
| `queryControlOperation` | R7，同一路径，只认控制答案 |
| `readModelSelection` | 读 handler `session.model-selection` |
| `commitEntries` | 恒返回 `unavailable`（[已知限制](#已知限制)） |
| `history.begin`、`history.next`、`history.since` | R2 |
| `history.readModelView` | R5 |
| `pending` | R8 |
| `references` | R10 |
| `releasedScopes` | R11 |

### 存储契约入口的采用

存储契约现在是 [sql-contract](../../storage/sql-contract/SPEC.md)，它的公开形状已经提供本成员原先期望的六项入口。本成员只经这些公开形状使用 SQL，不依赖提供者实现。表中编号保留，因为其他条款引用它们。

<a id="xp-table"></a>

| 编号 | 入口 | 采用方式 |
| --- | --- | --- |
| XP-1 | 参加者模块登记 | `sessionStorageMaterials()` 返回 `ParticipantDescriptor`，应用把它并入材料目录并声明组合。本成员不登记 |
| XP-2 | 参加者业务响应通道 | 模块返回 `participated`、`conflict`（带依据）、`unsupported`、`failed`。响应证据与回执同事务保存，端口从证据还原结果，不在事务外重算（[W1 第 9 步](#w1)） |
| XP-3 | 事务外读入口 | `SqlStorage.read`，八个 handler，`ordering` 为 `snapshot`，每页一个有界事务。每次读带随机 `requestKey` |
| XP-4 | `SqlValue` 与 `QueryRows` | 位置列以 `bigint` 读写，其余为文本。形状见 sql-contract §10 |
| XP-5 | 迁移挂接 | `MigrationModule` 由提供者在原子迁移里执行。本成员的 `verify` 核对十张表都在 |
| XP-6 | 事务域目录 | 应用提供 `TenantDomainAccess`。每次调用先 `resolve` 本租户的域；系统读用 `snapshot` 枚举。目录项指向别的租户或别的作用域时拒绝使用 |

存储对 SQLite 提供者的独立读连接由 sql-contract 的 `read` 入口闭合，不再是缺项。读与提交是否在同一个 Worker 内串行是提供者的事，见 [sqlite-provider 规格](../../storage/sqlite-provider/SPEC.md)。

TB-04 的大载荷保管链路仍是 Session 契约记下的[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)，本成员现在不写 `sl_blob`。


### 参加者模块与材料

本成员只向存储契约登记一个参加者，名字是 `session`。它在两种提交里出现：

- Session 为提交方的命令（JC-01 至 JC-05、JC-07、JC-08、JC-10、JC-13 至 JC-24、JC-28，以及 JC-11 的「Agent 记录已删除」分支）：本成员的 `commit` 把 `SessionCommand` 与全部 `GuardCommand` 放进同一条 `FactCommand`，`participant` 为 `session`，`facts` 为 `{ command, guards }`。桥交来的材料由 `session` 模块在事务里核对，不翻译成各自独立的存储参加者。
- 执行记录提供者为提交方的四种交接（JC-06、JC-09、JC-11、JC-12）：执行记录提供者的提交里有一条 `participant` 为 `session` 的命令，`facts` 是契约 P-2 规定的 `Participation` 与版本化载荷。两个只读参加（JC-26、JC-27）同样经这条命令到达，`facts` 带只读意图。

组合版本由应用在装配时声明：参加者列表为 `session` 加执行记录提供者声明的参加者名，`combinationVersion` 与 `manifestDigest` 经 `SessionStorageOptions.combination` 交入，本成员原样放进每次提交请求。契约 P-1 要求两者在同一个事务域。本成员不登记别的参加者名，也不计算清单摘要；桥的材料不是存储参加者。

## 结果与不变量

### 记号

N 为该会话条目总数。K 为本页实际扫描条目数。B 为本页读出字节。k 为过滤的 `kind` 数。p 为本页返回行数。D 为检查点之后的条目数。M 为所查索引的规模。T 为本部署的事务域数。全部复杂度按有序索引（B 树）估，SQLite 与 PostgreSQL 相同。

### 表、索引与位置

本节与下文 W3、R9 写的是设计目标表集。head 已实现的表集是[实现现状](#实现现状)的「当前表」，缺少 `sl_batch`、`sl_blob`、`sl_ref_idx` 与 `sl_rebuild`，并多出 `sl_input`；`sl_operation` 多 `form` 与 `result` 两列。以实现现状为准，直到差异被实现或被拥有者改写。

<a id="tb-01"></a>

**TB-01 权威五表与 blob。**下列表在共同提交内写入，是会话日志的权威形状。列、键与约束见[对象模型](docs/object-model.md#当前实现的表)。

| 表 | 每行 | 键 |
| --- | --- | --- |
| `sl_journal` | 一个会话：租户、来源身份、`tail`、提交序号、当前 epoch 与它的基位置 | `(tenant, session)` |
| `sl_batch` | 一次提交：操作身份、首末位置、条目数、字节数、提交时间、解释版本、回执证据 | `(tenant, session, commit_seq)` |
| `sl_entry` | 一个条目：封套各字段、载荷或载荷引用、字节数、内容摘要 | `(tenant, session, position)` |
| `sl_operation` | 一个 Session 操作：规范化参数摘要、提交序号、原回执 | `(tenant, session, operation)` |
| `sl_state` | 一个会话的 `WorkSnapshot` 物化：只含未结部分、归约版本、`covered` | `(tenant, session)` |
| `sl_blob` | 一段超过内联阈值的载荷：字节、大小、媒体类型 | `(tenant, digest)` |

`sl_state` 只物化未结状态：`pending`、`handed`、`waiting`、未释放的 `consumptions`、停在 propagating 的 `controls`、`tasks`、`unresolved`、`idle`、`run`、`frozen`、`residents` 与声明修订。已释放的消费与已对账的控制只留在日志里。它的大小随未结工作增长，不随历史长度增长。

<a id="tb-02"></a>

**TB-02 派生七索引。**下列索引在同一提交内维护，可以从 `sl_entry` 重建。它们不是第二份权威。

| 索引 | 键 | 为谁服务 |
| --- | --- | --- |
| `sl_kind_idx` | `(tenant, session, kind, position)` | R2 的 `kinds` 过滤 |
| `sl_ref_idx` | `(tenant, session, ref_kind, ref_id, position)` | R3、R4、R10 的 shape 定位 |
| `sl_model_view` | `(tenant, session, epoch, seq)` 加 `position`、`bytes`、`prefix_digest` | R5 |
| `sl_annotation_idx` | `(tenant, session, target_from, target_to, position)` | R6，即 R2 每页的 `annotations` |
| `sl_pending_idx` | `(tenant, reason, session)` | R8 |
| `sl_resident_idx` | `(resident_key, tenant, session)` 加 `capability`、`admitted_position` | R10 |
| `sl_released_scope_idx` | `(tenant, session, scope)` 加 `task`、`position` | R11 |

本成员不为推理续接状态部件建任何索引，也不建推理回放索引。部件随 SE10 的内容块留在 `sl_entry.payload` 里。

<a id="tb-03"></a>

**TB-03 位置是 64 位整数。**`position` 在一个会话内严格递增，相邻提交的位置连续，批内按条目顺序递增。`commit_seq` 从 1 起每次提交加一。SQLite 用 `INTEGER` 并以 BigInt 读写，PostgreSQL 用 `bigint`。契约层的 `EntryId` 与 `SessionRevision` 仍是品牌字符串：`EntryId` 是该条目 `position` 的十进制文本，`SessionRevision` 是会话 `tail` 的十进制文本。编解码只发生在本成员的边界，`session` 与 `session-adapters` 不解析它们。`seq` 与 `epoch` 同样是 64 位整数，在 `ModelViewBasis` 与 `ModelViewRow` 里是十进制文本。

<a id="tb-04"></a>

**TB-04 载荷的内联与外置。**载荷的 UTF-8 字节数不超过内联阈值时写在 `sl_entry.payload`，超过时写入 `sl_blob`，条目只存 `payload_ref`（摘要）与 `payload_bytes`。阈值是策略配置，初值 16 KiB，由装配给出。blob 与条目在同一事务里写入，先写 blob 再写条目。对象存储作为去向待[对象或文件存储契约](https://github.com/nemori-ai/omne-harness-lite/issues/541)，闭合前只有同库 blob 表。一次提交里 `facts` 的总字节受存储契约的 `maxCommandBytes` 限制。超过它的内容不能走本成员的内联或 blob，必须先由内容拥有者可靠保管，再以耐久引用进入条目（[SL08](../session-contract/SPEC.md#日志提交与查询结果)）。

### 写路径

<a id="w1"></a>

**W1 Session 为提交方的提交。**`SessionTransactionPort.commit` 按下列步骤执行。`session` 的流水线（[CP-01](../session/SPEC.md#cp-01)）在事务外完成它的第 1 至第 4 步，本成员从 CP-01 的第 5 步接手。时序见[写路径](docs/flows.md#写路径session-为提交方)。

1. 选尝试代次并构造存储操作身份。代次的规则见下文的[尝试代次](#w1-attempts)。身份的 `scope` 与 `transactionDomain` 取自应用目录里该租户的事务域，`operation` 为 `SessionOperationId`，`operationKey` 为 `<SessionOperationId>#<代次>`，`protocolVersion` 为 `2`。规范化 `{ command, guards }` 为 JSON 值：位置、序号与 epoch 都是十进制文本，租户与工作区经 legal-identity 的编码写成带标记的文本，没有 BigInt、`undefined`、`Date` 或函数。Session 操作的输入摘要由 `commandDigest` 给出，写进 `sl_operation.input_digest`。调用前先向访问裁定取一次当前决定，访问不指名该命令的租户与会话时直接 `denied`。经委派视图提交时不取决定，改为核对视图绑定的请求与本次命令（租户、Session、命令摘要），不一致答 `denied`，证据取自绑定。
2. 调用存储契约的 `commit`，命令数组只有一条 `participant` 为 `session` 的命令。`rejected_before_accept` 映射为 `unavailable`，不改写为业务拒绝；其中 `writer_not_current` 映射为 `commit-unknown`。`unknown` 映射为 `commit-unknown`。`identity_conflict` 说明同一 Session 操作的另一次尝试已经用了这个代次：已有回执为 `committed` 时，端口从该回执的响应证据取出原结果，摘要相同则返回，`recovered` 为真，摘要不同则返回 `conflict`；已有回执为 `rolled_back` 时，回到第 1 步选下一个代次。
3. Worker 内，`session` 模块收到 `facts` 与语句端口。先核对材料：每个 `GuardCommand` 的 `owner`、`participant`、`protocol` 与该命令种类要求的材料集合一致。集合按[共同提交表](../session-contract/SPEC.md#共同提交与共享事务域)的「参加者」列固定在本成员的材料表里。缺一项或多一项，响应「不支持」，不写任何行。
4. 点查 `sl_operation`，得到该操作的 `OperationRecord`，没有时为 null。认回由第 6 步的 `decide` 判定，本步只读行。
5. 锁住并读 `sl_journal`，再读 `sl_state`。PostgreSQL 下用 `SELECT ... FOR UPDATE` 锁住该会话的 `sl_journal` 行，同一会话后到的事务在这里等待，前一个事务提交后才读到新尾部。SQLite 只有一个写者，事务本来就串行，不另加锁。`sl_state.covered` 不等于 `sl_journal.tail`，或归约版本不是当前版本：响应「失败」，原因为 `unavailable`，`owner` 为本成员，由 R9 追赶后重试。核对通过时，交给 `decide` 的快照的 `revision` 等于 `tail`。
6. 调用 `session-contract` 的 `decide(快照, command, guards, 操作记录)`（[领域服务与归约](../session-contract/SPEC.md#领域服务与归约)）。`decide` 认回原操作，按命令调用领域服务与守卫。命令带 `expected` 时，`decide` 还比较 `expected` 与快照的 `revision`。带 `expected` 的命令只有七种：`reload`、`release`、`finishRun`、`recordIdle`、`bindExternalCall`、`completeExternalConsumption` 与 `commitDerived(context-reminder)`。其余命令不带 `expected`，`decide` 按 `sl_state` 的当前状态重新裁定，不产生 `changed`。本成员不另调用领域服务，也不另写允许或拒绝的规则。按 `Decision` 的三种结果处理：
   - `recovered`：响应「参加」，不写行。提交方的提交照常成立，`commit` 之后读回原回执，`recovered` 为真。
   - `rejected`：响应「冲突」，依据为其中的 `SessionFailure`。带 `expected` 的命令在 `expected` 不等于 `tail` 时得到 `changed`，并带当前 `revision`。同操作不同输入摘要时得到 `conflict`。
   - `entries`：继续第 7 步。
7. 为 `decide` 产出的 `EncodedEntry` 逐条分配 `position`，补上 `id` 与 `revision`（[TB-03](#tb-03)）。先写 blob，再写 `sl_entry`，再写 [TB-02](#tb-02) 的派生行，见 [W3](#w3)。调用 `reduce(前状态, 本批次)`，得到新快照。`decide` 与 `reduce` 共用同一解释版本，`reduce` 解释 `decide` 的批次必须得到命令要求的后态。`reduce` 返回 `quarantined` 说明两者不互逆，这是契约实现的缺陷：响应「失败」，不写任何行。替换 `sl_state`，比较新旧快照维护 `sl_pending_idx`。写 `sl_batch`、`sl_operation`，最后以 `UPDATE sl_journal ... WHERE tail = 第 5 步读到的 tail` 更新 `tail` 与 `commit_seq`。这条更新影响 0 行时响应「失败」，结果映射为 `unavailable`，并记诊断。第 5 步的锁在位时这不应发生，发生即说明违反了不变量。
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

**W1 的代价与退化。**每次提交读出整行 `sl_state` 交给 `decide`，`reduce` 之后整行替换，重算快照摘要，再比较新旧快照维护 `sl_pending_idx`。代价是 O(|sl_state|)，与历史长度 N 无关。`sl_state` 随待处理输入、未结工作与常驻集合（`residents` 只追加）增大而线性增长。退化条件：一个会话积累 P 条待处理输入而没有 Run 消费它们时，每次 `accept` 的代价是 O(P)，累计 O(P²)。约束它要靠 `accept` 的上限或背压策略，策略字段的初值只是配置初值。现有配置与契约都没有这一项，见[明确缺项](#明确缺项)。

<a id="w2"></a>

**W2 Session 为参加者的提交。**执行记录提供者发起的提交里，`session` 模块按 [W1](#w1) 第 3 至第 7 步执行，差别如下。时序见[参加者路径](docs/flows.md#写路径session-为参加者)。

- 第 3 步的材料是带 `Participation` 的 Session 命令与版本化载荷。`joint` 不是四种之一，或缺项：响应「不支持」。
- 第 4 步的操作身份按 OP-00 从 execution、提交方操作身份与 `joint` 派生。
- 参加的命令没有 `expected`。事务本身保证提交方读到的状态与写入的状态一致。
- 第 6 步的 `decide` 走参加分支，在其中调用 `judgeAdvance`。压缩分支的判定也在 `decide` 里，本成员只备齐它需要的历史输入（[W4](#w4)）。
- 第 7 步的批次与新快照同时更新 `ExecutionRef.revision` 与 `evidence`。
- 只读参加（JC-26、JC-27）只执行第 3 至第 6 步，不写行，不更新快照。
- 本成员不调用 `COMMIT`，也不能结束提供者的事务。提交方失败时两侧都不保存。

<a id="w3"></a>

**W3 派生行与条目同事务。**下表是每类条目必须同批写入的派生行。没有「条目有、索引无」的可见状态。

| 条目 | 派生行 |
| --- | --- |
| 任何条目 | `sl_kind_idx` 一行 |
| `refs` 里有 `input`、`consumption`、`run`、`attempt`、`card`、`control` 的条目 | `sl_ref_idx` 每个引用一行 |
| SE10 且内容块有 `toModel` 为真的部分，且不是压缩记录 | `sl_model_view` 当前 epoch 追加一行，`seq` 加一，`prefix_digest = H(上一行 prefix_digest ‖ 本条目 digest)` |
| SE10 压缩记录 | `sl_model_view` 新 epoch，见 [W4](#w4) |
| `refs.target` 非空的条目（SE33，以及其他指向旧条目的标注） | `sl_annotation_idx` 一行，`target_from` 与 `target_to` 为引用范围的首末位置，单条目时两者相等 |
| SE08 | `sl_resident_idx`：把该会话的行集合替换为本次记下的登记键集合，每个键一行，`capability` 取自登记键所属的能力身份，`admitted_position` 为该能力 SE36 的位置 |
| SE26 | 会话已归档时，删除该会话在 `sl_resident_idx` 的全部行 |
| SE27 | 删除该会话在 `sl_resident_idx` 的全部行。归档同批以 SE26 取消未终结 Run，所以已归档的会话没有未终结 Run |
| SE28 | 按最近一条 SE08 的登记键集合重建该会话在 `sl_resident_idx` 的行。删除该会话在 `sl_released_scope_idx` 的全部行，因为这个索引只收已归档会话的释放读回 |
| SE25 且载荷是作用域释放的读回，处置含 `released`，会话已归档 | `sl_released_scope_idx` 每个已释放作用域一行，`task` 为原任务操作身份。同一 `(tenant, session, scope)` 重复读回只保留首次位置 |
| 快照里进入或离开某个待办原因 | `sl_pending_idx` 增删，原因按 `PendingReason` 的八个取值：`initialization`、`unresolved`、`controls`、`tasks`、`inputs`、`run`、`idle-armed`、`release`。规则见下文 |
| 载荷超过内联阈值 | `sl_blob` 一行，条目只存引用 |

常驻工具与会话冻结的三类事件：SE36 写 `sl_kind_idx` 与 `sl_ref_idx(run)`（随 `startRun` 或 `reload` 时），快照的 `residents` 追加一项。SE37 写 `sl_kind_idx`，快照的 `frozen` 置为非空，`sl_resident_idx` 不变。SE38 写 `sl_kind_idx` 与 `sl_ref_idx(input)`，快照的 `pending` 移除对应输入。

`sl_pending_idx` 的每个原因只由快照决定，不读时间，所以提交时就能准确维护（[`PendingReason`](../session-contract/SPEC.md#sessionreconciliation)）。本成员对新旧快照逐个原因求值：旧快照不满足、新快照满足时加一行，反过来删一行，两者相同时不动。

| 原因 | 新快照满足的条件 |
| --- | --- |
| `unresolved` | `unresolved` 非空 |
| `controls` | 有停在 propagating 的控制 |
| `tasks` | `tasks` 非空 |
| `inputs` | 待处理输入非空 |
| `run` | 有未终结的 Run |
| `idle-armed` | 自动归档已启用、未豁免，且没有未终结的 Run。是否到期由扫描时的 `judgeIdle` 裁定，本成员不判断到期 |
| `release` | 任一 `ResultConsumption` 的 `custody` 或 `completion` 非空且 `release` 为 pending |

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

<a id="w5"></a>

**W5 解释进度随解释提交保存。**快照内每个执行的 `ExecutionRef.readThrough` 是 Session 对 Agent 事件的解释进度（[EC-02](../session-contract/SPEC.md#ec-02)）。它与同日志解释产生的后果、该次 Session 操作的答案在同一次解释提交中保存。不产生后果的事件不单独提交，持久进度随下一次解释提交前进。`receive` 不接收 Agent 事件，不推进 `readThrough`。序号不大于快照当前 `readThrough` 的事件已经随它的后果提交过，重读时按原 execution 与事实身份认回，`readThrough` 不回退。`readThrough` 与会话状态在 `sl_state` 同一行，没有单独的进度表。

<a id="w6"></a>

**W6 并发写的裁定。**同一会话的两次提交只允许一个后继。SQLite 由单写连接与 `BEGIN IMMEDIATE` 串行化。PostgreSQL 由 [W1 第 5 步](#w1) 对 `sl_journal` 该行的 `SELECT ... FOR UPDATE` 串行化：后到的事务等前一个提交，再读到新尾部。所以两种介质下后到的事务都在新尾部上执行 `decide`：带 `expected` 的七种命令在 `expected` 不等于新尾部时得到 `changed`；其余命令按新状态重新裁定，不产生 `changed`。第 7 步的 `UPDATE ... WHERE tail = 第 5 步读到的 tail` 是最后一道核对，影响 0 行按「失败」处理并映射为 `unavailable`。本成员不用进程内锁或内存 CAS 代替这条核对。

### 读路径

每条读路径先按身份与披露边界核权，再读取。核权失败返回 `denied` 或 `invalid`，不返回空页。提供者不可用、索引重建中或读入口缺席返回 `unavailable`，不返回空页。读路径不写任何行，不发通知。

**读路径路由**（SQL r2 第 17 节）。每个公开读先向访问裁定取一次当前决定；经委派视图的读不取决定，只核租户与 Session 等于绑定，再按调用指名的租户向应用目录取事务域，随后经 `SqlStorage.read` 交给 handler。租户与会话随输入送入 handler，handler 的每条语句都按两者过滤。路由如下：

| 公开入口 | 路由 |
| --- | --- |
| `commit` | 写路径，参加者 `session`，响应证据保存原失败依据 |
| `readWork`、`readInput`、`readModelSelection`、`history.begin`、`history.next`、`history.since`、`history.readModelView`、`pending` | `snapshot` 读，每页一个有界事务 |
| `references`、`releasedScopes` | 系统读：按租户顺序逐个租户域各做一次 `snapshot` 读。不声称跨域的单一快照。目录枚举失败、目录项不属于任何租户、任一域读失败，整次读返回 `unavailable`，不返回较短的页 |
| `queryOperation`、`queryControlOperation` | 写路径先查原回执（一次意图为 `query` 的提交），未命中再按原归属对各代次调用存储 `query`（[R7](#r7)） |

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

游标是签名的自描述值，服务端不保存读会话。签名载荷含游标种类（`history`、`model-view`、`pending`、`references`、`released-scopes`）、租户、会话（系统读与待办为空）、过期时间与续读状态；历史游标的续读状态含边位置、固定上界、方向、`kinds` 与 `pageBytes`。验证时依次核对：签名密钥可读（不可读为 `unavailable`）、签名有效、种类、租户与会话与本次调用一致、未过期。任一不符为 `invalid`。游标不含主体摘要：每次续读都重新向访问裁定取当前决定。过期时间由 `cursorTtlMs` 给出，初值 15 分钟。签名密钥归装配，经 `sessionCursorSigning` 注入。

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

**实现状态：**`queryOperation` 与 `queryControlOperation` 共用同一条查找路径：先经一次意图为 `query` 的提交读 `sl_operation`，会话不存在时 `denied`；命中后按 `form` 区分：`queryOperation` 只认 `batch`，`queryControlOperation` 只认 `control` 与 `answer`，认错种类返回 `conflict`（SL07）。未命中时才对各代次调用存储 `query`。代次 1 的差异见[实现现状](#实现现状)的 R7 一行。

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

引用的定义归契约：会话当前记下的登记键含该键且会话未归档；冻结而未归档的会话算引用；已归档的会话不算引用，因为归档同批取消未终结 Run。索引行按 [W3](#w3) 在 SE08、SE26、SE27、SE28 提交时维护，所以读取不扫描日志。游标绑定 `key` 与系统作用域，按 `(tenant, session)` 排序。退化：事务域数 T 大时每页 O(T log M)，由 XP-6 的目录决定遍历顺序，游标记当前事务域。索引重建中或任一事务域不可读时返回 `unavailable`，不返回部分结果冒充没有引用。

<a id="r11"></a>

**R11 已释放作用域读：`releasedScopes`。**

```text
releasedScopes(principal, scope = system, after, limit):
    核对系统作用域的读取资格
    对每个事务域: 行 ← sl_released_scope_idx 范围 ((tenant, session, scope) > after)             O(T log M + limit)
    返回 { scopes: [{ tenant, session, task, scope }], next }
```

账本是会话日志的 SE25。索引只收已归档会话的释放读回（[W3](#w3)）。退化与 R10 相同。

### 保留与缓存

<a id="rt-01"></a>

**RT-01 不删除。**本成员没有删除条目、批次、操作回执或旧 epoch 行的操作。归档、冻结、压缩、交付责任解除与格式演进都不删除。存储维护（VACUUM、重建索引、迁移）可以改变物理字节，不改变 `sl_entry` 的身份、内容与顺序。

<a id="rt-02"></a>

**RT-02 交付责任解除不改变保留。**`receive(release)` 把 `ResultConsumption.release` 改为 confirmed 之后，生产者可以释放它的副本。此时 SE20 保存的内容或引用是消费侧唯一可恢复的来源（[EC-06](../session-contract/SPEC.md#ec-06)）。本成员对 SE20 的内联载荷与 blob 不做任何清理。引用指向的外部内容由其拥有者按保留责任维护，本成员只保证引用本身与条目一起保留。

<a id="rt-03"></a>

**RT-03 blob 随条目保留。**`sl_blob` 的行只要被任一条目引用就保留。同一租户内同摘要内容只存一份。没有被任何条目引用的 blob 只可能来自已回滚的事务，提供者的回滚已经撤下它。

<a id="rt-04"></a>

**RT-04 存储侧缓存。**本成员只缓存不可变或可重算的派生物：预编译语句、每个事务域的迁移版本与归约版本、R10 取 shape 时按 `(tenant, session, position)` 缓存的 SE36 载荷。权威读（R1、R7）与 `sl_journal` 的读数不缓存。条目缓存与快照缓存归 `session`，视图前缀摘要缓存归 `session-adapters`，本成员不持有它们。

### 符合性

<a id="c-01"></a>

**C-01 派生表等于重算。**对任一已提交前缀，下列等式必须成立。不成立是 `StorageDefect`，不是可忽略的告警。

| 派生物 | 重算方式 |
| --- | --- |
| `sl_kind_idx`、`sl_ref_idx`、`sl_annotation_idx` | 从 `sl_entry` 逐条按 [W3](#w3) 的规则重新生成行集合 |
| `sl_model_view` 的每个 epoch | 从 `sl_entry` 的 SE10 序列按 CM-01 朴素推导模型视图，再按 [W4](#w4) 重算 `seq` 与 `prefix_digest` |
| `sl_pending_idx` | 从重算的 `sl_state` 按 [W3](#w3) 的八个原因重新生成 |
| `sl_resident_idx` | 从每个会话最近一条 SE08 的登记键集合，按归档状态过滤 |
| `sl_released_scope_idx` | 只取当前已归档的会话：从它最近一次归档之后的 SE25 释放读回逐条重新生成。撤销归档的会话没有行 |
| `sl_state` | 从创建批次起 `reduce` 全部批次 |
| `sl_journal.tail`、`commit_seq`、`epoch`、`epoch_base` | 分别等于最后一条条目的位置、`sl_batch` 的行数、`sl_model_view` 的最大 epoch 与该 epoch 首个压缩记录行的位置 |
| `sl_operation` 的每一行 | 与提供者的已提交回执对应：Session 提交的操作，每行至少有一个代次的已提交回执，身份为 `<operation>#<代次>`。`decide` 认回时响应「参加」不写行，这样的代次也有已提交回执；参加操作的行对应执行记录提供者那次提交的回执。反过来，每个已提交回执去掉代次后都有 Session 行 |

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

| 情形 | 本成员的结果 | 谁处置 |
| --- | --- | --- |
| 存储契约 `rejected_before_accept` | `unavailable`，`owner` 为存储参加者，带原因 | 装配或存储契约拥有者 |
| `identity_conflict`，已有回执为 `committed` | Session 输入摘要相同时返回原回执，`recovered` 为真；不同时 `conflict`（[W1](#w1) 第 2 步） | 调用方 |
| `identity_conflict`，已有回执为 `rolled_back` | 选下一个代次重新提交 | 本成员 |
| 选代次时某代次为 `unknown` | `commit-unknown`，不开新代次（[尝试代次](#w1-attempts)） | `session` 的 S4 按原身份 R7 |
| 代次达到尝试代次上限，全部为 `rolled_back` | `unavailable`，`owner` 为本成员 | 装配调整上限或维护者处置 |
| `rolled_back`，停止响应为 `conflict` | 响应证据里保存的原 `SessionFailure`。带 `expected` 的命令在尾部已变时是 `changed` | 调用方；`changed` 由 `session` 重做 |
| `rolled_back`，停止响应为 `unsupported` 或 `failed` | `unsupported` 为 `invalid`（字段 `command`）；`failed` 为 `unavailable`，诊断带类别 | 调用方 |
| `unknown`、`writer_not_current`、锁等待超时 | `commit-unknown` | 调用方按原身份 R7 |
| 材料缺项或多项 | 「不支持」，明确回滚，映射为 `invalid` | 调用方 |
| 第 7 步的 `sl_journal` 条件更新影响 0 行 | 「失败」，`unavailable`，记诊断。这违反第 5 步行锁下的不变量 | 诊断 |
| `sl_state` 落后或归约版本不符 | `unavailable`，`owner` 为本成员。追赶尚未实现，没有自动追赶 | R9 自动追赶 |
| `sl_entry` 缺口、损坏、`tail` 不一致 | 该会话隔离：`readWork` 与 `loadRecovery` 返回 `quarantined`，其余读与写返回 `unavailable`（[R9](#r9)） | 运维按 [SL14](../session-contract/SPEC.md#日志读取投影及恢复) |
| 派生索引重建中 | 依赖它的读 `unavailable`，带进度 | 等待重建 |
| 读失败、读被取消、事务域目录没有该租户、目录答了别的租户 | `unavailable`，`owner` 为本成员，诊断带原因 | 读：存储提供者；目录：应用装配 |
| 游标签名密钥缺席 | 带游标的读（R2、R5、R8、R10、R11）在生成或验证游标时返回 `unavailable` | 装配 |
| 任何 SQL 异常 | 不转成业务拒绝；写路径响应「失败」，读路径 `unavailable` | 诊断 |

### 迁移与生命周期

- 迁移片段分两类。权威表的迁移只增列、不改旧列含义、不改位置与身份；派生表的迁移可以整体重建。两类都随提供者的原子迁移执行：DDL、数据与迁移标记同事务，失败回到迁移前（[XP-5](#xp-table)）。
- 归约版本升级是一次 `sl_state` 全量重建（R9），不是迁移。它在格式迁移之后、开放写准入之前完成，或在首次治理读时按会话惰性完成。两种方式都是策略配置。
- 本成员没有 Cordis 入口，也没有关闭函数：`createSessionStorage` 返回的端口只持有应用交入的存储、目录、访问裁定与游标签名，不持有连接。应用在装配时把 `sessionStorageMaterials()` 并入材料目录并声明组合，端口在提供者就绪后才可用。已提交的条目不因端口被丢弃而变得可撤回。
- 提供者关闭期间，新的 `commit` 得到 `closing` 映射的 `unavailable`；在途的语句跑完。读入口随提供者关闭而不可用。

### SQLite 与 PostgreSQL

| 事项 | SQLite（`node:sqlite`） | PostgreSQL（`pg`） | 本成员的处理 |
| --- | --- | --- | --- |
| 64 位位置 | `INTEGER`，以 BigInt 读写 | `bigint` | 边界编解码为十进制文本（[TB-03](#tb-03)） |
| JSON 载荷 | `TEXT` | `text` | 两边都用 `text` 加应用层 schema 校验，不用 `jsonb`，避免方言分叉 |
| blob | `BLOB` | `bytea` | 同一列名，Kysely 类型映射 |
| 写并发 | 单写连接，`BEGIN IMMEDIATE`，事务本来串行 | `SELECT ... FOR UPDATE` 锁住该会话的 `sl_journal` 行 | 两边都在锁内读尾部，最后做 `tail` 条件更新（[W6](#w6)） |
| 读连接 | sql-contract 的 `read` 入口 | 独立连接，读事务看一致快照 | 读经 `read` 入口；排队归提供者 |
| 部分索引 | 支持 | 支持 | `sl_pending_idx` 等先用普通表保持同形，不用部分索引 |
| 耐久 | `journal_mode=WAL`、`synchronous=FULL` 由提供者读回；不等于断电试验 | `fsync` 与复制配置 | 耐久证据归 [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 的承接方，本成员不宣称 |
| 迁移 | 同连接事务内 DDL 可回滚 | 事务性 DDL | 两边都走原子迁移 |
| 大对象去向 | 同库 `sl_blob` | 同库 `sl_blob`，或对象存储 | 阈值与去向是策略配置 |

## 组合与验证

### 消费的承诺

| 承诺 | 精确位置 | 本成员怎样消费 |
| --- | --- | --- |
| `commit`、`query`、`read` 的结果模型与拒绝顺序，响应证据 | [sql-contract §7 commit](../../storage/sql-contract/SPEC.md#7-commit)、[§8 query](../../storage/sql-contract/SPEC.md#8-query)、[§9 read](../../storage/sql-contract/SPEC.md#9-read) | W1 的映射与读路径路由 |
| 参加者端口、事实格与语句限制 | [sql-contract §7.4](../../storage/sql-contract/SPEC.md#74-参加者端口与事实格) | 参加者模块只用 `execute`，`params` 只用允许的类型 |
| SQLite 提供者的启动、受理队列、两段回滚、未知条件 | [sqlite-provider 规格](../../storage/sqlite-provider/SPEC.md) | 失败分类表 |
| `SessionTransactionPort` 六条义务 | [SessionTransactionPort](../session-contract/SPEC.md#sessiontransactionport) | W1 第 3 步核对完整材料；W1 第 6 步与 W6 对带 `expected` 的七种命令返回 `changed`；TB-04 的保管前提；W1 的尝试代次与 R7 的 `attempt-rejected`；读路径逐页核权；W5 的游标同存 |
| 历史面四个读操作与三个对账读操作的结果与拒绝原因 | [SessionHistory](../session-contract/SPEC.md#sessionhistory)、[SessionReconciliation](../session-contract/SPEC.md#sessionreconciliation) | R2、R5、R8、R10、R11 |
| 事件目录的封套与 38 类 | [事件目录](../session-contract/docs/object-model/session-log-events.md#原生事实类别) | `sl_entry` 列与 W3 的派生规则 |
| `decide`、`reduce` 与 OP-00 的纯函数，以及它们共用的解释版本 | [领域服务与归约](../session-contract/SPEC.md#领域服务与归约)、[OP-00](../session-contract/SPEC.md#op-00) | W1 第 6、7、9 步；W2；W4 第 2 步；R9 |
| 模型视图 CM-01 至 CM-06 与消息类型 | [message SPEC](../../common/message/SPEC.md#模型视图) | W4 第 4 步的新 epoch 行；R5 的消息解码；C-01 的视图重算。压缩判定经 `decide` 传递，本成员不直接调用 |
| `HistoryPage.annotations` 的含义 | [SessionHistory](../session-contract/SPEC.md#sessionhistory) | R2 每页经 R6 填充 |
| 历史源读口 H1 至 H5 | [request-context-contract](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图) | R5 |

### 自有义务的验证

每条义务的验证方法、前提与未覆盖写在 [docs/verification-obligations.md](docs/verification-obligations.md)。下表只给对应关系。全部义务都是后继实现必须通过的可观察结果，不是已执行的测试。

| 义务 | 验证 |
| --- | --- |
| C-01 派生等于重算 | 影子表集合差，随机命令序列 |
| C-02、C-03 分页完整与游标 | 属性测试与篡改用例 |
| C-04 前缀摘要 | 属性测试 |
| W1 至 W6 写路径 | 每个 JC 行一个用例，核对派生行与 `sl_state` |
| `decide` 往返 | `reduce(前状态, decide(...) 的批次)` 等于命令要求的后态与提交后的 `sl_state` |
| R6 页内标注 | 跳转读取，`annotations` 与按 SE33 全量扫描的集合比较 |
| R1 至 R11 复杂度与退化 | 基准：N 从 10³ 到 10⁶，R1、R3、R5、R7、R8 不随 N 增长，R2 随 K 与 B 线性 |
| W6 并发写裁定 | 两个进程并发提交同一会话：后到者在新尾部上裁定，带 `expected` 的命令得到 `changed`，其余命令按新状态裁定 |
| 尝试代次与 R7 | 每种代次回执组合一个用例，核对选中的代次、`recovered`、`commit-unknown`、`attempt-rejected` 与 `not-committed` |
| 断电耐久 | 故障注入，介质声明；归 SQL-T01 |
| 失败分类表 | 每行一个注入用例 |

### 明确缺项

| 缺什么 | 谁来补 | 补上之前本成员怎样表现 |
| --- | --- | --- |
| `commitEntries` 的纯范围检查（entries 解释） | session-contract 拥有者 | 恒返回 `unavailable`（[已知限制](#已知限制)） |
| 本节「实现现状」列出的尚未实现的设计：`sl_batch`、`sl_blob`、`sl_ref_idx`、R9 追赶与重建、PostgreSQL | 本成员 | 见[实现现状](#实现现状)；这些条款不得写成已验证 |
| 对象存储作为 blob 去向 | [issue 541](https://github.com/nemori-ai/omne-harness-lite/issues/541) | 只有同库 `sl_blob` |
| 超过 `maxCommandBytes` 的内容先由内容拥有者保管、再以耐久引用进入条目的链路（Session 契约的[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)） | 存储的拥有者与各内容拥有者 | 条目只带已达到耐久条件的引用（[TB-04](#tb-04)）。拿不到耐久引用时命令返回 `unavailable` |
| 数值目标：每页延迟、每秒提交数、重建时长、`maxScanPerPage` 与 `pageBytes` 的初值 | 本成员，按验证计划实测后写进本页的声明边界 | 不声明任何数值。策略配置没有默认值时装配必须给出 |
| 断电耐久 | [SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) 的承接方 | 本成员只声明进程级持久依赖提供者读回的 `synchronous=FULL`，不宣称断电耐久 |
| 登记键到能力身份的绑定（R10 的 `capability` 列） | Tool 契约与事件目录对 SE08 载荷的细化 | 本成员假定 SE08 的登记键按能力身份列出；不成立时 `ResidentReference.capability` 不可填，R10 不可用 |
| 从 `SessionOperationId` 辨认参加操作的入口，例如身份编码带派生种类，或 `queryOperation` 的输入带种类（[R7](#r7)） | Session 契约拥有者 | R7 对未命中的操作一律探查代次，代次 1 为 `not_committed` 时返回 `unknown`，不给 `not-committed`。Session 提交的操作仍可用同一身份重做命令，由 [W1 的尝试代次](#w1-attempts)选代次。协调器与调度器发起的操作停在 `unknown` 时，靠 S1、S3 等触发者以同一身份再次触发才收敛 |
| `accept` 的上限或背压策略：一个会话的待处理输入数上限，与超限时的拒绝原因（[W1 的代价与退化](#w1-cost)） | 本成员提出字段与初值；超限的拒绝原因归 Session 契约拥有者 | 没有上限。积累 P 条待处理输入的会话，每次 `accept` 的代价是 O(P) |
| 压缩覆盖范围的条目数上界（[W4](#w4)） | [request-context-contract](../../context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界) 的拥有者 | W4 在写事务里读出 `covers` 的全部条目，代价随覆盖范围线性增长。SQLite 下同一事务域的其他提交在此期间等待 |
| 撤销归档之后，作用域引用会不会被复用（[W3](#w3) 的 SE28 行） | 执行环境契约的拥有者 | 撤销归档时删除该会话在 `sl_released_scope_idx` 的行，R11 不再返回这些作用域。作用域引用若被复用，本成员不区分新旧两次使用 |
