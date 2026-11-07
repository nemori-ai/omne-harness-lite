# @omne-harness/tool-storage-sql 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本包兑现的端口契约归它们的拥有者：记录仓端口 `ToolLedgerStore` 归 [`@omne-harness/tool`](../tool/src/ledger-store.ts)，原件保管端口 `ToolOutputCustody` 归 [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#p05-执行事实与原输出)，SQL 操作语义归 [`@omne-harness/sql-contract`](../../storage/sql-contract/SPEC.md)。本文件不复制这些契约，只写本包怎样兑现它们。

W3 的材料用途、期限、页租约及删除协议为 [#1168](https://github.com/nemori-ai/omne-harness-lite/issues/1168) 的待评审增量，尚未由本提供者实现。现有已知限制保留为实现差距，不作为继续永久保管正文的兼容依据。

## 范围与依据

本包是 Tool 记录仓与原件保管的 SQL 提供者。它在 `sql-contract` 之上实现耐久的 `ToolLedgerStore` 与 `ToolOutputCustody`，并导出静态材料 `toolStorageMaterials()`。`createSqlToolGuardedHostCommit` 另提供带原调用修订条件的 host 提交，供受信集成方写资源许可。

依据：

- tool-exec 线 D2 决策记录（#421 评论 6561321713，线负责人 2026-11-01 决定，第二层）。决策记录修订了 D2 候选（#421 评论 6561130766）的第 1、2.2、2.3、4、5、7 节。两者不一致时以决策记录为准。
- Reduce 裁定 R1-D2：Tool 的耐久仓与会话日志在同一个租户事务域，共用写队列。
- #421 r6 的 C-SQL-PERMIT 采用 R2-D18 的可加实现范围，兑现[执行环境的资源许可与原调用终局同序](../../execution/execution-environment-contract/SPEC.md#结果与不变量)。采用范围为 TS-11，不改变 `ToolLedgerStore` 端口。
- 消费的契约修订：本包合入时 `@omne-harness/tool` 的 `ToolLedgerStore`（G1）与两组记录仓套件，`@omne-harness/tool-contract` 的 P05 与 custody 套件，`@omne-harness/sql-contract` 的 SQL r2（§2.4、§3.2、§4、§7、§9.3、§17）。

状态：实现与包内验证在 #421 r6 闭包 C-LEDGER 完成。交付接受归派发者。本包不提供 `./cordis` 插件，不接 `tool-records` 行，不合并材料目录。这些归应用侧（波 B 与 L-APP）。

## 结果与不变量

### TS-01 记录仓读取

`read(domain)` 是一次 `domain-serial` 读（sql-contract §9.3、§17）。它在本租户的事务域内读取一个账本域（`call`、`queue` 或 `host`）的修订号与全部记录。

- 从未提交过的账本域答 `complete`，修订号 `0`，没有记录。
- 读取被拒绝或失败时答 `unavailable`，不答空快照。
- 每行记录必须是它的行键所指的记录（`recordKey(record)` 等于行键）。不一致时答 `unavailable`，不交付这行。
- 记录按 JSON 读回。读回的值不与调用方或存储共享引用。

### TS-02 记录仓提交

`commit(input)` 是一次 SQL 提交，参加者为 `tool`。参加者在写事务内依次做下列事：

1. 读取账本域的当前修订号，从未提交过时为 `0`。
2. 当前修订号不等于 `expected` 时，停止并回滚。端口答 `conflict` 与当前修订号，不写入任何东西。
3. 按输入顺序执行写入：`put` 按键替换，`delete` 删除该键，键不存在时什么也不做。
4. 把账本域修订号设为 `revision`。写入集为空或只删除不存在的键时，修订号同样推进。

结果对应如下：

| SQL 结果                                        | 端口答复                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `committed`                                     | `committed`                                                 |
| `rolled_back`，参加者以修订号停止               | `conflict`，带当前修订号                                    |
| `rolled_back`，其他原因（参加者抛错、语句失败） | `unavailable`。明确回滚已持久，提交没有任何效果             |
| `unknown`                                       | `unknown`。账本按它写入的操作认回结果                       |
| `rejected_before_accept`                        | `unavailable`，诊断带拒绝原因                               |
| `identity_conflict`                             | `unavailable`。每次提交用新的操作键，提供者没有执行本次提交 |

写入的记录不是严格 JSON 时（函数、BigInt、非有限数、类型化数组、环），端口在发出提交之前答 `unavailable`。值为 `undefined` 的对象成员按 JSON 省略。

SQL 提供者违反 sql-contract §2.5、以 reject 报告结果时，本包不捕获该异常，原样交给调用方（防御指导 DP-01）。账本把它当作结果不定。

### TS-03 租户隔离

- 租户只经受信的 `TenantDomainLookup`（sql-contract §2.4）取得事务域。目录不含该租户时，读与写都答 `unavailable`，不发出任何 SQL 操作，也不登记租户。
- 目录答复的作用域不是该租户时，答 `unavailable`，不使用该域。
- 租户以 legal-identity 的 TenantId 形状进入。本包用 legal-identity 重建并解析租户文本，非法文本答 `unavailable`。
- 参加者与读 handler 的每条语句都以租户为第一过滤条件。同一数据库里另一租户的行不会被读、认回或覆盖。另一租户对同一调用键的读写，所得答复与从未写过相同。

### TS-04 原件保管：分块与清单

`preserve` 不设单次大小上限（D2 决策记录结论第 3 条）。它按下列顺序保管原件：

1. 读本操作的清单。已有清单时：同一输入答原 `RawOutput`，不写入；另一输入答 `conflict`，不改动任何东西。
2. 把原件字节切成不超过 `maxChunkBytes` 的块。每块是一次 SQL 提交，键是（租户，调用，操作，块序号）。块提交遇到已封存的操作时：同一输入不写，另一输入答 `conflict`。
3. 最后提交清单：字节数、块数、SHA-256、封印摘要与答复。参加者先核对第 0 至第 n−1 块正好构成声明的字节与 SHA-256，再删除序号不小于块数的残留块，然后写入清单。核对不成立时答 `conflict`，不写清单。

由此成立：

- 清单落盘之前，`inspect` 不答 `retained`。
- 中断（进程在清单之前停止）留下的块不可见。同一操作重送时按键覆盖它们，多出的块在清单提交时删除。
- 块或清单的提交答 `unknown` 时，`preserve` 答 `commit-unknown`。调用方以同一操作重送。
- 输入身份由 codec、字节数、SHA-256 与来源证据决定。同一操作、同一身份的重送认回原 `RawOutput`。

`RawOutput` 的 `content.key` 是 JSON 文本 `[call, operation]`，`content.storage` 与 `custody.owner` 是 `@omne-harness/tool-storage-sql`，`custody.digest` 绑定租户、调用、操作与输入身份。

### TS-05 结果投影保管

`retainResult` 只在同一租户、同一调用已有封存的原件，且该原件的封印等于 `raw.custody.digest` 时进行。否则答 `invalid`（`field: 'raw'`）。投影值按严格 JSON 编码，在它自己的操作下按 TS-04 分块保管，清单记录它保管在哪个原件之上。参加者在清单提交时再核一次该原件仍已封存。同一操作重送答原证据，另一投影答 `conflict`。原件字节不因此改变。最终投影须可独立恢复；raw 派生依据只保留定位和验证所需元数据，不能使读投影依赖已经获准释放的 raw 字节。最终提交前 raw 仍有归一化用途，提交后按用途解除和删除任务处理。

### TS-06 修订号

保管行与清单不是 `LedgerRecord`，不在任何账本域内。它们不推进任何账本域修订号（评审 N2），整域读也不受原件大小影响。

### TS-07 构造期核对

`createSqlToolOutputCustody` 在构造时核对：`maxChunkBytes` 与 `maxCommandBytes` 都是正安全整数，并且 `maxChunkBytes` 的 base64 长度加信封预留 `CHUNK_ENVELOPE_BYTES` 不超过 `maxCommandBytes`。不成立时抛 `RangeError`，不构造。信封预留覆盖参加者名、意图、租户文本、各 256 字符的调用与操作、块序号与摘要。

### TS-08 对从未保管的操作的 inspect

`inspect` 对从未保管的操作答 `unknown`（决策记录 U1），对以投影保管的操作也答 `unknown`。它不写排除标记。

### TS-09 读取次序

`ToolLedgerStore.read` 用 `domain-serial`。字节清单内容不可变，读取使用 `snapshot`。W3 在内容读取前通过同材料身份及代次的权威门取得页租约，并核对用途、期限与删除围栏；仅凭不可变清单不足以授权与删除并发的读取。sql-contract §9.3 把「可能写入排除记录的 Tool `lookup`/`queryOperation`」留在写路径（评审 N4）。在本包这一层，排除记录由账本以 `ToolLedgerStore.commit` 写入，按修订号条件提交，提交本身在写路径上。读只给出排除决定所依据的修订号，读与条件提交之间落下的任何写都使该提交答 `conflict`。

### TS-10 材料

`toolStorageMaterials()` 返回一个参加者 `tool`、一条迁移 `tool/001-tool-ledger-custody` 与三个读 handler。参加者拥有全部 `tl_` 表，不读其他参加者的表，不需要也不提供事实，声明为 `singleton`。每个模块以构建固定的 `file:` URL 与文件字节的 SHA-256 描述。handler 的 `maxOutputBytes` 为 4194304，等于提供者 `maxReadResultBytes` 的初值。

### TS-11 带原调用条件的 host 提交

`createSqlToolGuardedHostCommit(options)` 返回独立的 `commit` 端口。调用方传入原调用域、此前读取的 `callExpected` 修订，以及现有的 host `LedgerCommitInput`。

调用方在提交前必须核对主体资格、原调用尚未终局、原请求与准备匹配。本工厂不解析 `ToolState`，也不代替这些判断。它只保证已核对快照的修订在 host 写入时仍成立。调用方不能把已经终局的快照作为许可依据。

参加者在同一个 SQL 操作事务内执行：

1. 核对原调用域为 `call`、目标域为 `host`，且两者租户一致。适配器提交前与参加者解析时各核对一次。非法输入不写入。
2. 按租户、`call` 类型与调用名读取 `tl_domain`。该域不存在或修订不等于 `callExpected` 时答 `call-changed`，host 没有任何写入。缺失的 call 不视为修订 `0` 的已存在调用。
3. 按 TS-02 执行 host CAS。修订不匹配答 `conflict`，`current` 为 host 当前修订。call 条件和 host 写入都在提供者的同一个写事务内，失败回滚该操作，事务提交后才答 `committed`。

`unknown` 与 `unavailable` 沿 TS-02 映射。工厂不自动重试。`call-changed` 或 host `conflict` 后，调用方重新读取、核对原调用，再决定是否重新提交。`unknown` 后，调用方按原 host mutation 查询认回，查不到时仍保留未知，不能据此重复外部效果。

许可先提交、原调用随后终局时，host 记录仍保留。终局不会自动删除许可，后续清理由 host 记录拥有者显式提交。工厂不新建表或迁移。`guarded-host` 意图属于既有 `tool` 参加者，使用 `tl_domain` 与 `tl_record`。参加者代码摘要改变，装配方必须通过 `toolStorageMaterials()` 重算组合清单摘要。

本保证只覆盖原调用修订与 host 提交的排序，不承诺与 Session ended 的跨域原子性。保留范围资格、关闭状态与已发生效果的控制仍归各自权威。

## 所有权、失败与生命周期

- 本包不持有连接、Worker、计时器或其他需要释放的资源。连接、Worker、事务与清理归 SQL 提供者。工厂返回的对象可以随时丢弃。
- 信任假设（评审 N5）：本包不核验主体。调用方（账本、执行侧与启动协调器）在调用之前已核验主体与租户资格。本包只按受信的目录解析租户的事务域，并在每条语句里按租户过滤。
- 每次提交使用新的 SQL 操作键（`tool.ledger`、`tool.guarded-host`、`tool.chunk`、`tool.manifest`）。端口按自己的记录认回结果，不认回 SQL 回执。
- 已提交的写入与保管不因任何对象被丢弃而撤销。

## W3 材料保管与回收设计

精确行为归 [Tool 有限期正文保管](../tool-contract/SPEC.md#有限期正文保管)。本包沿既有 SQL 参加者兑现 Tool 账本与材料状态，不另建跨域存储权威。

- 最终通道先写成耐久材料，再由 Tool 权威提交结果版本、用途、固定期限及待删除任务。准备材料的清单不能反向要求永久保留 raw。Tool 结果提交未知时查原 operation，不能因扫描不到关联就删除在途材料。
- 材料身份、代次和用途是回收依据。相同字节可以共享物理材料，但每项独立用途须完整登记；引用计数的数字本身不代替用途证据。原生引用的目标不登记为可删除的 Tool 正文。
- 页准入和删除围栏在同材料顺序中核验。删除任务固定精确 key 和代次；IO 在 SQL 事务外执行，成功后确认原任务。未知或失败保持待办。过期只关闭正文新读，不清除仍有程序用途或有效页租约的材料。
- 受信维护端口以有限批量扫描和推进。租户过滤同时覆盖清单、块、用途、租约、任务及认回路径；跨租户相同调用号不能共用材料。SQL 内部 base64 信封仍是传输编码，不作为模型正文协议。
- 历史迁移先提供预演清单。可信结果提交时刻可作期限起点，否则在迁移提交时一次固定。无法确认所有权的材料隔离报告，不能按字段名或路径猜测为 Tool 自有正文。迁移同身份可认回，原生附件目标不在删除集合。
- 空间验证分别记录源字节、材料副本、索引、回执、WAL、临时文件及数据库空闲页。逻辑释放、可复用空间和操作系统文件缩小分别报告；不为缩小文件而无条件阻塞前台执行 VACUUM。

提供者工厂继续不持有定时器或宿主生命周期。扫描调度及关闭排空由装配持有者承担。SQL 清单与字节后端可以分离，但最终材料耐久、Tool 提交和物理删除确认仍是三个可注入故障的边界。

W3-A 按[材料协议](../tool-contract/docs/material-protocol.md)拆清实现职责。Tool 保管分面负责用途和时间；本包的字节分面负责精确 objectId/generation 的不可变存储。pending final envelope、raw 与最终通道均分块保存，不能在 tl_record 或 manifest answer 中重复完整载荷。账本只写引用、用途、时间水位、页租约与原操作依据。

候选索引由同一 ledger participant 随账本写入共同维护，只输出有界 call/material 定位；其结果不能直接调用删除。对象 write/seal 和持久删除 tombstone 共排序，删除回执未知后仍拒绝旧写复活。删除覆盖全部 chunks 与含载荷的清单，保留必要的摘要回执和围栏。旧 adoption 的材料在换 provider 后仍须可认回；无法解析时答 unavailable，不能猜测 missing。

## 已知限制

1. 同域共用写队列（R1-D2）：Tool 的提交与会话日志的提交在同一租户事务域排队。ST-09 或 E9 测量超过阈值时重开。
2. 两条不等式（评审 N1）。左侧上界归 `tool` 的 P08 拥有者，在它给出之前是已知限制：
   - 一次 `ToolLedgerStore.commit` 的写入集，编码后加信封不超过 `storage` 行的 `maxCommandBytes`。超过时提供者拒绝（`command_limit`），端口答 `unavailable`。
   - 一个账本域的全部记录，编码后不超过读 handler 的 `maxOutputBytes`（4194304）与提供者的 `maxReadResultBytes`，记录数不超过 100000。超过时读答 `unavailable`。
3. 当前实现没有材料到期删除，Tool 材料与会话日志在同一个 SQLite 文件里增长。它尚不满足 W3 的有限期正文契约，须由本波新增用途及删除流程闭合；不能保留为生产永久全文政策。
4. `inspect` 对从未保管的操作答 `unknown`（U1），P05 拥有者另定时再改。
5. 只验证了单进程。两个进程共用一个库、真实 SQLite 提供者的 Worker、持久与断电都未验证，留联调 A。
6. 每次提交（包括每个块）在提供者的回执表里留下一条回执。原件越大，回执越多。
7. 清单提交在一个写事务内重读全部块并计算 SHA-256，代价与原件大小成正比。
8. 值为 `undefined` 的记录成员按 JSON 省略。读回的记录没有这些成员。

## 组合与验证

| 义务                | 持续验证                                                                                                                                                                                     | 前提与未覆盖                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TS-01、TS-02        | `tests/ledger-store-conformance.spec.ts` 运行 `toolLedgerStoreConformance()` 与 `toolLedgerStoreCompositionConformance()`，七个故障手柄都有来源，没有不适用项；`tests/atomic-commit.spec.ts` | SQLite 测试提供者（`tests/fixtures/sqlite-storage.ts`），不是 sqlite-provider                    |
| TS-03               | `tests/tenant-isolation.spec.ts`：同键两租户、他租户行混入同一库、目录外的租户                                                                                                               | 同上                                                                                             |
| TS-04、TS-05、TS-08 | `tests/custody-conformance.spec.ts` 运行 `toolOutputCustodyConformance()`，没有不适用项；`tests/custody-chunks.spec.ts`；`tests/participant.spec.ts`                                         | 同上                                                                                             |
| TS-06、TS-07        | `tests/custody-chunks.spec.ts`                                                                                                                                                               | 同上                                                                                             |
| 重开                | `tests/reopen.spec.ts`：关闭再打开同一组数据库文件                                                                                                                                           | 进程内关闭与重开，不是进程终止或断电                                                             |
| 启动围栏            | `tests/start-coordinator.spec.ts`：`tool-host-local` 的协调器在本仓上运行三组启动套件，并在重开后重建                                                                                        | 授权套件的用例全部不适用（协调器没有授权消费点）                                                 |
| TS-10               | `tests/materials.spec.ts`、`tests/public-entry.spec.ts`                                                                                                                                      | 真实的三方材料合并由应用侧验证                                                                   |
| TS-11               | `tests/guarded-host-commit.spec.ts`：真实 Tool 终局、两个 SQLite 连接竞争、租户隔离、丢答、操作中失败与重开                                                                                  | 使用 node:sqlite 测试提供者和真实参加者。未验证 sqlite-provider Worker、组提交、跨进程竞争或断电 |
