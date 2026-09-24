# model-request-runtime 实现设计

契约：[`capability.model-request-runtime` v1](../../../../spec/capabilities/model-request-runtime/v1/contract.md)（下文「契约 S-n」「契约 G-n」都指它）。
本页的服务名、方法名、列名、日志事件名一律是**候选**；契约的九件事不复述，只写兑现点与缺口。

## 实现路径与来源

**自建两个插件，其余全部复用。**

- **复用的纯模块**（同批 core 节点，由那边定接口；本页只写用法）：`packages/core/stream-assembly`（到达装配器——本节点就是契约 S-51 说的模型侧宿主）、`packages/core/model-model`（档案与响应体的形状与校验）、`packages/core/message-model`（五种记录、`AssistantMessage`、块）、`packages/core/tool-model`（`ModelToolName`、`Duration`）、`packages/core/asset-evaluation`（「用哪个模型」这一项与两个时限的求值——输入来路见[依赖表](#依赖作用域与绑定)）；已实现的 [`identity-values`](../../core/identity-values/README.md) 与 [`offer-expiry`](../../core/offer-expiry/README.md)（`Instant`）。
- **模态投影的两个纯函数** `project`、`compatible` 从 [`packages/model/modality-projection`](../modality-projection/README.md) 按包 import，**不 inject**（草图 Y-2）。
- **插件层共用件**取 [kernel-basis](../../core/kernel-basis/README.md)：`definePlugin`（config 由内核在插件体之前校验）、`resolveOptional`（调用时取用可选依赖）、`Outcome`（闭合的失败字面联合）。存储走 [core/storage 协议](../../core/storage/design.md#协议)。
- **传输**：pi-ai 定向 fork（D-019）。**fork 包本身没有节点**：上游精确版本、托管方式、许可、补丁对 0.86.x 的重生成都未定（[D-019 比较门现状补记](../../../../record/decisions/model-provider-pi-ai-fork/gate-status-2026-09-23.md)）。本节点只定它**进来的形状**：一个构造参数级的接口（候选 `TransportAdapter`），`send(请求, 凭据值, 中止信号) → 到达事件序列 ＋ 原样状态码 ＋ 用量与费用来源`，另在出网之前报两样事实——这一次的改值与丢项（契约 S-38 传输适配第 10 条）、本据点传输能承载的模态（契约 S-11 末段）。两个实现：fork 适配，脚本化传输（测试与验收装配用）。契约 S-38 的十一条由适配层逐条兑现；其中第 1、2、4、5、7 条依赖研究假设（契约 G-10），**本节点不据研究推导上游行为**，只把它们列成适配层的符合性测试义务（[verification](verification.md#证据义务)）。
- **值不在本节点**：成因表、脱敏三参数、两个时限、退避的取值都是契约开放缺口（G-5、G-6、G-9、G-8），代码里不放默认值。

## 契约到 Cordis 的投影

### 插件、服务键与配置

| 单元 | 插件与服务键（候选） | 必需 inject | 调用时取用（`resolveOptional`） | 配置（`definePlugin` 的 `Config`） |
|---|---|---|---|---|
| **P-2** | 插件 `model-request-runtime`；provide `modelRuntime` | `modelCatalogRead`、`credentialLookup`（[model-profile-directory](../model-profile-directory/README.md) 的 P-1r，或单进程装配里的 P-1）；`sessionLog`（块 D，无契约）；`storage`；`clock`（[infra/clock](../../infra/clock/README.md)） | `assemblyManifest`：会话装配清单的读面（PF-004 的契约未起草，无提供者），本节点从它取求值结果 | 传输实现的选择及其配置（固定 base URL、拒绝重定向：S-38 第 9 条）；`statusCauseTable`（契约 S-18 的 `status_cause_table`，G-5）；脱敏三参数（契约 S-20，G-6） |
| **P-5** | 插件 `model-default-retry`；不 provide | runner 的实现登记面 `loopExtensionImplementations`（[loop-extension-runner](../../agent-loop/loop-extension-runner/README.md)） | — | `defaultRetryBackoff`（契约 S-35 的 `default_retry_backoff`，G-8） |

**配置错误一个政策**（与 tenancy 各节点、[kernel-basis](../../core/kernel-basis/design.md#依赖作用域与绑定) 同一条）：config 缺项或不合形状 ⇒ 内核让 fiber `FAILED`、什么都不 provide（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）⇒ 装配启动失败。
本节点**不在代码里放默认值**：`statusCauseTable` 与脱敏三参数没有值，P-2 就不启动——没有脱敏参数时「凭据不出现在任何记录里」的前提不成立（契约第八节安全性质那一行）；`defaultRetryBackoff` 没有值，装配就不装 P-5，runner 由指定挂件顶上、一律不重试（契约 S-35 末条允许的收场，不是本节点选的政策）。
**两个时限不是配置**：它们是运行时设置项（契约 S-21），每一次发出之前从装配清单的求值结果现取，取不到 ⇒ 这一次 `unavailable`。

### 操作落点

| 契约责任 | 插件、服务或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| S-5 `callId` 会话内唯一；调用跨尝试延续 | `modelRuntime.openCall` 铸 `callId`：128 位随机、交换表示按 `data.identity-values/v1#S-31` | 尚未实现 | 唯一性**不靠随机**：一次调用的首条耐久记录（「已出门」第 1 次，或调用终结）在会话日志上有唯一键（[L-6](#存储要求)），撞了即拒、那一边 `unavailable`；在途表按 (会话, `callId`) 为键 |
| S-6 调用状态 | P-2 的在途表，只在进程内；终态与「已开口」从日志判 | 同上 | 状态不另存为权威；在途表随实例丢，由对账重建 |
| S-7 绑定 | `openCall`：`modelCatalogRead.readProfile` 取快照、合并参数、出门前检查；`dispatch` 把绑定写进「已出门」；续接只从最近一条「已出门」读 | 同上 | 续接与追补**不读内存、不重读档案** |
| S-8 六种记录 | 带栅栏的四种（已出门、已开口、中断意图、调用终结）经调用方随 `openCall` 交来的追加口写；不带栅栏的结算（响应体）与会话级写入（模型切换、对账追补）经 `sessionLog` 写 | 同上 | 形状归 `packages/core/message-model`（`data.messages/v1#S-49`、`#S-50`）；为什么同时要两条路见[与草图不同的三处](#与装配草图不同的三处) |
| S-9～S-12 选中、有效、合法、展示 | `effectiveModel`、`legalTargets`、`displayList` 每次现算：日志尾的最后一条 `model_selection_changed` → 装配清单里的求值结果 → `modelCatalogRead.listProfiles(T)` → 本地按 `落点(T, r, A)` 求 → `compatible` | 同上 | **允许集合 `A` 的来源是契约 G-19**：闭合前求值结果里没有这一项，按契约 S-11 第一条恒 `unavailable`；胜出行不按 (T, r) 缓存 |
| S-13 投影追到日志尾 | P-2 的投影缓存（[R-1](#存储要求)）；每次读先从水位追到日志尾，逐条套 `project` 的可分解一步 | 同上 | 缓存不是权威；缓存行读不到就从日志头重算（答案相同，代价随历史长度；记一条 info 日志）；性质测试与伸缩测量是证据义务 |
| S-14 失败集合与判定次序 | 各方法返回闭合字面联合（`Outcome`），判定次序照各操作 ⑥ | 同上 | **没有 catch-all**：`StorageUnavailable`／日志不可用映射为 `unavailable`，其余异常上抛（缺陷） |
| S-15 两个锚点先写后行 | `dispatch`：`await` 「已出门」追加确认 → 才调 `send`；首个内容：`await` 「已开口」追加确认 → 才推给观察者 | 同上 | 绑 formal；两支写不进照契约 S-15 末条 |
| S-16 首 token | 看装配状态第一次出现的 `firstContentAt`（`capability.stream-assembly/v1#S-16`），不看传输库的「开始」事件 | 同上 | 传输适配第 4 条 |
| S-17 结算 | 全部结算只走一个函数（候选 `settle`）：按 `ResponseId` 追加响应体，唯一冲突 ⇒ 已有先到者，空操作、不报错；撤除的结算在同一个撤除函数里按「中止 → 定收场 → 写 → 释放」 | 同上 | 绑 formal；与 loop 的共同存储对象见[下文](#跨-owner-的共同存储对象与三条交错) |
| S-18 成因 | 按失败来源分支；状态码 → 成因只查 `statusCauseTable`，表外 ⇒ `unrecognized`；本地错误 ⇒ `unrecognized` 带留痕 | 同上 | 表的内容 G-5 |
| S-19 凭据现取 | 每一次发出之前 `credentialLookup.value(发起租户, 绑定的有效模型引用的 origin)`；值只作为 `send` 的实参，不进任何对象、记录、日志事件 | 同上 | 静态检查候选：`credentialLookup` 的调用点只许在「发出」那一个模块 |
| S-20 脱敏 | 写入之前一律经同一个脱敏函数（三参数来自配置）；原始响应存附件之前同样过一遍 | 同上 | 原始响应留存这一支受阻于附件存储未定义（`data.content-blocks` 的 G-1），**不挡响应体本身** |
| S-21 两个时限 | 每一次发出两个计时器，挂在那次调用的 effect 上，收场即清 | 同上 | 项名与默认值 G-9；取不到 ⇒ `unavailable` |
| S-22 发出序列 | 守卫与计划约束是 `dispatchAgain`／`canDispatchAgain` 共用的同一个判定函数；续接取失联那次的那一家 | 同上 | 绑 formal |
| S-51 模型侧装配宿主 | 每一次发出一份装配状态，按 (会话, 目标) 为键；逐个 `accept`；被拒 ⇒ 紧接着交一个 `reason: rejected` 的 `trim`，并记一条结构化日志事件；收场 `closeOut`，撤除与失联 `abandon` | 同上 | 日志事件（候选名）`model_call.increment_rejected` 记 error 级、`model_call.event_after_finish` 记 info 级——**不用 warn**：缺省只导出到 info（basis [`logger-level-order-error-lowest`](../../../../basis/cordis/logger-level-order-error-lowest.md)），warn 会被丢 |
| S-24～S-34、S-49、S-50 十三个操作 | `modelRuntime` 上同名方法 | 同上 | 九件事照契约 |
| S-35 默认重试件 | P-5 登记的实现：纯函数（快照里的供应商次序、允不允许回退、已试过的家、最近成因）→ `retry { provider, after }` 或 `observed` | 同上 | 零依赖；结论照样过契约 S-30（runner 经 `canDispatchAgain` 判） |
| S-36 宿主停止与撤除 | 每次调用在宿主上一个 effect；P-2 自己的在途表 effect | 同上 | [装卸表](#成对的装载与撤除) |
| S-37 不发事件 | 不 `emit`、不监听 | — | [事件一节](#事件派发过滤与边界) |
| S-38 左列、S-39 | 见[装配给 vs 协议给](#装配给-vs-协议给)与[依赖表](#依赖作用域与绑定) | — | 右列不在本版 |

### inject 边与换代时收掉的在途事实

`inject` 的含义是「提供者换代或不可用，我就卸载重跑」（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）；没有可选形式，可选依赖一律调用时取用（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）。

| 边（消费者 → 提供者） | 必需／调用时 | 提供者换代或撤除时收掉什么 | 对齐的契约条款 |
|---|---|---|---|
| P-2 → `modelCatalogRead` | 必需 | P-2 插件体重跑：旧实例的在途表 effect 被撤，每一次在途调用按契约 S-36 末条结算（在途的流 `abandon`、收场 `interrupted{run_cancelled}`、释放）；inject `modelRuntime` 的 agent runtime 随之重跑。P-1r 须在实例内部处理断线重连，不以换代表达断线（草图 inject 表） | S-36 末条、S-39 |
| P-2 → `credentialLookup` | 必需 | 同上；**值轮换不触发**——值是每次现取的数据（草图 N-9） | S-19 |
| P-2 → `sessionLog` | 必需 | 同上；撤除时的结算写可能因旧日志服务已撤而写不进——**不补写**，由下一次对账追补（契约 S-36「权威的收口是下一次尝试的对账」） | S-36、S-33 |
| P-2 → `storage` | 必需 | 同上；缓存行留在存储里，它不是权威 | S-13 |
| P-2 → `clock` | 必需 | 同上 | — |
| P-2 ⇢ `assemblyManifest` | 调用时取用 | 不重跑；缺席或读不到 ⇒ 依赖它的操作 `unavailable` | S-14、S-39 |
| P-5 → `loopExtensionImplementations` | 必需 | P-5 重跑并重新登记；其间 runner 看它「此刻不在」，由指定挂件顶上（一律不重试） | runner S-17 |
| agent runtime → `modelRuntime`（loop 那一程，尚无节点） | 必需 | 在途调用随 P-2 撤而结算；没开口的在下一次尝试续接，开口的记失联 | S-33 |
| runner ⇢ `modelRuntime`（`legalTargets`、`canDispatchAgain`） | 调用时取用（在 runner 节点） | runner 不重跑；缺席 ⇒ 那一件判不出 ⇒ 那一次 `dispatch` `unavailable` | runner S-14、S-33 |

**有意不设的边**：P-2 不 inject runner（草图 N-7：否则依赖成环）；不 inject 模态投影（纯函数，Y-2）；不 inject 传输（内部依赖，N-2）；不 inject 保管方（经 `credentialLookup` 间接）；P-5 不 inject P-2。

### 与装配草图不同的三处

**一、P-2 必需 inject 会话日志服务**（草图写「P-2 不 inject 会话日志服务，追加口随调用交进来」）。契约里有五个操作没有调用方的追加口却要读或写日志：`selectModel` 写切换事实（契约 S-27 ① 只收会话与路由名）、`effectiveModel`／`legalTargets`／`displayList` 读选中模型与投影、`reconcile` 为**上一个进程**里的调用追补（那时的追加口已随进程没了）、`readAttempts` 读发出记录。带栅栏的锚点写仍走调用方交来的追加口——栅栏属于调用方那一次尝试。

| | 只用调用方交来的读写口（草图） | 可选取用 `sessionLog` | **必需 inject `sessionLog`（本方）** |
|---|---|---|---|
| 覆盖契约 | 上面五个操作要在输入里多一个口：改契约的操作输入 | 覆盖 | 覆盖 |
| 日志缺席时 | — | P-2 活着、每个操作 `unavailable` | P-2 `PENDING`、`modelRuntime` 不可见，消费者 `PENDING` |
| 日志提供者换代 | 不牵动 P-2 | 不牵动 P-2 | P-2 重跑、在途调用结算——**但 agent runtime 本来就 inject 日志、同样会重跑，在途调用照样被结算**，多付的代价为零 |
| 落选方最强论证 | 草图：P-2 不持有日志句柄，读写口带着栅栏，谁在写一目了然 | 日志换代时 P-2 不重跑，已开口的流不被打断 | — |
| 本方弱点 | — | — | 多一条 inject 边；「带栅栏的写走调用方的口、不带栅栏的走服务」这条分工要在代码里守住（静态检查候选：锚点写只许经调用方交来的口） |

置信度：中高。依据是契约 S-27 ①、S-33 ① 的输入里没有追加口；若 loop 契约把会话级写入也做成调用方交口，本条可退回草图。

**二、P-2 inject `storage` 与 `clock`**。草图的存储表写了「模态投影缓存：P-2、缓存行写入」，inject 列没写存储；本节点补上这条边。`clock` 给「已开口」时刻、切换事实的时刻与响应体时序用不后退的时间源（infra/clock 的 `now` 不后退），若会话日志的条目壳自带时间点，改由它给、去掉这条边（记在缺口 MRR-N9）。

| | 进程内缓存 | 每次从日志头重算 | **持久缓存（本方）** |
|---|---|---|---|
| 伸缩义务（契约 S-13「代价与历史长度无关」） | 重启后第一次读随历史长度 | 每次随历史长度 | 追补只随新增条目 |
| 落选方最强论证 | D-026 只禁内存**存储提供者**，缓存不是存储；少一条 inject 边 | 零状态、零一致性问题 | — |
| 本方弱点 | — | — | 多一份持久小状态与一条 inject 边；缓存与它追的那本日志必须位置可比（[R-2](#存储要求)） |

置信度：中。缓存丢了从日志重算必得同一答案（`capability.modality-projection/v1#S-6`），所以这一选择只关伸缩，不关正确性。

**三、在途表与传输连接池合成一个 effect**（草图列为两个）。同一 fiber 的各个 effect 撤除时**并发驱动、不保证次序**（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)）：分成两个，连接池可能先关，在途的流于是先以传输错误断掉，结算会把它读成一次上游故障——而契约 S-36 要求撤除时的收场是 `interrupted{run_cancelled}`、不是故障。合成一个撤除函数，次序由代码写死：置「停止中」→ 逐个结算在途调用 → 关连接池。落选方的最强论证是两份资源各自一个 effect、各自撤除更直接；本方弱点是一个撤除函数做两件事。置信度：高。

### 一次调用是宿主上的一个 effect

照草图 N-1，理由不重复（调用失败是一个值、不是插件失败；调用身份要跨尝试稳定，只能落在日志里；一条会换代的 inject 边会让调用 fiber 重跑、重跑就是再发一次）。机制：

- **宿主显式交进来**：`openCall` 的「宿主」参数是宿主交出的一个句柄（候选形状：`effect(撤除函数) → 提前撤除函数`，以及宿主的中止信号与「停止中」读面）——本节点**不从服务方法里摸调用方的上下文**（草图 H-5）。
- **何时登记**：出门前检查通过、调用进入 `open` 时在宿主上登记一个 effect；`undispatched` 的调用不登记（它已在终态）。撤除函数 = 对这次调用做契约 S-36 的结算。
- **正常收场时注销**：调用进入终态（或 `reply_pending` 被收口）时调提前撤除函数。**这依赖假设 H-1**（`ctx.effect` 返回的撤除函数可以提前单独调用），kernel-basis 里**没有这条 probe**（缺口 MRR-N5）；它不成立时改为「在宿主下开一个子作用域承载调用的资源」，契约条款与本节其余部分不变。
- **两处结算只有一个先到**：宿主撤除与 P-2 自身撤除可能同时结算同一次调用（草图 H-2：内核重载会不会等旧 fiber 的异步撤除完成，未核实，**本节点不依赖它**）。同一个实例里两条路径调用同一个 `settle`、同一个调用对象上的「已结算」标记先挡一次；跨实例由会话日志上的唯一键挡（[L-2](#存储要求)）——**正确性只在后者**。
- **撤除时不取消在途的方法调用**：内核不取消在途调用。机制是「停止中」标记：P-2 自身撤除或宿主进入停止时置位；`openCall`、`dispatch`、`dispatchAgain` 在入口与每个提交步骤之前（写「已出门」之前、调 `send` 之前）检查它，已置位 ⇒ `runtimeStopped`，不再出网。检查与写之间的窗口由在途表兜住：写「已出门」之前先入表，所以撤除时的结算一定看得到它；它若已写下「已出门」而没出网，结算写下 `interrupted{run_cancelled}`、账全未知——如实，不是编造。
- **每次发出的两个计时器、装配状态、中止句柄**都挂在这一次调用的 effect 上，收场即清。

### 事件：派发、过滤与边界

- **P-2、P-5 不发、也不监听任何 Cordis 事件**（契约 S-37）；控制全是直接调用。本版**不消费**会话日志的追加通知来提前推进投影——正确性靠读时追到日志尾，提前推进只是性能，没有测量就不加。
- **F② 依赖消失时谁被卸载**：见上表；范围是 P-2 实例与 inject `modelRuntime` 的 agent runtime。一次调用的宿主本来就是 agent runtime，两者一起重跑，范围不比契约要的大。
- **F③ 有没有一条事件能越过租户或会话边界**：没有 Cordis 事件，所以没有派发模式与过滤器可选。两条非事件的外送通道各自守住边界：
  - **推给观察者**：观察者端口由宿主随 `openCall` 交进来（与追加口一起，候选），**按 (会话, 目标) 路由**、只推给这次调用所在会话的观察者（契约 S-51 第 1、9 条）；两个会话里同一个 `callId` 各进各的装配状态。观察者端口的形状归会话出站流（块 D，无契约，缺口 MRR-N6）。
  - **结构化日志事件**：进 JSONL 运行日志，只带会话、`callId`、目标、被拒的值——**不带内容、不带凭据**；它是运维面的记录，不是租户可见的通道。

### 存储要求

**A. 对会话日志提供者的要求**（块 D，**无契约、无节点**；本节点只能列，落不了——缺口 MRR-N1）。与 [loop-extension-runner](../../agent-loop/loop-extension-runner/design.md#存储要求) 的 RL 系列落在**同一本日志、同一个尝试行**上，两边各写一条、互指。

| # | 要求 | 对应契约条款 |
|---|---|---|
| L-1 | 追加以「确认落盘」为返回；确认之后跨进程重启仍在 | S-15「写下指追加口确认落盘」 |
| L-2 | **响应体按 (会话, `ResponseId`) 唯一**；第二条被拒，失败**分得出**是「已有」而不是不可用 | S-17、S-38 第 2 行 |
| L-3 | **多条目原子追加，且可带「这个 `ResponseId` 还没有响应体」的前置**：违反即整批拒（loop 的「回复消息 ＋ 它的响应体」一次写下，或一起不写） | S-17、S-38 第 1 行 |
| L-4 | **尝试栅栏在日志的写入边界上判**：带栅栏的追加在**同一存储事务里锁定读**那个运行的尝试行，序号不是最大即拒；结算类记录（响应体、账）不设栅栏、照写并带 `late` | S-17、S-38 第 8、11 行 |
| L-5 | 读到的尾就是读那一刻已确认的最新位置；读不到返回可识别的失败，**不返回空** | S-9、S-13、S-14 |
| L-6 | 锚点与终结记录的唯一键：「已出门」按 (会话, `callId`, 发出序号)、「已开口」同上、「中断意图」与「调用终结」各按 (会话, `callId`) | S-5（发号唯一）、S-31 ⑦、S-38 第 8 行 |
| L-7 | 一个会话内的日志位置可比、单调，缓存的水位用它 | S-13 |
| L-8 | 五种记录作为不是消息的记录条目存下，条目壳带会话、运行、尝试与租户 | S-8（形状归 `data.messages/v1#S-49`、`#S-50`） |

**B. 对存储提供者的要求**（[core/storage](../../core/storage/design.md#协议)，协议已有这些能力）。

| # | 要求 | 对应契约条款 |
|---|---|---|
| R-1 | 投影缓存表（候选 `model_projection_cache`）：主键会话；列：无 transcript 的模态集合、水位、它所追的那本日志的标识。唯一写入者 P-2。写在一次写事务里 `lockRow` 那一行、**只在新水位大于旧水位时更新**（只增不减） | S-13 |
| R-2 | 水位与会话日志位置可比：行上记着日志标识，与当前日志对不上即整行作废、从日志头重算 | S-13、S-38「投影 = 从日志重算」 |
| R-3 | 不可用可识别：`StorageUnavailable` 时从日志头重算（答案相同），不把「缓存读不到」说成「投影为空」 | S-13、S-14 |

### 跨 owner 的共同存储对象与三条交错

本节点自己的每一次写都是一次追加，**没有「同一提交」要跨 owner**；需要排序的是它与 loop 对**同一次发出**的并发写。三处共同对象：

1. **响应体的唯一键**（L-2）——loop 的「回复消息 ＋ 响应体」一次追加（L-3）与本节点的结算（撤除、对账、`settleReply`）都要落在它上面。
2. **运行的尝试行**（L-4）——带栅栏的锚点写与新尝试开始时的序号推进都在同一事务里锁它。
3. **锚点的唯一键**（L-6）——两个写入者对同一次调用的同一个发出序号各写一条「已出门」时，后者被拒。

**三条交错，逐条排除不算数的替身**：

| # | 交错 | 没有共同对象会怎样 | 三个替身为什么挡不住 | 共同对象怎样排序 |
|---|---|---|---|---|
| X-1 | 宿主停止：P-2 的撤除写 `interrupted{run_cancelled}`（`ResponseId` R） ‖ loop 同时把回复与它的响应体 R 一次写下 | 两条响应体、两笔账；日志里有一条回复消息，而它的响应体说「没有回复」 | **进程内锁**只在 P-2 实例里，loop 的追加不取它；**时间谓词**（「收场后 N 毫秒内以 loop 为准」）不参与冲突检测；**没落盘的「已结算」标记**在 loop 那边看不见 | L-2：后到者被拒。本节点那一支是空操作；loop 那一支整批不落（L-3），回复不成为消息——与契约 S-17 兜底一致（已交付的块在响应体的 `delivered` 里） |
| X-2 | 旧尝试里半死不活的协程写「已出门」D2 ‖ 新尝试推进序号并对账 | 对账没看到 D2 → 续接又发一个 D2：同号两条、两副协程各发一次 | **时间谓词**（「旧尝试超时即视为死」）挡不住一个恰好醒来的旧协程；**进程内锁**随 P-2 实例生灭，重跑后新旧实例互不相知 | L-4：锚点写在同一事务里锁定读尝试行。推进在前 ⇒ 旧写被拒 ⇒ 旧协程不出网、得 `unavailable`；写在前 ⇒ 对账看得到 D2，照契约 S-33 收它 |
| X-3 | 不属于任何运行的调用：旧 P-2 实例里一个撤除前已开始的 `dispatchAgain` 写「已出门」D2 ‖ 新实例在会话重新承载后对账并续接，同样写 D2 | 同 X-2，且没有尝试行可锁 | 同上；「停止中」标记只缩小窗口，检查与写之间仍可交错 | L-6：(会话, `callId`, 2) 唯一，后写的被拒、不出网 |

这三条在形式模型里**被吸收**（模型只有一次调用、一个原子的「写下」），所以它们的证据只能是真并发演练（[verification](verification.md#证据义务) 的 C-1～C-3）；**会话日志提供者不存在，演练受阻**。

`selectModel` 的判定与写入**不在同一提交**是契约 S-27 ④ 有意接受的窗口，不需要共同对象。

### 装配给 vs 协议给

契约 S-38 左列，本版单机怎样兑现（右列不在本版）：

| 契约 S-38 的保证 | 本节点单机的兑现 |
|---|---|
| 回复消息与它的响应体同一提交 | 本节点把带回复的响应体**交回、不写**（`reply_pending`）；loop 用 L-3 一次写下 |
| 追加按 `ResponseId` 幂等 | L-2；本节点的 `settle` 把唯一冲突当成「已有先到者」 |
| 「已开口」先于内容被看见 | 同进程：`await` 「已开口」追加确认之后才推给观察者；此前交出的快照不含内容 |
| 「已出门」先于出网 | 同进程：`await` 「已出门」追加确认之后才调 `send` |
| 在册状态变化之后按新状态准入 | 每次 `openCall`、`legalTargets` 都现读 `modelCatalogRead`，不缓存；**单进程装配由 P-1 直读同一份存储**；据点装配的 P-1r 受阻（新鲜度上界是契约 G-12） |
| 凭据值只在发出时出现；来源如实 | 进程内把值作为 `send` 的实参交给适配层；`origin` 取自绑定的有效模型引用，调用方交不进来 |
| 一次调用内各次发出用同一份档案快照 | 打开时绑定进调用对象；每条「已出门」带着它；续接从日志读 |
| 投影 = 从日志重算 | R-1～R-3：读时追到日志尾 |
| 同一次调用只有一个写入者、发号唯一 | 一个 P-2 实例一张在途表；跨实例、跨尝试由 L-4、L-6 挡 |
| 调用方身份已核实 | **归装配**：`modelRuntime` 是能力间内部面，据点装配（[apps/cli](../../../apps/cli/README.md)）的入口层核身份、会话打开时核归属；本节点不核实 |
| 结算写入不被尝试栅栏拒收 | L-4 的豁免：结算经 `sessionLog` 的不带栅栏追加写、带 `late` |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `capability.model-profile-directory/v1` S-16、S-17、S-20 | 必需 inject `modelCatalogRead`、`credentialLookup`：据点装配由 P-1r 提供（**受阻**，见那个节点），单进程开发与验收装配由 P-1 直接提供 | 每次准入现读；凭据每次发出现取 | 读不到 ⇒ `unavailable`；不回退到缓存或别的范围 |
| `capability.modality-projection/v1` S-6、S-15、S-16 | 包依赖，纯函数 | 随包版本 | — |
| `capability.stream-assembly/v1` S-16、S-18～S-23、S-28 | 包依赖 `packages/core/stream-assembly`（纯计算） | 每一次发出一份状态 | 装配器交回的失败值原样记进结构化日志 |
| `capability.asset-evaluation/v1` S-8、S-22、S-23 | 纯计算包依赖；**输入**取自会话装配清单（`assemblyManifest`，调用时取用；PF-004 的契约未起草、无提供者） | 每次现取 | 缺席或读不到 ⇒ `unavailable`；允许集合 `A` 另受契约 G-19 阻断 |
| 会话日志（块 D，无契约） | 必需 inject `sessionLog`；带栅栏的写走调用方随 `openCall` 交来的追加口 | 每次操作现读 | 读不到 ⇒ `unavailable`，不回退到在途表（契约 S-34 ⑧） |
| 数据契约（`data.model-profile`、`data.model-response`、`data.messages`、`data.content-blocks`、`data.call-accounts`、`data.loop-extension`、`data.tool-definition`、`data.arrival-events` v1） | 包依赖同批 core 纯模块 | 随包版本 | — |
| `data.identity-values/v1`、`data.offer-expiry/v1` | 包依赖 | 随包版本 | — |
| 存储（无契约，`storage`） | 必需 inject；要求 R-1～R-3 | 换代 ⇒ 重跑 | 不可用 ⇒ 从日志重算 |
| 时间源（`clock`） | 必需 inject | 装配启动时 provide | 缺席 ⇒ `PENDING` |

**被谁消费**：agent runtime（loop 那一程，尚无节点）、runner（调用时取用两个判定）、交付面的切换命令与停止按钮（经 [apps/cli](../../../apps/cli/README.md)）。

## 状态、并发与失败映射

**写权**全在 P-2；P-5 没有写。**提交点**逐操作：`openCall` 只在检查不过时写调用终结；`dispatch`／`dispatchAgain` 是「已出门」；首 token 是「已开口」；收场是响应体（本节点写）或交回（调用方写）；`interrupt` 是中断意图；`releaseCall` 是调用终结；`settleReply` 是带处置的响应体；`reconcile` 每一行各自一次；`selectModel` 是切换事实。

**不加进程内锁作为正确性机制**：在途表与调用对象上的标记只让同一实例里的重复路径少走一步；两个写入者之间的次序全部落在 L-2、L-4、L-6 上。理由同 tenancy 各节点：锁的实例随插件实例生灭，重跑后新旧实例互不相知。

**失败映射**：日志或存储 `StorageUnavailable` ⇒ `unavailable`；L-2 冲突 ⇒ 空操作；L-6 冲突 ⇒ 这一次不出网、`unavailable`，调用停在原状态；L-4 拒收（带栅栏的写）⇒ `unavailable`，不出网；传输错误按契约 S-18 分类；凭据取不到按契约 S-19、S-29 ⑧；缓存行形状不对 ⇒ 作废重算、记 error 日志；存储里读出的日志记录形状不对 ⇒ 缺陷，上抛。没有 catch-all。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（P-2：传输、成因表、脱敏三参数；P-5：退避） | 内核在插件体之前校验（kernel-basis `definePlugin`） | 不过 ⇒ `FAILED`、不 provide、装配启动失败（basis `plugin-throw-fails-fiber`） | — |
| P-2 的一个 effect：传输适配与连接池、在途表 | P-2 fiber；插件体里建，建成之后才 `provide` | 适配层构造抛出 ⇒ 插件体抛出 ⇒ `FAILED`，没有半个服务 | 撤除函数按序：置「停止中」→ 逐个结算在途调用（中止 → 在途的流 `abandon` → `interrupted{run_cancelled}` 或调用终结 → 释放）→ 关连接池。撤除函数里的异常只进日志（basis `effect-disposal-concurrent-not-ordered`），所以每一步自己记 error 级结构化日志；写不进的结算留给对账。**保留**：日志里的六种记录——没有一条正确性依赖在途表（契约 S-39） |
| `ctx.provide('modelRuntime')` | P-2 fiber；`ACTIVE` 后可解析 | provide 由 effect 纳管（kernel-basis probe `provide-is-effect-managed`，未升格为 basis 条目） | 服务消失，消费者重跑或 `PENDING`；已开始的方法调用**跑完**，靠「停止中」标记在下一个提交步骤前停下 |
| 每次调用在宿主上的 effect（含两个计时器、装配状态、中止句柄） | 宿主（agent runtime）fiber；`openCall` 通过检查时登记 | 登记本身失败 ⇒ `openCall` `unavailable`，调用不打开 | 宿主撤除 ⇒ 契约 S-36 的结算；正常收场 ⇒ 提前撤除（依赖 H-1）；已在 `reply_pending` 的那一次流已收尾、不再 `abandon`，只写没有回复的 `interrupted{run_cancelled}` |
| P-5 向 runner 登记系统自带实现 | P-5 fiber；拿回注销函数包进 `ctx.effect`（草图「贡献的统一形状」） | 同名已登记 ⇒ runner 拒绝 ⇒ P-5 插件体抛出 ⇒ `FAILED` | 注销；**正在求值的那一次跑完**，runner 按契约 runner S-34 把「实现在求值中途被撤下」记成报错；之后 runner 由指定挂件顶上 |

**没有定时器承担正确性**：退避计时归 loop（契约 S-30 ④ 「本能力不替它计时」）；每次发出的两个时限计时器随调用 effect 清。

## 实施缺口与消费者影响

契约自己的 G-n 不在此重抄；下面是本节点的缺口。

| # | 缺口 | owner | 受阻的消费者 | 闭合条件 |
|---|---|---|---|---|
| MRR-N1 | **会话日志的提供者没有契约、没有节点**：L-1～L-8 全落在它上面；三条交错的共同对象（L-2、L-4、L-6）没有家 | 主线 → 块 D（loop 那一程） | 全部十三个操作；三条真并发演练 | 会话日志契约写出 L-1～L-8（或等价条款），并有提供者节点互指 |
| MRR-N2 | **凭据保管方没有契约、没有提供者**：取值问法恒 `unavailable` ⇒ 每一次发出 `unavailable` | 主线（见 [model-profile-directory 的 MPD-N1](../model-profile-directory/design.md#实施缺口与消费者影响)） | `dispatch`、`dispatchAgain` | 保管方有契约与提供者 |
| MRR-N3 | **装配清单读面（`assemblyManifest`）没有契约、没有提供者**：选中模型初值、层锁、两个时限都取不到 | PF-004 的契约 owner（与 runner 节点同一缺口） | 读三个、`openCall`、`selectModel`、`dispatch` | PF-004 契约起草、给出读面；允许集合另待契约 G-19 |
| MRR-N4 | **传输 fork 包没有节点**：上游精确版本、托管、许可、补丁对 0.86.x 重生成、状态码从注入的 `fetch` 取的做法 | 主线 → 提供者设计（D-019 的实施义务） | 全部发出 | fork 节点立起，D-019 比较门逐项有测试 |
| MRR-N5 | **假设 H-1**（effect 提前撤除）无 probe；H-2 不依赖 | `packages/core/kernel-basis` | 一次调用的 effect 写法 | probe 在 4.0.4 上立起；不成立时改子作用域写法 |
| MRR-N6 | **会话出站流（观察者端口）没有契约** | 主线 → 块 D | 契约 S-51 第 8、9 条的兑现 | 出站流契约给出端口形状与按会话路由 |
| MRR-N7 | 「已开口」在首 token 热路径上多一次耐久写，**延迟未测量** | 本节点 | 无（不改设计） | 有实现后按验收装配测一次，记入 verification |
| MRR-N8 | 原始响应留存受阻于附件存储未定义（`data.content-blocks` 的 G-1） | 那份契约的 owner | 原始响应留存这一支（不挡响应体） | 附件存储有定义 |
| MRR-N9 | **据点装配要装 `storage` 与 `clock`**；若会话日志条目壳自带时间点，`clock` 这条边可去 | [apps/cli](../../../apps/cli/README.md)（装配）；块 D | P-2 启动 | 装配节点写明；块 D 契约定时间点的来源 |

**与草图的差异不改契约**：「P-2 不 inject 会话日志服务」只写在草图里，契约没有这一条；本节点改为必需 inject（[理由](#与装配草图不同的三处)）。若 loop 契约起草时把会话级写入也做成调用方交口，本节点可退回草图。
