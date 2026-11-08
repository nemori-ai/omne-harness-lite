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
5. 调用域按最终维护提示更新 TS-12 候选索引，与账本写集同事务。索引失败使整个事务回滚。

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

`retainResult` 完整投影写入已退出公开保管端口。参加者拒绝新的 retain manifest，不再建立对 raw 的 holder 依赖。最终通道通过 ToolMaterialStore 分别保存，由 Tool 结果 CAS 管理用途及替代关系。既有 retain manifest 的读取和数据库记录暂时保留，显式历史迁移归 W3-C，不在接口迁移时直接删除旧数据。

### TS-06 修订号

保管行与清单不是 `LedgerRecord`，不在任何账本域内。它们不推进任何账本域修订号（评审 N2），整域读也不受原件大小影响。

### TS-07 构造期核对

`createSqlToolOutputCustody` 在构造时核对：`maxChunkBytes` 与 `maxCommandBytes` 都是正安全整数，并且 `maxChunkBytes` 的 base64 长度加信封预留 `CHUNK_ENVELOPE_BYTES` 不超过 `maxCommandBytes`。不成立时抛 `RangeError`，不构造。信封预留覆盖参加者名、意图、租户文本、各 256 字符的调用与操作、块序号与摘要。

### TS-08 对从未保管的操作的 inspect

`inspect` 对从未保管的操作答 `unknown`（决策记录 U1），对以投影保管的操作也答 `unknown`。它不写排除标记。

### TS-09 读取次序

`ToolLedgerStore.read` 用 `domain-serial`。字节清单内容不可变，读取使用 `snapshot`。W3 在内容读取前通过同材料身份及代次的权威门取得页租约，并核对用途、期限与删除围栏；仅凭不可变清单不足以授权与删除并发的读取。sql-contract §9.3 把「可能写入排除记录的 Tool `lookup`/`queryOperation`」留在写路径（评审 N4）。在本包这一层，排除记录由账本以 `ToolLedgerStore.commit` 写入，按修订号条件提交，提交本身在写路径上。读只给出排除决定所依据的修订号，读与条件提交之间落下的任何写都使该提交答 `conflict`。

### TS-10 材料

`toolStorageMaterials()` 返回一个参加者 `tool`、两条迁移 `tool/001-tool-ledger-custody`、`tool/002-tool-materials` 与四个读 handler。参加者拥有全部 `tl_` 表，不读其他参加者的表，不需要也不提供事实，声明为 `singleton`。每个模块以构建固定的 `file:` URL 与文件字节的 SHA-256 描述。handler 的 `maxOutputBytes` 为 4194304，等于提供者 `maxReadResultBytes` 的初值。

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
- 历史载荷经独立维护读口交给Tool拥有的格式解码；普通账本读口不把旧载荷强转成当前记录。预演只读。一次迁移先保存原操作、源修订及固定目标身份，再准备材料。发布在同一SQL事务内核源修订，替换当前通道及旧final事实的完整载荷，并保存用途、固定期限、旧正文来源关联和完成回执。final转换保留Tool定义的稳定事实和结果绑定，不得在迁移回执之后用另一次事务补做。源已变化则拒绝发布，不能覆盖旧拥有者的新写入。
- 发布未知时按原操作认回，不重算已经提交的期限。旧raw/retain清单及分块只有在已确认替代且所有独立用途结束后才能删除；删除只接受该迁移证明拥有的精确清单。host交付副本的含义与处置归host，SQL不自行解释其阶段或替它授予删除。
- 空间验证分别记录源字节、材料副本、索引、回执、WAL、临时文件及数据库空闲页。逻辑释放、可复用空间和操作系统文件缩小分别报告；不为缩小文件而无条件阻塞前台执行 VACUUM。

`createSqlToolHistorySourceReader` 只读取历史清单证明属于该调用的 sealed raw。它采用固定旧生产者的分块布局：除末块外，每块与首块等长。游标绑定租户、调用、结果及完整清单，偏移须与块位置一致。每页读取前后核对同一清单，拒绝缺块、非规范 base64 或布局不符。此适配器不授予访问资格；Tool 维护入口负责逐页核当前资格。

提供者工厂继续不持有定时器或宿主生命周期。扫描调度及关闭排空由装配持有者承担。SQL 清单与字节后端可以分离，但最终材料耐久、Tool 提交和物理删除确认仍是三个可注入故障的边界。

W3-A 按[材料协议](../tool-contract/docs/material-protocol.md)拆清实现职责。Tool 保管分面负责用途和时间；本包的字节分面负责精确 objectId/generation 的不可变存储。pending final envelope、raw 与最终通道均分块保存，不能在 tl_record 或 manifest answer 中重复完整载荷。账本只写引用、用途、时间水位、页租约与原操作依据。

候选索引由同一 ledger participant 随账本写入共同维护，只输出有界 call/material 定位；其结果不能直接调用删除。对象 write/seal 和持久删除 tombstone 共排序，删除回执未知后仍拒绝旧写复活。删除覆盖全部 chunks 与含载荷的清单，保留必要的摘要回执和围栏。旧 adoption 的材料在换 provider 后仍须可认回；无法解析时答 unavailable，不能猜测 missing。

## 已知限制

1. 同域共用写队列（R1-D2）：Tool 的提交与会话日志的提交在同一租户事务域排队。ST-09 或 E9 测量超过阈值时重开。
2. 两条不等式（评审 N1）。左侧上界归 `tool` 的 P08 拥有者，在它给出之前是已知限制：
   - 一次 `ToolLedgerStore.commit` 的写入集，编码后加信封不超过 `storage` 行的 `maxCommandBytes`。超过时提供者拒绝（`command_limit`），端口答 `unavailable`。
   - 一个账本域的全部记录，编码后不超过读 handler 的 `maxOutputBytes`（4194304）与提供者的 `maxReadResultBytes`，记录数不超过 100000。超过时读答 `unavailable`。
3. 材料删除与持久候选索引已实现，应用维护行负责自动推进。删除释放分块并产生可复用页，不承诺 SQLite 文件立即缩小。回执、围栏与会话历史仍按各自责任保留，长期增长须分别测量；不能以这些记录保留正文副本。
4. `inspect` 对从未保管的操作答 `unknown`（U1），P05 拥有者另定时再改。
5. 已验证真实 SQLite Worker 重建及两个先后运行的进程恢复同一删除操作。两个进程同时共用一个库、强杀与断电耐久仍未验证。
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

## W3 材料 worker 的实现映射

材料命令沿同一 `tool` 参加者执行。002 新增 `tl_material` 与 `tl_material_chunk`，依赖 001，不修改 001 的迁移文件。旧 raw/retain 迁移归 W3-C，不由新增空表自动完成。

同一 tenant/call/material 的 begin 固定原写操作与输入摘要。chunk 仅接受原输入，不覆盖异值分块。seal 核完整长度及 SHA-256。material-erase 首次持久记录原删除操作及授权摘要，禁止后续 begin/chunk/seal。后续同操作每次最多删 128 块，剩余为零才记录 deleted，并解除载荷描述。对象围栏仍保留。

`tool.material.read` 采用 domain-serial，最多读取两行。每次字节读取限于一个分块且最多 65536 字节，通过 SQL substr 取范围。这个物理 IO 上限不定义模型的正文预算或 Tools.read_result 的语义页。未知、未封存、已围栏及损坏分别返回内部状态，由公开适配器按契约全化。

当前已实现 worker、读 handler、公开材料仓适配器及持久候选索引。TTL、用途、资格及删除授权归 Tool；SQL worker 不判断业务期限。自动维护调度由应用装配消费候选源与 Tool 维护端口。


## W3 公开材料仓

`createSqlToolMaterialStore` 返回 `ToolMaterialStore`。受信装配提供 provider adoption、已有租户目录及 SQL 组合。材料地址包含完整 provider adoption、材料 id 和 generation，调用及租户另外进入 SQL 主键。provider 不匹配返回 unavailable，不把不同提供者的空仓解释为 unknown。主体资格由调用本仓的 Tool 边界核验，本仓不读取 Session。

write 在第一次异步目录查询前复制字节及输入元数据。begin 固定分块布局，重试使用已存布局；修改工厂分块配置不改变未完成对象。封存的同输入直接认回原 seal，异输入冲突。适配器按实际 JSON 命令字节数检查配置上限。已受理或抛错而无法确认写入结果时返回 commit-unknown，保留原 operation；不会在未知状态下继续下一步。

inspect 核原写操作；inspectErase 核原删除操作。未封存、完整封存、持久围栏和删除完成分别返回对应状态。来自 SQL 的状态、seal 与字节页必须经解析，异常形状返回 unavailable，不猜测冲突或已删除。物理字节缺席、未准备完成、已围栏或损坏不能返回空成功页。仅材料末尾可以返回空页及 next=null。

erase 每次只提交一次 material-erase，不在适配器中循环。pending 表示围栏已建立或仍有分块；deleted 才携带完成回执。重试沿原 operation 和授权摘要推进，异操作或异授权冲突。inspectErase 不执行物理删除。

上述为字节仓行为。最终事实、结果结算、正文读取及应用自动维护已消费该仓。正文到期、语义页、用途解除与回收进度由 Tool 实现。

### TS-12 持久材料维护候选

`createSqlToolMaterialMaintenanceSource` 实现 Tool 的窄候选源。它沿 N5 使用受信调用方，不签发主体，也不从扫描结果推导删除资格。每次扫描按 TS-03 解析租户域并在语句内过滤租户。

迁移 003-tool-material-maintenance 从已有调用域及其唯一维护提示建立索引。无提示的旧域记为 unknown，交给 Tool 经调用 CAS 回填；SQL 不计算用途或生成期限。后续调用提交在同一事务内投影最终提示。索引按调用保存稳定递增序号，更新提示不改变序号，元数据随调用账本保留。

扫描首段固定该租户的最大序号，后续只读取原上界内、原位置之后的活动行。单页 limit 是 1 至 128 的安全整数；128 是资源边界，不是吞吐承诺。每次最多读取一条上界和 limit+1 条活动行。先取有界行，再按固定时间截点排除尚未到期的 due；none 不进入活动页。返回位置越过所有已扫描行，因此 calls 可以为空而 next 非空。新调用及已越过位置后才改变的旧调用由下一轮发现。

游标绑定版本、租户、时间截点、上界和位置，可在重开后继续。它不是授权凭证。无效输入在读取前拒绝；存储失败或损坏提示返回失败，不回答扫描完成。候选只返回调用身份，处理时仍须由 Tool 重核。无限坏项的修复、Host 公平调度、关闭和实际生产装配不由本提供者承诺。

验证入口为 [候选源场景](tests/material-maintenance-source.spec.ts)及 [实际提供者重开与读预算](tests/material-maintenance-live.spec.ts)。它们不代替 Host 的自动维护验收。
