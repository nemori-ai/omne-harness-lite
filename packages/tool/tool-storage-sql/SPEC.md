# @omne-harness/tool-storage-sql 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本包兑现的端口契约归它们的拥有者：记录仓端口 `ToolLedgerStore` 归 [`@omne-harness/tool`](../tool/src/ledger-store.ts)，正文存储端口 `ToolBodyStore` 与到期索引的契约归 [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#正文存储端口与到期索引)，SQL 操作语义归 [`@omne-harness/sql-contract`](../../storage/sql-contract/SPEC.md)。本文件不复制这些契约，只写本包怎样兑现它们。

## 范围与依据

本包是 Tool 记录仓与正文存储的 SQL 提供者。它在 `sql-contract` 之上实现耐久的 `ToolLedgerStore`（含同租户读集断言的条件提交 TS-11、到期索引 TS-14 与整域删除 TS-15）与 `ToolBodyStore`（TS-13），并导出静态材料 `toolStorageMaterials()`。

依据：

- tool-exec 线 D2 决策记录（#421 评论 6561321713，线负责人 2026-11-01 决定，第二层）。决策记录修订了 D2 候选（#421 评论 6561130766）的第 1、2.2、2.3、4、5、7 节。两者不一致时以决策记录为准。
- Reduce 裁定 R1-D2：Tool 的耐久仓与会话日志在同一个租户事务域，共用写队列。
- [执行环境的资源许可与原调用终局同序](../../execution/execution-environment-contract/SPEC.md#结果与不变量)由 `ToolLedgerStore.commit` 的读集断言（`tool` SPEC「记录仓的同租户读集断言」）兑现，本包在 TS-11 实现它；原来的专用守护宿主提交已删除。
- 消费的契约修订：本包合入时 `@omne-harness/tool` 的 `ToolLedgerStore`（G1）与两组记录仓套件，`@omne-harness/tool-contract` 的正文存储端口与 `toolBodyStoreConformance()`，`@omne-harness/sql-contract` 的 SQL r2（§2.4、§3.2、§4、§7、§9.3、§17）。

状态：实现与包内验证在 #421 r6 闭包 C-LEDGER 完成。交付接受归派发者。本包不提供 `./cordis` 插件，不接 `tool-records` 行，不合并材料目录。这些归应用侧（波 B 与 L-APP）。

## 结果与不变量

### TS-01 记录仓读取

`read(domain)` 是一次 `domain-serial` 读（sql-contract §9.3、§17）。它在本租户的事务域内读取一个账本域（`call`、`queue` 或 `host`）的修订号与全部记录。

- 从未提交过的账本域答 `complete`，修订号 `0`，没有记录。
- 读取被拒绝或失败时答 `unavailable`，不答空快照。
- 每行记录必须是它的行键所指的记录（`recordKey(record)` 等于行键）。不一致时答 `unavailable`，不交付这行。
- 记录按 JSON 读回。读回的值不与调用方或存储共享引用。

`readRecord(domain, key)` 在同一次 `domain-serial` 读中取得域修订号和指定键的记录。SQL 使用已有的 `(tenant, kind, name, key)` 主键查询，返回零或一行，不扫描其他记录正文。缺失、不可用、格式与行键核对遵循 TS-01。单键读不改变完整域读取的数量和字节限制。

### TS-02 记录仓提交

`commit(input)` 是一次 SQL 提交，参加者为 `tool`。参加者在写事务内依次做下列事：

1. 读取账本域的当前修订号，从未提交过时为 `0`。
2. 当前修订号不等于 `expected` 时，停止并回滚。端口答 `conflict` 与当前修订号，不写入任何东西。
3. 按输入顺序执行写入：`put` 按键替换，`delete` 删除该键，键不存在时什么也不做。
4. 把账本域修订号设为 `revision`。写入集为空或只删除不存在的键时，修订号同样推进。
5. 写入集中的 `schedule` 与 `unschedule` 在同一写事务内更新 `tl_due`（TS-14）。索引写入失败使整个事务回滚。

结果对应如下：

| SQL 结果                                        | 端口答复                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `committed`                                     | `committed`                                                 |
| `rolled_back`，参加者以修订号停止               | `conflict`，带当前修订号                                    |
| `rolled_back`，其他原因（参加者抛错、语句失败） | `rejected`，`reason` 为失败类别。明确回滚已持久，提交没有任何效果；失败由输入与已提交的数据决定（sql-contract §7.6），同一提交再试得到同一失败 |
| `unknown`                                       | `unknown`。账本按它写入的操作认回结果                       |
| `rejected_before_accept`，暂时的原因            | `unavailable`，诊断带拒绝原因                               |
| `rejected_before_accept`，确定的原因            | `rejected`，`reason` 为拒绝原因。定性见 sql-contract 的[提交拒绝原因的定性](../../storage/sql-contract/SPEC.md#提交拒绝原因的定性) |
| `identity_conflict`                             | `unavailable`。每次提交用新的操作键，提供者没有执行本次提交 |

写入的记录不是严格 JSON 时（函数、BigInt、非有限数、类型化数组、环），端口在发出提交之前答 `rejected`：同一写入集再试仍不是严格 JSON。值为 `undefined` 的对象成员按 JSON 省略。

SQL 提供者违反 sql-contract §2.5、以 reject 报告结果时，本包不捕获该异常，原样交给调用方（防御指导 DP-01）。账本把它当作结果不定。

### TS-03 租户隔离

- 租户只经受信的 `TenantDomainLookup`（sql-contract §2.4）取得事务域。目录不含该租户时，读与写都答 `unavailable`，不发出任何 SQL 操作，也不登记租户。
- 目录答复的作用域不是该租户时，答 `unavailable`，不使用该域。
- 租户以 legal-identity 的 TenantId 形状进入。本包用 legal-identity 重建并解析租户文本，非法文本答 `unavailable`。
- 参加者与读 handler 的每条语句都以租户为第一过滤条件。同一数据库里另一租户的行不会被读、认回或覆盖。另一租户对同一调用键的读写，所得答复与从未写过相同。

### TS-06 修订号

正文分块与清单不是 `LedgerRecord`，不在任何账本域内。它们不推进任何账本域修订号（评审 N2），整域读也不受原件大小影响。

### TS-09 读取次序

`ToolLedgerStore.read` 与 `due` 用 `domain-serial`。正文清单与分块不可变，`tool.body.read` 用 `snapshot`；读回的授权、期限与读后再核归 Tool 的账本，不归本包。

### TS-10 材料

`toolStorageMaterials()` 返回一个参加者 `tool`、一条迁移 `tool/r6-001-tool-ledger-body-due`（账本、正文存储与到期索引的表）和三个读 handler。模块以文件 URL 与 SHA-256 命名；应用把它们并入组合目录，本包不建目录。

### TS-11 带同租户读集断言的提交

`commit` 的 `asserts` 随 `ledger` 意图进入同一个参加者命令。适配器先核每条断言的域与被写域同租户，不同租户答 `unavailable`，不提交 SQL。参加者在同一个 SQL 操作事务内执行：

1. 按 TS-02 读被写域的修订号，不等于 `expected` 时以 `revision` 原因停止，答 `conflict`。
2. 对每条断言按租户、域类型与域名读取 `tl_domain`；该域不存在时修订为 `0`。任一修订不等于断言值时以 `assertion` 原因停止，答 `conflict`，`current` 为被写域的当前修订号，没有任何写入。
3. 两项都成立才应用写入并推进被写域的修订号。断言的域不写、不推进修订号。读取与写入在提供者的同一个写事务内，所以被断言域的提交不能落在评估与写入之间。

`unknown` 与 `unavailable` 沿 TS-02 映射。调用方在 `conflict` 后重读所有参与的域再决定是否重新提交；`unknown` 后按自己写入的记录认回。本保证只覆盖同一租户事务域内各账本域的排序，不承诺与 Session 的跨域原子性。`toolLedgerStoreConformance()` 的 `store.asserts-*` 用例在本仓上运行。

### TS-15 整域删除

记录仓端口的整域删除是一次 SQL 提交，参加者为 `tool`。语义归 `tool` SPEC 的[记录仓的整域删除](../tool/SPEC.md#记录仓的整域删除)。参加者在一个写事务内做下列事：

1. 按 TS-02 读该账本域的修订号。修订号不等于期望值时，以 `revision` 原因停止并回滚。端口答 `conflict` 与当前修订号，不删除任何行。
2. 按 `(tenant, kind, name)` 删除三张表里属于该域的行：`tl_record` 的全部记录、`tl_due` 的全部到期条目与 `tl_domain` 的修订号行。
3. 三项删除在同一个写事务里一起生效或一起回滚。任一删除失败使整个事务回滚。

每条语句以租户为第一过滤条件，所以另一个租户的同名域不受影响（TS-03）。删除之后读该域，按 TS-01 答 `complete`，修订号 `0`，没有记录。删除不留墓碑。SQL 结果到端口答复的映射同 TS-02。正文表不属于任何账本域，整域删除不碰 `tl_body_chunk` 与 `tl_body_manifest`（TS-06）。

## 所有权、失败与生命周期

- 本包不持有连接、Worker、计时器或其他需要释放的资源。连接、Worker、事务与清理归 SQL 提供者。工厂返回的对象可以随时丢弃。
- 信任假设（评审 N5）：本包不核验主体。调用方（账本、执行侧与启动协调器）在调用之前已核验主体与租户资格。本包只按受信的目录解析租户的事务域，并在每条语句里按租户过滤。
- 每次提交使用新的 SQL 操作键（`tool.ledger`、`tool.body-put`、`tool.body-seal`、`tool.body-delete`），身份带 `recall: 'never'`（[sql-contract §3.1](../../storage/sql-contract/SPEC.md#不认回的提交)），提供者不为它写回执。端口按自己的记录认回结果：账本按操作记录与域修订，正文存储按分块与清单的现状（同序号同字节答 `kept`，同清单答 `sealed`，删除幂等）。提交结果未知时，端口读回这些记录，不重新执行工具。端口从不重用 SQL 身份；同一端口操作重送时，账本的修订守卫与正文的不可变性认回原结果，不产生第二份结果。
- 已提交的写入与正文不因任何对象被丢弃而撤销。

## 已知限制

1. 同域共用写队列（R1-D2）：Tool 的提交与会话日志的提交在同一租户事务域排队。ST-09 或 E9 测量超过阈值时重开。
2. 两条不等式（评审 N1）。左侧上界归 `tool` 的 P08 拥有者，在它给出之前是已知限制：
   - 一次 `ToolLedgerStore.commit` 的写入集，编码后加信封不超过 `storage` 行的 `maxCommandBytes`。超过时提供者拒绝（`command_limit`），端口答 `rejected`，`reason` 为 `command_limit`。
   - 一个账本域的全部记录，编码后不超过读 handler 的 `maxOutputBytes`（4194304）与提供者的 `maxReadResultBytes`，记录数不超过 100000。超过时读答 `unavailable`。
3. 正文删除与整域删除去掉对应的行，产生可复用页，不承诺 SQLite 文件立即缩小。回收后的正文条目随调用域的整域删除去掉（TS-15）。
4. 两个进程同时共用一个库、强杀与断电耐久未验证。
5. 封存在一个写事务内重读全部分块并计算 SHA-256，代价与正文大小成正比。
6. 值为 `undefined` 的记录成员按 JSON 省略。读回的记录没有这些成员。

## 组合与验证

| 义务                | 持续验证                                                                                                                                                                                     | 前提与未覆盖                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TS-01、TS-02、TS-11、TS-15 | `tests/ledger-store-conformance.spec.ts` 运行 `toolLedgerStoreConformance()`（含 `store.asserts-*` 与整域删除用例）与 `toolLedgerStoreCompositionConformance()`，七个故障手柄都有来源，没有不适用项；`tests/atomic-commit.spec.ts`；`tests/ledger-asserts.spec.ts`：排队中的提交在执行时才评估断言，两个连接之间被断言域的写入使断言在执行时失败 | SQLite 测试提供者（`tests/fixtures/sqlite-storage.ts`），不是 sqlite-provider；提供者的 4 MiB 读出上限由该测试双身按 `READ_OUTPUT_BYTES` 复现 |
| TS-03               | `tests/tenant-isolation.spec.ts`：同键两租户、他租户行混入同一库、目录外的租户；`tests/tenant-isolation-live.spec.ts`：正文表与到期索引上的同一性质——A 的正文对 B 不到期、不被 B 的清扫回收、B 的账本与正文仓读不到、B 的删除不动它；混入 A 库的 B 行不进入 A 的到期读、清扫、正文读与删除 | 同上                                                                                             |
| TS-06 | `tests/body-revision-live.spec.ts`：真实 sqlite-provider 上写入三块正文并封存清单，前后 `tl_domain` 的全部行不变，调用域与宿主域经 `read` 读到的修订号不变，按写入前修订号的账本提交仍然落盘 | 慢层；只覆盖写入与封存，删除正文不在本用例 |
| 不写回执（C10）     | `tests/receipts-live.spec.ts`：真实 sqlite-provider 上一次带卸载正文的完整调用（受理、准备、启动、正文块与封存、最终事实、收场，≥ 8 次提交）后 `_sql_receipt` 行数不变 |
| 重开                | `tests/reopen.spec.ts`：关闭再打开同一组数据库文件                                                                                                                                           | 进程内关闭与重开，不是进程终止或断电                                                             |
| 启动围栏            | `tests/start-coordinator.spec.ts`：`tool-host-local` 的协调器在本仓上运行三组启动套件，并在重开后重建                                                                                        | 授权套件的用例全部不适用（协调器没有授权消费点）                                                 |
| 历史无关（C7 host） | `tests/host-history-independence.spec.ts`：种入 2000 次 Tools 调用（来源绑定、控制主体、父与目标两次受理、环境获取与长寿命保留作用域里的保留终端与移交后停止的保留进程、转发槽与一条收到的副本、父调用经真实账本驱动到 `done` 的结果交付）后新调用能启动；计数记录仓显示一次 Tools 调用在宿主路径上读到的记录数与字节数在 20 与 2000 次历史下逐项相等，保留作用域记录的大小两次相等；作用域的收场记录随已停止的保留进程增长（等于停止数），只计数，读一条收场事实恰读一条记录；`start-guards` 大小单独报告 | 慢层；接收方、资格与材料是替身，账本与宿主工厂是真件 |
| TS-10               | `tests/materials.spec.ts`、`tests/public-entry.spec.ts`                                                                                                                                      | 真实的三方材料合并由应用侧验证                                                                   |

## 正文存储与到期索引的实现映射

正文与到期索引的命令沿同一 `tool` 参加者执行（`body-put`、`body-seal`、`body-delete` 与 `ledger` 的 `schedule`/`unschedule`）。表：`tl_domain`、`tl_record`、`tl_body_chunk`、`tl_body_manifest`、`tl_due`；读 handler：`tool.ledger.read`、`tool.body.read`、`tool.due.read`；一条迁移 `tool/r6-001-tool-ledger-body-due`。打开 r6 基线之前建的库时，SQL 提供者发现当前目录不列出的迁移标记，拒绝该事务域，不迁移旧数据（C9，`tests/old-baseline-quarantine.spec.ts`）。

### TS-13 正文存储

`createSqlToolBodyStore(options)` 在 SQL 存储契约上兑现 [`ToolBodyStore`](../tool-contract/SPEC.md#正文存储端口与到期索引)。`options` 在记录仓的选项之外给出 `permitKey` 与 `clock`：适配器在发送命令之前、在本进程内用 `verifyBodyPermit` 校验许可签名，并用 `clock.now()` 判断截止时间；参加者不接收时钟，只保持对象不可变。`put`、`seal`、`delete` 各是一次 SQL 提交（意图 `body-put`、`body-seal`、`body-delete`），冲突与未就绪由参加者以 `body-conflict`、`body-not-ready` 停止并回滚；`sealed` 在提供者提交清单之后才答出。`read` 用 `tool.body.read`（`snapshot`）按序号范围读取，一次最多 `BODY_READ_CHUNKS` 块，更长的范围分多次读取；正文一旦封存就不再变化，两次读取之间被删除的正文答 `absent`。表：`tl_body_chunk(tenant, call, body, seq, data)` 与 `tl_body_manifest(tenant, call, body, chunks, bytes, digest)`，都不碰 `tl_domain`。判据：`tests/body-store-conformance.spec.ts` 在 SQLite 测试提供者上运行 `toolBodyStoreConformance()`，`crash` 手柄关闭并重开同一目录。

### TS-14 到期索引

`ledger` 意图的写入集接受 `schedule` 与 `unschedule`，参加者在同一个写事务内写 `tl_due(tenant, kind, name, key, due_at)`，所以它们与记录写入和修订号推进一起生效或一起回滚。`ToolLedgerStore.due` 用 `tool.due.read`（`domain-serial`）读取 `due_at <= now` 的条目，一次最多 `DUE_READ_ENTRIES` 条，适配器把更大的 `limit` 收窄到这个上限。判据：`tests/ledger-store-conformance.spec.ts` 的 `due.*` 用例。
