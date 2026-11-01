# @omne-harness/model-storage-sql 行为规格

本页拥有本成员在 SQL 存储契约上保存 Model 调用事实的行为。类型与运行时校验归 [src/](src/index.md) 的公开源码。Model 的公共行为归 [model-contract SPEC](../model-contract/SPEC.md)，归约规则归 `@omne-harness/model` 的共享核心，存储提交协议归 [sql-contract SPEC](../../storage/sql-contract/SPEC.md)。本页不重写这些承诺。

## 范围与依据

本成员实现共享核心的存储端口 `ModelCommandStorage`，并把核心与它装成耐久的 `ModelCommands`。它把一次调用的耐久事实保存为一份调用文档，按版本比较写入（CAS），并在提交点线性化。采用依据是 L-MODEL 波 1 的设计 D3、决策记录 D3（第 1、3、4、8 到 12 条）、D3b（`ModelCommandStorage` 是权威形状）、D3c（余下工作重切）与 D3d（S1 评审遗留的八条）。

### 实现现状

现在的切片是 S1 存储骨架加 C-WIRE-SQL 装配。

- 已实现：四张表与迁移 `001-model-records`；行与调用文档之间的解析；`createSqlModelStorage`，即 `ModelCommandStorage` 的 SQL 实现；参加者 `model`；读 handler `model.call` 与 `model.pending` 的模块；构造期核对；`createSqlModelCommands`，即共享核心的 22 个方法装在这份存储上。
- 未实现：发送协调器（C-COORD）；静态材料 `modelStorageMaterials()` 及其 `codeDigest`；`modelCommands` 应用插件（L-APP）。

### 耐久的 ModelCommands

`createSqlModelCommands(options)` 等于 `modelCommands(createModelCommandsCore(核心选项, createSqlModelStorage(存储选项)))`。22 个方法的规则全部在共享核心，本成员不另写规则。

- 选项是核心的选项（`owners`、`authority`、`evidence`、`clock`、`limits`）加上存储需要的 `storage`、`domains`、`combination`、`maxCallBytes`、`maxCommandBytes`、可选的 `attemptLimit` 与 `unresolvedLimit`。
- 核心的 `limits.capacity` 在这里是每租户份额：`reserved` 给出该租户持有的容量，参加者在受理的同一次提交里按同一份额核对。所以不另设 `tenantCapacity`。
- 构造期核对：核心的选项与 owner 声明（核心抛出）；N1 与组合（存储抛出）；`limits.scanPageCalls` 不超过 `model.pending` 一页的上限 1000。
- 返回 `{ commands }`。发送协调器合入后，它的镜像在装配处装饰这份存储，命令与协调器共用同一个被装饰的存储与同一个核心。

### 存储端口

端口的权威形状在共享核心（`packages/model/model/src/commands/storage.ts`），本成员从 `@omne-harness/model/commands` 导入，不另存同形类型。根入口原样转导这些类型。

| 方法                            | 本成员的行为                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `run(work, scope)`              | 读取 scope 的调用、operation 绑定与租户份额，在这次读取上同步运行 `work`，再提交 `work` 暂存的一次写入。CAS 冲突时重新读取并再运行 `work`   |
| `documents(tenant)`             | 本次读取的视图：scope 的调用（存在时），scope operation 的已提交绑定，以及本进程登记的该租户结论未定的绑定。scope 以外的租户读为空          |
| `reserved(field)`               | 本次读取时，该租户仍持有请求材料的调用的容量之和                                                                                            |
| `commit(tenant, write)`         | 暂存写入并返回 `committed`。真正的结论在 `run` 返回时给出                                                                                   |
| `publish(tenant, call)`         | 暂存不绑定 operation 的整份调用写入（读关系进度）                                                                                           |
| `pending(tenant, after, limit)` | 一页待恢复调用：`model.pending` 读到的待决标记调用与本进程该租户结论未定的 operation 所属调用的并集，按调用升序。游标是上一页的最后一个调用 |

`run` 的 scope 是核心的 `RunScope`（租户文本，可选调用，可选 operation）。本存储每次 run 读一个调用：scope 不带调用时 `run` 返回 `unavailable`，不运行 `work`。核心只在 `scanPending` 给出不带调用的 scope，而本存储提供 `pending`，所以 `scanPending` 不经 `run`。没有 scope 的 `run` 不预读：`work` 调用端口的任何读写方法时，`run` 返回 `unavailable`。

`commit` 只能在带 operation 的 scope 里暂存，且写入的 operation 必须等于它。没有 operation 的 run 没有读到该 operation 的绑定，认不回同一 operation 的早先提交，所以不得暂存 `commit`。

下列情形在 `work` 内抛出，`run` 把它们映射为 `unavailable`，不写入：

- `commit`、`publish` 的租户、调用或 operation 不是 scope 里的那个，或 scope 没有 operation 时 `commit`。
- `expected` 不是本次读取交出的同一份文档。
- 一次 `run` 里第二次写入。
- 删除调用的写入（`call` 为空而 `expected` 不为空）。

### 已知差异

- `query` 读不到已提交的绑定：核心的读方法给出的 scope 不带 operation（C-WIRE-CORE），所以 `model.call` 不读该 operation 的绑定。对一个已提交的 operation，`query` 在本存储上回答 `not-committed`，内存实现回答 `committed`。修正需要核心把 `query` 的 operation 放进读 scope，归共享核心，见明确缺项。
- 扫描游标：`scanPending` 的 `next` 是上一页的最后一个调用（键集分页），扫描期间新受理的调用会出现在后面的页里。内存实现在首页取定全部调用，游标是不透明的 `scan_` 身份。
- 快照只保存最新一份。认回一个已被后续 `preserve` 超过的 `preserve` 时，核心返回 `invalid('call', 'recovery-material-released')`。内存实现保留每一份快照。
- 容量口径：`materialBytes` 只计最新快照。
- `DispatchDocument.assembly` 在核心是 `StreamAssembly | null`，在本成员的行里恒为 `null`：活的组装是进程状态，不保存。编解码处显式收窄：读出的 dispatch 都是 `null`，写入一个非空的 `assembly` 返回 `invalid`，不丢掉它照写。
- 结论未定的绑定在本成员里 `effect` 记为 `applied`。共享核心不读这个字段。

## 结果与不变量

### 表与身份

四张表都是 STRICT，主键的第一列都是 `tenant`（租户的 `tenantCodec` 文本）。列只在 `src/schema.ts` 的 `TABLES` 里声明一次。迁移、行解析与参加者都从这份声明取列。

| 表             | 主键                               | 内容                                                                                                                                                                    |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `md_call`      | （tenant，call）                   | 调用头。`row_version` 是 CAS 令牌。`request` 为 NULL 表示请求材料已释放。`snapshot` 是最新快照的头。`reads` 是读关系。`pending` 是核心 `hasRecoveryWork` 对该文档的判定 |
| `md_dispatch`  | （tenant，call，seq）              | 每次发出一行，`dispatch` 唯一。Map 与 Set 存为条目数组                                                                                                                  |
| `md_part`      | （tenant，call，seq，block，part） | 块正文的分片。`block` 是块在该次发出里的位置。`open`、`seal` 带块的 index                                                                                               |
| `md_operation` | （tenant，operation）              | operation 到调用的绑定，含方法、指纹、修订与回执                                                                                                                        |

### 一次 run

1. 解析租户的事务域。未登记的租户读为空。它的写入返回 `unavailable`，不写入。
2. 对本进程登记的、属于这个调用的未定 operation 查询存储。存储已有结论的，从登记里移除。
3. scope 不带调用时返回 `unavailable`。
4. 读 `model.call`，在这次读取上运行 `work`。`work` 没有暂存写入时，直接返回 `work` 的结果。
5. 调用的 `capacity.bytes` 超过 `maxCallBytes` 时返回 `capacity`，不提交（N1）。写入 operation 时，按存储身份 `<operation>#<n>` 找第一个未使用的代：已回滚的代跳过。已提交的代说明读取已过时，回到第 2 步。结论未定时返回 `commit-unknown`。读关系进度的写入使用身份 `<call>#read@<version>`。
6. 把暂存的行作为一条事实命令提交给参加者 `model`，并按结果映射：
   - `committed`：返回 `work` 的结果（`work` 失败时也照样提交它暂存的写入，例如读关系的 `denied` 结束）。
   - 参加者以 `version`、`operation-bound` 或 `call-exists` 停止，或 `identity_conflict`：回到第 2 步。
   - 参加者以 `capacity` 停止：返回 `capacity`，`required` 为该调用的容量。
   - `unknown` 或 `writer_not_current`：登记该 operation 为结论未定，返回 `commit-unknown`。读关系进度的写入返回 `unavailable`。
   - 其余拒绝：返回 `unavailable`。

回到第 2 步的次数不超过 `attemptLimit`，超过时返回 `unavailable`。`work` 每次运行都基于一次新读取，失败的尝试不留下写入。

### 参加者的 CAS

参加者 `model` 在提供者的写事务里按下面的次序执行。任何一步停止，整次提交回滚：

1. 有绑定时插入 `md_operation`。主键已存在时停止，原因 `operation-bound`。
2. `expected` 为 null 时插入 `md_call`，已存在时停止，原因 `call-exists`。否则执行 `UPDATE md_call ... WHERE tenant = ? AND call = ? AND row_version = ?`，没有改到一行时停止，原因 `version`。
3. 写有变化的 dispatch 行，删除被合并、被取代或被重写的分片，插入新分片。
4. 新调用时，汇总该租户 `request IS NOT NULL` 的调用容量（含本行）。任一项超过份额时停止，原因 `capacity`。

参加者拒绝租户或调用与事实顶层不一致的行，回复 `unsupported`，不执行任何语句。第 4 步的汇总语句与 `model.call` 报告份额用同一条 SQL（`src/reads.ts` 的 `HELD_SHARE_SQL`）。

### 从块到分片

写入时，本成员比较读到的块与新文档的块：

- 新块：写 `open` 与（非空时）一个 `append` 或 `replace`，已封的块只写 `seal`。
- 追加模式的块变长：写一个 `append`，只含新增的部分。
- 替换模式的块改变：写一个 `replace`，删去该块此前的 `replace`。
- 块被封：删去该块的全部分片，写一个 `seal`。
- 其他变化（块减少、index 改变、正文不是前缀延长）：重写该次发出的全部分片。

### 租户条件

参加者与两个读 handler 的每条语句都带 `tenant = ?`。值来自本次请求的租户文本。行解析再核对一次每行的租户、调用与 operation，不一致时读取返回 `unavailable`。未登记租户的读取按空域处理，结果与「调用不存在」相同。

经 `ModelCommands`，另一租户的调用与不存在的调用得到相同的回答：核心先核资格，再查文档，查无调用时返回 `invalid('call', 'not-found')`。用例让两个租户共用一个事务域，所以任何一条语句丢掉租户条件，回答就不同（`tests/tenant.spec.ts`）。

JSON 列只做列级的穷尽解析：列齐全、类型对、租户与调用对。列内的嵌套形状信任本参加者写入时的编码，读出时不再按契约逐项校验。这是已知限制：只有参加者 `model` 写这几张表，读出与写入用同一份编码。

### N1：单次提交的字节上界

构造期核对 `maxCallBytes + COMMAND_RESERVE_BYTES ≤ maxCommandBytes`（预留 64 KiB），以及 `maxCallBytes + READ_RESERVE_BYTES ≤ 4 MiB`（`model.call` 的输出上界）。任一项不成立时构造抛出 `RangeError`。兑现点在提交：一份调用文档的 `capacity.bytes` 超过 `maxCallBytes` 时，存储返回 `capacity`，不提交。所以受理时即拒绝，不留到某次提交超限。装配须使批写配置 `outputBatchBytes` 加头部预留不超过 `maxCommandBytes`。这是跨装配行的组合保证，承担者由装配页具名。

一次提交仍超过 `maxCommandBytes` 时，存储以 `command_limit` 拒绝，`run` 返回 `unavailable`，不截断。`preserve` 收到 `unavailable` 后，该批事实由运行时持有，直到同一 operation 重做成功。何时重做由运行时决定（M6 的义务）。

### N2：分片行数的上界

同一次提交内，一块的 `append` 分片达到 `PART_MERGE_THRESHOLD`（64）个时，合并为一行，取其中最小的分片号，正文按分片号拼接。`replace` 每块至多保留一个。块被封后只剩一个 `seal`。

所以每块至多有 `open` 与 64 个增长分片。`model.call` 的 `maxRowsRead` 为 20000：调用、operation 与容量占 3 行，其余由 dispatch 与分片共用。超过时 handler 失败，读取返回 `unavailable`，该调用的读写都不可用。这是失败终局，不是截断。块数由受理时的 `capacity.blocks` 约束。块数乘以 65 加 dispatch 数接近 20000 时，须由受理侧拒绝。

### N3：主线程回调与提交

资格端口与证据适配器在主线程运行，不进入 Worker。所有主线程回调在每次提交尝试内调用一次，结果随 CAS 提交写入。核验与提交之间存在窗口（sql-contract §11 的 L-1）。窗口里资格或证据的变化不被本次提交看见。每次 CAS 冲突后重新读取，回调再调用一次。各回调点由 S2、S3 的方法逐个列出。

### N5：进程内状态

结论未定的 operation 按租户登记在进程内，每租户上限 `unresolvedLimit`（初值 1024）。某租户登记满时，该租户新的写入返回 `unavailable`，直到存储给出结论。别的租户不受影响。进程重启或同进程替换实例后，这份登记丢失：新实例看不到旧实例在途的 operation，直到同一 operation 被重试（第 4 步按存储身份查询）。重做入口与发现义务归运行时（M6）。读关系保存在 `md_call.reads`，不丢失。

### N6：同 operation 同内容的重投

唯一协调进程下，同一 driver 对同一调用串行写入，新的代次使用新的 operation。所以一个已被后续写入超过的 operation 不会被同内容重投。可达时按 Model 契约拥有者的裁定处理。

### N7：`md_operation` 的增长

每次写操作增加一行 `md_operation`，与存储层的提交回执各保存一份。这些行与释放后的 `md_call` 头都不删除，与会话日志不删除日志相同。读关系进度的写入不增加 `md_operation` 行。

## 所有权、失败与生命周期

### 失败

`run` 返回 `ModelFailure`。本成员自己产生的种类：

| 种类             | 含义                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `capacity`       | 租户份额不够新调用，或调用超过 `maxCallBytes`                                                          |
| `unavailable`    | 存储、事务域或读取不可用，存储的行不能解析，scope 不覆盖的读写，或尝试次数用尽。依赖名 `model-records` |
| `commit-unknown` | 写入已发出，结论未定                                                                                   |
| `invalid`        | 新文档不能编码为行，`field` 指出位置                                                                   |

错误不静默变成成功。`commit-unknown` 之后，同一 operation 的重试在存储结论确定前继续返回 `commit-unknown`。

### 所有权

本成员拥有四张表、迁移、参加者 `model` 与两个读 handler。它不拥有存储提交协议、回执、事务域目录与组合登记。会话存储组合在 `create` 时登记包含 `session` 与 `model` 的组合。本成员不登记、不迁移。待恢复的判定 `hasRecoveryWork` 归共享核心，本成员调用它写 `pending` 列。

### 生命周期

`createSqlModelStorage` 在构造期核对选项。之后它只持有结论未定的登记，不持有资源。存储与事务域查询由调用方提供并负责关闭。`work` 必须是同步的：一次 `run` 的读写面只在 `work` 同步运行期间有效。

## 组合与验证

### 消费的承诺

- `sql-contract`：提交协议 2、身份与回执、`TenantDomainLookup`、Worker 模块接口。
- `legal-identity`：租户文本。
- `model-contract`：调用文档里各值的类型。
- `@omne-harness/model/commands`：`createModelCommandsCore`、`modelCommands`、`hasRecoveryWork` 与端口类型（含可选的 `pending`）。

### 自有义务的验证

| 义务                                                                                                                                                  | 用例                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 迁移建出四张 STRICT 表，主键以 tenant 开头                                                                                                            | `tests/schema.spec.ts`      |
| 解析穷尽每一列，拒绝缺列、多列、他租户行，分片折叠回块                                                                                                | `tests/documents.spec.ts`   |
| run 的 CAS 冲突重读、参加者拒绝超前版本、认回、未定登记、份额、租户条件、N1、N2、读关系进度                                                           | `tests/commit.spec.ts`      |
| M4-2：`checkCommandsAccounts` 对内存实现与本实现各跑一次，逐项相同                                                                                    | `tests/accounts.spec.ts`    |
| M4-3：资格结果、守卫声明、调用与容量由一次提交写入；提交失败时都不存在；N1 在提交处拒绝                                                               | `tests/admission.spec.ts`   |
| M4-4：经 commands 的他租户调用与不存在相同；写路径不碰他租户的同名调用；参加者拒绝他租户行                                                            | `tests/tenant.spec.ts`      |
| M4-5：保存成功但回包丢失时，同 operation 重试认回原结果、不重复写；未定 operation 进入待恢复扫描；按租户的登记上限；commit 须在 scope 的 operation 内 | `tests/unknown.spec.ts`     |
| M4-6（早期守卫）：与 `sessionStorageMaterials()` 组成有效组合，构造期核对两方的 `codeDigest`                                                          | `tests/combination.spec.ts` |

用例在 `node:sqlite` 上运行真实的参加者、迁移与 handler 模块，后五个经共享核心运行 `ModelCommands`。它们不覆盖提供者的 Worker、耐久性、队列与关闭（联调 A）。组合保证归 L-APP 的会话存储组合行，`combination.spec.ts` 只是早期守卫。

### 明确缺项

- 静态材料与模块文件：提供者按每个模块文件的默认导出加载。现在 `schema.ts` 默认导出迁移，`commit.ts` 默认导出参加者。两个 handler 在 `reads.ts` 中是具名导出，还需要各自的模块文件与 `modelStorageMaterials()`。
- 与会话日志同处一个事务域时的写队列争用没有实测数据。ST-09 或 E9 的测量显示 Model 写使会话日志提交的排队时延超过阈值时，按 R1-D2 重开分域。
- 跨租户的全局容量上界不在一个事务域内，M2 不设。
- `query` 对已提交 operation 的回答（见已知差异）：需要共享核心把 `query` 的 operation 放进读 scope，本成员已能读该绑定。归共享核心的拥有者。
- 结构度量：`src/documents.ts` 与 `src/commit.ts` 中原超过 alert 阈值的六个函数已拆分（D3d 第 8 条）。
