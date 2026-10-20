# tool 内部架构

本页规定 Tool 实现的内部模块与构造方法。领域位置、责任边界与设计状态归契约包的[领域架构](../../tool-contract/docs/architecture.md)。本包已实现独立执行、记录仓端口与账本工厂、runtime 的逻辑终局路径，以及真实调用从受理、启动、事实保管到原结果收场与 queue 名额释放的推进协程。尚未交付的操作回复具名的 `unsupported`，增量名是：真实环境自动释放与未交付事实分支（`execution facts and release`）、控制（`controls`）、等待（`waits, decisions and resources`）、过程观察（`process observation and diagnostics`）、恢复（`recovery scan`）、排空与交接（`drain and handover`）。计时依赖宿主时钟，该时钟尚未交付。绑定登记表、Catalog 与 Cordis 插件也尚未交付。操作与增量名的对应见[包入口的支持范围](../README_ZH.md#支持范围)，准确范围见 [SPEC](../SPEC.md#当前范围)。

## 内部模块与依赖

| 模块         | 拥有                                                                   | 向外依赖                                                   |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| definition   | 定义判定、参数 codec、紧凑呈现与纯可用性判定                           | 资产名称、JSON 和消费者能力的显式输入                      |
| author       | 普通/结构化返回适配、固定 renderer/codec、独立执行函数、作者上下文接口 | 受限 E、显式执行作用域、结果政策；不依赖 Cordis 或本域存储 |
| call         | 聚合不变量、状态决定、具名命令与读取投影                               | 受信 guard 快照及本域提交适配                              |
| coordination | 持久待办推进、原执行认回、答复/控制/暂停/交接                          | 明确外域端口；没有任意容器查找                             |
| execution    | 固定绑定、真实发起边界、事实流及原控制                                 | 环境与外部工具真实协议                                     |
| custody      | 原输出、正式结果、过程与附件的保管、分页及交付                         | 存储与当前读取/承接资格                                    |
| composition  | 程序子调用预留、可信来源、父退出后责任                                | 正规 Tool 门面和具体程序执行域                           |
| cordis       | Service 定义、阶段适配器、独立 host、目录贡献                          | 固定 Cordis 4.0.4 与共同 IC                                |

这些是职责分解，不预设新包、进程或每项一层 class。Commands 的具体提供者可以把本域状态、队列、回执和待办放在同一存储事务；不得把外部执行和 SQL 提交描述为一个原子动作。派生投影可重建，原输出和源事实的保管不能靠重跑工具恢复。

## 采用的机制与成本

公开面保留具名操作。内部使用纯 `decide(state, command, guards)` 计算变更和待办，最终事务重核 revision、队列与有效 guard。这样既能列举合法命令，也能穷举并发反例。无需规定事件溯源、通用消息总线或公开任意事务回调。

每种有外部效果的协议保留自己的准备记录、查询、排除与未知。共享操作身份与回执结构，不将环境释放、答复和停止压成无业务语义的统一 execute。代价是至少一次意图提交和一次结果提交；这项成本换取回包丢失后仍能认回原操作。批保存过程可以降低写入次数，但展示必须晚于保存。

目录只提供可替换观察句柄。长期宿主只驱动已有责任。ToolRuntime 只对消费者提供稳定操作。三者分开防止调用方退出、目录无路由或 Cordis disposer 被解释为业务收场。计划换代先显式交接，意外故障从待办恢复。

程序执行方是具体 Tool 执行者的一种组合应用，不增加第四 runtime。子工具各有原调用、队列和结果；宿主保存父子关系，程序仅取得窄代理。完整组合协议见 [composition](../../tool-contract/SPEC.md#code-与-tool-的组合协议)，语言和引擎由具体提供者固定，不以本包泛型替代隔离设计。

## 程序执行方的宿主构造

程序执行方是 ToolExecutorBinding 的一个具体提供者，采用 foreground、live-only，自身不允许 programmable。不增加第四 runtime。程序语言、版本、标准能力、help/execute 参数及跨执行域编码由该提供者精确声明；执行环境提供者固定引擎和隔离能力。本页不以通用接口宣称这些选型已完成。

程序执行宿主注入受限程序环境、内部 admission、ToolChildren、来源签发和结果保管能力。子调用保留预留身份，不经普通 invoke 换身份。一次 execute 的程序和显式输入是参数；租户、主体、调用方已有的工作关联、父调用、权限、环境、限额和绑定是受信宿主依赖。脚本只取得 ProgramTools 的窄代理及自己显式输入，不取得 Context、服务容器、E、executor、来源签发能力或宿主凭据。跨界必须复制/校验允许的数据，不传 JS 宿主对象引用。

## Tool 内部实施规格

本页规定内部构造方法。行为协议归 [protocols](../../tool-contract/SPEC.md#tool-操作协议)，公开类型归 [public-api](../../tool-contract/docs/public-api.md)，对象关系归 [object-model](../../tool-contract/docs/object-model.md)。契约函数已在 `tool-contract` 实现。独立执行、账本工厂、runtime 的逻辑终局路径与到启动记录为止的推进协程已在本包实现，实现选择见 [SPEC](../SPEC.md)。下述各节中，对应这些已实现范围的部分描述现有代码，其余部分是设计，尚未交付。

### 聚合和事务提供者

ToolCall 决定器输入当前持久状态、具名命令和已核验 guard 快照，输出拒绝，或业务变化、操作结果与后续任务。决定器不读服务、不发通知、不运行工具。Commands 各具名入口负责边界解析和资格，事务适配器负责最终 revision/唯一操作检查及提交。不得允许调用者绕过决定器任意写状态。

持久布局至少能索引 tenant/call、operation/inputDigest/result、queueKey/ordinal/slot、start chain、wait/response、control、timing、result/delivery、process cursor、source event、task 和 child relation。它们不要求各占一张表。队列名额和 FIFO 跨调用同提交；重复操作的回执读取与授权分开。保管正文可独立存储，但必须先有耐久内容证据，再提交引用，失败保留可对账的原件责任。

命令提交时创建的任务使用完整判别联合。对端接受、本域确认、生产侧交付解除不能复用同一个 evidence。每个 evidence 核拥有者、原租户/调用、操作、精确采用、摘要及仍有效的使用范围。拒绝和异常保留身份与阶段，日志不复制正文秘密。

#### 本包的记录仓与决定器（G1）

`createToolLedger(store, guards, clock, configuration, settlementPorts)` 返回 `{ commands, reads, admissions, queues, facts }`。第五参数 `ToolLedgerSettlementPorts` 注入 `custody.retainResult` 和原环境 `releaseInspection.inspectRelease`。同账本 facts 通过 dependencies 交给 runtime。`configuration` 给出结果页大小 `resultPageBytes`、修订冲突的重试上限 `ledgerCommitAttempts` 与队列容量 `queueCapacity`，三者都来自 `ToolConfiguration`。`admissions.admit` 回复状态与 `recovered`，`commands.admit` 是只回复状态的契约形状。源码在 [ledger.ts](../src/ledger.ts)、[ledger-decider.ts](../src/ledger-decider.ts)、[ledger-store.ts](../src/ledger-store.ts) 与 [ledger-reads.ts](../src/ledger-reads.ts)。

记录仓端口 `ToolLedgerStore<B>` 只有两个操作。`read(domain)` 返回一个事务域的全部记录和当前修订号，或 `unavailable`；返回 `complete` 表示快照包含该域此前每一次已确认的提交。`commit({ domain, expected, revision, writes })` 在 `expected` 等于当前修订号时原子写入全部 `writes` 并把修订号改为 `revision`，否则回答 `conflict`；提交结果不确定时回答 `unknown`，记录仓不可用时回答 `unavailable`。记录仓不解释记录内容，也不做业务判断。`durability` 声明 `none` 或 `durable`；`none` 只能出现在 `./testing`。

事务域是判别联合：`call` 域是 `(tenant, call)`，拥有一次原调用的全部记录；`queue` 域是 `(tenant, FIFO key)`，拥有同一 key 下各调用的顺序与名额；`host` 域是 `(tenant, key)`，供宿主提供者保存自己的耐久记录（例如 `tool-host-local` 的启动受理台账），本包不解释其内容。记录是判别联合，每种记录有一个唯一键：

| 记录 | 键 | 内容 |
| --- | --- | --- |
| `call` | `call` | 原调用：受理操作、固定请求、发起来源、当前 `ToolState`、已确认的环境、准备记录、启动记录、启动拒绝与执行引用 |
| `operation` | `operation:<operation>` | 一次已提交操作：种类、规范输入摘要、提交修订号、具名回执（例如 admit 的 `ToolState`、releaseDelivery 的 `DeliveryState`、planPreparation 的 `PreparationRecord`、prepareStart 的启动记录） |
| `result` | `result:<version>` | custody 区分 synthetic 与 execution，后者保留原 final/raw/retain 回执及清理责任。一个结果版本：原终局、实际终局、效果、完整 `ToolResult`、交付关系、来源证据、产生它的操作 |
| `environment-release` | 按原 preparation.operation 唯一定键 | canonical ReleaseRecord 与最后 ReleaseProgress；任务删除后保留，供同资源认回 |
| `account` | `account:<event>` | 一笔账目修订及其来源 |
| `task` | `task:<kind>:<operation>` | 一项待办，形状是契约的 `ToolTask` |
| `exclusion` | `exclusion:<operation>` | 一次否定答案的排除围栏：操作号与围栏提交的域修订号。该操作的提交删除它 |
| `queue-entry` | `entry:<call>` | 队列域：一个调用在该 key 下的序号、阶段（`preparing`、`ready`、`held`）、最后一次转换它的操作与该调用固定的并发上限。释放即删除；越过 `preparing` 的条目只由移动它的操作认回 |
| `queue-counter` | `counter` | 队列域：下一个序号 |
| `queue-release` | `released:<call>` | 队列域：已释放调用的墓碑，带释放依据（启动前拒绝的排除证据；可信原 final 的物理结束证明）。与删除条目同提交，没有条目的调用也写；创建条目的决定见到它就不创建；0.0.x 不剪枝 |
| `host` | `host:<key>` | 宿主域：宿主提供者的一条记录，值由提供者自己校验 |

#### 队列域与跨域提交

FIFO key 是 `[scope.owner, scope.key, 定义名]` 的 JSON 文本（P02：受权 scope 与工具资产身份，不含实现版本；租户不在 key 里，而是队列域身份 `(tenant, key)` 的一部分，所以 owner 与 key 相同的不同租户不共享队列）。范围与上限都由调用方在固定请求里交入，范围的授予证据 `scope.grant` 在 admit 时经该范围拥有者的核验器核验（`guards.grants`），Tool 不为调用创建或推进任何外部工作对象。队列域的记录只回答三个问题：这个 key 下有哪些尚未释放的调用、它们的先后、谁持有名额。

序号在首次受理的 admit 回复之前分配，条目阶段是 `preparing`；认回的受理不再分配。所以一个在另一个 admit 回复之后受理的调用序号更大，仍在准备的较早调用也已经有序号，后来的同 key 调用不能越过它（P02）。这一步失败时受理仍然成立，`planPreparation` 的队列步再分配序号。`enqueue` 把条目改为 `ready`。`prepareStart` 在同一队列事务里裁定队首与名额，并把条目改为 `held`。释放在同一提交里删除条目并写墓碑，且只凭调用域里的释放依据；已释放的调用得不到条目（[SPEC 第 22 条](../SPEC.md#22-跨域提交与修复)）。队首规则：条目是 `ready`，没有序号更小的 `preparing` 或 `ready` 条目，且 `held` 条目数小于该调用固定的 `limits.concurrency`（`null` 表示没有上限）。名额按每个调用自己固定的上限判断，因为后续设置变化不重写旧执行的采用。名额按条目阶段计数，不看前后台关系，所以转后台不释放名额。

容量（`ToolConfiguration.queueCapacity`）是一个 key 下尚未释放的条目数上限。真实工具的 admit 在提交前读队列域，条目数已达上限时回复 `unavailable`（`dependency` 为 `tool-queue`），不受理。这次读取与受理提交不在同一事务，所以并发受理可以短暂超出容量。已受理的调用不因容量失败，这是 P02 的硬线，容量只是受理前的拒绝。

调用域与队列域没有分布式事务。每个跨域转换按同一顺序分三步走，调用域领先、队列域跟随、调用域收尾：

1. 调用域提交意图：当前命令的收尾提交写入下一步的 `queue` 待办（契约的 `ToolTask`，`kind` 为 `queue`，`basis` 是当时状态的证据），待办的存在表示"队列域还有一步没有确认"。
2. 队列域提交转换：按调用键幂等。条目已经处于目标阶段、且是同一操作转换的，直接认回，另一个操作转换的回复 `conflict`。创建条目的步骤（admit 的序号分配与 `planPreparation`）分两段：条目仍是 `preparing` 时按调用认回，因为两个入口创建的是同一个条目，这一步不移动它；条目已越过 `preparing` 时只有移动它的操作认回，其余回复 `conflict`。条目不存在而应当存在（例如 `enqueue` 时没有条目）回复 `unavailable`，不补造。`prepareStart` 的队列步可以回答"还没轮到"，此时什么都不写。
3. 调用域提交结果：写入新状态、操作回执与下一步的待办，删除本步的 `queue` 待办。

两步之间崩溃时，`queue` 待办仍在调用域里，`loadRecovery` 返回它；下一次推进从第 2 步重做，第 2 步幂等，所以队列域不会出现第二个条目或第二次持有。驱动的操作号由受理操作号派生，完整清单见 [SPEC 第 23 条](../SPEC.md#23-推进协程)。崩溃后重做用的是同一个操作号，P01 的认回规则直接适用。各命令的分步：

| 命令 | 第 1 步（上一命令已写的待办） | 第 2 步（队列域） | 第 3 步（调用域） |
| --- | --- | --- | --- |
| admit | 受理提交写 `queue` 待办 | 回复前分配序号，条目 `preparing` | —（待办留给 `planPreparation`） |
| `planPreparation` | admit 写的 `queue` 待办 | 认回已有条目，没有时分配序号 | 状态 `preparing`、`queue.waiting`，`PreparationRecord`，`prepare` 待办 |
| `prepared` | — | — | 记录已确认环境，删除 `prepare` 待办，写 `queue` 待办 |
| `enqueue` | prepared 写的 `queue` 待办 | 条目 `ready` | 状态 `queued`，写 `queue` 待办 |
| `prepareStart` | enqueue 写的 `queue` 待办 | 队首与名额成立则条目 `held`，否则回答等待且不写 | 状态 `starting`、`queue.held`、启动记录、`start` 待办 |
| `recordStart(started)` | — | — | 状态 `running`，删除 `start` 待办，同提交原 facts 待办 |
| `preserveResult` | 原 final 的 settle 待办 | （先做第 3 步）删除 entry 并写墓碑 | 独立 retain 已确认后同提交原结果、delivery、ended 与全部后继责任，最后关闭 queue 待办 |
| `rejectPending`、`recordStart(rejected)` | — | （先做第 3 步）删除条目 | 状态 `settled`、`unavailable` 终局、`queue.released`、`deliver` 待办、`queue` 待办；队列域删除条目后再删除 `queue` 待办 |

启动拒绝的释放是调用域先收尾、队列域后释放的转换：终局先于释放成立，释放只凭调用域里的释放依据（P02：仅逻辑收场不释放名额），崩溃时 `queue` 待办让释放重做；重做时条目已不存在也要写墓碑，已有墓碑则什么也不写。`prepareStart` 的队列步与调用域提交不在同一事务，所以名额可以先于启动记录被持有：这样的 `held` 条目是待履行义务，不是启动，由同一操作身份的重做对账，履行它的前提与触发的拥有者见 [SPEC 第 22 条](../SPEC.md#22-跨域提交与修复)。

写入是 `put` 或 `delete`，按键生效；删除不存在的键是空操作。生效的提交不论写入集内容都把域修订号改为 `revision`。域修订号是该域的规范十进制计数，每次提交加一。`ToolState.revision` 等于写入该状态的那次提交的域修订号。排除围栏只推进域修订号并写一条 `exclusion` 记录，不改状态，所以 `WriteContext.expected` 与 admit 的 `stale-revision.current` 都用状态修订号（没有调用记录时为 `0`），记录仓的条件提交用域修订号。

决定器是纯函数：输入快照（按键整理的记录）、一条命令、已核验的 guard 事实与本次铸造的修订号；输出"只回复不写"或"写入一组记录并回复"。它不读端口、不发通知、不运行工具。命令入口按顺序做：边界输入检查（`invalid`）、租户与主体资格（`denied`，缺租户或主体不属于该租户时不区分调用是否存在）、来源核验（伪造 `denied`，不可读 `unavailable`）、读取快照（失败 `unavailable`）、`WriteContext.expected` 与状态修订号比对（`stale-revision`）、决定、按快照的域修订号条件提交。`conflict` 时重读重判，最多 `ledgerCommitAttempts` 次；`unknown` 时回复 `commit-unknown` 并保留原操作号供查询；读到同操作号同摘要的记录时回复原回执，异摘要回复 `conflict`。守卫或记录仓抛出时，回复里只有依赖名，不带异常消息。

admit 的决定顺序：已有 `call` 记录而操作号不同是 `stale-revision`（admit 隐含的期望修订号是"尚未受理"）；`mode=background` 而定义不许可后台是 `invalid`，dummy 与参数失败也一样；`known-unavailable` 不读参数、不查 `complete`、不查 programmable，直接形成 unavailable 终局；可用定义在 programmatic 路径未显式许可时回复 `unsupported`，不写任何记录；`complete=false` 是 `invalid`，不受理；原参数与生效参数都经 `judgeToolArguments` 完整解析，任一失败形成 `failed/arguments` 终局；全部通过的真实工具被受理，同提交 `queue` 待办，见上一节。两种逻辑终局同提交 `call`、`operation`、`result`、`account` 与 `deliver` 任务：`phase=settled`、`relation=foreground`、`foreground={ kind: 'final' }`、`execution=not-started`、`effect=not-started`、`timing={ kind: 'closed', accumulatedMs: '0' }`、`queue=none`、`delivery=pending`。请求的 `mode` 不改变这一关系，因为逻辑终局在建立任何等待关系之前形成。结果正文由 `guards.results` 文本工厂生成，再经 `guards.policy.judgeResult` 核验；核验失败时不报告受理完成（`unavailable`）。

guards 是受信快照：`access.qualify` 回答主体对该租户、调用与动作的资格，并证明租户是 legal-identity 铸造的值（账本只查形状）；`sources.verify` 回答调用来源是否来自受信入口；`grants` 是按范围拥有者声明的核验器表，核验器回答并发范围的授予证据是否确由该拥有者授予当前租户和调用方，没有声明核验器的拥有者一律拒绝；`starts.qualifyStart` 回答已受理的固定请求现在是否仍可启动（当前调用方式许可与资格，`prepareStart` 用它）；`results` 是文本结果工厂；`policy` 是结果政策；`budgets` 给出参数解析预算。结果页大小是部署配置，不在 guards 里。这些值由宿主在构造时固定，决定器只消费它们的结论。

每种证据各自铸造，不跨用途复用。`record` 是 `<种类>:` 加定位值的规范 JSON。定位值总有租户（两段身份文本）与调用，再加本种类的部分：`result` 加版本、交付号与产生它的操作，`delivery` 加版本与交付号，`operation` 加操作，`account` 加账目事件，`state` 不再加。`revision` 是提交修订号，`digest` 是 `sha256:` 加 `{ kind, place, content }` 的规范 JSON（键按码点排序，省略 `undefined`）的摘要。所以两个租户的同号调用不共享任何证据。

读取投影在 [ledger-reads.ts](../src/ledger-reads.ts)：`lookup` 以受理操作号认回 `call` 记录；`operation` 认回操作记录。两者的否定答案（`not-accepted`、`not-committed`）由 [ledger.ts](../src/ledger.ts) 的排除围栏把关：完整快照里没有该操作时，账本先提交一条该操作的 `exclusion` 记录（值是操作号与这次提交的新域修订号，替换旧的），`expected` 是快照的域修订号；成功后才回答否定答案。按旧修订号准备的在途提交此后都会冲突，而该操作的命令重读时从 `exclusion` 记录得知否定答案已在它在途时给出：记录的修订号大于命令第一次读取的域修订号时，命令停止重试，回答固定诊断的 `unavailable`（`ledger-store`），不落盘。第一次读取就看到记录的新重送照常进行，提交时在同一写入集删除该记录；快照里已有操作记录时认回先于排除。围栏冲突就重读重判（另一读取者的围栏不排除读取者，读取者再次围栏），围栏未知时 `operation` 回答 `unknown`、`lookup` 回答 `unavailable`，围栏不可用时回答 `unavailable`。这项成本是每个否定答案多一次提交；读取到 `found` 或 `committed` 不提交。接受的风险记在 [SPEC 第 14 条](../SPEC.md#14-查询p01)。`result` 与 `account` 不提交；`result` 按完整内容块分页，`next` 是绑定租户、调用、版本、投影与块位置的 JSON 文本，单块超过页预算时回答 `unsupported`（卸载尚未实现），不切块；`account` 只回答账目，不附正文。

### 持久化与一致性边界

本节区分领域事实、应用推进和存储机制，供记录仓契约与耐久适配使用。分析依据是本包现有记录与决定器、Tool 的 [P01–P09](../../tool-contract/SPEC.md#tool-操作协议)、[存储事务行为](../../../storage/docs/storage-contract/SPEC.md)及系统[共同成立的业务事实](../../../../docs/architecture/data-and-state.md#共同成立的业务事实)。现有支持范围仍以本页开头及[成员 SPEC](../SPEC.md#当前范围)为准。存储规格承诺不表示本包已有耐久提供者或运行证据。

#### 领域事实及一致性边界

下表盘点业务一致性边界，不把四类事实都认定为现有独立持久聚合。现行契约已确定调用和队列两个持久一致边界，不要求两者共同事务。ToolCall 是持久聚合根，WaitRecord 是其聚合内实体。工具内部等待的记录实现与执行绑定登记的完整持久模型尚未交付。运行时观察句柄不成为事实身份，见[对象与生命周期](../../tool-contract/docs/object-model.md#对象与生命周期)。

| 定位号与事实 | 身份、拥有者 | 必须共同成立的事实 | 当前承载及尚待确定的边界 | 依据 |
| --- | --- | --- | --- | --- |
| D01 调用 | 租户、原 call；Tool 调用拥有者 | 每次业务转换的权威状态、原操作回执及后继任务一起成立。交付解除还包括该结果版本的交付状态与生产侧证明 | ToolCall 是持久聚合根，拥有等待等事实；`call` 域当前保存调用、操作、结果、账目及任务。等待记录的具体布局与适配端口尚待实现；改变既定聚合边界须另取得 Tool 契约拥有者决定 | [对象与生命周期](../../tool-contract/docs/object-model.md#对象与生命周期)，[CallRecord、OperationRecord、ResultRecord](../src/ledger-store.ts)，[decideRelease](../src/ledger-decider.ts)，[P08](../../tool-contract/SPEC.md#p08-过程分页与全文交接) |
| D02 队列 | 租户、FIFO key；Tool 队列拥有者 | 序号分配与计数更新一起成立；队首判断、已有持有数、受理时固定的 limit 与取得名额一起裁决；删除条目与释放墓碑一起提交 | `queue` 域跨调用串行化。call 域的启动意图与 queue 的持有分步提交。排队响应 `waiting` 是队列裁决结果，不是独立 wait 记录 | [QueueEntryRecord、QueueReleaseRecord](../src/ledger-store.ts)，[decideQueueHold、decideQueueRelease](../src/ledger-start.ts)，[跨域提交与修复](../SPEC.md#22-跨域提交与修复) |
| D03 工具内部等待 | 原租户、call、等待 key 及其原请求关联；Tool 拥有等待，答复协议拥有者拥有答复资格与内容 | 原请求及采用快照、等待状态、有效回应及后继责任保持一致。取消与答复在原 ToolCall 事务排序；取消先成立则后到决定不作为答案。取消或终局与失效任务同提交，关闭等待与新计时段同提交 | WaitRecord 是 ToolCall 聚合内实体，身份为 call + wait；[LedgerRecord](../src/ledger-store.ts) 尚无完整等待记录。P06 的等待不同于 D02 排队，也不同于 Fiber 暂停。具体持久布局、适配端口及跨答复拥有者的参加或承接方式由 Tool 契约拥有者与相关答复拥有者确认 | [对象与生命周期](../../tool-contract/docs/object-model.md#对象与生命周期)，[P06](../../tool-contract/SPEC.md#p06-内部等待与答复)，[P09](../../tool-contract/SPEC.md#p09-账目恢复与退出)，[共同成立的业务事实](../../../../docs/architecture/data-and-state.md#共同成立的业务事实) |
| D04 执行绑定登记 | 原 adoption、command 所选绑定及其采用身份；ToolBindings 提供者 | 同一次绑定选择中的作者操作、参数解析、返回检查及原采用保持配对。恢复取得原事实查询与控制能力，不能重新选择新表启动 | 绑定登记表尚未交付。其持久身份、登记与撤除的一致性边界仍由 Tool 契约拥有者及绑定提供者确定，不能借用 host 记录键代定 | [ToolBindings 与依赖方向](../../tool-contract/docs/object-model.md#应用对象端口和依赖方向)，[P09](../../tool-contract/SPEC.md#p09-账目恢复与退出)，本页[业务 schema 与输出归一化](#业务-schema-与输出归一化) |

三种登记另有不同责任。local 的启动资格台账通过 [start-coordinator.ts](../../tool-host-local/src/start-coordinator.ts) 的 `prepare/consume/inspect/invalidate/exclude` 保存启动资格与围栏，使用 `host` 域。`HostRecord.value` 由该宿主解释，Tool 账本不读取它。执行绑定登记属于 D04。存储的[组合登记](../../../storage/docs/storage-contract/SPEC.md#登记)保存租户、事务域、组合版本及参加者名单，不保存工具绑定，也不是每次业务操作的回执。

#### 记录仓端口中的领域语言与机制语言

`ToolLedgerStore` 当前是带 Tool 记录类型的条件原子记录口，不是只讲领域语言的仓储口。它明确不解释记录。业务命令与纯决定器拥有不变量，存储适配拥有提交机制。后续接口调整须走记录仓契约工作，不能仅改术语名称。依据为 [ledger-store.ts](../src/ledger-store.ts) 的端口声明及[分层责任](../../../../docs/architecture/layers-and-dependencies.md#领域语义依赖与模型边界)。

| 定位号与表达 | 性质及受影响位置 | 后续承接层 |
| --- | --- | --- |
| L01 `read(domain)`、`commit(input)` | 全域快照与条件写入是记录机制。领域需要的是载入原调用、裁决队列、认回原操作等能力；两个通用方法不表达这些目的 | Tool 记录仓契约明确业务读写需求，基础设施适配现有存储；见 B01、B03 |
| L02 `LedgerDomain`、transaction domain | `call` 和 `queue` 的身份承载 D01、D02 的业务范围；两域分别提交、不要求共同事务是[现行契约决定](../../tool-contract/docs/object-model.md#无状态性与有状态性)。storage 的事务域另绑定真实数据库及写连接，二者不能按同名等同 | Tool 适配保留现行两域协议，基础设施映射提交域；新业务要求若改变该边界，须由 Tool 契约拥有者另作决定。跨消费方组合见 C01，现有两域适配见 B01 |
| L03 `revision`、`expected` | 状态修订支持业务并发判断；域修订和 CAS 是存储串行化机制。排除记录会只推进域修订，所以二者不能混用，见[现有修订规则](#本包的记录仓与决定器g1) | Tool 命令保留状态前提，记录仓适配核对域修订；见 B01、B03 |
| L04 `writes`、`put/delete`、记录键 | 写集合与键编码是布局机制。调用、原操作、结果版本、队列序号、任务与释放依据是业务事实。`commit` 的全部写入必须共同生效，空变更也推进域修订 | 决定器输出业务变化，基础设施编码与持久化；不得开放任意业务写入入口，见 B01 |
| L05 `host`、`HostRecord.value: unknown` | 通用宿主保存机制不定义业务模型，也不保证值符合 storage 的 JSON 命令约束 | 实际宿主拥有值的版本与解析，基础设施编码；见 B04 |
| L06 `OperationRecord.receipt`、`ResultRecord.delivery` | 原操作认回与结果交付是领域语义。`inputDigest`、证据键及摘要编码服务于认回，但不自动成为 storage 五字段操作身份 | Tool 拥有业务回执，适配维护存储身份与回执关联；见 B02、B05 |
| L07 `ExclusionRecord` | “否定答案不能被旧在途提交推翻”是 P01 语义；查询写围栏与域修订是本实现机制。不能拿一次空读替代它 | Tool 查询口保留否定证据要求，适配采用满足同等排除条件的机制；见 B03 |

L01–L07 的类型、键、写集合及状态定义均见 [ledger-store.ts](../src/ledger-store.ts)；L03、L07 的实际重读与围栏执行见 [ledger.ts](../src/ledger.ts) 和[查询风险](../SPEC.md#14-查询p01)。

#### 应用用例及中间责任

下表的“局部原子”只指列出的提交域。跨域分步推进表示当前实现的最终推进方式，不扩张为跨域原子保证。系统允许[显式共同参加或按契约分步承接](../../../../docs/architecture/data-and-state.md#共同成立的业务事实)。跨消费方的协调者仍待架构拥有者指定；现有账本工厂、driver、host 只因承担局部推进，不能因此取得该身份。

| 定位号与用例 | 必须原子的局部事实 | 跨边界步骤与当前协调 | 中间失败或未知后的责任 | 依据 |
| --- | --- | --- | --- | --- |
| U01 受理到排队 | call 的受理状态、操作回执、`queue` 任务同提交；queue 的序号与条目同提交 | `admissions.admit` 先提交 call，再 `order`。未完成分配可由 `planPreparation` 补做，是分步推进 | call 中任务保留队列义务；同一派生操作身份认回，不能生成第二条目 | [ledger.ts](../src/ledger.ts) 的 `admissions`，[跨域提交与修复](../SPEC.md#22-跨域提交与修复) |
| U02 队首与名额 | 一个 queue key 内比较更早未取得名额的条目、held 数和固定 limit，成功把条目改为 held | `prepareStart` 先做 queue 裁决，再写 call；非队首或无名额时不写 queue | queue 已 held 而 call 未写启动意图时，名额仍是待履行义务。同身份重做对账，不把 held 当真实执行 | [decideQueueHold](../src/ledger-start.ts)，[prepareStart](../src/ledger.ts)，[SPEC 22](../SPEC.md#22-跨域提交与修复) |
| U03 启动 | call 的启动意图、操作回执、start 任务共同提交 | driver 推进原启动协议；真实发起还需启动资格与执行者围栏。外部发起不与 SQL 原子提交 | 回包未知查询原启动，不能换号重跑函数。当前 driver 已调用 live-only 绑定并对账原 authority，原事实由受管 reader 自动保管并确认，可信原 final 的收场由第 26 条推进，不重新 start | [推进协程](../SPEC.md#23-推进协程)，[P04](../../tool-contract/SPEC.md#p04-实际发起围栏)，[支持范围](../README_ZH.md#支持范围) |
| U04 释放名额 | call 先保存释放依据及队列任务；queue 删除条目与墓碑同提交 | `releaseQueue` 先提交 queue，再关闭 call 的 queue 任务。`queues.reconcile` 读取调用事实后修复 queue，是分步对账 | 任一步失败保留原任务，按原身份重做。仅逻辑终态不释放；`releaseBasisOf` 支持启动前排除及已 settled/可信 ended 的原 final 依据 | [releaseQueue](../src/ledger.ts)，[releaseBasisOf、decideQueueRelease](../src/ledger-start.ts)，[survey、reconcile](../src/ledger-queue.ts) |
| U05 交付释放与消费方 | P08 要求 Tool 的 pending 变 released、原操作回执和生产侧证明同提交；当前决定器还更新 call 及删除 deliver 任务 | 消费方提供 retained 或 processed 证据。Tool 内部提交不等于消费方事实自动共同提交。两端组合及协调者由架构拥有者与消费方决定，见 C01 | 提交未知时双方继续保管，以原 result、delivery、consumer、operation 查询。旧版本释放不解除新 delivery，也不触发内容到期删除 | [P08](../../tool-contract/SPEC.md#p08-过程分页与全文交接)，[decideRelease](../src/ledger-decider.ts)，[#434 的 Tool 侧释放责任](https://github.com/nemori-ai/omne-harness-lite/issues/434) |
| U06 恢复扫描 | 任务及其后继责任与对应业务变更共同保存；claim 裁定当前协调代次 | P09 要求扫描、载入原事实、认领、逐任务查原端口。当前 queue reconcile 是局部修复，`scanPending`、claim 尚未实现，不能称完整恢复 | 原任务保留查询、保管、控制与清理责任；换协调者不杀原执行。外部 unavailable 或 unknown 不授权新 start/resume；完整扫描由父卡阶段 6 承接 | [P09](../../tool-contract/SPEC.md#p09-账目恢复与退出)，[driver.ts](../src/driver.ts)，[#421 阶段 6](https://github.com/nemori-ai/omne-harness-lite/issues/421) |

U05 中 P08 的同提交要求覆盖 Tool 生产侧事实。消费方业务事实的参加范围由跨消费方组合明确。跨消费方组合仍须按系统架构显式决定，不能从当前单 call 域提交反推该组合已经确定。

#### 存储契约承载与适配差距

下表对照已接受的存储规格，不选择提供者实现。一次 storage `commit` 只在一个真实事务域内原子提交；它能容纳登记参加者，不自动把现有多个 `LedgerDomain` 合成一个数据库事务。

| 定位号与承诺 | Tool 需要的适配及限制 | 依据与去向 |
| --- | --- | --- |
| S01 五字段操作身份 | 将业务操作关联到 tenant、transactionDomain、operation、protocolVersion、operationKey，并持久保存可恢复的映射。同身份异内容与业务 revision 冲突是不同问题 | [操作身份](../../../storage/docs/storage-contract/SPEC.md#操作身份)、[提交](../../../storage/docs/storage-contract/SPEC.md#提交)；B02 |
| S02 组合登记 | 协调者登记具名参加者及组合版本。登记跨重启保存、旧版本不覆盖；Tool 绑定登记与启动资格台账均不能替代它 | [登记](../../../storage/docs/storage-contract/SPEC.md#登记)；B01、C01、C02 |
| S03 提交与原子范围 | Tool 参加者在事务内重核业务前提，事实、回执及待交接记录共同提交。现行契约确定 call 与 queue 两个持久一致边界，不要求共同事务；适配保留 P02 的域内提交及同身份对账。新业务要求若需改变该边界，须有具体依据并取得 Tool 契约拥有者决定。外部工具效果不进入数据库事务 | [提交](../../../storage/docs/storage-contract/SPEC.md#提交)、[提供者义务](../../../storage/docs/storage-contract/SPEC.md#提供者义务)、[持久一致边界](../../tool-contract/docs/object-model.md#无状态性与有状态性)、[P02](../../tool-contract/SPEC.md#p02-定义准入与队列)、[事务域](../../../../docs/architecture/data-and-state.md#事务域与异步sqlite执行)；B01、C01 |
| S04 结果及未知查询 | `unknown` 后以同一完整身份 `query`。明确 `rolled_back` 具有持久回滚回执；`rejected_before_accept` 没有回执；`identity_conflict` 带已有回执。不能把它们全压成 Tool `conflict` 或 `unavailable` | [提交](../../../storage/docs/storage-contract/SPEC.md#提交)、[查询](../../../storage/docs/storage-contract/SPEC.md#查询)、[LedgerCommit](../src/ledger-store.ts)；B02、B03 |
| S05 否定结论 | storage `not_committed` 需要旧写者排除、旧事务终止、恢复完成、权威读取成功及未入受理队列五项证明。它不同于 revision 不匹配；Tool 排除围栏须保留等效语义 | [查询](../../../storage/docs/storage-contract/SPEC.md#查询)、[ledger.ts](../src/ledger.ts)；B03 |
| S06 参加者事务端口 | 以版本化 JSON facts 进入 Worker，参加者同步 `execute(facts, port)`。不传闭包、Context 或 DB handle，不控制事务，不持锁等待外部端口；命令条数与大小有限 | [参加者端口](../../../storage/docs/storage-contract/SPEC.md#参加者端口)、[提交](../../../storage/docs/storage-contract/SPEC.md#提交)；B04、C02 |
| S07 租户与写代际 | 事务域绑定一个租户，旧写代际未排除时不准入。Tool 的 tenant 身份必须进入映射与查询。storage 写代际不代替 Tool claim 的协调代次或启动围栏 | [登记](../../../storage/docs/storage-contract/SPEC.md#登记)、[提供者义务](../../../storage/docs/storage-contract/SPEC.md#提供者义务)、[P09](../../tool-contract/SPEC.md#p09-账目恢复与退出)；B02、B06 |
| S08 耐久证据 | 事务原子性、`durability: durable` 声明与断电证据分别核对。本包没有已交付 SQLite 仓储；#280 尚未为本包提供运行证据。进程终止也不替代 SQL-T01 断电证据 | [存储规格状态与验证义务](../../../storage/docs/storage-contract/SPEC.md#验证义务与未覆盖)、[SQL-T01](../../../../docs/architecture/deployment/infrastructure-policy.md#sql-t01)、[#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)；B06 |

`ToolLedgerStore.commit` 的 `conflict` 只保证本次 expected 不匹配且未写；storage `identity_conflict` 是同身份异输入。`ToolLedgerStore.commit` 的 `unavailable` 表示未尝试，而 storage `rolled_back` 表示已持久确认回滚，二者不能仅按“未生效”互换。适配须保留原身份、是否受理及证据强度，供具名业务命令解释，见 S04、S05。

#### 内容存储的契约需求

SQL 事务端口支持 `Uint8Array` 参数，只说明语句参数能力，不定义对象或文件服务。全文、附件与卸载派生需要独立内容契约。以下只列需求，接口、保管期限及提供者由存储或架构拥有者决定。依据为 [P08](../../tool-contract/SPEC.md#p08-过程分页与全文交接)、[可靠交接与消费确认](../../../../docs/architecture/data-and-state.md#可靠交接与消费确认)及[保留、归档与清理](../../../../docs/architecture/data-and-state.md#保留归档与清理)。

| 定位号 | 需要覆盖的承诺 |
| --- | --- |
| O01 身份与关联 | 具名对象及版本关联原租户、call、result、附件或派生来源。地址与摘要不能单独授权读取；派生不覆盖原件 |
| O02 可靠保存证据 | 提交引用和发布占位之前取得内容保存证据。失败或未知保留原件责任，能够以原保存身份查询及对账，不生成假可取回地址 |
| O03 读取与完整性 | 每次重核关联及当前资格；raw 独立核权。字节长度、摘要和版本支持完整性核验；分页绑定原对象及位置，不将字节片段假称完整 UTF-8。缺失、地址失效和暂不可用须可区分 |
| O04 保管、释放与恢复 | 明确原件、必要过程及派生的保管者与承接证据。交付解除不等于内容删除。引用仍有效或保存结果未知时保留恢复责任，现行 P08 不设到期删除动作，保管策略变更由原承诺拥有者决定 |

对象/文件契约尚为[#421 阶段 5 的前置条件 D-01](https://github.com/nemori-ai/omne-harness-lite/issues/421)，不能从 SQL 契约的参数类型补出该保证。

#### 三类结论与后续责任

以下定位号在本节内稳定使用。A 是现有存储契约承诺，B 是 Tool 必须调整的假设，C 是需要拥有者决定的要求。B 中“候选”表示要开后续卡，不表示该方案已经接受。

| 定位号 | A：现有存储契约已承诺 | 依据及责任 |
| --- | --- | --- |
| A01 | 完整操作身份、同身份同输入认回及异输入冲突 | S01；存储契约拥有者维护，Tool 适配消费 |
| A02 | 组合登记持久保存、版本并存及具名参加者校验 | S02；存储契约拥有者维护，应用协调者登记 |
| A03 | 同事务域的事实、回执与待交接记录共同提交，Worker 参加者使用受限事务端口 | S03、S06；存储提供者兑现，领域参加者核业务 |
| A04 | 明确提交、持久回滚、受理前拒绝及未知有不同证据；同身份查询与五项否定证明 | S04、S05；存储提供者兑现，Tool 保留语义 |
| A05 | 租户域绑定、写代际排除及命令大小、数量与准入限制 | S06、S07；存储提供者与装配者兑现 |
| A06 | 耐久须按故障范围验证，规格状态不授予提供者符合性 | S08；存储提供者及 SQL-T01 拥有者给证据 |

B 项的端口调整由 Tool 拥有者在 [#435 记录仓一致性套件](https://github.com/nemori-ai/omne-harness-lite/issues/435)中按契约变更协议确认；[#421 阶段 6.9](https://github.com/nemori-ai/omne-harness-lite/issues/421)消费该结果实现耐久适配，运行以 #280 接受为前提。

| 定位号 | B：Tool 要调整的假设 | 受影响端口方法、改动归属及后续卡 |
| --- | --- | --- |
| B01 | 一个 `LedgerDomain` 条件写不能自动代表所有业务共同事实，也不能把 call/queue 分步说成共同提交 | `ToolLedgerStore.read/commit`、`commands.prepareStart`、`queues.reconcile`；Tool 领域口与应用边界按 D01、D02、U01–U04 保留现行两域提交及同身份对账。#435、阶段 6.9 的存储适配不以 C01 为前置。若新业务要求改变 call/queue 边界，列候选 B01，附具体依据并先取得 Tool 契约拥有者决定 |
| B02 | 业务 operation、摘要和回执不能直接等同 storage 完整操作身份与回执 | `ToolLedgerStore.commit/read`、`reads.lookup/operation`；Tool 存储适配建立可恢复关联，保留 S01、S04、S07 语义。#435、阶段 6.9，身份适配候选 B02 |
| B03 | 通用空读、CAS conflict 或明确回滚不能取代 Tool 否定查询围栏 | `ToolLedgerStore.read/commit`、`reads.lookup/operation`；Tool 查询适配按 L07、S04、S05 核实等效排除和未知处理。#435、阶段 6.9，否定查询适配候选 B03 |
| B04 | `HostRecord.value: unknown` 和通用 `ContentBlock` 不能假定均可直接作为有界 JSON facts 提交 | `ToolLedgerStore.commit/read`、`preserveResult`、`content.read/raw`；宿主拥有值的版本编码，Tool 保管层处理内容引用，基础设施只编码已确认的数据契约。依据 L05、S06、O01–O03；#435、[#433](https://github.com/nemori-ai/omne-harness-lite/issues/433)、父卡阶段 5 与 6.9，编码与内容适配候选 B04 |
| B05 | 当前 call 内交付释放不代表已提供消费方共同提交入口 | `releaseDelivery`、`ToolLedgerStore.commit`；Tool 完成 P08 自身事实，应用组合另等 C01、C02。依据 U05；[#434](https://github.com/nemori-ai/omne-harness-lite/issues/434)、#435，父卡“交付释放与消费方同一次提交”集成点候选 B05 |
| B06 | 单域全量快照和局部队列修复不能充当完整耐久恢复扫描，声明 durable 不能替代运行证据 | `ToolLedgerStore.read/commit`、`scanPending`、`loadRecovery`、`claim`；Tool 恢复层补齐持久扫描需求，基础设施兑现读取和代际屏障。依据 U06、S07、S08；#435、父卡阶段 6 与 6.9，扫描仓储口候选 B06 |

| 定位号 | C：交给拥有者决定的要求 | 依据、具名责任与持续落点 |
| --- | --- | --- |
| C01 | 明确哪些 Tool 与消费方事实需要共同提交，哪些按原契约分别承接，并指定应用协调者与中间责任 | U05、S02、S03；架构拥有者 PanQiWei 会同 Tool 及具体消费方拥有者决定。候选考虑共同参加者组合或显式分步承接，均不能在此默认采用。落点为 #421 跨消费方提交集成点 |
| C02 | 确认 Tool 参加者身份、组合版本、事实编码、可调用入口与当前资格；若需要扩展仓储口，先接受该边界 | L01、S02、S06；Tool 契约拥有者 PanQiWei 与存储契约拥有者决定，应用协调者只按已接受资格调用。落点为 #435、阶段 6.9 及 B01、B05 候选 |
| C03 | 接受覆盖 O01–O04 的对象/文件存储契约，包括保存未知、读取资格及释放责任 | O01–O04；存储组或架构拥有者 PanQiWei 决定，Tool 提供具名消费需求。落点为 #421 D-01 与阶段 5；接口及保管策略由内容契约明确，并遵守 P08 现行保留要求 |
| C04 | 在 ToolCall 聚合根、WaitRecord 聚合内实体及 P06 排序与同提交承诺下，确认等待的持久布局、适配端口及跨答复拥有者参加或承接方式；另确定执行绑定登记的持久身份及共同事实 | D03、D04、S06；Tool 契约拥有者 PanQiWei 会同答复协议及绑定提供者拥有者决定。落点为 #421 的绑定登记、阶段 4 等待工作及 #435；不得用 host 台账或存储组合登记替代 |

本节未发现必须修改存储公共结果模型的已证实缺口。当前明确的工作是 Tool 适配、应用组合决定和独立内容契约。若这些工作产生存储契约无法表达的具体反例，由 C02、C03 的拥有者接续决定，不从现有实现缺失推导存储保证缺失。

### 协程驱动

createToolRuntime 先组装门面和 driver，再向独立 host.install 注册 driver；安装本身不受理业务。host.schedule 是唤醒提示。driver.run 通过 scanPending/loadRecovery 读任务，claim 当前协调代次，以实例 fiber 发布观察句柄，然后只推进已持久安排的工作。多次唤醒合并，事务围栏裁定唯一写者；定期扫描补漏。

本包的 driver 在 [driver.ts](../src/driver.ts)。绑定发起与原启动查询在 [driver-binding.ts](../src/driver-binding.ts)，它持有进程内 live 句柄，区分发起前端口失败、绑定失败、抛错与返回句柄。driver 继续拥有 ledger 步骤、失败标记的操作身份及永久排除后的终局写入。

启动阶段的前置或查询端口返回的失败保持原结果，未知异常向 `run` 调用方传播同一对象，不按临时不可用自动重试，原任务与名额保留。`binding.start` 已尝试后的异常仍按 P04 对账；后续查询异常不解除已有失败责任。原绑定异常正文的耐久保存与诊断读取尚未交付。

绑定模块集中准备 permit、解析原绑定与重连环境，driver fence 选择启动、认回或排除。失败 marker 是观察，不是跨 driver 派发围栏，唯一实际受理及永久排除由 authority 排序。失败标记与崩溃窗口见 [SPEC 第 23 条](../SPEC.md#23-推进协程)。

driver 推进启动以及原事实保管与确认：读 `loadRecovery`，按阶段与待办做一步，再重读；一次运行的步数上限是 `ToolConfiguration.driverStepsPerRun`。

一次运行结束后协程自己决定是否再运行：步数用尽且至少有一步提交了或认回了提交时立即重调度；整轮没有进展（全是被排除、修订号陈旧或提交未知的回答），以及记录仓或端口失败、环境答 pending 或 unknown，按 `ToolConfiguration.driverRetryDelayMs` 重调度，排队的等待者经 `queues.reconcile` 对本 key 对账一次。

scanPending、claim 与观察句柄的发布尚未实现，其余唤醒来自 invoke、同 key 释放、原事实 ready 和通道重连重试，执行引用的代次是固定值；没有等待者、进程退出后的欠账归恢复扫描 `scanPending` 的队列域一遍。步骤与操作号见 [SPEC 第 23 条](../SPEC.md#23-推进协程)。

一个实例可处理多个待办，不能为每个观察者创建真实执行。事实流读取、控制与等待响应可以并发接收，但进入 Commands 时按原 operation 和当前 revision 排序。事实存储 ACK 后才确认源可交接；无 ACK 不释放源保管。可选观察者慢或断开不影响真实执行。

依赖失败暂停依赖它的任务并保留诊断，不把整次调用的所有清理都阻塞。例如授权不可用阻止新启动，但受权托管通道可以继续接受原结果；结果写入不可用时不能继续确认源，却可以请求停止和查询原执行。不可用、已排除和连续性丢失是不同结论。

### 准备、执行与结果管线

顺序为固定请求、环境准备认回、FIFO、启动记录、共同围栏、原执行、事实保管、原输出 codec/custody、返回适配、结果提交和交付。dummy 与参数失败在环境之前收场。普通返回不经对象字段猜测；作者适配在绑定时固定，结构化结果也必须经过整结果政策和附件保管。

对端每种操作保留稳定身份。准备、停止、答复、暂停、释放的响应丢失均查询同一记录。对端不具确定查询能力时返回 unknown，不能通过换操作号实现“恢复”。托管提供者资格声明须说明支持哪些排除和连续性证据；缺能力的提供者不能装成能安全恢复的变体。

执行链与协调代次分开。协调者退出不自动中断执行。受信 late ingress 核原来源后可保存迟到结果与费用，而不恢复旧协调者推进权。检查点只有在原执行排除、已做效果和消费位置可恢复时成立；普通 Promise 栈不采用序列化恢复。

### 作者输出和等待适配

作者使用普通 async execute(A, E, context)。每次执行上下文使嵌套 helper 可以借用 emit 或 wait 的窄接口。生成器方案则通过 yield 输出和等待，由宿主 next(answer) 驱动，每次输出都交回控制，且要求 helper 传播生成器协议。因此采用执行上下文。行为与失败统一归 [P11](../../tool-contract/SPEC.md#p11-作者输出与等待原语)，不新增运行时或通用消息总线。

执行绑定构造一个 Scope，把原身份、停止信号、容量、过程转换器和等待适配器封装起来。作者只取得 Context。内部有一个按调用顺序分配位置的有界输出账，记录受理序号、固定内容、保管状态和回执。事实读取器不等待作者消费 emit 的 Promise，因而不会出现作者 await emit、宿主却等待作者 return 才读取事实的死锁。

append-text 转为固定文本块的累计值；replace 保持完整块。容量核对同时覆盖在途内容和未封块累计状态，超过限额明确拒绝。后端可批保存，但原事件身份不随分批改变。关闭块的身份和模式索引可落存储，不在内存无限累积。等待、控制和恢复通路不占过程输出队列的额度，输出填满不能阻塞取消传播。

wait 适配器先固定 key 和输入，再把请求保管为证据，与输出屏障后的 WaitIntent 交给既有事实流。Ask 适配器解析采用的请求；resource 适配器从 request 证据取得关联，不读取变化中的 E 补全原请求。原答复按 ResponseRecord 送入 Scope；它只消费一次原答复并产生一次 continued 事实；同一结果的多个作者等待分支仍可能各自继续，业务副作用去重由作者及目标协议负责。等待 key 及已消费回应交给原执行源的耐久查询索引后才释放本地历史额度。独立内存适配器按显式上限拒绝新 key，不静默淘汰旧记录。等待输入和回应解码由各协议拥有者负责，Tool 不发明统一表单或默认授权答案。

作者返回时包装器立即调用 finish 关闭新受理，同时按 P05 保管原 R。正常最终投影等待这两项成功，并确认没有活动等待。暂时保存未知留在原输出账，阻止 completed；永久失败形成明确故障。失败或取消的逻辑终局可以先成立，后续保管、清理和迟到效果由原任务承接。独立 executeTool 使用同一 Scope 收尾接口，能力与耐久保证由显式提供者说明，不内建无声 noop。

实现至少拆开过程接收、外部回应接收和控制三条可推进路径。一个等待中的作者协程不占住整个 driver；同一 ToolCall 的事实转换仍在 Commands 中排序。Cordis 只装配这些适配器及其资源，不能把 Fiber 的等待或撤除替代为 ToolWait 或 cancelled 决定。

### 业务 schema 与输出归一化

等待形状放在实际工具或其业务协议拥有者，通用检查复用 schema-provider。ToolWaitContract 绑定请求及响应形状，执行绑定把采用列表固定为作者允许集合。开放等待时保存 ToolWaitSchemaSnapshot；响应端按原快照取得 schema 租约，完成检查后释放。恢复加载不到原修订时报告缺席，不跟随当前最新声明。

ToolWaitResponseValidator 是交给决策方或资源接收适配器的窄依赖。接收者先校验候选，再按其权威协议确认有效回应；invalid 只返回提交者。只有已确认的有效回应进入 ToolDecisionBridge 或 ToolResourceResponses 的 resolve。业务校验依赖当前权限、候选集合或资源状态时，单独注入相应守卫，不放入 schema callback。这里没有新增等待运行时、登记存储或通用 HTTP 服务。

结果管线保持两种作者写法。ordinary 的 executor 返回 R，structured 的 executor 直接返回 ToolResult。前者经固定 renderer 和程序编码器生成 ToolResult，后者验证原封装。两者均在 P05 提交前完成返回验证、程序 schema 检查、块政策和保管。OutputCodec 解决可保存与可恢复，不证明业务字段正确；ToolReturnValidator 使用原 arguments 和实际返回检查类型及本域后置条件。

ToolResult.data 使展示内容和程序数据共享原 resultVersion、保管及交付责任。分开保存原函数值和展示结果、由程序执行方另取输出，会增加两份记录的同提交、版本和交付一致义务，因此不采用。RawOutput 仅负责原件保管，不能成为绕过权限和输出校验的程序 API。

多命令采用逐操作封装。defineToolOperation 在各自 A/R 类型下封装作者，登记表只组合 ToolOperation，不要求不同函数共享返回类型。defineCommandTool 从命令键和各操作声明生成 ToolDefinition。另一方案是让整张表持续携带每键的 A/R 泛型；它有利于同进程调用推断，但不能直接代表跨域程序数据，也不能替代动态分派校验。本设计把类型检查留在单操作构造处，程序执行方的类型来自逐命令程序 schema。完整规则见 [P13 的多命令部分](../../tool-contract/SPEC.md#多命令作者注册与返回选择)。

ToolBindings 提供者持有 ToolAuthorRegistration，按原 adoption 与 command 选择封闭操作。选中后，参数解析、执行、输出检查、渲染与程序编码保持配对。恢复不按新表重新选名，settle 不遍历其他命令的 schema 寻找可通过项。各操作使用同一明确环境契约 E，不因聚合而扩大依赖或权限。同步注册只完成可判断的绑定，schema 来源及正文的异步检查在可用性成立前完成。

程序执行方的具体语言适配器从经过验证的 data 解码本语言值，禁止跨域传原宿主对象或函数。动态调用只保证实际声明中的性质，不凭名字推导静态类型。展示投影由消费方处理，Tool 不把 data 整体塞进消费方的请求内容。具体引擎和 SDK 语法仍由程序执行提供者交付。

该分离参考 LangChain JS 的 content 与 artifact。核对固定源码 [tools/index.ts](https://github.com/langchain-ai/langchainjs/blob/bfa3b31fd3136495235984b43287b3c6eff7da3e/libs/langchain-core/src/tools/index.ts) 的输入解析、content_and_artifact 与结果包装路径，以及 [tools/types.ts](https://github.com/langchain-ai/langchainjs/blob/bfa3b31fd3136495235984b43287b3c6eff7da3e/libs/langchain-core/src/tools/types.ts)，该路径没有通用业务输出 schema 验证，artifact 类型也不提供这项保证。本设计只借鉴表示分离，新增的输出验证和可靠交接责任由 Tool 自己兑现。外部服务的 structured-output 功能不作为工具返回校验依据。

### 故障处理与资源次序

计划退出先 quiesce，读取完整 drain inventory，排空或 handover，再撤目录及释放实例资源。handover 必须有承接者对同一清单的耐久回执；变化中的清单不能用旧回执盖过。存储失败或外部操作 unknown 时保留责任，不报告优雅退出成功。

环境释放晚于其所需内容与接续事实转入独立保管；释放本身可失败和查询。停止执行与释放环境分别确认，不依赖 Cordis disposer 的执行顺序。程序执行方的程序域销毁后，child ledger、控制任务和结果保管仍由长期宿主承担。

### 验证设施与限制

设计验证至少包括公开声明提取编译、非法状态类型反例、两个调用竞争名额、启动与失效排序、每类外部回包丢失、答案与取消、逻辑终局和迟到版本、父关闭与子受理未知。必须包含能击中错误变体的断言，不能只验证 happy path。

真实提供者还须证明断电耐久、跨 owner 失效顺序、环境资源排除、持续时间来源、原事实源保管、受限程序隔离与不合作程序终止。模型假设和实际探针范围分别记录，未运行项见 [coverage](../../tool-contract/verification/README.md) 的验证义务及 [open-questions](../../tool-contract/docs/architecture.md#tool-设计状态与外部缺项) 的外部缺项。设计文档不选择尚未采用的存储后端或程序执行方的引擎。

## 普通调用与持久引用

runtime.invoke 在第一次 await 前用契约判定器固定 payload，再通过来源 resolve 原子建立或认回 call/admission 与来源，最后沿原身份调用 ledger。来源签发器与核验器由真实入口装配。runtime 不建立 payload 去重表或引用映射表。引用直接编码原租户、call 与 admission，操作引用另带 operation。

[invocation-access.ts](../src/invocation-access.ts) 集中解码与租户核对，queries、content 和 commands 直接进入各原端口。目录连接单独进入 host.directory。持久读取与交付不取决于活实例。driver.run 的实例身份来自 host，同一存活实例重复唤醒沿用。真实生产 host、claim、同一 call 的换实例接管及完整恢复尚未实现。

## 原事实读取资源

[driver-facts.ts](../src/driver-facts.ts) 拥有每原 start 的受管 reader 和 ACK 编排。[driver-binding.ts](../src/driver-binding.ts) 按 tenant/call/start 保留原 live 与恢复路由。[driver.ts](../src/driver.ts) 保持每 call 串行、step budget 和统一 retryDelay。读取回调不写 ledger，业务事实及待办仍由 call 域 CAS 决定。信号竞争与退出前提见 [SPEC 第 25 条](../SPEC.md#25-原事实受管推进)。


### 原结果与环境清理模块

[ledger.ts](../src/ledger.ts) 拥有边界、当前资格、外部端口调用和多 operation 排除围栏。[ledger-settlement.ts](../src/ledger-settlement.ts) 核原 final、单赢家并生成终局及全部后继任务的同提交写集。[ledger-environment-release.ts](../src/ledger-environment-release.ts) 拥有全过程保管闭包、按 preparation 唯一的 canonical 计划和观察确认。外部 retain 在 CAS 之外只按原身份调用，CAS 重判不能沿用过期闭包。

[driver-settlement.ts](../src/driver-settlement.ts) 从原 task.basis 读取 SavedFact，再重送原 preserveResult。[driver.ts](../src/driver.ts) 在成功后重读 queue 待办，确认已关闭才报告进展和 wake。未确认 ACK 不阻止此路径。正常 completed 关闭 reader，异常终局保留后续原 process 和 blocked facts 责任。完整必要行为归 [SPEC 第 26 条](../SPEC.md#26-原结果收场与释放责任)，跨域顺序见 [flows](flows.md#原结果与释放)。
