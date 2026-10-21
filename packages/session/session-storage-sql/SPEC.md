# @omne-harness/session-storage-sql 行为规格

状态：存储成员，`draft`，候选技术设计，没有运行实现。本成员是 Session 组里唯一接触介质的成员。它用 SQL 表兑现 [session-contract](../session-contract/SPEC.md) 声明的 `SessionTransactionPort`：提交、权威读、原操作查询、历史读、epoch 视图读、待办扫描、引用查询与已释放作用域读。治理规则不在本页，本页只写表、索引、写路径、读路径、符合性与介质差异。

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。表与索引的列、键与约束在 [docs/object-model.md](docs/object-model.md)，写路径、压缩提交与派生重建的时序在 [docs/flows.md](docs/flows.md)，验证义务在 [verification/](verification/README.md)。

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
| 消费游标随条目同提交 | [EC-02](../session-contract/SPEC.md#ec-02) |
| 引用查询的索引维护与引用定义 | [常驻工具与会话冻结](../session-contract/SPEC.md#常驻工具与会话冻结) |
| 已释放作用域的账本 | [ScopeReleasePort](../session-contract/SPEC.md#scopereleaseport) |
| 推理续接状态不建索引 | [推理续接状态](../session-contract/SPEC.md#推理续接状态) |
| 压缩记录形状、保留名单与模型视图 CM-01 至 CM-06 | [message SPEC 模型视图](../../common/message/SPEC.md#模型视图) |
| 历史源读口与 epoch 视图 H1 至 H5 | [request-context-contract](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图) |
| 公开形状 | [session-contract public-api](../session-contract/docs/public-api.md) |
| 存储契约：操作身份、提交、查询、五项证明、参加者端口、提供者义务 | [存储事务行为](../../storage/docs/storage-contract/SPEC.md)、[SQLite 提供者设计](../../storage/docs/storage-contract/sqlite-provider.md) |
| 技术选择：Kysely 加 `node:sqlite`，经配置切换 PostgreSQL，没有内存实现 | [技术基础](../../../docs/architecture/technical-foundations.md#共同技术选择)、[基础设施政策](../../../docs/architecture/deployment/infrastructure-policy.md) |
| 耐久边界与 SQL-T01 | [已确认保存的耐久边界](../../../docs/architecture/data-and-state.md#已确认保存的耐久边界)、[SQL-T01](../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01) |
| 组内落位 | [组架构](../docs/architecture.md)、[组流程](../docs/key-flows.md) |

### 两个「事务端口」

存储契约把参加者模块在 Worker 内拿到的语句端口叫 `TransactionPort`，只有一个方法 `execute(sql, params)`。Session 契约把本成员要实现的端口叫 `SessionTransactionPort<P>`，它是进程内的服务对象，有提交、读与查询十一个操作。两者不是同一个接口。本页写「语句端口」指前者，写「事务端口」指后者。

| 事务端口的操作 | 本成员怎样兑现 |
| --- | --- |
| `commit` | 翻译为存储契约的一次 `commit`。参加者模块 `session` 在 Worker 内经语句端口写事实，见 [W1](#w1) |
| `readWork` | R1 |
| `readInput` | R3 |
| `queryOperation` | R7 |
| `history.begin`、`history.next`、`history.since` | R2 |
| `history.readModelView` | R5 |
| `pending` | R8 |
| `references` | R10 |
| `releasedScopes` | R11 |

### 存储契约还没有给出的入口

存储契约目前没有可依赖的 workspace 成员。本成员对它的期望写成下表。每一项都是本成员工作的前提，拥有者是存储线（[issue 540](https://github.com/nemori-ai/omne-harness-lite/issues/540)）。缺一项，本成员的对应操作返回 `unavailable`，`owner` 为存储参加者。本成员不自造替代实现，也不用内存实现代替。

<a id="xp-table"></a>

| 编号 | 期望 | 为什么需要 | 缺它时 |
| --- | --- | --- | --- |
| XP-1 | 参加者模块的登记入口：按参加者名把 `execute(facts, port)` 模块装进 Worker，与提供者同一事务域 | 本成员的 `session` 模块要在提供者的事务里跑 | `commit` 不可用 |
| XP-2 | 参加者的业务响应通道：参加者能把「参加」「冲突（带依据）」「不支持」「失败」交给提交方，并使提供者按「冲突」「不支持」做明确回滚 | Session 契约的拒绝结局与 Agent 契约的四种参加者响应都要穿过提供者 | 本成员按 [W1 第 7 步](#w1) 的退路在事务外重算拒绝原因，只能覆盖 Session 自己提交的命令。Agent 发起的提交里，Session 的「冲突」只能表现为明确回滚，依据丢失 |
| XP-3 | 事务外的读入口：在同一事务域上执行只读语句，读到已提交状态，不进入受理队列 | R1 至 R11 全部是事务外读取。存储契约写明 SQLite 提供者的权威读取与 `query` 都用写连接，不增加读连接 | 全部读操作不可用 |
| XP-4 | `SqlValue`、`QueryRows` 的精确形状，以及 BigInt 在 `params` 与行里的表示 | 64 位位置以 BigInt 读写 | 位置列退化为文本比较，排序与范围查询失去原生整数比较。本成员不接受这种退化 |
| XP-5 | 迁移片段的挂接：本成员的 DDL 与数据迁移随提供者的原子迁移一起执行，失败回到迁移前 | 派生表重建与格式升级 | 不能升级格式。旧格式的读写照常 |
| XP-6 | 事务域目录：系统作用域读取要枚举本部署里全部租户的事务域 | 存储契约把一个事务域绑定一个租户。R10 与 R11 跨租户 | `references` 与 `releasedScopes` 返回 `unavailable`，不返回空页，也不只回答部分租户 |

XP-2、XP-6 与 [TB-04](#tb-04) 的大载荷保管链路也是 Session 契约记下的[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)。本表的「缺它时」与契约那里写的表现一致，拥有者以契约为准。

存储契约对 SQLite 提供者只保留一条写连接，并写明「以后要增加读连接，由新的设计明确写出」。本页的读路径按一条独立读连接设计，复杂度不变，但在现行契约下读取与提交在同一个 Worker 消息队列里串行。这是一条明确缺项，见[组合与验证](#明确缺项)。

### 参加者模块与材料

本成员只向存储契约登记一个参加者，名字是 `session`。它在两种提交里出现：

- Session 为提交方的命令（JC-01 至 JC-05、JC-07、JC-08、JC-10、JC-13 至 JC-24、JC-28，以及 JC-11 的「Agent 记录已删除」分支）：本成员的 `commit` 把 `SessionCommand` 与全部 `GuardCommand` 放进同一条 `FactCommand`，`participant` 为 `session`，`facts` 为 `{ command, guards }`。桥交来的材料由 `session` 模块在事务里核对，不翻译成各自独立的存储参加者。
- 执行记录提供者为提交方的四种交接（JC-06、JC-09、JC-11、JC-12）：执行记录提供者的提交里有一条 `participant` 为 `session` 的命令，`facts` 是契约 P-2 规定的 `Participation` 与版本化载荷。两个只读参加（JC-26、JC-27）同样经这条命令到达，`facts` 带只读意图。

组合版本由本成员在装配时登记：参加者列表为 `session` 加执行记录提供者声明的参加者名。契约 P-1 要求两者在同一个事务域。本成员不登记别的参加者名；桥的材料不是存储参加者。

## 结果与不变量

### 记号

N 为该会话条目总数。K 为本页实际扫描条目数。B 为本页读出字节。k 为过滤的 `kind` 数。p 为本页返回行数。D 为检查点之后的条目数。M 为所查索引的规模。T 为本部署的事务域数。全部复杂度按有序索引（B 树）估，SQLite 与 PostgreSQL 相同。

### 表、索引与位置

<a id="tb-01"></a>

**TB-01 权威五表与 blob。**下列表在共同提交内写入，是会话日志的权威形状。列、键与约束见[对象模型](docs/object-model.md#权威表)。

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

**W1 Session 为提交方的提交。**`SessionTransactionPort.commit` 按下列步骤执行。事务外的第 1 至第 4 步归 `session` 的流水线（[CP-01](../session/SPEC.md#cp-01)），本成员从第 5 步接手。时序见[写路径](docs/flows.md#写路径session-为提交方)。

1. 构造存储操作身份：`tenant` 为命令的租户，`transactionDomain` 为该租户的事务域，`operation` 为 OP-00 派生的 `SessionOperationId`，`protocolVersion` 为 `1`，`operationKey` 为 `SessionOperationId` 的文本。规范化 `{ command, guards }` 为 JSON 值：位置、序号与 epoch 都是十进制文本，没有 BigInt、`undefined`、`Date` 或函数。
2. 调用存储契约的 `commit`，命令数组只有一条 `participant` 为 `session` 的命令。`rejected_before_accept` 映射为 `unavailable`，`owner` 为存储参加者，不改写为业务拒绝。`identity_conflict` 映射为 `conflict`。
3. Worker 内，`session` 模块收到 `facts` 与语句端口。先核对材料：每个 `GuardCommand` 的 `owner`、`participant`、`protocol` 与该命令种类要求的材料集合一致。集合按[共同提交表](../session-contract/SPEC.md#共同提交与共享事务域)的「参加者」列固定在本成员的材料表里。缺一项或多一项，响应「不支持」，不写任何行。
4. 点查 `sl_operation`，得到该操作的 `OperationRecord`，没有时为 null。认回由第 6 步的 `decide` 判定，本步只读行。
5. 读 `sl_journal` 与 `sl_state`。`sl_state.covered` 不等于 `sl_journal.tail`，或归约版本不是当前版本：响应「失败」，原因为 `unavailable`，`owner` 为本成员，由 R9 追赶后重试。核对通过时，交给 `decide` 的快照的 `revision` 等于 `tail`。
6. 调用 `session-contract` 的 `decide(快照, command, guards, 操作记录)`（[领域服务与归约](../session-contract/SPEC.md#领域服务与归约)）。`decide` 认回原操作，按命令调用领域服务与守卫，并比较命令的 `expected` 与快照的 `revision`。本成员不另调用领域服务，也不另写允许或拒绝的规则。按 `Decision` 的三种结果处理：
   - `recovered`：响应「参加」，不写行。提交方的提交照常成立，`commit` 之后读回原回执，`recovered` 为真。
   - `rejected`：响应「冲突」，依据为其中的 `SessionFailure`。`expected` 不等于 `tail` 时它是 `changed` 并带当前 `revision`；同操作不同摘要时它是 `conflict`。
   - `entries`：继续第 7 步。
7. 为 `decide` 产出的 `EncodedEntry` 逐条分配 `position`，补上 `id` 与 `revision`（[TB-03](#tb-03)）。先写 blob，再写 `sl_entry`，再写 [TB-02](#tb-02) 的派生行，见 [W3](#w3)。调用 `reduce(前状态, 本批次)`，得到新快照。`decide` 与 `reduce` 共用同一解释版本，`reduce` 解释 `decide` 的批次必须得到命令要求的后态。`reduce` 返回 `quarantined` 说明两者不互逆，这是契约实现的缺陷：响应「失败」，不写任何行。替换 `sl_state`，比较新旧快照维护 `sl_pending_idx`。写 `sl_batch`、`sl_operation`，更新 `sl_journal.tail` 与 `commit_seq`。
8. 提供者 `COMMIT`。本成员在事务外读回 `sl_operation` 得到 `CommitReceipt`，返回给 `session`。
9. 存储契约返回 `rolled_back` 时，本成员在事务外以 R1 重读快照与 `sl_operation`，再调用一次 `decide`：得到相同的 `rejected` 则返回该拒绝；快照已变则返回 `changed`。这是 [XP-2](#xp-table) 缺席时的退路，它只对 Session 自己提交的命令成立。`unknown` 原样映射为 `commit-unknown`，不改写，不换身份。

`attempt-rejected`：存储契约的 `writer_not_current` 与锁等待超时属于本次尝试未生效。本成员把它们映射为 `commit-unknown`，不映射为 `not-committed`。只有存储 `query` 返回带五项证明的 `not_committed` 时，R7 才给出 `not-committed`。

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
| SE08 | `sl_resident_idx`：把该会话的行集合替换为本次固定的登记键集合，每个键一行，`capability` 取自登记键所属的能力身份，`admitted_position` 为该能力 SE36 的位置 |
| SE26 | 会话已归档时，删除该会话在 `sl_resident_idx` 的全部行 |
| SE27 | 没有未终结 Run 时，删除该会话在 `sl_resident_idx` 的全部行；有未终结 Run 时保留 |
| SE28 | 按最近一条 SE08 的登记键集合重建该会话在 `sl_resident_idx` 的行 |
| SE25 且载荷是作用域释放的读回，处置含 `released`，会话已归档 | `sl_released_scope_idx` 每个已释放作用域一行，`task` 为原任务操作身份。同一 `(tenant, session, scope)` 重复读回只保留首次位置 |
| 快照里进入或离开某个待办原因 | `sl_pending_idx` 增删，原因按 `PendingReason` 五种：`unresolved`、`controls`、`tasks`、`idle-due`、`release` |
| 载荷超过内联阈值 | `sl_blob` 一行，条目只存引用 |

增补的三类事件：SE36 写 `sl_kind_idx` 与 `sl_ref_idx(run)`（随 `startRun` 或 `reload` 时），快照的 `residents` 追加一项。SE37 写 `sl_kind_idx`，快照的 `frozen` 置为非空，`sl_resident_idx` 不变。SE38 写 `sl_kind_idx` 与 `sl_ref_idx(input)`，快照的 `pending` 移除对应输入。

`sl_pending_idx` 的 `release` 原因：快照里任一 `ResultConsumption` 的 `custody` 或 `completion` 非空且 `release` 为 pending 时加一行，全部为 confirmed 或消费已释放时删一行。`idle-due` 由 `judgeIdle` 的结果决定，本成员只按新旧快照比较增删，不自己判断到期。

<a id="w4"></a>

**W4 压缩提交开新 epoch。**`commitDerived(compaction)` 的参加者在同一事务里按下列顺序执行。时序见[压缩提交](docs/flows.md#压缩提交)。

1. 备齐压缩判定的历史输入：覆盖范围 `covers` 内的全部条目、`covers.to` 之后到压缩点之前的消息，以及未结工作所在的条目引用。前两组从 `sl_entry` 按范围读，O(log N + |covers| + |after|)；第三组经 [R4](#r4) 按关联定位。三组输入经 `DecideReads.compaction` 交入 `decide`（[契约](../session-contract/SPEC.md#领域服务与归约)）。
2. 调用 `decide`。压缩判定（`openWork` 与 message 包的 `judgeCompaction`）在 `decide` 里执行，本成员不另调用。结果为 `rejected` 时响应「冲突」，依据为判定结果，不写任何行。
3. 写 `decide` 产出的 SE10 压缩记录与 SE33 标注。标注的 `refs.target` 是 `covers` 范围，`sl_annotation_idx` 一行。
4. 计算新 epoch 的行序列：`rows = retained（按原日志顺序）‖ C ‖ 旧 epoch 中 position > covers.to 的行`。为 `rows` 从 1 重编 `seq`，重算 `prefix_digest`，写入 `sl_model_view` 的新 epoch。只复制索引行（`position`、`bytes`、摘要），不复制内容。
5. `sl_journal.epoch` 加一，`epoch_base` 记为 C 的 `position`。

旧 epoch 的行不删除，供审计与人侧读取。写成本是 O(|retained| + 保留尾长度) 行索引复制，两者都由压缩策略有界，策略归 Request Context。

<a id="w5"></a>

**W5 消费游标随条目同提交。**`receive` 写条目的同一事务里，快照内对应执行的 `ExecutionRef.readThrough` 设为本事件的序号。不产生条目的事件不单独提交。`receive` 带来的 `readThrough` 小于快照当前值时响应「冲突」，结局为 `changed`。游标与会话状态在 `sl_state` 同一行，没有单独的游标表。

<a id="w6"></a>

**W6 并发写的裁定。**同一会话基于同一旧 `tail` 的两次提交只允许一个后继。SQLite 由单写连接与 `BEGIN IMMEDIATE` 串行化，PostgreSQL 由 `sl_journal` 该行的 `UPDATE ... WHERE tail = :expected` 的受影响行数裁定。两种介质下落后者都在 [W1 第 6 步](#w1) 由 `decide` 得到 `changed`。本成员不用进程内锁或内存 CAS 代替这条核对。

### 读路径

每条读路径先按身份与披露边界核权，再读取。核权失败返回 `denied` 或 `invalid`，不返回空页。提供者不可用、索引重建中或读入口缺席返回 `unavailable`，不返回空页。读路径不写任何行，不发通知。

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

页预算按 `sl_entry.payload_bytes` 累计。内联与外置载荷都填这一列，所以判断截断不需要先读出载荷。外置在 `sl_blob` 的载荷只在条目确定进入本页之后才读取，不为被截断的条目读 blob。载荷里指向内容拥有者的耐久引用只以引用返回，读者按需向内容拥有者另取，本成员不代取。读者经 `session` 的条目缓存（[CA-1](../session/SPEC.md#ca-1)）命中已读条目时不再到达本成员。

游标是签名的自描述值，服务端不保存读会话；签名密钥归装配。

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

**R7 原操作认回：`queryOperation`。**

```text
queryOperation(access, operation):
    row ← sl_operation[tenant, session, operation]                     O(log M)
    命中: 返回 committed，带原回执
    未命中: q ← 存储契约 query(操作身份)
        q 为 committed（提供者有回执而本成员无行）: 返回 unavailable，这是存储缺陷，见 C-01
        q 为 rolled_back: 返回 not-committed，依据为该回执
        q 为 not_committed（五项证明齐全）: 返回 not-committed，依据为五项证明
        q 为 unknown: 返回 unknown
```

本成员不自己构造「明确未提交」。旧写代际未排除、队列里仍有该操作、恢复未完成时，提供者只给 `unknown`，本成员照传。退化：没有。

<a id="r8"></a>

**R8 待办扫描：`pending`。**

```text
pending(principal, tenant, after, limit, reason):
    若 reason 给定: 行 ← sl_pending_idx 范围 (tenant, reason, session > after)，取 limit 行      O(log M + limit)
    否则: 五个 reason 各取范围 (tenant, reason, session > after)，按 session 归并去重，取 limit 个会话  O(5 log M + 5·limit)
    返回 { sessions, next = 最后一个 session 或 null }
```

游标是最后一个会话身份的签名值，绑定租户与 `reason`。索引行在共同提交里随快照增删（[W3](#w3)）。读取不删待办。退化：没有。索引重建中返回 `unavailable`。

<a id="r9"></a>

**R9 追赶与重建。**

```text
追赶(tenant, session):
    state ← sl_state；head ← sl_journal
    若 state.fold_version ≠ 当前版本，或 state 的摘要校验失败: state ← 空（从创建批次起）
    批 ← sl_batch 范围 (commit_seq > state.covered_commit)                            O(log N + D)
    逐批读条目并 reduce；每批后把新快照与 covered 写回 sl_state（独立的小写事务）
    追平 head.tail 之后，治理读才返回快照

重建派生索引(tenant, session 或全库, 索引名):
    记录重建进度行；期间对应读路径返回 unavailable 并带进度
    清空该索引在范围内的行；按 sl_entry 顺序重算并写入；每批一个事务
    完成后删除进度行
```

D 在正常运行中为 0，因为每次提交都物化。只有归约版本升级或 `sl_state` 损坏时 D = N，复杂度 O(N log M) 加内容读取，内存只需快照大小。重建期间 R1、R8、R10、R11 返回 `unavailable`，不用旧快照或旧索引授予资格；R2、R3、R5、R7 不依赖被重建的索引时照常。重建只解释事实，不调用模型、工具或外部效果。`sl_entry` 本身缺口、损坏或 `sl_journal.tail` 与最后一条条目不一致时，隔离该会话：全部读返回 `unavailable`，`owner` 为本成员，写被拒绝，不清空、不静默丢弃尾部。

<a id="r10"></a>

**R10 引用查询：`references`。**

```text
references(principal, scope = system, key, after, limit):
    核对系统作用域的读取资格；无资格 → denied
    对本部署的每个事务域（XP-6）: 行 ← sl_resident_idx 范围 (key, (tenant, session) > after)   O(T log M + limit)
    每行读 sl_entry[admitted_position] 取 SE36 的 shape（条目不可变，可缓存）                       O(limit · log N)
    返回 { sessions: [{ tenant, session, capability, shape }], next }
```

引用的定义归契约：会话当前固定的登记键含该键且会话未归档；冻结而未归档的会话算引用；已归档但有未终结 Run 的会话算引用。索引行按 [W3](#w3) 在 SE08、SE26、SE27、SE28 提交时维护，所以读取不扫描日志。游标绑定 `key` 与系统作用域，按 `(tenant, session)` 排序。退化：事务域数 T 大时每页 O(T log M)，由 XP-6 的目录决定遍历顺序，游标记当前事务域。索引重建中或任一事务域不可读时返回 `unavailable`，不返回部分结果冒充没有引用。

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
| `sl_pending_idx` | 从重算的 `sl_state` 按五种原因重新生成 |
| `sl_resident_idx` | 从每个会话最近一条 SE08 的登记键集合，按归档状态与 Run 终态过滤 |
| `sl_released_scope_idx` | 从已归档会话的 SE25 释放读回逐条重新生成 |
| `sl_state` | 从创建批次起 `reduce` 全部批次 |
| `sl_journal.tail`、`commit_seq`、`epoch`、`epoch_base` | 分别等于最后一条条目的位置、`sl_batch` 的行数、`sl_model_view` 的最大 epoch 与该 epoch 首个压缩记录行的位置 |
| `sl_operation` 的每一行 | 与提供者的回执表一一对应：有 Session 行必有提供者回执，有已提交回执必有 Session 行 |

检查方式：符合性套件把重算结果写入同形的影子表，再按主键做集合差。差为空才通过。全量检查在验证计划里按会话抽样执行，每次提交后的增量检查只比对本批触及的键。

<a id="c-02"></a>

**C-02 固定上界下的分页完整。**对任一 H，`begin` 到 `exhausted` 的全部页拼接后，等于 H 内该主体获准读取的条目全集，不重不漏。并发追加不进入本轮。

<a id="c-03"></a>

**C-03 游标不可篡改。**换会话、换租户、扩过滤、改 H、改方向或改主体摘要的游标一律 `invalid`。

<a id="c-04"></a>

**C-04 前缀摘要可比较。**同一 epoch 内同一 `seq` 的 `prefix_digest` 永不改变。两段不同的前缀以压倒性概率摘要不同。摘要函数是 SHA-256，输入是上一行摘要与本条目内容摘要的字节拼接。

## 所有权、失败与生命周期

### 身份与所有权

- 租户是每一行的列，也是每条语句的条件。本成员不从连接、事务域或 Cordis 上下文推断租户。事务域由装配按租户给出。同一事务域只服务一个租户，这是存储契约的规则；本成员仍在每张表保留 `tenant` 列，跨租户访问在语句层被拒绝。
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
- 读路径在事务外执行。SQLite 下读与写共用 Worker 的写连接，按消息顺序串行；PostgreSQL 下读用独立连接，MVCC 保证读事务看不到未提交尾部。两种介质下读到的都是已提交状态。
- `commit` 没有取消。调用方取消观察时，原操作仍有结果拥有者，按原身份经 R7 对账。读路径的取消只释放调用方。
- 同一会话的提交由 [W6](#w6) 串行化。不同会话的提交在同一事务域内仍经同一条写连接串行（SQLite），这是提供者的规则。

### 失败分类

| 情形 | 本成员的结果 | 谁处置 |
| --- | --- | --- |
| 存储契约 `rejected_before_accept` | `unavailable`，`owner` 为存储参加者，带原因 | 装配或存储线 |
| `identity_conflict` | `conflict` | 调用方 |
| `rolled_back` 且退路重算得到拒绝结局 | 该拒绝结局 | 调用方 |
| `rolled_back` 且退路重算与状态不符 | `changed` | 调用方重做 |
| `unknown`、`writer_not_current`、锁等待超时 | `commit-unknown` | 调用方按原身份 R7 |
| 材料缺项或多项 | 「不支持」，映射为 `invalid` | 调用方 |
| `sl_state` 落后或归约版本不符 | `unavailable`，`owner` 为本成员，带追赶进度 | R9 自动追赶 |
| `sl_entry` 缺口、损坏、`tail` 不一致 | 该会话隔离，读写都 `unavailable` | 运维按 [SL14](../session-contract/SPEC.md#日志读取投影及恢复) |
| 派生索引重建中 | 依赖它的读 `unavailable`，带进度 | 等待重建 |
| 读入口或事务域目录缺席（[XP-3](#xp-table)、[XP-6](#xp-table)） | `unavailable`，`owner` 为存储参加者 | 存储线 |
| 游标签名密钥缺席 | R2、R5、R8、R10、R11 返回 `unavailable` | 装配 |
| 任何 SQL 异常 | 不转成业务拒绝；写路径响应「失败」，读路径 `unavailable` | 诊断 |

### 迁移与生命周期

- 迁移片段分两类。权威表的迁移只增列、不改旧列含义、不改位置与身份；派生表的迁移可以整体重建。两类都随提供者的原子迁移执行：DDL、数据与迁移标记同事务，失败回到迁移前（[XP-5](#xp-table)）。
- 归约版本升级是一次 `sl_state` 全量重建（R9），不是迁移。它在格式迁移之后、开放写准入之前完成，或在首次治理读时按会话惰性完成。两种方式都是策略配置。
- 本成员的 Cordis 入口在装配时登记参加者模块与组合版本，读入口在提供者就绪后才可用。撤除只结束本成员的句柄与缓存，不关闭提供者的连接，不回滚任何提交。已提交的条目不因 disposer 运行而变得可撤回。
- 提供者关闭期间，新的 `commit` 得到 `closing` 映射的 `unavailable`；在途的语句跑完。读入口随提供者关闭而不可用。

### SQLite 与 PostgreSQL

| 事项 | SQLite（`node:sqlite`） | PostgreSQL（`pg`） | 本成员的处理 |
| --- | --- | --- | --- |
| 64 位位置 | `INTEGER`，以 BigInt 读写 | `bigint` | 边界编解码为十进制文本（[TB-03](#tb-03)） |
| JSON 载荷 | `TEXT` | `text` | 两边都用 `text` 加应用层 schema 校验，不用 `jsonb`，避免方言分叉 |
| blob | `BLOB` | `bytea` | 同一列名，Kysely 类型映射 |
| 写并发 | 单写连接，`BEGIN IMMEDIATE` | 行级锁，MVCC | 两边都做 `tail` 条件更新（[W6](#w6)） |
| 读连接 | 现行存储契约只有写连接，读与写串行 | 独立连接，读事务看一致快照 | 读路径按独立读连接设计；SQLite 的串行是明确缺项 |
| 部分索引 | 支持 | 支持 | `sl_pending_idx` 等先用普通表保持同形，不用部分索引 |
| 耐久 | `journal_mode=WAL`、`synchronous=FULL` 由提供者读回；不等于断电试验 | `fsync` 与复制配置 | 耐久证据归存储线的 SQL-T01，本成员不宣称 |
| 迁移 | 同连接事务内 DDL 可回滚 | 事务性 DDL | 两边都走原子迁移 |
| 大对象去向 | 同库 `sl_blob` | 同库 `sl_blob`，或对象存储 | 阈值与去向是策略配置 |

## 组合与验证

### 消费的承诺

| 承诺 | 精确位置 | 本成员怎样消费 |
| --- | --- | --- |
| 存储契约 `commit`、`query`、`registerCombination` 的结果模型与拒绝顺序 | [存储事务行为](../../storage/docs/storage-contract/SPEC.md#提交) | W1 的映射表 |
| 参加者端口与语句限制 | [参加者端口](../../storage/docs/storage-contract/SPEC.md#参加者端口) | 参加者模块只用 `execute`，`params` 只用五种允许类型 |
| SQLite 提供者的启动、受理队列、两段回滚、未知条件 | [SQLite 提供者设计](../../storage/docs/storage-contract/sqlite-provider.md) | 失败分类表 |
| `SessionTransactionPort` 六条义务 | [SessionTransactionPort](../session-contract/SPEC.md#sessiontransactionport) | W1 第 3 步核对完整材料；W1 第 6 步与 W6 返回 `changed`；TB-04 的保管前提；W1 的 `attempt-rejected` 映射；读路径逐页核权；W5 的游标同存 |
| 历史面四个读操作与三个对账读操作的结果与拒绝原因 | [SessionHistory](../session-contract/SPEC.md#sessionhistory)、[SessionReconciliation](../session-contract/SPEC.md#sessionreconciliation) | R2、R5、R8、R10、R11 |
| 事件目录的封套与 38 类 | [事件目录](../session-contract/docs/object-model/session-log-events.md#原生事实类别) | `sl_entry` 列与 W3 的派生规则 |
| `decide`、`reduce` 与 OP-00 的纯函数，以及它们共用的解释版本 | [领域服务与归约](../session-contract/SPEC.md#领域服务与归约)、[OP-00](../session-contract/SPEC.md#op-00) | W1 第 6、7、9 步；W2；W4 第 2 步；R9 |
| 模型视图 CM-01 至 CM-06 与消息类型 | [message SPEC](../../common/message/SPEC.md#模型视图) | W4 第 4 步的新 epoch 行；R5 的消息解码；C-01 的视图重算。压缩判定经 `decide` 传递，本成员不直接调用 |
| `HistoryPage.annotations` 的含义 | [SessionHistory](../session-contract/SPEC.md#sessionhistory) | R2 每页经 R6 填充 |
| 历史源读口 H1 至 H5 | [request-context-contract](../../context/request-context-contract/SPEC.md#历史源读口与-epoch-视图) | R5 |

### 自有义务的验证

每条义务的验证方法、前提与未覆盖写在 [verification/obligations.md](docs/verification-obligations.md)。下表只给对应关系。全部义务都是后继实现必须通过的可观察结果，不是已执行的测试。

| 义务 | 验证 |
| --- | --- |
| C-01 派生等于重算 | 影子表集合差，随机命令序列 |
| C-02、C-03 分页完整与游标 | 属性测试与篡改用例 |
| C-04 前缀摘要 | 属性测试 |
| W1 至 W6 写路径 | 每个 JC 行一个用例，核对派生行与 `sl_state` |
| `decide` 往返 | `reduce(前状态, decide(...) 的批次)` 等于命令要求的后态与提交后的 `sl_state` |
| R6 页内标注 | 跳转读取，`annotations` 与按 SE33 全量扫描的集合比较 |
| R1 至 R11 复杂度与退化 | 基准：N 从 10³ 到 10⁶，R1、R3、R5、R7、R8 不随 N 增长，R2 随 K 与 B 线性 |
| W6 并发写裁定 | 两个进程基于同一 `tail` 提交，只有一个成功 |
| 断电耐久 | 故障注入，介质声明；归 SQL-T01 |
| 失败分类表 | 每行一个注入用例 |

### 明确缺项

| 缺什么 | 谁来补 | 补上之前本成员怎样表现 |
| --- | --- | --- |
| [XP-1 至 XP-6](#xp-table) 的存储契约入口。XP-2 与 XP-6 也在 Session 契约的[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)里 | 存储线（[issue 540](https://github.com/nemori-ai/omne-harness-lite/issues/540)）；XP-2 与 Agent 的拥有者联合，XP-6 与应用装配联合 | 对应操作 `unavailable`，`owner` 为存储参加者。XP-2 缺席时按 [W1](#w1) 第 9 步的退路 |
| SQLite 的独立读连接 | 存储线 | 读与提交在同一 Worker 队列串行。复杂度不变，吞吐由验证计划实测 |
| 对象存储作为 blob 去向 | [issue 541](https://github.com/nemori-ai/omne-harness-lite/issues/541) | 只有同库 `sl_blob` |
| 超过 `maxCommandBytes` 的内容先由内容拥有者保管、再以耐久引用进入条目的链路（Session 契约的[明确缺项](../session-contract/SPEC.md#具名前提与明确缺项)） | 存储的拥有者与各内容拥有者 | 条目只带已达到耐久条件的引用（[TB-04](#tb-04)）。拿不到耐久引用时命令返回 `unavailable` |
| 数值目标：每页延迟、每秒提交数、重建时长、`maxScanPerPage` 与 `pageBytes` 的初值 | 本成员，按验证计划实测后写进本页的声明边界 | 不声明任何数值。策略配置没有默认值时装配必须给出 |
| 断电耐久 | 存储线 SQL-T01 | 本成员只声明进程级持久依赖提供者读回的 `synchronous=FULL`，不宣称断电耐久 |
| 登记键到能力身份的绑定（R10 的 `capability` 列） | Tool 契约与事件目录对 SE08 载荷的细化 | 本成员假定 SE08 的登记键按能力身份列出；不成立时 `ResidentReference.capability` 不可填，R10 不可用 |
