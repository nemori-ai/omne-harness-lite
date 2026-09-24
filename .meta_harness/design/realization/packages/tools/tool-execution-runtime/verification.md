# tool-execution-runtime 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/tool-execution-runtime/verification.md`](../../../../spec/capabilities/tool-execution-runtime/verification.md)：一个 TLA+ 模型（两个登记任务、六个去保护配置、三份补充否定配置、七个可达性探针）、十八条规范场景、两个方向的故障注入、K-1～K-11 两源反例。
本页按本节点的兑现点登记，再加**本节点自己的选择**带来的义务（会话哨兵、发件箱、活体表由一个 effect 持有、先 provide 后扫描）。**本节点尚未建包，除契约模型的两次运行外一切未开始。**

## 证据义务

### 契约模型（已执行，只证模型）

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-7](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-7-活体与找得到)、[S-13](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-13-账)、[S-16](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-16-首胜收场只写一次)～[S-20](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-20-恢复扫描与停机不重来)、[S-29](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-29-会话归档)、[S-30](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-30-答复等待) 的安全性质 | formal task `tool-execution-runtime-v1-execution` ＋ 成对的去保护配置 | **已执行（模型层）**：见[实际执行](#实际执行)；九条进 [bindings](bindings.yaml)。**证的是交错语义，不证本节点的存储真的兑现了 R-T1／R-T3**——那一半是下面 N-2、N-3 的真并发演练 | 契约 owner（模型）；本节点（N-2、N-3） |
| S-18、S-19、S-20 的进展性质 | formal task `…-execution-progress` | **已执行（模型层）**，**不绑**：三条公平性前提（恢复终会发生、追加终会成功、强制停止终会生效）与三条结论一一对应、没有否定配置；本节点里「追加终会成功」依赖会话日志提供者（不存在），「强制停止终会生效」依赖 X-5（未核） | 前提的实际兑现：N-5（X-5）、会话日志提供者 |
| 按构造成立的性质（`ReminderAfterPlaceholder`、`ArchiveSettlesAll`、`SequentialBatch`、`ConcurrencyCap` 等十条）与 `TypeOK` | **不绑**——模型里没有会失败的断言 | 证据形式改为场景：`ReminderAfterPlaceholder` → S-52 与本节点 N-1；`ArchiveSettlesAll` → S-56；`SequentialBatch`、`ConcurrencyCap` → S-58 与本节点 N-4；`WaitOnlyForeground`、`RunCancelSparesBackground` → S-57 | 本节点 |

### 规范场景（十八条，全部未开始）

契约 verification 已列每条的证据形式；本表只写**在本节点上**额外受阻于什么。

| 场景 | 本节点上受阻于 | 状态 |
|---|---|---|
| [S-50](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-50-前台完成)、[S-51](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-51-前台被用户中断)、[S-53](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-53-等待再次等待与迟到的答复)、[S-55](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-55-找得到的不追补)、[S-56](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-56-归档之后到达的完成不送达)、[S-57](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-57-取消运行不动后台)、[S-59](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-59-停止与交回交错) | 每条都要走 `submit`：受阻于 T-8（会话持有租户的读面，否则恒为 `dependencyUnavailable{storage}`）与 T-7（会话日志追加面）；`submit` 必带的 `report` 要一份注册表算出的报告，而注册表本批 `PENDING`（装配清单无提供者）。**可做的最小形态**：验收装配里用标明「非产品行为」的替身顶上这几个读写面、报告与 PB-1 放行件——那是本节点的测试，不是契约场景的通过 | 未开始 |
| [S-52](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-52-自动转后台后完成落一条提醒) | 同上 ＋ 契约 G-6（落盘前那一关，本批一律「不可用」）＋ 契约 G-18（`late` 兑现不了——这一格断言不了） | 未开始 |
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
| N-1 | **两路排空同一会话**（旧任撤除中、新任扫描后；或同一任的重试与定时器并发）：日志里每 `(会话, CallId, 段)` 恰一条、同段占位在提醒之前（[design 的反证](design.md#跨-owner-的同一提交执行记录与会话日志)反证不了的那一条） | **真并发**演练：两个装配、两个存储连接、同一库文件；会话日志用一个带唯一约束的替身 | 未开始；受阻于 T-7（真会话日志） | 本节点 ＋ 会话日志提供者（互指 L-1） |
| N-2 | **追加成功、置 `appended` 之前停机**：重启后再追加撞键「已在」、日志不重复 | 故障注入 | 未开始 | 本节点 |
| N-3 | **会话哨兵（R-T3）真的排出次序**：并发的同一批两次 `submit`（两个存储连接）；`submit` 与 `archiveSession` 交错；`submit` 与 `cancelForRun` 交错；交回与中断交错。断言：首胜、判重、标记重判各只有一个结果，没有「写了记录又被归档漏掉」的行 | **真并发**，sqlite 与 pg 各一遍（pg 上哨兵是咨询锁，行为与 sqlite 的库级串行不同） | 未开始 | 本节点 |
| N-4 | **并发上限与批内次序跨两个起执行者决定成立**：同一工具两项同时可起时只起上限个；换代后的新任从存储读出同一答案 | 真并发 ＋ 换代演练 | 未开始 | 本节点 |
| N-5 | **X-5**：据点进程被强杀后，执行者起的子进程树是否仍在；按登记的回收句柄（进程组）能否整棵回收；`running` 已写、回收句柄未写的窗口里被强杀会留下什么 | 实验（提案 [X-5](../../../../record/proposals/tool-execution-runtime-baseline/alternatives.md#仍待区分的实验)） | 未开始 | 实现者；结果进 basis 或登待核对主张 |
| N-6 | **假设 A-1**：Cordis 4.0.4 在必需服务换提供者时，等旧插件体的 async effect disposer 结算完才重跑插件体 | probe（`core/kernel-basis`），通过后升格 basis 条目 | 未开始 | `core/kernel-basis` owner。不成立时本节点的 S-48 要改成「新任扫描前先等旧任的撤下标记」，届时回来改设计 |
| N-7 | `ctx.provide` 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`）升格为 basis 条目 | basis 升格 | 未开始（**待核对主张**） | `core/kernel-basis` owner |
| N-8 | 服务状态闸：扫描提交前一切方法 `runtimeNotReady`；上交之后一切方法 `runtimeStopped`、挂着的 `awaitForeground` 同答；存储恢复后不补写 | 演练（与 S-68 同一套装配） | 未开始 | 本节点 |
| N-9 | 配置错误同一政策：缺 `executionStopGrace`／`deliveryRetryInterval` 或非正 ⇒ 装配启动失败、服务不出现 | 单元测试 | 未开始 | 本节点 |
| N-10 | `execution.delivered` 监听者抛出不改已追加的事实、只记一条 error 诊断（basis `emit-listener-throw-propagates`） | 单元测试 | 未开始 | 本节点 |
| N-11 | 计时只以 `clock.now()` 判：宿主计时器提前或推迟醒来都不改判；时钟答不可用时不触发 | 可前推、可答不可用的时间替身 | 未开始 | 本节点 |
| N-12 | 静态检查：每个写事务开头取会话哨兵；`storage.write(fn)` 内不调用任何别的插件的服务（P-13）；不以 `ctx.bail` 做异步控制；本包不 inject 执行者、不 inject 可选依赖；JSON 列只经 `readJsonStrict`／`writeJsonLossless` 读写（R-T9）；`execution.delivered` 不接任何跨进程转发（M42） | 结构检查（`tools/ts-checks` 的规则，候选），各带一条「故意违反就失败」的自测 | 未开始 | 本节点 ＋ ts-checks owner |
| N-13 | **报告的三方核对**（M33、M46）：`report` 缺席（一批全是 `UnparseableCall` 也一样）、带的会话／运行／尝试任一不是本次的（含同一运行上一次尝试的那份）⇒ 整批 `invalidInput`、什么都没写；**排在服务闸之前**——扫描未完成时带错报告答 `invalidInput` 而不是 `runtimeNotReady`；MCP 动作记下的接入点持有就是交来的报告里那一份 | 单元测试 ＋ 演练（报告用替身） | 未开始 | 本节点 |
| N-14 | **JSON 每一跳无损**（M36，R-T9）：参数里有 `12345678901234567890` 与超精度金额的调用，经 `submit` 落盘、恢复扫描回读、交给执行者、落成消息之后逐字不变；存储里一段带重复键的 JSON 回读 ⇒ 缺陷，不挑一个 | 单元测试（sqlite 与 pg 各一遍：两种方言的 JSON 列与文本列行为不同） | 未开始 | 本节点 |
| N-15 | **判不了先于判不合**（契约 S-11、S-23 ④ 第 ② 条，N-22 T-16）：① 一批里一项的参数 schema 带一个静态筛查漏过的病态 `pattern`、实参触发灾难回溯 ⇒ 判定工作线程到判定时限被终止、换一只新的，那一项 `failed{schema_unsupported}`，块上写明「判定超时」、**不附用法**；判定期间另一个会话的 `submit` 照常返回（事件循环没被卡住）；同批别的项照常判、照常执行；② 作者写的工具参数 schema 编不出 ⇒ 同一收场、块上写明「编不出」；③ 反证：以上两种都**不是** `arguments_invalid`，也没有一项退成不判照跑；④ 判定中途开始撤下 ⇒ 整批 `runtimeStopped`、什么也不写；⑤ 换不起新线程 ⇒ `stopped` ＋ 上交 | 单元测试（①～③、⑤）＋ 带撤下的演练（④）；时限在测试里取小值 | 未开始；**正式的时限与 `pattern` 上限的值要等 `data.tool-definition` 的 G-16** | 本节点；值归 `core/tool-definition` |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| `2026-09-25-formal-assets-runtimes` · `tool-execution-runtime-v1-execution` | `Execution.tla` ＋ `Execution.cfg`：六个开关全 `TRUE`、`MaxWaits = 2`；一个会话、两批四次调用、至多一次停机；无公平性；死锁检查关闭 | **退出 0，无反例**：2,656,347 generated · 741,344 distinct · 0 left · 深度 22 · 1 min 09 s，完整穷尽 | [run README](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) |
| 同 run · `tool-execution-runtime-v1-execution-progress` | `ExecutionProgress.cfg`：`FairSpec`、`MaxWaits = 1` | **退出 0，无反例**：524,448 distinct · 深度 20 · 15 min 55 s | 同上 |
| 2026-09-24 契约修复者本机运行（**非 formal task**、未落进 `record/evidence/`） | 六个去保护配置、三份补充否定配置、七个可达性探针；`Execution.tla` 与上一行同一份 | 全部**按预期**违反或被反驳 | 契约 verification [实际执行](../../../../spec/capabilities/tool-execution-runtime/verification.md#实际执行)、[结果与反例](../../../../spec/capabilities/tool-execution-runtime/verification.md#结果与反例) |

**这三行都不是本节点的符合性证据**：它们检查的是契约的模型。去保护那一行证明「首胜、耐久交付、先写后停、全量恢复、不重起、等待序号」这六处保护是 load-bearing 的——正是本节点要求 R-T1、R-T3 与发件箱存在的理由。
那一行的原始输出不在 `record/evidence/` 里，是本页每条绑定共同的弱点（[bindings](bindings.yaml) 文件头）。
**有限检查不写成无条件证明**：结论只在模型的固定规模内、且在「存储真的兑现同一行条件写与不只成一半」这个前提下成立。**通过不提升契约或本节点的任何接受状态。**

## 覆盖缺口

本节点**没有任何实现证据**：不存在源码、测试与集成运行。按缺口分：

- **契约兑现不了、受阻的**（设计里的编号见 [design 的缺口表](design.md#实施缺口与消费者影响)）：
  - 契约 G-6（原 T-2）落盘前那一关——S-42 全部、S-52 的那一关；受阻消费者 `after_action` 上的拓展件（hooks 的 PostToolUse、卸载判定、租户件）。
  - 契约 G-17（原 T-3）观察者推送面——S-62 第 9 条；受阻消费者交付面。
  - 契约 G-18、G-19（原 T-4、T-5）`late` 与模型调用的费用来路——S-13 账的这几列，兑现不了、不写过渡值。
  - T-6～T-10（落点、会话日志、会话持有租户、卡片、附件存储）——对应契约 G-4、G-1、G-12、G-5、G-7；M43 本程不补。
  - T-16 的收场已由 N-22、N-24 落进契约（判不了——含判定超时——一律 `failed{schema_unsupported}`），证据义务是 N-15；**剩下的**：判定时限与 `pattern` 上限的值（`data.tool-definition` G-16，owner `core/tool-definition`）；S-30 答复值校验超时怎样答，契约没写（受阻消费者：带 `pattern` 等待形状的执行者）。
  - 原 T-1（报告交不到本能力）已随 M33、M46 闭合；它的证据义务是 N-13。
- **模型盖不到、本节点要自己证的**：N-1～N-4（真并发与故障注入，存储前提的实证）；帧流与到达装配（S-39、S-62）只有场景 S-66；有序撤下与上交（S-47、S-48）只有场景 S-68 与 N-8。
- **待核对主张与假设**：A-1（N-6）、`provide-is-effect-managed`（N-7）、X-5（N-5）。
- **不绑的形式结论**（与 [bindings](bindings.yaml) 文件头一致）：进展任务；十条按构造的性质与 `TypeOK`；`BackgroundHasPlaceholder`（反例停在 `EndedIsLanded`，没有单独被反驳）；`CallOutcomeStable`、`AtMostOneReminder`（没有否定配置）。
- **契约 S-46 右列（协议须给）**本节点一条都不兑现；跨进程逐行重开。
- **断电边界**：sqlite `synchronous = NORMAL` 下 S-17 对断电不成立（R-T6）；没有证据形式，报主线。
