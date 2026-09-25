# tool-execution-runtime 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/tool-execution-runtime/verification.md`](../../../../spec/capabilities/tool-execution-runtime/verification.md)：一个 TLA+ 模型（两个登记任务、六个去保护配置、三份补充否定配置、七个可达性探针）、十八条规范场景、两个方向的故障注入、K-1～K-11 两源反例。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（会话哨兵、发件箱、活体表由一个 effect 持有、先 provide 后扫描）。**本节点尚未建包，除契约模型的两次运行外一切未开始。**

## 证据义务

### 契约模型（已执行，只证模型）

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-7](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-7-活体与找得到)、[S-13](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-13-账)、[S-16](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-16-首胜收场只写一次)～[S-20](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-20-恢复扫描与停机不重来)、[S-29](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-29-会话归档)、[S-30](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-30-答复等待) 的安全性质 | formal task `tool-execution-runtime-v1-execution` ＋ 成对的去保护配置 | **已执行（模型层）**：见[实际执行](#实际执行)；九条进 [bindings](bindings.yaml)。**证的是交错语义，不证本节点的存储真的兑现了 R-T1／R-T3**——那一半是下面 N-2、N-3 的真并发演练 | 契约 owner（模型）；本节点（N-2、N-3） |
| S-18、S-19、S-20 的进展性质 | formal task `…-execution-progress` | **已执行（模型层）**，**不绑**：三条公平性前提（恢复终会发生、追加终会成功、强制停止终会生效）与三条结论一一对应、没有否定配置；本节点里「追加终会成功」依赖会话日志提供者（接口 `capability.session-log` v1 已定，最小提供者节点 `session-log-jsonl` 已立），「强制停止终会生效」依赖 X-5（未核） | 前提的实际兑现：N-5（X-5）、会话日志提供者 |
| 按构造成立的性质（`ReminderAfterPlaceholder`、`ArchiveSettlesAll`、`SequentialBatch`、`ConcurrencyCap` 等十条）与 `TypeOK` | **不绑**——模型里没有会失败的断言 | 证据形式改为场景：`ReminderAfterPlaceholder` → S-52 与本节点 N-1；`ArchiveSettlesAll` → S-56；`SequentialBatch`、`ConcurrencyCap` → S-58 与本节点 N-4；`WaitOnlyForeground`、`RunCancelSparesBackground` → S-57 | 本节点 |

### 规范场景（十八条，全部未开始）

契约 verification 已列每条的证据形式；本表只写**在本节点上**额外受阻于什么。

| 场景 | 本节点上受阻于 | 状态 |
|---|---|---|
| [S-50](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-50-前台完成)、[S-51](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-51-前台被用户中断)、[S-53](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-53-等待再次等待与迟到的答复)、[S-55](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-55-找得到的不追补)、[S-56](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-56-归档之后到达的完成不送达)、[S-57](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-57-取消运行不动后台)、[S-59](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-59-停止与交回交错) | 每条都要走 `submit`：T-8（会话持有租户）、T-7（会话日志追加面）、T-6（落点）三样**接口已定**（`capability.{session-tenancy, session-log, execution-environments}` v1），可以在验收装配里由它们的最小提供者 ＋ 测试种子跑——**有前提：最小提供者建包**（节点 `session-tenancy-table`、`session-log-jsonl`、`execution-environments-host` 已立，都尚未建包）；`submit` 必带的 `report` 要一份注册表算出的报告，注册表必需 inject 的装配清单同样接口已定（`capability.assembly-manifest` v1），最小提供者节点 `assembly-manifest-store` 已立、尚未建包。放行仍是 PB-1 的只供验收放行件。**这样跑出来的是「有前提：最小提供者」的通过**，不是产品装配的通过 | 未开始 |
| [S-52](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-52-自动转后台后完成落一条提醒) | 同上 ＋ 契约 G-6（落盘前那一关，本批一律「不可用」）＋ `late` 要 `runAttemptFacts`（契约 G-18；验收装配由最小提供者 `run-attempt-facts-derived` ＋ 测试驱动交进的认法答，只断言驱动写过的那几种） | 未开始 |
| [S-54](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-54-停机后前台与后台各追补一条) | 同上 ＋ T-9（关卡请求没有接收方）＋ X-5 | 未开始 |
| [S-58](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-58-插队三行) | 同上 ＋ 「等的是不是卡片」只读得到 `wait.card` 有没有（G-5） | 未开始 |
| [S-60](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-60-凭据不符与核对不了都整批不执行) | `capability.tool-admission` **本批无提供者**：「核对不了」那一支现在就能做（缺席即 `admissionUnavailable`）；「凭据不符」一支要一个会答 `invalid` 的核对面 | 未开始 |
| [S-61](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-61-参数不合即刻失败并带用法)、[S-64](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-64-参数收齐却解析不了)、[S-65](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-65-重放同一批返回首次的结果)、[S-67](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-67-租户不符整批不收)、[S-69](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-69-查不到条目的调用即刻收场不可用) | 同第一行；S-61 另受阻于 `Tools().inspect` 无契约；S-65 要断言「重放照 `submit_disposition` 答」 | 未开始 |
| [S-66](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-66-帧被拒报一次收场之后的帧不进) | 同第一行；装配状态依赖 [`core/stream-assembly`](../../core/stream-assembly/README.md)（尚未建包） | 未开始 |
| [S-68](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-68-有序撤下收尾在途的帧流上交之后撤下) | 同第一行；「有序替换本能力」要替换存储或时钟的提供者——**依赖假设 A-1**（N-6） | 未开始 |

### 两源反例、故障注入与读面

| 来源 | 需要什么证据 | 状态 | owner |
|---|---|---|---|
| 契约 verification「两个方向」①②（S-7） | 故障注入：执行跑着时 `reconcile`；杀进程组再杀据点进程后重启 | 未开始；② 依赖 X-5（N-5） | 本节点 |
| S-33～S-35 读面遇存储不可用 | 注入 `StorageUnavailable`，断言 `dependencyUnavailable{storage}` 而不是空表或 `executionNotFound` | 未开始 | 本节点 |
| K-1～K-10（契约 verification「两源反例」） | 各按契约 verification 列的证据形式；本节点特别对应：K-2 → 首胜看记录不看活体（N-3 的一支）；K-3 → 找不到执行者、`start` 抛出 ⇒ `failed{start_failed}`；K-4 → 宽限后强制、并发位在收场事务释放；K-7 → 进程重启后 `readExecution` 仍答；K-8 → S-59；K-9 → 恢复一律不重起、不留「状态不明」；K-10 → X-5 | 未开始 | 本节点 |
| K-11（自有账本、部署独占租约） | —— | **不适用**：本节点把记录落 `core/storage`，属主排他由 `infra/storage-sql` 给 | —— |

### 本节点自己的选择带来的义务

| # | 义务 | 证据形式 | 状态 | owner 与闭合条件 |
|---|---|---|---|---|
| N-1 | **两路排空同一会话**（旧任撤除中、新任扫描后；或同一任的重试与定时器并发）：日志里消息每 `(会话, CallId, 段)` 恰一条、记录条目每 `(会话, CallId, 段, seq)` 恰一条；**同一段内条目与消息、跨段的占位与提醒都保持 `seq` 次序**（M70；[design 的反证](design.md#跨-owner-的同一提交执行记录与会话日志)反证不了的那一条） | **真并发**演练：两个装配、两个存储连接、同一库文件；会话日志用 `capability.session-log` v1 的最小提供者（按耐久内容判重、判与追加同一步，S-8、S-14） | 未开始；受阻于最小提供者节点尚无（T-7） | 本节点 ＋ 会话日志提供者（互指 L-1） |
| N-2 | **追加成功、置 `appended` 之前停机**：重启后再追加撞键「已在」、日志不重复；**会话日志提供者也一起重启**的那一支同样只有一条（L-1「按耐久状态判」，M70 的 TER-5） | 故障注入（两支：只重启本能力；两者都重启） | 未开始；后一支受阻于 T-7（真会话日志） | 本节点 ＋ 会话日志提供者（互指 L-1） |
| N-3 | **会话哨兵（R-T3）真的排出次序**：并发的同一批两次 `submit`（两个存储连接）；`submit` 与 `archiveSession` 交错；`submit` 与 `cancelForRun` 交错；交回与中断交错。断言：首胜、判重、标记重判各只有一个结果，没有「写了记录又被归档漏掉」的行 | **真并发**，sqlite 与 pg 各一遍（pg 上哨兵是咨询锁，行为与 sqlite 的库级串行不同） | 未开始 | 本节点 |
| N-4 | **并发上限与批内次序跨两个起执行者决定成立**：同一工具两项同时可起时只起上限个；换代后的新任从存储读出同一答案 | 真并发 ＋ 换代演练 | 未开始 | 本节点 |
| N-5 | **X-5**：据点进程被强杀后，执行者起的子进程树是否仍在；按登记的回收句柄（进程组）能否整棵回收；`running` 已写、回收句柄未写的窗口里被强杀会留下什么 | 实验（提案 [X-5](../../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)） | 未开始 | 实现者；结果进 basis 或登待核对主张 |
| N-6 | **两条内核假设**（T-13 同一行）：① **A-1**——Cordis 4.0.4 在必需服务换提供者时，等旧插件体的 async effect disposer 结算完才重跑插件体；② **下游重跑**——同一个提供者 fiber 因它自己的依赖换代而重跑插件体时，inject 它的下游消费者也卸载重跑（M71 的 TER-4：本服务换代后执行者贡献者重登记的前提） | probe（`core/kernel-basis`），通过后升格 basis 条目 | 未开始 | `core/kernel-basis` owner。① 不成立时本节点的 S-48 要改成「新任扫描前先等旧任的撤下标记」；② 不成立时新任的执行者表为空，要改成贡献者按本服务的状态变化自行重登；届时回来改设计 |
| N-7 | `ctx.provide` 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`）升格为 basis 条目 | basis 升格 | 未开始（**待核对主张**） | `core/kernel-basis` owner |
| N-8 | 服务状态闸：扫描提交前一切方法 `runtimeNotReady`；上交之后一切方法 `runtimeStopped`、挂着的 `awaitForeground` 同答；存储恢复后不补写。**反面**（M71）：扫描很慢时贡献者插件体跑到 `registerExecutor`——照常收下、不抛、不静默，扫描完成后第一次起 MCP 条目就找得到执行者；同键第二次登记仍抛出 | 演练（与 S-68 同一套装配） | 未开始 | 本节点 |
| N-9 | 配置错误同一政策：缺 `executionStopGrace`／`deliveryRetryInterval`／`judgeTimeoutMs` 或非正 ⇒ 装配启动失败、服务不出现（`judgeTimeoutMs` 缺席**不**退成某个代码里的默认值） | 单元测试 | 未开始 | 本节点 |
| N-10 | `execution.delivered` 监听者抛出不改已追加的事实、只记一条 error 诊断（basis `emit-listener-throw-propagates`） | 单元测试 | 未开始 | 本节点 |
| N-11 | 计时只以 `clock.now()` 判：宿主计时器提前或推迟醒来都不改判；时钟答不可用时不触发 | 可前推、可答不可用的时间替身 | 未开始 | 本节点 |
| N-12 | 静态检查：每个写事务开头取会话哨兵；`storage.write(fn)` 内不调用任何别的插件的服务（P-13）；不以 `ctx.bail` 做异步控制；本包不 inject 执行者、不 inject 可选依赖；JSON 列只经 `readJsonStrict`／`writeJsonLossless` 读写（R-T9）；`execution.delivered` 不接任何跨进程转发（M42） | 结构检查（`tools/ts-checks` 的规则，候选），各带一条「故意违反就失败」的自测 | 未开始 | 本节点 ＋ ts-checks owner |
| N-13 | **报告的三方核对**（M33、M46）：`report` 缺席（一批全是 `UnparseableCall` 也一样）、带的会话／运行／尝试任一不是本次的（含同一运行上一次尝试的那份）⇒ 整批 `invalidInput`、什么都没写；**排在服务闸之前**——扫描未完成时带错报告答 `invalidInput` 而不是 `runtimeNotReady`；MCP 动作记下的接入点持有就是交来的报告里那一份 | 单元测试 ＋ 演练（报告用替身） | 未开始 | 本节点 |
| N-14 | **JSON 每一跳无损**（M36，R-T9）：参数里有 `12345678901234567890` 与超精度金额的调用，经 `submit` 落盘、恢复扫描回读、交给执行者、落成消息之后逐字不变；存储里一段带重复键的 JSON 回读 ⇒ 缺陷，不挑一个 | 单元测试（sqlite 与 pg 各一遍：两种方言的 JSON 列与文本列行为不同） | 未开始 | 本节点 |
| N-15 | **判不了先于判不合**（契约 S-11、S-23 ④ 第 ② 条，N-22 T-16）：① 一批里一项的参数 schema 带一个静态筛查漏过的病态 `pattern`、实参触发灾难回溯 ⇒ 判定工作线程到判定时限被终止、换一只新的，那一项 `failed{schema_unsupported}`，块上写明「判定超时」、**不附用法**；判定期间另一个会话的 `submit` 照常返回（事件循环没被卡住）；同批别的项照常判、照常执行；② 作者写的工具参数 schema 编不出 ⇒ 同一收场、块上写明「编不出」；③ 反证：以上两种都**不是** `arguments_invalid`，也没有一项退成不判照跑；④ 判定中途开始撤下 ⇒ 整批 `runtimeStopped`、什么也不写；⑤ 换不起新线程 ⇒ `stopped` ＋ 上交；⑥ **答复形状校验判不了**（M75）：等待声明的形状带一个病态 `pattern`、答复值触发回溯 ⇒ `answerWait` 答 `{ resumed }`、这次执行 `failed{schema_unsupported}`（说明「答复形状校验超时」）、执行者从等待原语拿到 `ended` 而不是答复值；**反证**：不回 `invalidInput`、答复者不必重答；判得出「不合」的答复仍是 `invalidInput`、什么都不写 | 单元测试（①～③、⑤、⑥）＋ 带撤下的演练（④）；时限由测试配置的 `judgeTimeoutMs` 取小值 | 未开始；`pattern` 上限的值等 `data.tool-definition` 的 G-16 确认 | 本节点；上限值归 `core/tool-definition` |
| N-16 | **出站项的键**（M70，TER-1 的反例）：一次执行走完提交 → 起执行者 → 进等待 → 收场，同一 `call` 段写下多条 `entry` 出站项、一条也不撞唯一约束；同一段第二次写 `messages` 或 `card_close` ⇒ `UniqueViolation`（按失败映射是缺陷）；排空后日志里的条目条数等于出站项里的条目条数 | 单元测试（迁移片段在 sqlite 与 pg 上各跑一遍） | 未开始 | 本节点 |
| N-17 | **`late` 的来路与漏标窗口**（M74，design「跨 owner 的现读」）：① 测试种子播「尝试已被取代」或「运行已终结」⇒ 收场的账带 `late: true`；都没有 ⇒ `late` 缺席；读面答 `attemptNotFound`／`unavailable`（没播种）⇒ 有调用方的操作得 `dependencyUnavailable{runAttemptFacts}`、交回与到点上交，账里没有过渡值；② **真并发**：本能力读完「仍是当前」、提交之前 loop 提交取代——断言账带 `late`。**按当前设计这条演练必然失败**（登记的漏标窗口），共同存储对象落定之前不拿它当通过条件 | ① 单元测试（`run-attempt-facts-derived` ＋ 测试驱动交进的认法，或按 `capability.run-attempt-facts/v1#S-9` 写的测试读面）；② 真并发演练 | ① 未开始；② **受阻**：读面的真承接者未到，且那份契约自己登了同一个窗口（G-2）（T-4；`apps/cli` C-16） | 本节点 ＋ 读面的承接者（会话日志与 loop 那一程） |
| N-18 | **函数层 `invokeTool`**（[design 的公开面](design.md#公开面)）：不装 Cordis、不给存储与会话，只给定义、调用块、判定对象与一个脚本化执行者即跑通一次；判不了 ⇒ `schema_unsupported`、判不合 ⇒ `arguments_invalid` 带用法、`start` 抛出 ⇒ `start_failed`（不是被中断）、交回不合 ⇒ `result_rejected`、中止 ⇒ `interrupted` 且外部效果「不可确定」；不提供等待回调时等待原语答「不进入等待」；**反证**：同一调用两次 `invokeTool` 就是两次执行（函数层不判重、不承诺首胜） | 单元测试 | 未开始 | 本节点；有实现即可跑（纯函数面，不受阻） |
| N-19 | **服务面复用同一个 `invokeTool`**（关键选择表）：结构检查——核心起执行者只经 `invokeTool`，不另持一套执行者协议；演练——收场首胜写下之后才调句柄 `stop`（S-18），有序撤下 `abandon` → 写收场 → `stop`（S-48） | 结构检查（`tools/ts-checks` 候选规则）＋ 与 S-59、S-68 同一套演练 | 未开始 | 本节点 |
| N-20 | **判定时限来自配置、改配置即改行为**（[design 的判定时限是策略配置](design.md#判定时限是策略配置)）：一只固定耗时 200 ms 的判定器（测试件）判同一调用与同一实参：`judgeTimeoutMs = 50` 的装配里那一项 `failed{schema_unsupported}`（判定超时），`judgeTimeoutMs = 500` 的装配里判得出结论——**只改配置，代码与输入不变，结论跟着变**；S-30 答复值校验同一对比；**反证**：`core/tool-definition` 的判定对象被传入时不带任何时限参数、源码里没有 500 这个常量（结构检查） | 单元测试（可前推的计时替身，不靠真墙钟）＋ 结构检查 | 未开始；有实现即可跑 | 本节点 |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| `2026-09-25-formal-assets-runtimes` · `tool-execution-runtime-v1-execution` | `Execution.tla` ＋ `Execution.cfg`：六个开关全 `TRUE`、`MaxWaits = 2`；一个会话、两批四次调用、至多一次停机；无公平性；死锁检查关闭 | **退出 0，无反例**：2,656,347 generated · 741,344 distinct · 0 left · 深度 22 · 1 min 09 s，完整穷尽 | [run README](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) |
| 同 run · `tool-execution-runtime-v1-execution-progress` | `ExecutionProgress.cfg`：`FairSpec`、`MaxWaits = 1` | **退出 0，无反例**：524,448 distinct · 深度 20 · 15 min 55 s | 同上 |
| 2026-09-24 契约修复者本机运行（**非 formal task**、未落进 `record/evidence/`） | 六个去保护配置、三份补充否定配置、七个可达性探针；`Execution.tla` 与上一行同一份 | 全部**按预期**违反或被反驳 | 契约 verification [实际执行](../../../../spec/capabilities/tool-execution-runtime/verification.md#实际执行)、[结果与反例](../../../../spec/capabilities/tool-execution-runtime/verification.md#结果与反例) |

**这三行都不是本节点的符合性证据**：它们检查的是契约的模型。去保护那一行证明「首胜、耐久交付、先写后停、全量恢复、不重起、等待序号」这六处保护是 load-bearing 的——正是本节点要求 R-T1、R-T3 与发件箱存在的理由。
那一行的原始输出不在 `record/evidence/` 里，是本页每条绑定共同的弱点（[bindings](bindings.yaml) 文件头）；按 [D-040 §八 M54](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)**待下一次证据 run 入库**，入库后这一行改指那个 run。
**有限检查不写成无条件证明**：结论只在模型的固定规模内、且在「存储真的兑现同一行条件写与不只成一半」这个前提下成立。**通过不提升契约或本节点的任何接受状态。**

## 覆盖缺口

本节点**没有任何实现证据**：不存在源码、测试与集成运行。按缺口分：

- **契约兑现不了、受阻的**（设计里的编号见 [design 的缺口表](design.md#实施缺口与消费者影响)）：
  - 契约 G-6（原 T-2）落盘前那一关——S-42 全部、S-52 的那一关；受阻消费者 `after_action` 上的拓展件（hooks 的 PostToolUse、卸载判定、租户件）。
  - 契约 G-17（原 T-3）观察者推送面——S-62 第 9 条；受阻消费者交付面。
  - 契约 G-19（原 T-5）模型调用的费用来路——S-13 账的这几列，兑现不了、不写过渡值。
  - 契约 G-18 的本程出路（M74，T-4）：`late` 经 `runAttemptFacts` 现读；读面接口已定（`capability.run-attempt-facts` v1）、真承接者未到，S-16、S-19、S-25～S-29、S-41 的收场都「有前提：该读面」（验收装配由 `run-attempt-facts-derived` ＋ 测试驱动交进的认法答）；**读在落账事务之外，与 `data.call-accounts/v1#S-39`「落下时」之间有漏标窗口，本批没有共同存储对象**——证据义务 N-17，受阻消费者：读账里 `late` 的人（汇总、费用核对）。
  - T-6～T-10（落点、会话日志、会话持有租户、卡片、附件存储）——对应契约 G-4、G-1、G-12、G-5、G-7；M43 真承接者本程不补。其中落点的宿主机那一半、会话日志、会话持有租户三样**接口已定**（D-043 R-1），最小提供者节点 `execution-environments-host`、`session-log-jsonl`、`session-tenancy-table` 已立（candidate，尚未建包）；受阻消费者不变（S-50～S-69 的产品装配形态）。
  - T-17：函数层 `invokeTool` 的行为没有契约条款可引——证据义务 N-18 只能对本页的描述核，受阻消费者：外部包装 `invokeTool` 的人。
  - T-16 的收场已由 N-22、N-24、M75 落进契约（参数与答复形状判不了——含判定、校验超时——一律 `failed{schema_unsupported}`），证据义务是 N-15；**剩下的**：判定时限与 `pattern` 上限的值（`data.tool-definition` G-16，owner `core/tool-definition`）。
  - 原 T-1（报告交不到本能力）已随 M33、M46 闭合；它的证据义务是 N-13。
- **模型盖不到、本节点要自己证的**：N-1～N-4（真并发与故障注入，存储前提的实证）；帧流与到达装配（S-39、S-62）只有场景 S-66；有序撤下与上交（S-47、S-48）只有场景 S-68 与 N-8。
- **待核对主张与假设**：A-1 与「同一提供者重跑 ⇒ 下游重跑」（N-6）、`provide-is-effect-managed`（N-7）、X-5（N-5）。
- **不绑的形式结论**（与 [bindings](bindings.yaml) 文件头一致）：进展任务；十条按构造的性质与 `TypeOK`；`BackgroundHasPlaceholder`（反例停在 `EndedIsLanded`，没有单独被反驳）；`CallOutcomeStable`、`AtMostOneReminder`（没有否定配置）。
- **契约 S-46 右列（协议须给）**本节点一条都不兑现；跨进程逐行重开。
- **断电边界**：sqlite `synchronous = NORMAL` 下 S-17 对断电不成立（R-T6）；没有证据形式，报主线。
- **L-3a（日志一侧的持久不晚于 SQL 一侧的「已送达」）契约不兑现**：`capability.session-log` v1 S-13 只到进程崩溃、断电边界 G-3 留给提供者；本页没有能让它失败的证据形式（断电任何演练都测不出），只能对提供者设计核「追加返回成功在确认落盘之后」——最小提供者 `session-log-jsonl` 的关键选择二如此写。受阻消费者：会话日志的真承接者（换刷盘政策时无契约条款会响）。

## 独立评审

2026-09-25 本节点随 N3 批（`tools` 三节点）经一次独立的架构评审（只读结构核对，无运行）：本节点应修 2、建议 3、观察 1、范围外 3，无阻断；主线据此裁定 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M54、M70、M71、M74、M75（批的结论见同节 N-28）。下表逐条写处置与落点。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| TER-1（应修） | `entry` 类出站项按 `(会话, CallId, 段, kind)` 唯一，一次执行的第二条记录条目就撞约束、按缺陷失败；放宽后 L-1 按段去重又会把收场条目当「已在」丢掉 | 按 M70：`entry` 的唯一键与 L-1 幂等键带出站项自己的 `seq`，`messages`／`card_close` 仍按段唯一；反证扩为「同一段内条目与消息保持 `seq` 次序」 | design.md 持久记录「出站项」行（`dedupe_slot`）、R-T2、S-19 与 S-22 行、跨 owner 的同一提交第 2 处与反证第二条、L-1；本页 N-1、N-16 |
| TER-2（应修） | `registerExecutor` 是否受服务状态闸没写；受闸则扫描期间贡献者登记失败、MCP 那一格永远没有执行者 | 按 M71：登记与撤下不经闸，只改进程内执行者表，`recovering` 期间照常受理、不抛不静默 | design.md S-7、S-37 行，关键选择四弱点栏，服务状态段，装卸表「执行者登记」行；本页 N-8 |
| TER-3（建议） | 「先撤本插件再撤存储」在依赖驱动的卸载路径上结构上不可得 | 按 M71：改写为「装配须**显式**先撤本插件与桥，再撤存储与时钟；依赖驱动的卸载不满足此次序」，`apps/cli` 已按 M48 A-1 承接 | design.md「归装配的事项」 |
| TER-4（建议） | 「同一提供者 fiber 因自身依赖重跑 ⇒ 下游消费者重跑」没有 probe，S-37 以它为前提 | 按 M71：登 kernel-basis 待补 probe，列进 T-13 与 A-1 同一行 | design.md 提供者换代段、装卸表「执行者登记」行、T-13；本页 N-6 |
| TER-5（建议） | 会话日志是 JSONL，没有数据库唯一约束；L-1 若不按耐久状态判「已在」，日志提供者也重启的交错会出两条 `ToolMessage` | 按 M70：L-1 明写「按耐久状态判已在」，并写明判与追加对同一会话是一步 | design.md L-1、跨 owner 的同一提交末段；bindings 文件头与 S-19 条；本页 N-2 |
| TER-6（观察） | 发件箱在会话日志缺席时无界增长；帧入口不限额 | 不作发现（需求未给政策）；帧入口已登 T-15 | —— |
| 范围外 1 | G-18 让本批没有一个收场事务能被如实提交，README 的可实施范围与之相抵 | 按 M74：落账前经据点读面 `runAttemptFacts` 现读，不给过渡值、不改 `data.call-accounts`；可实施范围对 S-16、S-19、S-25～S-29、S-41 标「有前提：该读面」。**起草时另见**：读在事务外，与「落下时」之间有漏标窗口、本批没有共同存储对象——登 T-4 与 N-17，报主线 | design.md S-13 行、新节「跨 owner 的现读」、依赖表、消费者表、失败映射、对其余 owner 的要求、T-4、报给主线；README；bindings S-13 条；本页 N-17 |
| 范围外 2 | N-25 把答复形状校验超时收成 `invalidInput`，人会被要求反复重答 | 按 M75（覆盖 N-25 后半，契约 S-30 已小修）：这次执行 `failed{schema_unsupported}`、`answerWait` 答 `{ resumed }` | design.md S-30 行、失败映射、T-16、报给主线；README；本页 N-15 ⑥ |
| 范围外 3 | `apps/cli` 是否承接显式撤除次序 | N5 批已核：`apps/cli` 按 M48 A-1 显式驱动（P-2 → 本插件 → 桥本体 → hooks-compat → 派发器；2026-09-25 独立评审 N7 F-6 之后加入兼容件，验收装配再接执行环境与保管方） | 同 TER-3 |
| 自报（M54） | 否定配置的原始输出不在 `record/evidence/` | 按 M54：待下一次证据 run 一并跑并入库 | bindings 文件头；README；本页「实际执行」 |

## 修订波（2026-09-25 公开面）

依据：[D-043](../../../../record/decisions/assets-runtimes-rulings-2026-09-25/README.md) R-1、R-2，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)，[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) N-37。本波只改节点；契约侧的对应修订（TER G-1、G-12、G-18、T-4、T-8 改指接口契约）由规格侧并行落，本节点只引条款号。**处置不等于接受或评审闭合。**

| 事项 | 依据 | 处置 | 落点 |
| --- | --- | --- | --- |
| 公开面 | SYS-OPEN；D-043 R-2 | 新开「公开面」一节：公开函数面 `invokeTool` ＋ 执行者接口、收场对照表、落成消息的次序；Cordis 服务面复用它（关键选择表）；只在运行时层成立的不变量逐条列出、写明函数层不承诺 | design.md「公开面」；README 公开面一条；本页 N-18、N-19；bindings 文件头一句 |
| 函数层没有契约条款 | 起草时推导 | 登缺口 T-17，报主线 | design.md T-17 与「报给主线」 |
| 会话日志接线 | N-37；`capability.session-log` v1 | S-19 行、跨 owner 同一提交第 2 处、L-1～L-5 加「接口契约兑现条款」一列、依赖表、消费者表、失败映射（`alreadyRecorded`／`unavailable`／`tenantMismatch`）；排空一律 `unfenced`；判重键带写入方前缀（session-log G-5） | design.md 对应各处；T-7；bindings 文件头与 S-19 条 |
| 会话持有租户接线 | `capability.session-tenancy` v1 S-8 | S-21 行、依赖表、消费者表、失败映射；读不到改指契约开出的 `dependencyUnavailable{sessionTenancy}`（S-21）；最小提供者产品里无写面 ⇒ 产品装配里恒为这个值 | design.md；T-8 |
| 尝试与运行的事实接线 | `capability.run-attempt-facts` v1 S-9；N-37 ④ | S-13 行、跨 owner 的现读、依赖表、消费者表、失败映射（`attemptNotFound` 不当「仍是当前」）；漏标窗口与那份契约的 G-2 同一闭合条件；读不到改指契约新开的 `dependencyUnavailable{runAttemptFacts}`（S-47 那一行）；会话持有租户读不到改指 `{sessionTenancy}`（见上一行）；送达按契约 S-46 只剩发件箱一种形状，关键选择三改为留存理由 | design.md；T-4；README；本页 N-17、覆盖缺口 |
| 执行环境接线（T-6／G-4／S-38 第 2 步） | N-37 ⑨；`capability.execution-environments` v1 S-11、S-12 | S-38 第 2 步宿主机那一半落到 `placeExecution`，不答 `host` 一律 `failed{environment_unavailable}`；沙箱那一半与权限来路仍缺 | design.md S-38 行、依赖表、消费者表、失败映射；T-6 |
| 验收装配里的「替身」改称最小提供者 | D-043 R-1 | 「归装配」段与场景受阻说明改写；最小提供者节点尚无、由主线另立 | design.md「归装配的事项」；本页规范场景表首行、S-52 行、N-1 |
| 判定时限由常量改为本节点的策略配置（主线追加裁定，2026-09-25） | 研发品味「策略类的东西不写死」；`core/tool-definition` U-8 同日改为指回本节点 | 计时的 owner 是本节点的判定工作线程；时限是配置项 `judgeTimeoutMs`（初值 500 ms，测试配置自带、产品装配由据点给，缺席或非正 ⇒ 启动失败）；函数层 `invokeTool` 的判定经 `parts.judge`，不给时没有时限（列入「函数层不承诺」）；T-16 与互指表改写 | design.md 依赖表的 config 行与「判定时限是策略配置」、公开面、S-23 行、T-16、对其余 owner 的要求；本页 N-9、N-15、N-20 |
| 对齐契约第二轮（`47e36d14`）：`{sessionTenancy}` | 契约 S-15 失败值那一行、S-21、S-23 ⑧、S-47 | 会话持有租户读不到（`sessionNotFound`、`unavailable`、缺席）改为 `dependencyUnavailable{sessionTenancy}`，不再借 `{storage}`；「报给主线」撤掉这一项 | design.md S-21 行、依赖表、消费者表、失败映射、T-8、报给主线；本页会话持有租户一行 |
| 最小提供者节点互指（主线 2026-09-25） | `packages/session/{session-log-jsonl, session-tenancy-table, run-attempt-facts-derived}`、`packages/infra/execution-environments-host` 四个 candidate 节点 | L-1～L-5 引导段、T-4、T-6、T-7、T-8、依赖表与消费者表、S-38 行改为「真承接者未到，最小提供者节点 X 已立（candidate）」并链到那边的承接或缺口表；落点读数来自 `execution-environments-host` 的可选读面 `executionPlacementReadings`；T-4 ③ 随契约开出 `{runAttemptFacts}` 闭合 | design.md 各处；README 可实施范围；本页场景表、N-17、覆盖缺口 |
| 独立评审 N6 B-1：跨存储持久次序只活在会话日志节点 | [D-040 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ①（登执行宿主 L-3 子项） | L-3 下加 L-3a「日志一侧的持久不晚于依它写下的 SQL 一侧（出站项『已送达』）」，写成对任何会话日志提供者的要求，引 `session-log-jsonl` 关键选择二；契约不兑现这一项，T-7 与覆盖缺口各记一笔 | design.md 对会话日志提供者的要求（引导段、L-3a）、T-7；本页覆盖缺口 |
