# tool-execution-runtime 实现设计

## 实现路径与来源

**自建一个 Cordis 插件**（[D-032](../../../../record/decisions/tool-execution-runtime-baseline/decision.md)：C 自研）。契约拥有的是执行记录的状态与收场、结果落成哪种消息、恢复扫描——三者被「同一次执行的收场只写一次、与它的消息不得只成一半」绑在一起，没有可 fork 的对象。
D-032 允许的**函数级借鉴**只登两项，都是「避坑」，不搬代码：收场首胜的判定次序参照 DSH `jobs` 的 settle（先判「已有收场」再写，写下之后一切晚到者丢弃）；`local-execution` 的「停止与 I/O 交错」那组反例与 DSH 的「spawn 失败被记成 killed」作为测试义务（[verification](verification.md#证据义务)的 K-3、K-8）。

**复用的都是本仓库的节点**，依赖方向单向：

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| 存储协议（一次读／写事务、`lockSentinel`、四型失败、`mapStorageError`、`MigrationFragment`） | [`core/storage`](../../core/storage/README.md)；实例由 [`infra/storage-sql`](../../infra/storage-sql/README.md) provide | 全部持久事实与序列化（[要求清单](#对存储提供者的要求清单)） |
| 时间源 `clock`（`now()` 不后退） | [`infra/clock`](../../infra/clock/README.md) | 账的起止、等待到点、前台阈值与上限的计时 |
| `definePlugin`、`resolveOptional`、`Outcome` | [`core/kernel-basis`](../../core/kernel-basis/README.md) | 插件骨架、可选依赖的现取、失败返回值 |
| 到达装配的纯计算（`start`／`accept`／`snapshot`／`closeOut`／`abandon`） | `packages/core/stream-assembly`（本批节点，起草中；纯模块，不是插件） | 工具一侧帧流的装配状态（S-39、S-62） |
| 工具定义形状、`ModelToolName` 逆转写、参数判定、用法文本、结果检查 | `packages/core/tool-model`（本批节点，起草中） | S-23 ④ 参数判定与用法、S-41 交回检查、S-37 按定义名找执行者 |
| 消息、结果块、账的形状 | `packages/core/message-model`（本批节点，起草中） | 送达的消息与账（S-13、S-19） |
| 身份值、`Instant` | [`core/identity-values`](../../core/identity-values/README.md)、[`core/offer-expiry`](../../core/offer-expiry/README.md) | 表示层校验与时刻 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）。机制语义逐条引 [basis](../../../../basis/README.md) 条目；basis 没有的标「假设」并列进[实施缺口](#实施缺口与消费者影响)。
**配置错误一个政策**：与租户一程同一收场——config 经 `definePlugin` 的 `Config` 由内核在插件体之前校验，不过即 fiber `FAILED`、什么服务都不出现、装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；不做运行期具名拒绝。

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个插件 `tool-execution-runtime`（候选名），一条 fiber，inject 恰两项：`storage`、`clock`。**它 provide 一个服务（候选名 `toolExecution`），方法与契约第四节的十四个操作一一对应（名字取契约：`submit`、`awaitForeground`、`interrupt`、`interruptBatch`、`background`、`cancelForRun`、`archiveSession`、`answerWait`、`preempt`、`reconcile`、`readExecution`、`listBackground`、`listLive`、`storeRaw`），另加执行者登记（候选 `registerExecutor`，S-37）。
执行者一侧的四个原语（等待、发帧、报账、交回）**不是服务方法**：它们在起执行者时随这一次执行交给执行者，只作用于它自己那一次（契约 S-12 ①「不带身份参数」）。

插件体只做三件事：provide 服务；登记**一个**运行时核心 effect（下称「核心」）；不跑任何外部效果。核心持有全部不持久的东西：

| 核心持有 | 是什么 | 契约 |
|---|---|---|
| 服务状态 | `recovering` → `serving` → `stopped`，单调 | S-15（`runtimeNotReady`／`runtimeStopped`）、S-20、S-47、S-48 |
| 活体表 | (会话, `CallId`) → 执行者句柄、停止手段、装配状态、等待的解除者、计时器；**排队中的执行在这里有一个队列位**——它也是「找得到」 | S-7 |
| 执行者表 | 定义名 → 执行者；另有一格给 MCP 来源（桥） | S-37 |
| 调度 | 批内次序与同工具并发上限的起执行者决定（决定在存储锁下做，见 S-43 行） | S-43 |
| 排空器 | 按会话、按出站序把出站项交给会话日志追加 | S-19 |
| 等待者 | `awaitForeground` 的挂起调用 | S-24 |

**迁移**：包导出迁移片段（候选名 `toolExecutionRuntimeMigrations`，`MigrationFragment[]`，形状归 `core/storage`），由装配 `apps/cli` 经 `composeMigrations` 合成；本包不自己建表。

### 关键选择

**一、一条 fiber（选），不拆成候选 D 的两条。**

| | 候选 D：活体持有者（不 inject）＋ 服务门面（inject 存储、时钟）两条 fiber | **一条 fiber，只 inject 存储与时钟（选）** |
|---|---|---|
| 落选方的最强论证 | 存储或时钟在进程内换代时，在途执行不动：门面重跑、持有者不动 | —— |
| 本方弱点 | —— | 存储或时钟一换代，本插件整个重跑，全部在途执行按 S-48 落 `failed{abnormal_interruption}`——**正确，但每换代一次就是一次停机**（契约 S-46 倒数第三行） |
| 为什么仍选它 | D 多一个进程内交接接口、一个停放队列，停放期间收场只在内存里——出现第二个写入者与「重复拥有同一事实」（[候选 D](../../../../record/proposals/capability-split-tools/alternatives.md#推荐与改票条件)） | 本版存储、时钟不在运行期换代（**装配前提**，归 `apps/cli`）；契约把它写成了前提 |
| 改选 D 的触发条件 | 装配在进程内撤换或重载存储、时钟成为运行期常态（运行期切换存储配置、长期待机部署启用热重载、升级确认在进程内重建存储）；或 X-6 的 probe 加运行日志表明宿主重跑确实在发生 | |
| 置信度 | 高（D-039 已接受候选 C，本行只写触发条件） | |

**二、一次执行是核心持有的一个活体表项（选），不开子 fiber。**

| | 每次执行一条子 fiber（草图原样：「执行 fiber × N，inject 无，插件体只跑一次，一个收口 effect」） | **活体表项，由核心这一个 effect 持有（选）** |
|---|---|---|
| 落选方的最强论证 | Fiber 是 Cordis 的所有权单位：父卸载带走子（草图的 H-1，**假设**，无 probe），实现写漏了也不留孤儿；每次执行的失败被 fiber 隔开 | —— |
| 本方弱点 | —— | 「一个都不漏」要核心自己保证：活体表里每一项都要在撤除序列里被收口；写漏一项就是一次孤儿进程（恢复时按登记的进程组回收兜底，但那要等下一任） |
| 为什么选它 | 契约 [S-48](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-48-本能力自己的撤除与换代)（修复波 2，晚于草图）要求有序撤下时**先**收尾帧流、**再**写收场、**然后**才发停止；而 fiber 卸载时各 effect 由 `Promise.all` 并发驱动，次序只能在**一个** effect 内组合（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）——子 fiber 各自的收口与父的写收场会并发。执行不 inject 任何东西，fiber 给不出依赖追踪的价值；它也不是一次插件应用。选子 fiber 还要先补三条没有 probe 的假设（[草图的前提表](../../../../record/proposals/capability-split-tools/design.md#草图依赖的前提与会推翻它的证据)：H-1 子随父卸载、H-3 单独卸载子不牵连父、H-4 无 inject 不重跑）。草图那一行还写着「不指望撤除时写收场」（H-9），晚于它的契约 S-48 已改成必须写 | 只依赖已有 probe 的一条 basis；K-2「插件体重跑等于把工具再做一遍」在这里结构上不存在——执行根本不是插件体 |
| 置信度 | 中。**这是本节点对草图的偏离**，交 architecture-reviewer 判 | |

**三、送达用发件箱（选），不把会话日志的追加并进本能力的事务。**契约 S-19／S-46 把二选一交给提供者设计。

| | 会话日志的追加口加入本能力的存储事务 | **发件箱：本能力在事务内写执行记录与出站项；排空器把出站项交给会话日志追加，按 (会话, `CallId`, 段) 幂等（选）** |
|---|---|---|
| 落选方的最强论证 | 消息与记录真正同一次提交，没有「已交付、待追加」这个中间态；`awaitForeground` 不用等排空 | —— |
| 本方弱点 | —— | 多一个中间态与一张表；`awaitForeground` 要等排空器；会话日志一侧必须提供幂等追加（[L-1](#对会话日志提供者的要求)），否则一次重排就是两条消息 |
| 为什么选它 | 存储协议的消费者义务 P-13：`write(fn)` 内不得调用任何经同一 `storage` 的别的服务面——「追加口加入调用方事务」就要把事务句柄交过插件边界，改两份契约的公开面，跨进程后整套作废（与 [organization-governance 不用跨插件事务句柄](../../tenancy/organization-governance/design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)同一理由）；会话日志的提供者此刻还不存在（契约 G-1） | 发件箱正是契约 S-46 右列要求分布式时必须采用的形状：单机与分布式同一机制 |
| 置信度 | 高 | |

**四、先 provide，扫描完成前一律 `runtimeNotReady`（选）；不等扫完再 provide。**

| | 插件体 `await` 恢复扫描，扫完才 provide；扫描抛出即 `FAILED` | **插件体立即 provide，核心在后台扫描，扫完才把服务状态置 `serving`（选）** |
|---|---|---|
| 落选方的最强论证 | 消费者永远看不到一个「在但没准备好」的服务；扫描出错在启动时就暴露为装配失败（basis `plugin-throw-fails-fiber`） | —— |
| 本方弱点 | —— | 每个方法都要先过服务状态闸；消费者要处理 `runtimeNotReady` 并稍后重试 |
| 为什么选它 | 契约 S-15、S-20 把「扫描之前」定义成一个具名返回值 `runtimeNotReady`（与 `runtimeStopped` 分开），这是契约给消费者的形状；存储在启动时一时不可用是抖动，不是配置错误——落 `FAILED` 要整个装配重启 | 扫描遇 `StorageUnavailable` 按 `deliveryRetryInterval` 重试、状态留在 `recovering` |
| 置信度 | 中高 | |

**五、同一会话的写入由一把存储哨兵序列化（选）。**

| | 执行行上的 `lockRow` | 进程内每会话一把锁 | **每个写事务开头 `lockSentinel('tool-execution-runtime/session/<会话>')`，锁下现读再写（选）** |
|---|---|---|---|
| 落选方的最强论证 | 粒度最细，同会话不同执行的写互不等待 | 零存储往返，最快 | —— |
| 本方弱点 | —— | —— | 同一会话的全部写串行；pg 上哨兵是 `hashtext` 的咨询锁，撞哈希只会多串行、不会错 |
| 为什么选它 | 首胜只是一部分：批内次序、同工具并发上限、提交与归档／取消运行的互斥、判重都跨**多行**判，行锁锁不住「还没有的行」（P-4：行不存在则什么也不锁） | **不算数**：锁随插件实例生灭，换代时旧实例的在途写与新实例的恢复扫描互不相知 | 一把锁覆盖全部跨行判定；它在存储里，旧任与新任、两路排空都排进同一个次序（P-5） |
| 置信度 | 高 | | |

### 持久记录（逻辑名，候选）

| 记录（候选表名） | 键与列（候选） | 对应条款 |
|---|---|---|
| 执行记录 `tool_execution` | 主键 `(session, call_id)`；`tenant`、`run`、`attempt`、`call`（原样调用块）、`definition_ref`、**`definition_name`**（逆转写得到）、**`origin`**（登记时注册表条目给的来源，MCP 调 `invoke` 要 `remoteName`）、`admission_token`、`environment`、`endpoint_holding`、`batch_id`＋`batch_position`、`posture`＋转后台原因、`phase`、`wait_index`＋`wait`、`call_outcome`、`outcome`（收场、原因、失败种类、发起者）、`reported_cost`、`account`、`stop_physical`、`external_effect`、`stopped_at`、`submitted_at`、`started_at`；**本节点加的内部列**：`submit_disposition`（首次提交时的 disposition，重放照它答）、`reclaim_handle`（执行者起来后登记的回收句柄，如进程组）、`submit_seq`（同会话单调，排队的先后） | S-5、S-6、S-8、S-13、S-14、S-23 ⑦、S-43、S-20 第 2 步 |
| 出站项 `tool_execution_outbox` | 主键 `(session, seq)`；唯一 `(session, call_id, segment, kind)`；`segment ∈ call · background`；`kind ∈ messages · entry · card_close`；`payload`（这一段的消息序列：`ToolInternalMessage` 在前、结果消息在后；或一条记录条目；或一个关卡请求）；`state ∈ pending · appended` | S-19、S-20 第 3、4 步、S-22 |
| 会话标记 `tool_execution_session` | 主键 `session`；`tenant`、`archived_at?` | S-29 ④「记下这个会话已归档」 |
| 已取消的运行 `tool_execution_cancelled_run` | 主键 `(session, run)`；`level`、`cancelled_at` | S-28 ④「记下这个运行已取消」 |
| 原始结果 `tool_execution_raw` | 主键 `attachment_id`；`tenant`、`session`、`call_id`、`media_type`、`bytes`、`stored_at` | S-36；存在哪、留多久是契约 G-7，本节点只给「写得进、换得回引用」 |

### 契约责任到插件、服务与操作

契约的九件事本表不复述，只写兑现点与缺口。**每个写操作恰一次存储写事务、事务开头取会话哨兵（[R-T3](#对存储提供者的要求清单)）；外部调用（放行核对、注册表、会话日志、执行者）一律在事务之外**（存储协议 P-13）。方法名取契约，其余名字标候选；全部**尚未实现**。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-5-一次执行以会话里的-callid-指认) 身份 `(租户, 会话, CallId)` | 执行记录主键 `(session, call_id)`，`tenant` 列逐次核对；活体表按同一键 | 尚未建包 | 不另立执行标识；进程、句柄、实例都不进键（DSH「同 id 换实例不串台」，K-2） |
| [S-6](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-6-执行记录) 执行记录、唯一写入者 | `tool_execution` 表；只有本插件的方法写它 | 尚未建包 | 内部列（上表加粗）不进契约形状；`stop` 三件与 `reclaim_handle` 可在收场之后补写，不改收场 |
| [S-7](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-7-活体与找得到) 活体与找得到 | 核心的活体表；服务状态闸：扫描提交之前一切方法 `runtimeNotReady` | 尚未建包 | 「在服务中每条未收场的记录都有活体」：扫描先于服务 ＋ 上交即 `stopped`（S-47）；**前提**：同一存储只有一个据点进程里的一份本能力在写（R-T8，归装配） |
| [S-8](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-8-姿态与阶段两个维度) 姿态 × 阶段 | 两列；转移在会话锁下判前置 | 尚未建包 | 姿态只从 `foreground` 写到 `background`；等待原语与转后台各自核对前台 |
| [S-9](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-9-两个收场)～[S-11](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-11-失败的种类) 两个收场、占位原因、失败种类 | 一张纯函数的对照表：触发源 → (收场, `reason.code`, 失败种类, 块由谁写)；只有停机追补、有序撤下、桥换代三路带 `abnormal_interruption` | 尚未建包；块文案归实现 | `arguments_invalid` 的用法由 `core/tool-model` 从同一份定义生成——与 `Tools().inspect` 一致性要等 PF-007 的契约（受阻，见 verification S-61） |
| [S-12](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-12-等待) 等待原语 | 执行者调 `wait(shape, deadline?, card?)`：会话锁下 `phase = waiting`、`wait_index + 1`、记形状 ＋ 一条出站条目；提交后挂一个解除者；有到点就挂一个计时器 | 尚未建包 | 解除者在 `answerWait` 提交后以 `answered` 交回，或在这次执行收场时以 `ended{outcome}` 交回；写不进 ⇒ `dependencyUnavailable{storage}`、不进入等待；等待期间前台阈值与上限暂停计时（S-44） |
| [S-13](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-13-账) 账 | 收场那一次事务里按记录算出 `ToolCallAccount` 写进 `account` 列 | 尚未建包 | `frames`：`closeOut`／`abandon` 交出的那份，停机追补写 `"unknown"`，执行者没起过写零；**`late` 要知道「尝试已被取代或运行已终结」，本节点没有读面**（缺口 T-4）；`credentialScope` 缺席（契约 G-15）；`model_call` 镜像与 `usage`、`service_reported` 的来路没有接口（缺口 T-5） |
| [S-14](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-14-停止与外部效果分开说) 停止与外部效果分开说 | `stop_physical`、`external_effect`、`stopped_at` 三列；桥交回的失败带「请求是否已发出」 | 尚未建包 | 执行者没跑过 ⇒ 已确定未发生；跑过而被停、停机、收场后又有交回 ⇒ 不可确定；正常收场不判 |
| [S-15](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-15-缺席时的默认答案) 缺席默认 | 见[状态、并发与失败映射](#状态并发与失败映射)的失败映射表 | 尚未建包 | 没有 catch-all；`StorageDefect` 是缺陷、不折成契约失败值 |
| [S-16](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-16-首胜收场只写一次) 首胜 | 会话锁下读 `outcome`，为空才写；不为空 ⇒ 这一路丢弃（交回得 `discarded`、中断得 `alreadyEnded`），留一条出站条目 | 尚未建包 | 「同一存储里同一行上的条件写」由 R-T3 的锁定读兑现；**不加进程内锁**。判「已有收场」看记录不看活体（K-2） |
| [S-17](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-17-持久意图先于外部效果) 意图先于外部效果 | `submit` 的事务写 `queued`；起执行者先在会话锁下写 `running`（占并发位），提交之后才调执行者的 `start`；执行者起来后交回回收句柄，另一次事务写 `reclaim_handle` | 尚未建包 | 至多起一次：`running` 只从 `queued` 写一次；恢复与重放都不重起。**`running` 写下到回收句柄写下之间有一个窗口**：此刻被强杀，恢复扫描找得到记录、找不到句柄，回收不了那棵进程树（X-5，缺口 T-13） |
| [S-18](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-18-收场先落停止后发) 收场先落停止后发 | 每次执行一个停止例程（一个 async 函数，不拆成多个 effect）：收场事务提交 → 给执行者发停止 → 等 `executionStopGrace`（config）→ 强制停止 → 回收句柄 → 补写 `stop_physical`／`stopped_at` | 尚未建包 | 并发位在收场那次事务里释放（计数只数 `running`／`waiting`）；收口任一步出错写进出站条目、不改收场；`forced` 不等宽限 |
| [S-19](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-19-送达) 送达 | 发件箱：收场（或转后台）与这一段的出站项同一次事务；排空器按会话、按 `seq` 调会话日志追加（幂等键 `(会话, CallId, 段)`），成功后把出站项置 `appended` | 尚未建包；会话日志追加面**不存在**（契约 G-1，缺口 T-7） | 共同存储对象与两条交错的反证见[下节](#跨-owner-的同一提交执行记录与会话日志)；`ToolInternalMessage` 只在 `closeOut` 交出的 `blocks` 非空时有，排在结果消息前、同一出站项；工具执行被中断不另补提醒 |
| [S-20](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-20-恢复扫描与停机不重来) 恢复扫描 | 核心起来后：按会话分页读全部未收场记录；每个会话一次事务——先按 `reclaim_handle` 回收（核对进程身份再杀），再首胜写 `failed{abnormal_interruption}`、外部效果与 `stop` 按契约、`frames = "unknown"`（`queued` 的写零）、`reported_cost` 入账、出站项（前台 `ToolMessage`、后台 `background_execution_interrupted` 提醒、关卡请求）；全部扫完 ⇒ `serving` | 尚未建包 | 不论会话、不论姿态、不论有没有协程要恢复；**没有例外地不重起**；已交付未追加的出站项由排空器照常追加、按幂等键不重复。关卡请求没有接收方（契约 G-5，缺口 T-9） |
| [S-21](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-21-租户与会话范围) 租户与会话 | 每个方法先表示层校验，再比记录上的 `tenant`，不等 ⇒ `executionNotFound`；`submit` 要读**会话持有的那一个**租户 | 尚未建包 | 会话持有租户的读面归会话那一程、**没有提供者**（契约 G-12，缺口 T-8）：读不到 ⇒ `dependencyUnavailable{storage}`——在它出现之前每次 `submit` 都是这个值。**不按租户、会话、运行开实例**（basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md)） |
| [S-22](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-22-关键转换留记录) 关键转换留条目 | 每次转换在同一事务里加一个 `kind = entry` 的出站项 | 尚未建包 | 收场那一条与收场同一次事务；条目壳归会话日志 owner（契约 G-1） |
| [S-23](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-23-提交一批) 提交一批 | `submit`：① 闸与表示层 → ② 读会话持有租户、比对 → ③ 一次读事务判重（已有且同块的记下首次 disposition、异块 ⇒ 整批 `callIdConflict`）并读归档／取消标记 → ④ 只对新项：逐项 `verifyToken`、按 ⑥ 的次序合成整批结论 → ⑤ 逐项查会话资产注册表 → ⑥ 写事务：会话锁下**重判** ③（并发的另一次 `submit`、归档、取消可能插进来过），再写记录、即刻收场的收场与出站项、发起即后台的占位；提交 → 唤醒调度 | 尚未建包 | 判重在凭据与注册表之前（K50、N-8）、租户在判重之前（R-29）；并发的同批两次提交撞主键 ⇒ 同事务重读按幂等返回（R-T4）。**⑤ 兑现不了**：按契约要以 `within = run{这次尝试的报告}` 查，而 `submit` 的输入里没有报告（**缺口 T-1**，两份契约对不上）；注册表缺席 ⇒ `dependencyUnavailable{registry}` |
| [S-24](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-24-等前台那一次调用落定) 等前台落定 | `awaitForeground`：先读记录与这一段出站项；`callOutcome` 已落且出站项 `appended` ⇒ 立即返回；否则挂一个等待者，排空器置 `appended` 时解除 | 尚未建包 | 任何协程、任何次数等同一结果；本任 `stopped` ⇒ 等待者一律 `runtimeStopped`；会话日志缺席时出站项不会 `appended`，等待不返回（缺口 T-7） |
| [S-25](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-25-中断一次执行)、[S-26](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-26-成批中断) 中断 | 会话锁下首胜写 `interrupted` ＋ 账 ＋ 出站项；提交后对每条跑停止例程 | 尚未建包 | 成批：一次事务里逐条判、已收场的跳过；`agent` 中断只落后台收场提醒的块（M23） |
| [S-27](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-27-转后台) 手动转后台 | 会话锁下：前台那一次还没落定、允许后台、阶段是 `queued`／`running` ⇒ 姿态后台 ＋ `backgrounded_by_user` ＋ 占位出站项 | 尚未建包 | 提交后唤醒调度（同批下一项可以起）；前台阈值与上限计时器撤掉 |
| [S-28](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-28-取消一次运行) 取消一次运行 | 会话锁下：这个运行名下前台未收场的全部 ⇒ `interrupted{run_cancelled}`；写 `tool_execution_cancelled_run` | 尚未建包 | 此后同运行的提交在 ⑥ 的重判里读到标记 ⇒ `alreadyEnded`；`forced` 不等宽限，从 `graceful` 升 `forced` 时对仍在 `stopping` 的立即强制 |
| [S-29](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-29-会话归档) 会话归档 | 会话锁下：全部未收场 ⇒ `interrupted{session_archived}`；写 `archived_at` | 尚未建包 | 归档之后晚到的交回在首胜处丢弃；**归档提交里交付的出站项要在归档之后仍被会话日志接收**（[L-4](#对会话日志提供者的要求)），否则那几条占位永远落不下 |
| [S-30](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-30-答复等待) 答复等待 | 会话锁下核对 `phase = waiting` 且 `wait_index` 相等 ⇒ `running` ＋ 条目；提交后才把答复交给等待中的执行者 | 尚未建包 | `value` 按那次等待声明的形状校验（与参数判定同一个 JSON Schema 校验器，`core/tool-model`）；答复者形状是契约 G-10 |
| [S-31](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-31-插队处置) 插队 | 会话锁下读每条的 `allowBackground`、`phase`、`wait.card`，按 PF-014 §5.4 的表一次写完 | 尚未建包 | 「等的是不是卡片」读 `wait.card` 有没有；卡片契约不在（G-5），判据只到「挂没挂卡」 |
| [S-32](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-32-对账) 对账 | 读这个会话未收场、活体表里没有的记录，按 S-20 第 2～4 步处置 | 尚未建包 | 扫描之后这一类本应为空，只作兜底 |
| [S-33](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-33-读一次执行)～[S-35](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-35-列出活体) 读面 | 一次只读事务（R-T5）；`readExecution` 另附装配状态的 `snapshot`；`listLive` 只读活体表 | 尚未建包 | 读不到 ⇒ `dependencyUnavailable{storage}`，不返回空表、不返回 `executionNotFound` |
| [S-36](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-36-存一份原始结果) 存原始结果 | 会话锁下核对「结果还没落进日志」（那一段的出站项不存在或未交付）⇒ 写 `tool_execution_raw`，交回 `AttachmentRef` | 尚未建包 | 声明卸载的原始结果在交回检查通过后由本能力先调它存下（S13-b）；存不下 ⇒ 与收场写不下同一处置（上交）。引用怎样解引用、留多久是契约 G-7（缺口 T-10） |
| [S-37](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-37-执行者登记与撤下) 执行者登记与撤下 | `registerExecutor(key, executor) → unregister`（候选）：`key` 是定义名，或「MCP 来源」那一格；同键重复登记即抛出（登记方启动失败，看得见）。贡献者把 `unregister` 包进**它自己的** `ctx.effect` | 尚未建包；执行者接口是本节点定的候选形状（缺口 T-14） | 撤下只影响此后的起执行者：活体表项握着执行者引用，在途照跑；MCP 例外由桥交回 `bridgeWithdrawn` 兑现（桥节点）。本插件**不 inject 任何执行者**（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)：写进 inject 等于「没有它我不跑」） |
| [S-38](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-38-起执行者) 起执行者 | 调度在会话锁下判第 1 步（同批前面的前台已落定、同工具在跑与在等的少于上限）并写 `running`；第 3 步按 `definition_name` 或 `origin.kind = mcp` 找执行者；第 4 步开装配状态 | 尚未建包 | **第 2 步兑现不了**：落点求值归 PF-005、没有契约（G-4，缺口 T-6）。找不到执行者或 `start` 抛出 ⇒ `failed{start_failed}`，不是被中断（K-3） |
| [S-39](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-39-发帧)、[S-62](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-62-工具侧到达装配前提的承诺) 发帧与到达装配宿主 | 每条活体一份装配状态（`core/stream-assembly` 纯计算），信封由本能力给；帧入口按执行者交出的次序逐个 `accept`；被拒的紧跟一个 `rejected` 的 `trim`；收场时 `finish` 或 `abandon` | 尚未建包 | 路由键是（会话, 目标）（M16）；本版帧入口**不合并、不截短、不限额**（部署政策未给，不自造）；**推给观察者没有操作面**（第 9 条，缺口 T-3）——在它有之前只有 `readExecution` 的快照 |
| [S-40](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-40-报账) 报账 | 会话锁下把校验通过的几笔追加进 `reported_cost` ＋ 条目；被拒的只进条目 | 尚未建包 | 停机不丢：恢复追补的账带着它们；写不下 ⇒ `dependencyUnavailable{storage}`，不在内存里假装记下 |
| [S-41](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-41-交回) 交回 | 交回检查（`core/tool-model`）→ 首胜写收场（`settled`／`discarded`）→ 落盘前那一关 → 出站项；写不下 ⇒ `escalated`，本任 `stopped` | 尚未建包 | 检查在收场之前，不存在「先 `completed` 后改判」；缺席按不合形状 |
| [S-42](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-42-结果落成消息之前的那一关)、[S-63](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-63-卸载判定这一件) 落盘前那一关与卸载判定 | **本批一律走「那一关不可用」**：`content` 照落，声明卸载的 `raw` 位置只落引用、摘要缺席，另一条出站条目 | 尚未建包 | **兑现不了完整的 S-42**：前台由谁驱动 `after_action`、驱动者怎样把结论交回本能力，都没有操作面（契约 G-6 ＋ 缺口 T-2）；卸载判定这一件本批没有实现（缺口 T-11），按 S-63 由指定挂件顶上，结果与上面同形。受阻消费者：`after_action` 上的全部拓展件 |
| [S-43](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-43-一批依次与同一工具的并发上限) 批内依次、同工具并发上限 | 调度的判定在会话锁下读存储（前一项 `call_outcome`、同会话同工具 `running`＋`waiting` 计数），不信内存计数 | 尚未建包 | 超出的按 `submit_seq` 排队；换代后的新任从存储读到同一答案 |
| [S-44](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-44-前台上限与转后台阈值) 阈值与前台上限 | 每条前台执行一个「前台在跑累计时长」的计时：只在 `running` 且前台时走，由 `clock.now()` 的差累加；宿主的计时器只作唤醒，醒来后以 `clock.now()` 判 | 尚未建包 | 到点写 `backgrounded_auto` 或 `foreground_timeout`；两者同时到点阈值那一路先；时钟不可用 ⇒ 不触发（S-47 末行） |
| [S-45](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-45-送达通知) 送达通知 | 排空器置 `appended` 之后 `ctx.emit('execution.delivered', …)`，发送方包一层 | 尚未建包 | 见[事件与过滤器](#事件与过滤器) |
| [S-47](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-47-依赖的提供者不可用)、[S-48](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-48-本能力自己的撤除与换代) 依赖不可用、本能力撤除 | 失败映射表；核心 effect 的撤除序列 | 尚未建包 | 见[状态、并发与失败映射](#状态并发与失败映射)与[成对的装载与撤除](#成对的装载与撤除) |

### 跨 owner 的「同一提交」：执行记录与会话日志

契约 S-19 要求「消息的追加与执行记录的那次写不得只成一半，停机也不能把它们拆开」；执行记录归本能力，会话日志归 loop 与会话那一程（未起草，契约 G-1）。**两个写入者共同触碰的存储对象有两处**：

1. **执行记录行与出站项行在本能力的同一次写事务里**（同一 owner、R-T1）：收场（或转后台）写下 ⇔ 那一段的出站项存在。这把「有占位」读成契约 S-19 的第二支——「已经与执行记录一起交付、等待追加」。
2. **会话日志里以 `(会话, CallId, 段)` 为键的唯一约束**（[L-1](#对会话日志提供者的要求)，会话日志提供者那一侧的一条）：本能力的每一路排空（同一任的重试、旧任与新任、停机前后）都经它追加，**第二次追加撞同一个键，答「已在」、不产生第二条**。

**反证两条交错**：

- **排空追加成功、置 `appended` 之前停机**：出站项仍是 `pending`；下一任恢复后排空器再追加一次，撞 L-1 的键 ⇒「已在」⇒ 置 `appended`。日志里恰一条。若会话日志**没有**这条唯一约束，这条交错就是两条 `ToolMessage`——所以 L-1 不是优化，是正确性前提。
- **同一段先后两项（占位 `seq = 1`、后台收场提醒 `seq = 2`），第一项追加失败**：排空器按会话、按 `seq` 走，**遇到第一个失败就停在这个会话**，不跳过去追加 `seq = 2`——否则提醒会排在占位之前（`data.messages/v1#S-32` ②④）。旧任与新任同时排空：两边都从最小的 `pending` 起，`seq = 1` 先被其中一路写下，另一路撞键「已在」，之后才轮到 `seq = 2`——次序不变。

**反证不了、要真并发演练的**：两个本能力实例（旧任在撤除、新任在扫描）同时排空同一会话——见 [verification 的本节点义务](verification.md#证据义务) N-1。

**这不是进程内锁、不是时间谓词、不是没落盘的单调事实**：两处都是存储里的行与约束。它比「同一次提交」弱的地方：日志追加晚于收场提交，中间有一段「已交付、未追加」；契约把这段算作「有占位」，`awaitForeground` 等到 `appended` 才返回，所以 agent 读日志时不会读到半截。

### 事件与过滤器

| 事件 | 发出／监听 | 派发 | 过滤器与越界 |
|---|---|---|---|
| `execution.delivered { tenant, session, callId, segment, outcome }`（契约 S-45） | 本插件发；本版没有必需的监听者 | `ctx.emit`，不带 `thisArg`；**发送方包住**：监听者抛出只记一条 error 诊断，已追加的事实不变（basis [`emit-listener-throw-propagates`](../../../../basis/cordis/emit-listener-throw-propagates.md)） | 不带 `thisArg` ⇒ 不过滤，`global` 监听者本来就绕过过滤：**同一据点进程里任何插件都听得见所有租户、所有会话的送达**。这是一条会越过租户与会话边界的事件——载荷只有标识与收场、**不带结果内容**，没有后果依赖它（契约 S-45）；进程内的代码本来就同属一个信任边界。**跨进程时不得广播**（协议给，契约 S-46 没有这一行，报主线） |
| 控制类事件 | 不开 | —— | 契约 S-45 末条；要介入执行走拓展点。异步控制不得用 `bail`（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)） |
| 帧推给观察者 | —— | **不用 Cordis 事件**：那会把一个会话的帧广播给整棵树 | 推送面要按（租户, 会话）显式订阅；契约没有这个操作（缺口 T-3） |

本插件**不监听任何事件**。

### 谁消费本节点、谁被本节点消费

| 相邻方 | 关系与取法 | 缺席时 | 本批状态 |
|---|---|---|---|
| agent loop（PF-012，无契约） | 调 `submit`、`awaitForeground`、`reconcile`、`cancelForRun`；它要把这次尝试的可用性报告交到本能力（缺口 T-1） | —— | 无节点 |
| `capability.tool-admission` v1 | **本批无提供者**：runner 在 `before_action` 末位以全拒件顶上，不产生放行结论。本节点在 `submit` ④ 现取它的 `verifyToken`（`resolveOptional`）——缺席 ⇒ 整批 `admissionUnavailable`，**一项都不执行** | 同左 | 可独立运行的验收装配用一个标明「非产品行为、只供本装配验收」的放行件（[D-040 PB-1](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#块-b-拆分提案报回的推荐-c按拥有者分领域)），**不立节点、不进产品装配** |
| `capability.asset-registry` v1（[`packages/tools/asset-registry`](../asset-registry/README.md)） | `submit` ⑤ 现取它的 `lookup`；报告里的 `endpointHoldings` | `dependencyUnavailable{registry}` | 节点同批；报告交不到本能力（T-1） |
| `capability.loop-extension-runner` v1（`packages/agent-loop/loop-extension-runner`，本批） | S-42 的 `after_action` 一关 | 按「那一关不可用」 | 驱动方与交回面未定（T-2） |
| `capability.mcp-bridge` v1（[`packages/tools/mcp-bridge`](../mcp-bridge/README.md)） | 桥经它同包的执行者贡献插件向本服务登记「MCP 来源」那一格 | MCP 条目起不来 ⇒ `failed{start_failed}` | 节点同批 |
| `capability.stream-assembly` v1（`packages/core/stream-assembly`，本批） | 纯模块 import | —— | 节点同批 |
| 会话日志提供者 | 排空器现取它的幂等追加（L-1～L-5） | 出站项留 `pending`，按 `deliveryRetryInterval` 重试 | **无契约、无节点**（G-1，T-7） |
| 会话那一程 | 会话持有的租户 | `submit` 整批 `dependencyUnavailable{storage}` | **无**（G-12，T-8） |
| 落点求值（PF-005） | 起执行者第 2 步 | S-38 第 2 步受阻 | **无**（G-4，T-6） |
| 执行者（本地工具、技能脚本、样例工具） | 向本服务登记；本节点不 inject 它们 | `failed{start_failed}` | 除桥之外本批无节点 |
| 装配 [`apps/cli`](../../../apps/cli/README.md) | 在根 Context 装本插件（不在 agent runtime 之下）、合成迁移、给 config、选存储属主 | —— | 节点修订中（本批） |

## 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 存储（`storage`；协议归 `core/storage`） | **必需 inject**；实例 `infra/storage-sql` | 提供者换代 ⇒ 本插件重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）⇒ 按 S-48 收掉全部在途 | 缺席 ⇒ `PENDING`，服务不出现；已 `ACTIVE` 后读写失败按失败映射表 |
| 时间源（`clock`） | **必需 inject**；`infra/clock` | 同上 | 同上；`now()` 答不可用 ⇒ 计时不触发、收场写不下即上交（S-47 末行） |
| `capability.tool-admission` v1 [S-25](../../../../spec/capabilities/tool-admission/v1/contract.md#s-25-verifytoken) `verifyToken` | **可选**：`submit` 时 `resolveOptional` 现取（basis `inject-has-no-optional-form`），不登记依赖、换代不重跑 | 每次 `submit` 现取 | 缺席或答 `unavailable` ⇒ 整批 `admissionUnavailable` |
| `capability.asset-registry` v1 [S-25](../../../../spec/capabilities/asset-registry/v1/contract.md#s-25-lookup查一条) `lookup`、[S-11](../../../../spec/capabilities/asset-registry/v1/contract.md#s-11-一次执行尝试的可用性报告) 报告 | **可选**，同上 | 同上 | 缺席或答 `unavailable` ⇒ 整批 `dependencyUnavailable{registry}`；**报告交不到本能力（T-1）** |
| 会话日志追加（无契约，G-1） | **可选**：排空器每次现取 | 每次排空现取 | 缺席 ⇒ 出站项留 `pending`、定时重试 |
| 会话持有租户读面（无契约，G-12） | **可选**：`submit` 现取 | —— | 缺席 ⇒ `dependencyUnavailable{storage}` |
| 落点求值（无契约，G-4） | **可选** | —— | S-38 第 2 步受阻（T-6） |
| 执行者 | **登记**，不 inject；键是定义名或「MCP 来源」 | 登记即可用；撤下只影响此后 | 找不到 ⇒ `failed{start_failed}` |
| config（候选名） | `executionStopGrace`（正时长）、`deliveryRetryInterval`（正时长）；**缺一或非正 ⇒ 启动失败** | 启动时 | 同一配置错误政策 |

### 对存储提供者的要求清单

| # | 要求 | 对应条款 | 协议兑现点 |
|---|---|---|---|
| R-T1 | 单次提交原子：执行行、出站项、会话标记、取消标记、原始结果行多表同成同败 | S-19、S-20 ③、S-23 ④、S-25～S-29 ④、S-36 | `core/storage` P-1 |
| R-T2 | 唯一约束：`tool_execution (session, call_id)`；出站项 `(session, seq)` 与 `(session, call_id, segment, kind)`；会话标记 `session`；取消标记 `(session, run)`；原始结果 `attachment_id`。约束名在迁移片段里起 | S-5、S-23 ⑦、S-19（一段一项）、S-28、S-29 | P-11 |
| R-T3 | **同会话写序列化**：每个写事务开头取 `lockSentinel('tool-execution-runtime/session/<会话>')`（候选名），锁下现读已提交的最新值再写；首胜、判重、归档／取消与提交的互斥、批内次序、并发上限都在锁下判。**本节点不加进程内锁** | S-16、S-23 ②③⑥、S-25～S-31、S-43；契约 S-46 第 3 行 | P-5、P-3 |
| R-T4 | 语句级唯一冲突不废事务：并发的同一 `CallId` 插入撞主键之后，同一事务重读按幂等返回 | S-23 ⑦ | P-2 |
| R-T5 | 只读事务快照一致 | S-33、S-34 | P-6 |
| R-T6 | 持久：提交成立后跨进程重启仍在。**边界**：sqlite `synchronous = NORMAL` 下 OS 崩溃或断电可能丢最后一段已提交事务（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md)）——那时 S-17「停机时凡是可能已在外面做了事的执行，存储里都有记录」对**断电**不成立（机器掉电本地子进程随之没了，远端效果可能已发生） | S-17、S-20、S-40 ④ | P-7 |
| R-T7 | 不可用可识别：不返回空结果、不返回旧快照；缺陷不折成不可用 | S-15、S-33 ⑧、S-34 ⑧ | P-8 |
| R-T8 | 单库单属主：同一份库同一时刻只被一个据点进程写，且那个进程里只装一份本能力——「找得到／找不到」只在同一进程的活体表里成立 | S-7；契约 S-46 第 2 行 | `infra/storage-sql` 的属主排他（[属主实例](../../infra/storage-sql/design.md#属主实例排他迁移前只读核对升级快照与确认)）；**装一份本能力归装配** |

### 对会话日志提供者的要求

会话日志的提供者尚无契约、无节点（契约 G-1）。它的节点立起来时须写一条对应本节的要求，**两边互指**：

| # | 要求 | 为什么 |
|---|---|---|
| L-1 | 追加面按 `(会话, CallId, 段)` 幂等：同键再追加答「已在」、不产生第二条；「已在」与「不可用」可区分 | [跨 owner 的同一提交](#跨-owner-的同一提交执行记录与会话日志)第 2 处共同对象；`data.messages/v1#S-32` 配对唯一 |
| L-2 | 一次追加可带同一段的多条（`ToolInternalMessage` 在前、结果消息在后、同段的记录条目），整体成败 | S-19 第 4 行的次序 |
| L-3 | 追加成功即持久、此后读得到 | `awaitForeground` 返回时消息已在日志里（S-24 ⑤） |
| L-4 | 会话归档之后，仍接收本能力在归档提交之前或之时交付的出站项；**或**会话一侧在封存日志之前等本能力排空——二选一，归会话那一程 | S-29：归档提交里交付的占位要落得下 |
| L-5 | 与执行记录在同一存储、同一约束域时，L-1 的唯一约束就是两个写入者共同触碰的那个对象；不在同一存储时 L-1 照样必需 | 契约 S-46 第 4 行 |

### 对其余 owner 的要求（互指）

| 对谁 | 要求 | 本节点缺口 |
|---|---|---|
| 决策卡片的 owner（PF-008，无契约） | 按卡片标识幂等地把卡片关成 `superseded`；本能力以 `kind = card_close` 的出站项请求 | T-9（G-5） |
| agent loop 或会话资产注册表 | 让 `submit` 拿得到这次尝试的可用性报告 | T-1 |
| runner 与 agent loop | 定下 `after_action` 由谁驱动、结论怎样交回本能力 | T-2（G-6） |
| 交付面与会话那一程 | 帧推送面：按（租户, 会话）显式订阅 | T-3 |

## 状态、并发与失败映射

**写权**全在本插件的方法与核心里；**提交点**：每个写操作一次事务。**执行的抽象状态**（姿态、阶段、两个收场）全在执行记录行上，活体表只是「此刻找得到」的进程内答案，不是状态的第二份权威——换代或停机后以行为准。

**服务状态**（核心持有，单调）：`recovering`（插件体跑完即进入；一切方法 `runtimeNotReady`）→ `serving`（恢复扫描全部提交）→ `stopped`（撤除开始、或上交之后；一切方法 `runtimeStopped`，挂着的 `awaitForeground` 一并以它返回）。**没有从 `stopped` 回来的路**：上交之后不等存储恢复补写（M13），下一任由装配重装。

**失败映射**（没有 catch-all）：

| 情形 | 映射 |
|---|---|
| 存储 `StorageUnavailable`，在读面或提交前的判定里 | `dependencyUnavailable{storage}` |
| 存储 `StorageUnavailable`，在写**收场**（交回、中断、到点、撤除时的首胜写）时 | **上交**（PF-011）：一条 error 级结构化日志、服务状态 `stopped`；执行者的交回得 `escalated`。在跑的执行照跑到下一任扫描按停机处置（S-47、M13） |
| 存储 `StorageDefect` 或 `UniqueViolation`／`ReferenceViolation` 出现在不该出现的地方 | 缺陷：原样上抛、error 日志；在写收场的路径上与上一行同样上交 |
| `verifyToken` 答 `invalid{reason}` ／ `unavailable` ／ `invalidInput`；提供者缺席 | `notAdmitted{why = reason}` ／ `admissionUnavailable` ／ `invalidInput`；缺席同 `admissionUnavailable` |
| 会话资产注册表答「没有」／读不到或缺席 | 那一项 `unavailable{no_such_entry}` ／ 整批 `dependencyUnavailable{registry}` |
| 会话持有租户读不到或读面缺席 | `dependencyUnavailable{storage}` |
| 会话日志追加答「已在」／不可用或缺席 | 置 `appended` ／ 出站项留 `pending`，这个会话的排空停在这一项，按 `deliveryRetryInterval` 重试 |
| `clock.now()` 答不可用 | 计时器醒来不判到点；需要时刻的收场写不下 ⇒ 上交 |
| 执行者没登记、`start` 抛出 | `failed{start_failed}` |
| 执行者交回形状不合、违反声明、缺席 | `failed{result_rejected}` |
| 桥交回 `bridgeWithdrawn` ／ 其余失败值 | `failed{abnormal_interruption}` ／ `failed{implementation_error}`（契约 S-11 的对照） |

**「上交」留下的那条条目落在哪**：契约 R-37 未决——这一刻执行记录与会话日志都写不下；本节点只写结构化日志（JSONL，error 级；Cordis logger 的级别序见 basis [`logger-level-order-error-lowest`](../../../../basis/cordis/logger-level-order-error-lowest.md)），接手那一层归装配（缺口 T-12）。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（两个正时长） | kernel-basis `definePlugin` 的 `Config`，插件体之前由内核校验 | 不过 ⇒ fiber `FAILED`、不 provide（basis `plugin-throw-fails-fiber`）——启动失败 | —— |
| `ctx.provide('toolExecution')` | 本 fiber；**立即可解析**，扫描完成前答 `runtimeNotReady` | 抛出 ⇒ 随 fiber 撤（`ctx.provide` 由 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**未升格为 basis 条目，待核对主张**） | 服务消失；已拿到服务引用的调用方此后得 `runtimeStopped`（由核心的服务状态给，不靠内核） |
| 核心 effect：服务状态、活体表、执行者表、调度、排空器、等待者、全部计时器 | 本 fiber；插件体里登记，登记即开始恢复扫描 | 扫描遇 `StorageUnavailable` ⇒ 留在 `recovering`、定时重试；遇缺陷 ⇒ `stopped` ＋ 上交 | **有序撤下序列**（下文），全在这一个 effect 的 disposer 里；disposer 内部捕获一切错误并记日志（basis `effect-disposal-concurrent-not-ordered`：卸载时异常只记日志、不上抛）。**保留**：全部执行记录、出站项、标记、原始结果——没有只活在实例里的事实 |
| 每次执行的活体：执行者句柄、停止例程、装配状态、前台计时器、等待解除者 | 核心的活体表；`running` 那次事务提交之后才调执行者 | 执行者 `start` 抛出 ⇒ `failed{start_failed}`、表项删除；回收句柄写不下 ⇒ 记日志、照跑（窗口见 S-17 行） | 收场事务提交 → 停止例程（发停止 → 宽限 → 强制 → 回收）→ 删表项。外部效果不回滚、不补偿 |
| 执行者登记（贡献） | 贡献者的 fiber；`unregister` 包进**贡献者自己的** `ctx.effect`——登记的寿命等于贡献者的寿命 | 贡献者 `FAILED` ⇒ 没有登记 ⇒ 此后起不来的 `failed{start_failed}` | 撤下：在途的照跑（活体握着引用）；本插件撤除时 `unregister` 成为空操作；贡献者 inject 本服务，本服务换代 ⇒ 贡献者重跑、重新登记 |
| 迁移片段 | 装配合成、存储提供者在 `provide('storage')` 之前跑 | 迁移失败 ⇒ 存储提供者启动失败，本插件 `PENDING` | 不随本插件撤除 |

**有序撤下序列**（契约 [S-48](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-48-本能力自己的撤除与换代)；一个 effect 内按次序 `await`，因为跨 effect 的次序不存在）：

1. **关准入**：服务状态 `stopped`；挂着的 `awaitForeground` 以 `runtimeStopped` 返回；撤全部阈值、上限与等待到点计时器；调度不再起新执行；排空器做完手上这一项就停。
2. **收尾帧流并写收场**：对每条有活体的执行，先对它开着的装配状态调 `abandon`（帧流以 `lost` 收尾），再在会话锁下首胜写 `failed{abnormal_interruption}`——外部效果「不可确定」、`frames` 取 `abandon` 交出的那份、交出的 `blocks` 非空就有一条 `ending: lost` 的 `ToolInternalMessage` 与结果消息同一出站项、关卡请求一并入出站；排队中的执行写同一收场，外部效果「已确定未发生」、`frames` 为零。**写不下的不重试**：留给下一任恢复扫描按停机处置（`frames` 那时是 `"unknown"`）。
3. **然后才发停止**：对每条执行跑停止例程（宽限 → 强制 → 回收）；全部结束或宽限加强制的时限到了才返回。次序照 S-18，不照恢复扫描的「先回收、再写」。
4. 执行者表清空；记一条 info 级日志说收了几条。

**提供者换代时收掉什么**（F 第二问，对齐契约 S-48、S-37、S-20）：本插件只 inject `storage`、`clock`。任一换提供者 ⇒ 上面的序列跑完、插件体重跑 ⇒ 新任 `recovering` → 扫描把旧任没写下的收掉 → `serving`；**全部在途执行都落 `failed{abnormal_interruption}`，没有一条被重起**；已交付的出站项由新任排空；执行者的贡献者（inject 了本服务）随之重跑、重新登记。契约把「本版不换代」写成装配前提（S-46 倒数第三行）。
**假设 A-1（待补 probe）**：Cordis 在必需服务换提供者时，**等旧插件体的 effect 撤除（含 async disposer）完成之后**才重跑新插件体。basis 条目 `plugin-body-reruns-on-provider-change` 只证了「先卸载再重跑」，没有证「等 async disposer 结算完」。若不成立，新任的恢复扫描可能抢在旧任第 2 步之前写下同一收场——**收场不变（首胜）**，但 `frames` 成了 `"unknown"`、那条 `ToolInternalMessage` 丢了（S-13、S-48 那一半失守）。

## 装配给与协议给：本节点单机怎样兑现左列

照契约 [S-46](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) 那张表逐行；右列（协议须给）本节点**一条都不兑现**。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| agent runtime 被回收不影响任何执行 | 本插件装在根 Context，不在任何 agent runtime 的 fiber 之下；`awaitForeground` 可重复等 | **装配**（`apps/cli` 把本插件装在根上） |
| 「找得到／找不到」 | 核心的活体表 ＋ 扫描先于服务；R-T8 单库单属主 | 本节点 ＋ **装配**（只装一份、存储属主排他） |
| 收场首胜 | R-T3：会话哨兵下的锁定读再写 | 本节点 ＋ 存储提供者 |
| 消息与记录不只成一半 | 发件箱 ＋ 会话日志 L-1 | 本节点 ＋ **会话日志提供者（无）** |
| 结果只送达一次、送到对的调用 | 本能力是唯一送达方；出站项唯一键 ＋ L-1 | 本节点 ＋ 会话日志提供者 |
| 放行凭据可核对 | `verifyToken` 读同一份会话日志 | `capability.tool-admission` 的提供者（**本批无**） |
| 本能力不随依赖换代而停下（前提） | 只 inject 存储、时钟 | **装配**：运行期不换这两个提供者 |
| 执行者资源随停机一起失去 | 回收句柄随行持久、扫描先回收再写 | 本节点 ＋ 执行者（登记句柄）；X-5 未核 |
| 时刻取自同一时间源 | 写进记录的时刻一律取 `clock.now()`；宿主计时器只作唤醒 | 本节点 ＋ `infra/clock` |

**归装配的事项**（点名给 `apps/cli`）：装一份、装在根上；存储属主排他（带升级守卫的 `storage-sql`）；运行期不换存储与时钟；**撤除次序**——先撤本插件（与桥），再撤存储与时钟，否则第 2 步的写全部落空、只能等下一任扫描；合成迁移片段；给 `executionStopGrace`、`deliveryRetryInterval` 的值；上交条目的落处（T-12）；验收装配的放行件（PB-1）。

## 实施缺口与消费者影响

契约第十二节的缺口不重抄；下表是**本节点自己的**缺口，编号 T-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| **T-1** | **可用性报告交不到本能力**：S-23 ② 第 6 条要以 `within = run{这次尝试的报告}` 查注册表、从报告取 `endpointHoldings`；而 S-23 ① 的输入没有报告，注册表的报告不持久（[`capability.asset-registry/v1#S-11`](../../../../spec/capabilities/asset-registry/v1/contract.md#s-11-一次执行尝试的可用性报告) 第 2 条），`lookup` 必须带报告（[`#S-25`](../../../../spec/capabilities/asset-registry/v1/contract.md#s-25-lookup查一条) ①）。两份契约对不上，本节点不在 design 里替它选 | `submit` 整个操作；MCP 调用的寻址 | 主线（TER 与 asset-registry 二者之一出新版，或 agent loop 契约把报告交给本能力） | 某份契约写明报告怎样到达本能力 |
| **T-2** | **落盘前那一关没有驱动方与交回面**：前台的 `after_action` 由 loop 驱动（契约 S-42 末条），但本能力没有接收结论的操作；后台的驱动方未定（G-6） | S-42 全部；`after_action` 上的拓展件（hooks-import 的 PostToolUse 改写、卸载判定、租户件） | 主线（PF-012、runner） | 契约写明驱动方与交回面；在它之前本节点一律按「那一关不可用」落 |
| **T-3** | **观察者推送面没有操作**（S-62 第 9 条） | 交付面实时看帧 | 交付面与会话那一程（PF-016、PF-009） | 一份契约给出按（租户, 会话）订阅的面 |
| **T-4** | **`late` 的判定读面**：要知道提交它的尝试是否已被取代、运行是否已终结 | S-13 `late` | agent loop 与运行的契约（PF-012） | 读面有家 |
| **T-5** | **执行经本系统调模型的 `ModelResponse`、`service_reported` 费用怎样到达本能力**：执行者接口里没有这一路 | S-13 `cost.items`、`usage`；S-40 | 主线（模型请求运行时与执行者接口） | 写明来路 |
| T-6 | 落点求值（契约 G-4） | S-38 第 2 步 | PF-005 owner | 契约与提供者出现 |
| T-7 | 会话日志追加面（契约 G-1）；本节点给出了要求 L-1～L-5 | 全部送达；`awaitForeground` | loop 与会话那一程 | 提供者节点写出对应要求并互指 |
| T-8 | 会话持有租户的读面（契约 G-12） | `submit` 恒为 `dependencyUnavailable{storage}` | 会话那一程（PF-015） | 读面有家 |
| T-9 | 关卡请求的接收方（契约 G-5） | S-20 第 4 步、S-48 | PF-008 的卡片契约 | 卡片契约给出按标识关卡的面 |
| T-10 | 原始结果的解引用与保留（契约 G-7）：本节点把字节存进自己的表，谁能读、留多久未定 | S-36 的消费者 | PF-006 owner 与存储那一程 | 附件存储有家；本节点改指它 |
| T-11 | **卸载判定这一件（S-63）本批不建实现**：判据没有产品输入，驱动方未定（T-2）；按 S-63 由指定挂件顶上 | 大结果的摘要 | 主线 | T-2 闭合且判据有输入；届时写明它是本包的第二个贡献者插件还是另立节点 |
| T-12 | 上交条目的落处（契约 R-37） | PF-011 §6.3 | 装配与观测那一程 | 装配写明 |
| T-13 | **两条待补 probe／实验**：A-1（换代时等旧任 async disposer 结算完再重跑）；X-5（据点被强杀后子进程树是否仍在、按登记的进程组能否回收整棵）。本节点**不依赖**草图的 H-1～H-4（执行不是子 fiber） | S-48 的 `frames`；S-17 窗口、S-20 第 2 步、进展性质 `StopsTakeEffect` | A-1：`core/kernel-basis`；X-5：实现者（提案 [X-5](../../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)） | probe 写进 kernel-basis、basis 升格或登待核对主张 |
| T-14 | **执行者接口没有契约**（契约说「不拆成独立契约」）：登记键、`start` 的入参、四个原语、回收句柄的形状由本节点定候选 | 桥的执行者贡献、样例工具、技能脚本的执行者 | 本节点（实施时）＋ 契约 owner 确认 | 形状写进本包公开入口并由消费者节点引用 |
| T-15 | 帧入口不节流：部署政策未给阈值，本版不合并、不截短、不限额 | —— | 主线（若要节流） | 给出政策 |

**报给主线**（不在本节点改）：T-1（两份契约对不上）、T-2（S-42 兑现不了）；`execution.delivered` 是一条同进程内越过租户与会话的通知，契约 S-46 没有写「跨进程不得广播」这一行；R-T6 的断电边界与 S-17 的字面。
