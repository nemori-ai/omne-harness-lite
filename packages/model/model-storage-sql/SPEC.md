# @omne-harness/model-storage-sql 行为规格

本页拥有本成员在 SQL 存储契约上保存 Model 调用事实的行为。类型与运行时校验归 [src/](src/index.md) 的公开源码。Model 的公共行为归 [model-contract SPEC](../model-contract/SPEC.md)，归约规则归 `@omne-harness/model` 的共享核心，存储提交协议归 [sql-contract SPEC](../../storage/sql-contract/SPEC.md)。本页不重写这些承诺。

## 范围与依据

本成员实现共享核心的存储端口 `ModelCommandStorage`，并把核心与它装成耐久的 `ModelCommands`。它把一次调用的耐久事实保存为一份调用文档，按版本比较写入（CAS），并在提交点线性化。采用依据是 L-MODEL 波 1 的设计 D3、决策记录 D3（第 1、3、4、8 到 12 条）、D3b（`ModelCommandStorage` 是权威形状）、D3c（余下工作重切）与 D3d（S1 评审遗留的八条）。

### 实现现状

现在的切片是 S1 存储骨架、C-WIRE-SQL 装配、C-COORD 发送协调器与 C-MODEL 静态材料。

- 已实现：四张表与迁移 `001-model-records`；行与调用文档之间的解析；`createSqlModelStorage`，即 `ModelCommandStorage` 的 SQL 实现；参加者 `model`；读 handler `model.call` 与 `model.pending` 及各自的模块文件；静态材料 `modelStorageMaterials()` 及其 `codeDigest`；构造期核对；`createSqlModelCommands`，即共享核心的 22 个方法装在这份存储上；`createSendMirror`，即发送协调器。
- 已实现：`./cordis` 的 `createSqlModelRecordsPlugin`，在记录插件上发布 `modelCommands`，并拥有独立的发送子插件。应用接线由应用装配承担。
- 已实现（候选，待 RFC-0013 接受）：诊断读面 `createSqlModelDiagnostics`，即 `ModelDiagnostics.list` 在同一份记录上的实现；读 handler `model.diagnostics` 及其模块文件；`./cordis` 的 `createSqlModelDiagnosticsPlugin`，发布 `modelDiagnostics`。行为见[诊断读面](#诊断读面)。应用行的接线归应用装配。

### 耐久的 ModelCommands

`createSqlModelCommands(options)` 把 SQL 存储、可选确认接缝和可选发送镜像装在唯一的命令核心上。装饰次序为 SQL storage → observation storage → send mirror storage → core；未启用的装饰层省略。22 个方法的规则全部在共享核心，本成员不另写规则。

- 选项是核心的选项（`owners`、`authority`、`evidence`、`clock`、`limits`）加上存储需要的 `storage`、`domains`、`combination`、`maxCallBytes`、`maxCommandBytes`、可选的 `attemptLimit` 与 `unresolvedLimit`，以及可选的 `send`（`mirrorBytes`、可选的 `maxClaims` 与发送来源 `sources`）。
- 核心的 `limits.capacity` 在这里是每租户份额：`reserved` 给出该租户持有的容量，参加者在受理的同一次提交里按同一份额核对。所以不另设 `tenantCapacity`。
- 构造期核对：核心的选项与 owner 声明（核心抛出）；N1 与组合（存储抛出）；`limits.scanPageCalls` 不超过 `model.pending` 一页的上限 1000。
- 另可传入 `initialRun`、`observation: { limits, timing }` 与 `reportConfirmation`。首次记录与确认源的行为由 [model](../model/SPEC.md#首次执行记录与私有通道)拥有。只给 initialRun 时也安装确认接缝，不创建观察源；两者均缺席时保留旧配置行为。
- 返回值增加 `initial` 与 `observations`，未启用时分别为 `null`。给出 `send` 时，命令与协调器共用同一个被装饰的存储与同一个核心，也就共用同一个资格权威；没有 `send` 时 `coordinator` 为 `null`。`initial.openHost` 的绑定门面仍使用这一核心、镜像与认领表，不另建执行缓存。

### 最终确认与私有侧口

SQL 的 Attempt.commit 只表示本轮暂存，不能建立首次资格或公开观察。确认桥每次 work 重建 pass，只有真实 `inner.run` 最终返回后，才按最后一轮的文档与绑定处理确认。CAS 冲突前的暂存不会发布，`commit-unknown` 保留原操作与首次 pending，不发布未确认状态。同操作重试只能认回已有首次记录，不从 SQL 的空 execution 重建来源。

确认顺序为首次登记、公共确认源、发送镜像更新、命令返回。前两步之间不 await，观察额度耗尽也不能跳过首次登记。确认回调失败不回滚或覆盖已提交的业务结果：受影响 initial 或观察侧口不可用，报告仅含 `initial-confirmation-failed` 或 `observation-confirmation-failed`，不含正文与异常原因。report 抛错也不改变 Outcome。底层异常仍原样抛出，不发布暂存。直接工厂未给 report 时不输出；记录插件提供安全 logger。

本成员不新增首次接管表或 migration。initialRun、观察记录、发送镜像与认领表都是进程内对象，耐久调用文档不等于这些运行记录可以在重启后恢复。恢复与后继接管仍属明确缺项。验证资源为 [stream-confirmation.spec.ts](tests/stream-confirmation.spec.ts)。

### Cordis 记录插件

`./cordis` 的公开类型与数据校验归 [cordis.ts](src/cordis.ts) 和 [cordis-config.ts](src/cordis-config.ts)。采用依据为 L-MODEL 波 2 #446 r9 的 RECORDS 闭包。

- 数据配置必须给出 `owners`、完整的 `limits`、`maxCallBytes`、`maxCommandBytes`、`combinationVersion` 与 `send.mirrorBytes/maxClaims`。数值为正安全整数，没有代码默认值。容量为十进制计数字符串。既有核心和 SQL 构造期检查继续生效，包括 N1 与扫描页上限。
- 对象选项 `resolve(ctx, config)` 在每次激活时取得 `storage`、`domains`、`clock`、`authority`、`evidence`、`sources` 与 `manifestDigest`，也可取得运行级 `initialRun` 和 `observation: { timing }`。观察十二项上限放在数据配置的 `observation` 中，timing 留在对象依赖中。两边只启用一边时加载失败；两边均缺席的旧配置仍可用。应用必须在 `options.inject` 列出该工厂所需的完整服务键常量列表；`modelCommands` 不能成为自身依赖。解析器不替应用推断依赖，也不赋予应用授权政策。
- 一次激活只调用一次 `createSqlModelCommands`。公开服务的 22 个方法全部委托这一实例。`options.sendStage(coordinator, activation)` 经闭包交出协调器、initial 与可选的 observation 配对。旧单参数 callback 可以忽略第二参数。配对中的 `commands` 是本次真实 `ModelCommandsService` 原体，不是内部命令对象或 Cordis 代理；source 来自同一工厂。它们不成为 Service 属性，不新增 ctx 键。每次重新激活创建新配对，宿主须核原体身份。
- 命令方法准备好后调用 `ctx.plugin` 创建发送子 fiber，不等待它。发送插件可静态依赖 `modelCredential` 与 `modelCommands`。缺凭据只使发送子 fiber 等待，记录服务仍可查询。凭据恢复时由 Cordis 激活子插件。
- 采用官方 `@deepseek-ai/cordis` 4.0.4，无自有 fork。发送子插件装载抛错时，Cordis 记录错误，子 fiber 进入 `FAILED`，等待该子 fiber 会拒绝；父记录 fiber 仍可为 `ACTIVE`。父启动成功只说明记录服务可用。应用须观察发送子 fiber 或对应日志，不能把父启动成功当作发送就绪。
- 父 fiber 撤除会关闭本次观察源、撤除命令贡献并等待子 fiber 清理。`storage`、`domains`、运行级 initialRun 及其他注入对象仍归其提供者所有，记录插件不关闭它们。清理不撤销已提交 SQL 事实，也不声明已发出的外部请求可回滚。宿主、发送子 fiber 与 channel 的正常关闭次序由入口组合者承担，见 [model-host-local](../model-host-local/SPEC.md#首次执行与公共观察接线)。

[cordis.spec.ts](tests/cordis.spec.ts) 用真实 Cordis、现有 `node:sqlite` 存储夹具与具名发送替身核对上述生命周期、配置拒绝与内存对拍。它不证明真实发送、Worker 耐久性或发行应用接线。

### 诊断读面

本节采用 [#1140 的本轮决定](https://github.com/nemori-ai/omne-harness-lite/issues/1140#issuecomment-6703474020)，不在上文波 1 设计的采用范围内。本节拥有 `ModelDiagnostics.list`（[model-contract 诊断查询与保留](../model-contract/SPEC.md#诊断查询与保留)）在本成员上的实现。设计依据是 [RFC-0013](../../../docs/rfcs/RFC-0013-engineering-telemetry.md) A 线「`ModelDiagnostics` 怎样实现」与裁定 DA2。公开类型与校验归 [diagnostics.ts](src/diagnostics.ts)、[cordis.ts](src/cordis.ts)。本节不重写契约的披露、分页与保留协议。

**数据来源。**读 handler `model.diagnostics` 按 `(tenant, call)` 读 `md_call.row_version`，再按 `seq` 升序读 `md_dispatch` 的 `tenant`、`call`、`seq`、`dispatch`、`record`、`logical_terminal` 列。它接受 `after`（上一页最后一行的 `seq`，首页为 null）与 `limit`，多读一行以判断有没有下一页。每条语句都带 `tenant = ?`。主线程再核对每行的租户与调用。

**字段映射。**每行 `md_dispatch` 投影为一条 `ModelAttemptDiagnostic`。只复制下表列出的字段。

| 字段                                                    | 来源                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                    | `mdiag_` 加 SHA-256(`call`、`dispatch`) 的十六进制。确定编码，不另存                                                     |
| `call`、`dispatch`、`revision`                          | 请求的调用、`md_dispatch.dispatch`、`md_call.row_version` 的十进制文本                                                   |
| `adapter`                                               | `record.supplier.adoption`                                                                                               |
| `send`                                                  | `record.send`：`started` 为 `sent`，`prepared` 与 `not-sent` 为 `not-sent`，`unknown` 为 `unknown`。本地意图不证明已发送 |
| `firstContent`                                          | `record.firstContent`，同值                                                                                              |
| `outcome`                                               | `logical_terminal`，缺席时 `record.terminal`，都缺席时 `pending`。`failed` 只带 `fault.cause` 与 `fault.upstreamStatus`  |
| `timing.materialize`、`sendToFirstContent`、`execution` | 存储没有阶段时间，三项都是 `unknown`（DA6 未采用）                                                                       |

`fault.diagnostic`、`fault.reported`、`record.supplier.recipient`、`record.supplier.model`、`record.messages`、`account`、`materialization`、`windows`、`events`、`md_dispatch.diagnostics` 与分片都不进页。

**页。**`snapshot` 是本成员签发的 `DurableEvidence`：`owner` 为 `model-records`，`record` 为调用，`revision` 为 `row_version`，`digest` 为 SHA-256(租户文本、调用、`row_version`)。`retention` 是部署配置的保留采用。`coverage` 恒为 `complete-through-snapshot`，因为本成员还没有清理。清理实现后改为按实际前缀。

**资格映射。**配置字段 `diagnosticsRead` 选择映射，现在只有 `tenant-self`：代租户行事的主体对自己租户的调用持有诊断读取资格。实现向记录的资格端口 `ModelCommandsAuthority.authorize` 提一个租户级问题（`action: 'inspect'`，`resource: { kind: 'tenant' }`），不提调用。端口拒绝时整次 `denied`，`action` 为 `diagnostics`。端口 `unavailable` 时原样返回。这是部署的显式采用，不是普通调用读取资格的自动延伸。本映射按 [#1140 DA2 采用](https://github.com/nemori-ai/omne-harness-lite/issues/1140#issuecomment-6703474020) 实施。

本成员只把租户级问题交给资格端口，不自己判断主体。装配决定 `inspect` 对哪些主体生效。harness-server 为经核验的本租户 login、work 提供读取资格，并保持 host 的单调用限制。应用为每次 `list` 独立取得异步读资格，在返回前直接复核该次资格，最后释放捕获；SQL 读者继续使用同一记录与资格端口。应用采用与生命周期归 harness-server 的 [Model 生产接线](../../../apps/harness-server/docs/rows/model-release.md)。

**检查次序。**保留采用、租户文本、资格、`limit`、游标、事务域、读取。被拒绝的主体得不到调用是否存在、游标是否有效与 `limit` 是否合法的任何信息。

**`limit`。**正安全整数，上限 `DIAGNOSTICS_PAGE_MAX`（100）。超出时 `invalid`，`field` 为 `limit`。

**游标。**`mdcur_` 加 base64url(`[row_version, seq]`) 加 base64url(HMAC-SHA256)。HMAC 的输入是租户文本、调用、保留采用的 `digest` 与载荷。密钥默认每个实例随机 32 字节，也可经选项 `cursorKey` 给出。续页先重新核资格，再核对 HMAC 与载荷，再读取。下列情形返回 `invalid`，`field` 为 `after`：HMAC 不符、另一调用或另一租户的游标、载荷不是两个非负安全整数、读到的 `row_version` 与游标不同（`reason` 为 `snapshot-superseded`）。所以游标不携带权限，也不换成新快照。游标只在签发它的实例内有效，这是本成员采用的分页快照期限。

**缺席。**租户没有事务域，或调用不存在：返回空页，`next` 为 null，`snapshot.revision` 为 `0`，`coverage` 为 `complete-through-snapshot`。两种情形的回答相同。带游标时回答 `invalid`，因为游标的 `row_version` 至少为 1。

**保留采用。**配置 `retention` 是一条 `Adoption`。缺席时插件照常装载，`list` 对每个输入都返回 `unavailable`，依赖名 `model-records`，不先核资格。本成员不默认永久保留。

**失败。**本成员自己产生的种类：`denied`（资格或租户文本）、`invalid`（`limit`、`after`）、`unavailable`（保留未采用、事务域、读取、行不能解析）。

**插件。**`./cordis` 的 `createSqlModelDiagnosticsPlugin({ inject, resolve })` 返回继承 `ModelDiagnosticsService` 的插件类。数据配置是 `{ diagnosticsRead: 'tenant-self', retention?: Adoption }`。`resolve(ctx, config)` 在每次激活时给出 `storage`、`domains` 与 `authority`。`inject` 不能包含 `modelDiagnostics`。应用把它与记录插件放在同一提供者组，因为它读同一个租户域的同一份文档。

用例在 [diagnostics.spec.ts](tests/diagnostics.spec.ts)。它经真实参加者写入调用文档，经加载的 `model.diagnostics` 读取，并用真实 Cordis 装载插件。它不证明 Worker、耐久性或发行应用接线。

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

- `query` 的 `not-committed`：没有绑定、本进程的未定登记里也没有这个 operation 时，本存储回答 `not-committed`，不再逐代调用存储的 `query` 取完整排除证明（D3 第 6 节）。进程内这两处已覆盖本进程的写；进程重启后未定登记丢失，重启前结论未定的写可能被答成 `not-committed`。这是已知限制，由波 C 的恢复扫描接续。
- `scanPending` 的并集语义（文档判定与未定登记）只有本存储一侧的用例，没有与内存实现逐项对拍。
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

参加者与三个读 handler 的每条语句都带 `tenant = ?`。值来自本次请求的租户文本。行解析再核对一次每行的租户、调用与 operation，不一致时读取返回 `unavailable`。未登记租户的读取按空域处理，结果与「调用不存在」相同。

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

## 发送协调器

`src/coordinator.ts` 的 `createSendMirror(storage, options)` 返回两样东西：存储端口的装饰层 `storage`，与工厂 `coordinator(core, sources)`。工厂返回共享核心的 `SendCoordinator`（`@omne-harness/model`）。采用依据是 D3 第 10 节第 3 点、D3 复核 N4 与决策记录 D3c。

装配把核心建在 `mirror.storage` 上，commands 与协调器共用这一个核心。所以两者共用同一份镜像与同一个资格权威 `core.options.authority`。`coordinator` 收到建在别的存储上的核心时，抛 `TypeError`。

镜像的更新：

- 一次 run 结束后才更新镜像。run 成功时，镜像保存最后一轮读到的文档与该轮暂存的写。
- run 暂存了写而没有成功时（含 `commit-unknown`），镜像丢弃该调用。所以镜像不领先于存储确认的结果。
- 新文档的修订号小于镜像里的修订号时，镜像不替换。读回包晚于新提交到达时，镜像不回退。
- `mirrorBytes` 是镜像的字节预算，按最近使用淘汰。最近保存的一份文档总留下。钉住的文档不淘汰。

围栏：

- `check` 与 `withinCurrent` 同步运行，中间没有 await，也不推迟到回调。核心在围栏内只从镜像读该调用。
- 围栏先问资格权威，再看镜像里有没有该调用。镜像里没有该调用时，核心在空视图上判断。授权查询里资源的 `consumer` 为 `null`，与内存实现对不存在的调用相同。所以未授权主体对镜像里的调用、冷调用与不存在的调用都得到同一个 `denied`，看不出调用在不在镜像里。
- 授权主体的调用不在镜像里时，围栏返回 `unavailable`（依赖 `model-send`，诊断 `qualification-unavailable`），不调用 `start`。重做入口是同一 operation 的 `recordMaterialization`：它的 run 读回该调用，写入镜像。
- 镜像与认领表的键含租户。别的租户的同名调用在本租户看来是冷调用，不能通过围栏，也不占本租户的认领。
- 在 `start` 内再进入围栏时，协调器抛 `TypeError`。
- 认领表使一个 dispatch 在本进程只启动一次。再次进入返回 `unknown`（`dispatch-already-claimed`）。`start` 抛错时返回 `unknown`（`transport-start-unknown`）。
- 镜像显示该 dispatch 不再是 `prepared`，或调用已收场时，协调器删除认领。淘汰不删除认领。认领数达到 `maxClaims`（初值 1024）时，新的围栏返回 `unavailable`（`send-claim-capacity`），不调用 `start`。

钉住（N4）：调用有一个 dispatch 已记录物化、仍是 `prepared`、且没有被认领时，镜像不淘汰该调用。所以从 `recordMaterialization` 提交到该 dispatch 的 `withinCurrent`，围栏不会因淘汰而拒绝。认领后钉住结束。钉住的文档数不超过处于发送阶段的调用数。发送边界在这一段停止时，钉住保持到该调用的下一次写入。

已知限制：

- 协调器假设唯一协调进程（契约「首版可由唯一协调进程持有围栏」，sqlite-provider L-4）。存储确认一次提交后，本进程要再经过若干微任务才更新镜像。在这个窗口里，围栏按提交前的文档判断。这与 N3 的 L-1 同类。
- 镜像与认领表只在进程内（同 N5）。重启或同进程替换实例后，新实例的认领表为空。旧实例启动了发送、但没有写入 `recordSend` 时，同一 dispatch 可以在新实例再次通过围栏。发现与重做的义务归运行时（M6）。
- 与内存实现的差异只有一条：主体获准、调用不在本进程镜像里时，本实现返回 `qualification-unavailable`，内存实现返回 `invalid`（`call`，`not-found`）。本实现不区分不存在与冷。主体未获准时，两个实现都返回 `denied`。

用例在 `tests/coordinator.spec.ts`：同步围栏与重入、一次启动、钉住与钉住结束、冷镜像与认回、未知结论丢弃镜像、旧读回包不回退、未授权主体对热、冷、不存在调用同一 `denied`、双租户同名调用的镜像与认领互不相见、认领上界的释放，以及与内存协调器逐步对拍。用例在 `node:sqlite` 测试提供者上运行，不覆盖真实提供者的 Worker、耐久性与关闭。

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

本成员拥有四张表、迁移、参加者 `model` 与三个读 handler。它不拥有存储提交协议、回执、事务域目录与组合登记。会话存储组合在 `create` 时登记包含 `session` 与 `model` 的组合。本成员不登记、不迁移。待恢复的判定 `hasRecoveryWork` 归共享核心，本成员调用它写 `pending` 列。

### 静态材料

`modelStorageMaterials()` 每次调用读一遍模块文件，返回 sql-contract §4 的三类描述。每个模块以构建产物的文件 URL 与文件字节的 SHA-256 描述，提供者按该文件的默认导出加载：

| 材料                           | 模块文件                 | 描述                                                                                 |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------ |
| 参加者 `model`                 | `commit.ts`              | 协议 `1`，拥有四张 `md_` 表，不读别的参加者的表，`grouping` 为 `singleton`           |
| 迁移 `model/001-model-records` | `schema.ts`              | 无前置迁移                                                                           |
| 读 handler `model.call`        | `handler-call.ts`        | `snapshot`；读四张表；`maxRowsRead` 20000；`maxOutputBytes` 4 MiB                    |
| 读 handler `model.pending`     | `handler-pending.ts`     | `snapshot`；只读 `md_call`；`maxRowsRead` 1001；`maxOutputBytes` 1 MiB               |
| 读 handler `model.diagnostics` | `handler-diagnostics.ts` | `snapshot`；读 `md_call` 与 `md_dispatch`；`maxRowsRead` 102；`maxOutputBytes` 4 MiB |

三个读都是 `snapshot`：`run` 读一个调用后按行版本比较写入，读不到更新的提交只会造成冲突与重读，不会丢写。诊断读把行版本钉在游标里，更新的提交使续页 `invalid`。handler 的模块文件只默认导出 `reads.ts` 或 `diagnostics.ts` 里的 handler，所以摘要只覆盖该文件本身的字节；被导入文件的变化不改变它，这与参加者、迁移模块的摘要相同。本成员不建目录、不声明组合：应用把这份材料与别的拥有者的材料合成一个目录。

### 生命周期

`createSqlModelStorage` 在构造期核对选项。之后它只持有结论未定的登记，不持有资源。存储与事务域查询由调用方提供并负责关闭。`work` 必须是同步的：一次 `run` 的读写面只在 `work` 同步运行期间有效。

## 组合与验证

### 消费的承诺

- `sql-contract`：提交协议 2、身份与回执、`TenantDomainLookup`、Worker 模块接口。
- `legal-identity`：租户文本。
- `model-contract`：调用文档里各值的类型。
- `@omne-harness/model/commands`：`createModelCommandsCore`、`modelCommands`、`hasRecoveryWork` 与端口类型（含可选的 `pending`）。

### 自有义务的验证

| 义务                                                                                                                                                                                                               | 用例                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| 迁移建出四张 STRICT 表，主键以 tenant 开头                                                                                                                                                                         | `tests/schema.spec.ts`      |
| 解析穷尽每一列，拒绝缺列、多列、他租户行，分片折叠回块                                                                                                                                                             | `tests/documents.spec.ts`   |
| run 的 CAS 冲突重读、参加者拒绝超前版本、认回、未定登记、份额、租户条件、N1、N2、读关系进度                                                                                                                        | `tests/commit.spec.ts`      |
| M4-2：`checkCommandsAccounts` 对内存实现与本实现各跑一次，逐项相同                                                                                                                                                 | `tests/accounts.spec.ts`    |
| M4-3：资格结果、守卫声明、调用与容量由一次提交写入；提交失败时都不存在；N1 在提交处拒绝                                                                                                                            | `tests/admission.spec.ts`   |
| M4-4：经 commands 的他租户调用与不存在相同；写路径不碰他租户的同名调用；参加者拒绝他租户行                                                                                                                         | `tests/tenant.spec.ts`      |
| M4-5：保存成功但回包丢失时，同 operation 重试认回原结果、不重复写；未定 operation 进入待恢复扫描；按租户的登记上限；commit 须在 scope 的 operation 内                                                              | `tests/unknown.spec.ts`     |
| M4-6（早期守卫）：与 `sessionStorageMaterials(options)` 组成有效组合，构造期核对两方的 `codeDigest`；handler 文件变了而摘要未更新时构造失败                                                                        | `tests/combination.spec.ts` |
| 静态材料：五个模块各有文件 URL 与匹配的 SHA-256；按默认导出加载出描述所指的参加者、迁移与 handler，并经它们服务 commands 的读取                                                                                    | `tests/materials.spec.ts`   |
| 诊断读面：白名单字段与存储一致，故障原文不进页，`timing` 为 `unknown`；他租户与无资格主体整次 `denied`；游标续页、重核资格、篡改与快照淘汰为 `invalid`；缺席为空页；保留未采用为 `unavailable`；插件装载与配置拒绝 | `tests/diagnostics.spec.ts` |

用例在 `node:sqlite` 上运行真实的参加者、迁移与 handler 模块，夹具按 `modelStorageMaterials()` 的模块文件以默认导出加载它们；后五个经共享核心运行 `ModelCommands`。它们不覆盖提供者的 Worker、耐久性、队列与关闭（联调 A）。组合保证归 L-APP 的会话存储组合行，`combination.spec.ts` 只是早期守卫。

### 明确缺项

- 与会话日志同处一个事务域时的写队列争用没有实测数据。ST-09 或 E9 的测量显示 Model 写使会话日志提交的排队时延超过阈值时，按 R1-D2 重开分域。
- 跨租户的全局容量上界不在一个事务域内，M2 不设。
- 结构度量：`src/documents.ts` 与 `src/commit.ts` 中原超过 alert 阈值的六个函数已拆分（D3d 第 8 条）。
