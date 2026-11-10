# @omne-harness/tool-storage-sql 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。本包兑现的端口契约归它们的拥有者：记录仓端口 `ToolLedgerStore` 归 [`@omne-harness/tool`](../tool/src/ledger-store.ts)，原件保管端口 `ToolOutputCustody` 归 [`@omne-harness/tool-contract`](../tool-contract/SPEC.md#p05-执行事实与原输出)，SQL 操作语义归 [`@omne-harness/sql-contract`](../../storage/sql-contract/SPEC.md)。本文件不复制这些契约，只写本包怎样兑现它们。

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

### TS-04 原件保管：分块与清单

`preserve` 不设单次大小上限（D2 决策记录结论第 3 条）。它按下列顺序保管原件：

1. 读本操作的清单。已有清单时：同一输入答原 `RawOutput`，不写入；另一输入答 `conflict`，不改动任何东西。
2. 把原件字节切成不超过 `maxChunkBytes` 的块。每块是一次 SQL 提交，键是（租户，调用，操作，块序号）。块提交遇到已封存的操作时：同一输入不写，另一输入答 `conflict`。
3. 最后提交清单：字节数、块数、SHA-256、封印摘要与答复。参加者先核对第 0 至第 n−1 块正好构成声明的字节与 SHA-256，再删除序号不小于块数的残留块，然后写入清单。核对不成立时答 `conflict`，不写清单。

由此成立：

- 清单落盘之前，`inspect` 不答 `retained`。
- 中断（进程在清单之前停止）留下的块不可见。同一操作重送时按键覆盖它们，多出的块在清单提交时删除。
- 块或清单的提交答 `unknown` 时，`preserve` 答 `commit-unknown`。调用方以同一操作重送。
- 块或清单的提交被存储受理前拒绝时，按 sql-contract 的[提交拒绝原因的定性](../../storage/sql-contract/SPEC.md#提交拒绝原因的定性)作答：暂时的原因答 `unavailable`，诊断带原因，调用方以同一操作重送；确定的原因答 `invalid`，`field` 为 `storage`，`reason` 为原因名。
- 输入身份由 codec、字节数、SHA-256 与来源证据决定。同一操作、同一身份的重送认回原 `RawOutput`。

`RawOutput` 的 `content.key` 是 JSON 文本 `[call, operation]`，`content.storage` 与 `custody.owner` 是 `@omne-harness/tool-storage-sql`，`custody.digest` 绑定租户、调用、操作与输入身份。

### TS-05 结果投影保管

`retainResult` 只在同一租户、同一调用已有封存的原件，且该原件的封印等于 `raw.custody.digest` 时进行。否则答 `invalid`（`field: 'raw'`）。投影值按严格 JSON 编码，在它自己的操作下按 TS-04 分块保管，清单记录它保管在哪个原件之上。参加者在清单提交时再核一次该原件仍已封存。同一操作重送答原证据，另一投影答 `conflict`。原件不因此改变。

### TS-06 修订号

保管行与清单不是 `LedgerRecord`，不在任何账本域内。它们不推进任何账本域修订号（评审 N2），整域读也不受原件大小影响。

### TS-07 构造期核对

`createSqlToolOutputCustody` 在构造时核对：`maxChunkBytes` 与 `maxCommandBytes` 都是正安全整数，并且 `maxChunkBytes` 的 base64 长度加信封预留 `CHUNK_ENVELOPE_BYTES` 不超过 `maxCommandBytes`。不成立时抛 `RangeError`，不构造。信封预留覆盖参加者名、意图、租户文本、各 256 字符的调用与操作、块序号与摘要。

### TS-08 对从未保管的操作的 inspect

`inspect` 对从未保管的操作答 `unknown`（决策记录 U1），对以投影保管的操作也答 `unknown`。它不写排除标记。

### TS-09 读取次序

`ToolLedgerStore.read` 用 `domain-serial`。保管的两个读（清单、块）用 `snapshot`，因为清单一经提交不再改变。sql-contract §9.3 把「可能写入排除记录的 Tool `lookup`/`queryOperation`」留在写路径（评审 N4）。在本包这一层，排除记录由账本以 `ToolLedgerStore.commit` 写入，按修订号条件提交，提交本身在写路径上。读只给出排除决定所依据的修订号，读与条件提交之间落下的任何写都使该提交答 `conflict`。

### TS-10 材料

`toolStorageMaterials()` 返回写参加者 `tool`、可选只读参加者 `tool-record-current`、一条迁移 `tool/001-tool-ledger-custody` 与三个读 handler。`tool` 拥有全部 `tl_` 表，不读其他参加者的表，不需要也不提供事实，声明为 `singleton`。`tool-record-current` 的采用条件归 TS-12；仅列入材料目录不代表应用已采用。每个模块以构建固定的 `file:` URL 与文件字节的 SHA-256 描述。handler 的 `maxOutputBytes` 为 4194304，等于提供者 `maxReadResultBytes` 的初值。

### TS-12 原记录的同事务核回

`toolRecordCurrentFacts` 把 Tool 原拥有者资格读取所得观察转换成只读 guard 命令。输入是一租户的一至三条原记录地址及完整记录的 `canonicalDigest`。来源资格、主体核验及所需记录集合由 Tool host 拥有，调用者不能用自报摘要代替原资格读取。精确形状见 [record-current.ts](src/record-current.ts)。

参加者 `tool-record-current` 只读 `tl_record`，不拥有表、不改变原记录。它按完整主键 `(tenant, kind, name, key)` 点读。记录缺失或摘要不同答 `conflict`，整次 SQL 操作回滚；空集合、重复地址、非 host/call 地址、非法摘要和未知字段答 `unsupported`。全部相等才提供 `tool.records-current/1`，payload 是完整输入依据。调用方必须在同一操作中消费此 fact，并逐项核对依据，不得只检查 fact 存在。

来源绑定在首次 call 创建前即可核回。无关记录的增加不使观察失效。相等是当前内容相等，不承诺识别删除后恢复相同内容的历史过程。SQL 操作回执只能认回原提交结果，不能充当新的 current 检查。新检查使用新的 operationKey。

装配必须保证本批 `tool` 写先于 guard，guard 先于声明依赖此 fact 的消费者；现有 SQL 组合的参加者顺序与事实依赖承载该顺序。没有该顺序时不能声明提交时核回保证。原主体、Identity 撤权、外部运行资格由各自拥有者核回。本材料不授予这些资格，也不单独证明完整权限捕获已接通。条件证明见 [record-current.md](verification/proofs/record-current.md)。

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

## 已知限制

1. 同域共用写队列（R1-D2）：Tool 的提交与会话日志的提交在同一租户事务域排队。ST-09 或 E9 测量超过阈值时重开。
2. 两条不等式（评审 N1）。左侧上界归 `tool` 的 P08 拥有者，在它给出之前是已知限制：
   - 一次 `ToolLedgerStore.commit` 的写入集，编码后加信封不超过 `storage` 行的 `maxCommandBytes`。超过时提供者拒绝（`command_limit`），端口答 `rejected`，`reason` 为 `command_limit`。
   - 一个账本域的全部记录，编码后不超过读 handler 的 `maxOutputBytes`（4194304）与提供者的 `maxReadResultBytes`，记录数不超过 100000。超过时读答 `unavailable`。
3. 原件全文永久保留，与会话日志在同一个 SQLite 文件里增长，没有到期删除（评审 N7）。重开阈值的归属由 Reduce 在 RI 时定。
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
