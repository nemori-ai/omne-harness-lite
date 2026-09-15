---
kind: decision
id: D-015
status: accepted
scope: 工具调用的完整生命周期（五维状态机、等待登记簿、控制与级联、前台上限、内建人类请求工具、帧事实侧、Schema 维度）、单一消息模型与出站流（信封、游标、补齐、瞬态帧协议）、外部命令式 hooks 兼容层，以及它们要求的 session / run / run-driver / tools / human-decisions / model-execution / durable-records / media-content / core-work 数据 / 生命周期组合的下一版契约与两个新契约
date: 2026-09-15
sources:
  - ../proposals/tool-execution/README.md
  - ../proposals/message-stream/README.md
  - ../proposals/hooks-compat/README.md
  - ../research/agent-loop-events-and-hooks/README.md
  - ../research/client-message-stream/README.md
acceptance: ../proposals/tool-execution/README.md#接受记录
supersedes:
  - id: D-008
    scope: capability.tools v1、capability.human-decisions v1、capability.model-execution v1、capability.durable-records v1、capability.media-content v1 与 data.core-work v1 作为新设计依赖的身份；未改动条款的语义在各自 v2 内原文延续，D-008 的其余契约（action-authorization、budget-accounting、tenant-governance、command-input、engineering-observation）与共同准入选择不变
  - id: D-014
    scope: capability.session v1、capability.run v1、composition.session-run-agent-lifecycles v1 与 capability.run-driver v2 作为新设计依赖的身份；三台状态机各落各目录、三形状级联、事实即事件、三个独立插件的选择不变，CC v2 不变
change_basis:
  observation: 用户 2026-09-14～15 的裁决 U-38～U-59（工具调用要有自己的完整状态机与前台上限转后台；Agent 向人提问的答复是该工具的返回值；Run 与工具生命周期错位、工具状态耐久；Run 应有明确的等待状态且由需要它等的对象自己登记；等待期间自动消费排队文本；帧缺省耐久；兼容 Claude Code / Codex 命令式 hooks；客户端只认一个消息模型），以及三轮独立架构复核指出的反例：tools v1 没有从提议到结算的完整转移与级联归属，SE-14 的 A / B 列依赖一个只在模型注释里存在的等待位置集合，被越过的 Run 停在非终态永久阻止归档，占位与提醒词表在两份提案里各写一份，stopping 的晚到结算会被判成新 Run 的触发
  causal_explanation: 这些裁决与反例使 D-008 / D-014 冻结版本的三处前提在本范围内不再成立——调用状态由驱动器视图推导而不是自有权威、Run 的等待由三处推导而不是一份登记簿、interrupted 是被越过 Run 的终点；因此 tools、run、session、run-driver 必须发下一版把登记簿、superseded 终态、五维调用状态机、Step 收束与合批规则写成条款，CD / DR / CT / HD / MC / LC 随之补齐它们各自拥有的形状与顺序，消息流与 hooks 兼容层作为新能力发布首版
  reproduction: ../proposals/tool-execution/review.md
  verification: ../../spec/capabilities/tools/verification.md
---

# D-015：工具执行闭环、消息流与外部 hooks 兼容

接受[工具执行提案](../proposals/tool-execution/README.md)、[消息流提案](../proposals/message-stream/README.md)
与 [hooks 兼容提案](../proposals/hooks-compat/README.md)经三轮独立复核后的正文。精确对象为一批
同时发布的契约：

| 身份 | 版本 | 性质 |
|---|---|---|
| [data.core-work](../../spec/data/core-work/v2/contract.md) | v2 | 兼容扩展加三处语义变化：内容块（`reasoning`、`system_reminder`、`deferred_receipt`、`tool_call.validation`、嵌套 `tool_result.value`）与命令声明（前台上限、启动模式、并发、停止能力、媒体、帧、结果形状）；语义变化为 `deferred_receipt` 的六值 reason、删除 `BackgroundDeclaration.automatic`、`Command.cancellation` 改为 `stop{capability}` |
| [capability.durable-records](../../spec/capabilities/durable-records/v2/contract.md) | v2 | 兼容扩展：批内记录顺序是 envelope 的一部分、重放稳定、记录 `eventId` 的定义 |
| [capability.media-content](../../spec/capabilities/media-content/v2/contract.md) | v2 | 兼容扩展：引用记录产生它的调用与 attempt |
| [capability.tools](../../spec/capabilities/tools/v2/contract.md) | v2 | 语义变化：五维调用状态机与转移、封闭停止词表、前台上限与自动转后台、单调用强停、内建 `human` 工具、帧缺省耐久 |
| [capability.human-decisions](../../spec/capabilities/human-decisions/v2/contract.md) | v2 | 语义变化：HD 作为 `human` 工具的执行 owner、答复按登记簿路由、程序化作答者、请求作为投影贡献 |
| [capability.run](../../spec/capabilities/run/v2/contract.md) | v2 | 语义变化：等待登记簿、`waiting` 与 `waitingFor` 投影、`superseded` 终态、unknown 计入收口、控制结果与隔离记录 |
| [capability.session](../../spec/capabilities/session/v2/contract.md) | v2 | 语义变化：SE-14 A / B 列按登记簿、`system` 与 `hook_continuation` 来源、取入既有 Run、守卫关闭词、历史派生表与 `asOf`、`frames(S)`、快照贡献 |
| [capability.model-execution](../../spec/capabilities/model-execution/v2/contract.md) | v2 | 兼容扩展与语义变化：interrupt 与强停并入同一 attempt 接纳账本（MC-04，语义变化）、attempt 记录的 `purpose` 与缺失块、`system_reminder` 投影、瞬态帧与 `pub{gen, n}`、读面 `attempts` |
| [capability.run-driver](../../spec/capabilities/run-driver/v3/contract.md) | v3 | 语义变化：切点来源、Step 收束与合批规则、占位与迟到结果、`invalid_proposal`、唤醒集合含队首文本、Yield 按登记簿、受理后守卫、扩展点站点词表（S0～S9 与旁路，进程内插件与外部 hooks 共用） |
| [composition.session-run-agent-lifecycles](../../spec/compositions/session-run-agent-lifecycles/v2/contract.md) | v2 | 语义变化：LC-04 加 `superseded` 终态行与 force_stop 受理即整簿注销 |
| [capability.message-stream](../../spec/capabilities/message-stream/v1/contract.md) | v1（新） | 出站流：帧信封与词表、一 Session 一条流、客户端游标、重连补齐与全量重取、作用域与投递、瞬态帧协议 |
| [capability.external-hooks](../../spec/capabilities/external-hooks/v1/contract.md) | v1（新） | 命令式 hooks 兼容层：站点与权力上界、S1 守卫协议、两家事件映射与降级表、`Stop` 续跑刹车、观察与信任 |

被取代的版本（tools v1、human-decisions v1、model-execution v1、durable-records v1、media-content v1、
core-work v1、session v1、run v1、生命周期组合 v1、run-driver v2）保持冻结与可引用，标为 superseded；
未迁移的消费者继续按旧版。

## 选择

- **Run 在等谁只有一份权威。** 需要 Run 等它的对象自己在 Run 上登记：本 Run 提议的调用（含等审批、
  等人的）在提议时登记，它进入的门在等待时登记；人类请求附属于调用，不独立登记。注销恰与释放它的
  事实同批。Run 处于 `waiting` 当且仅当 Step 已收束且登记簿非空；入站裁决查表，控制级联只有
  "保留"与"整簿注销"两种。调用上的前后台关系是登记簿的投影。
- **被越过的 Run 有终点。** interrupt_then_run 让旧 Run 进终态 `superseded`，同批整簿注销、未消费的
  接续改判为上下文、被保留的工作清单作为系统来源的上下文到达，由下一个有模型 Step 的 Run 消费一次。
- **调用有自己的五维状态机。** 进展、attempt 账本、等待关系、控制、结算交付各有 owner 与流；停止的
  物理事实是封闭三轴词表；`unknown` 计入两种收口、长期可见而不冒充隔离；单调用强停只对声明
  `forced_isolation` 的 owner 存在，首版 owner 是 `cooperative_fence`。
- **答复是工具的返回值。** Agent 向人提问与请求批准是内建 `human` 工具的两条命令，HD 是执行 owner，
  答复在同一提交结算调用；Agent 发起的批准是提示词不是系统机制。
- **Step 在提议登记后就收束。** "结果一起回"是开下一 Step 的合批规则，不是 Run 状态；每个 tool_use
  在切点恰得一个块；迟到结果以 `system_reminder` 引用已耐久的结果，词表只有一份。
- **客户端只认一个消息模型。** 消息按 `(seq, index, ordinal)` 定位，全量重取取自 projection 的一个
  水位，请求与调用的可见范围由 HD 与 tools 注册的贡献在同一水位裁剪；出站流不改事实、不持久化、
  不做准入；瞬态帧不入游标，重连以基线取代，`pub` 绑定提供者实例。
- **命令式 hooks 是扩展点的适配器。** 只能收紧、选择投影、注入下一 Step 的上下文、入队 trigger、
  有资格地代答；上游允许而这里不允许的效果逐项降级可查；`Stop` 续跑走 trigger 并有刹车。
- **不设 Run 级执行预算、不设系统级停止超时、不设"收口中"状态。** 前台上限由工具声明，有效阈值是
  声明与系统上限的较小者；owner 的有界等待到期即报 unknown。

用户裁决 U-38～U-59 与作者裁决 a～x、0～20、R1～R22 记录在三份提案的入口；作者裁决按用户确立的
工作风格自定，用户可另行否决。

## 理由与边界

三份提案共同触及的是同一个事实：驱动器、Session、工具、人类决定各自看到调用的一个侧面，而没有
一处权威把"谁在等谁、等到什么时候、等不到怎么办"写成条款。登记簿把三条推导规则合成一个对象，
`superseded` 让越过有终点，五维状态机让每个转移有 owner 与提交面，单一消息模型让客户端不必
猜事实。代价是十个契约同时发下一版；选择一次发版而不是逐个，是因为占位词表、提醒种类、等待
登记的事实名与 SE-14 的判据在这些契约之间互相引用，分批会留下半新半旧的窗口。

证据是有限范围的：[调用生命周期模型](../../spec/capabilities/tools/verification.md)（安全配置
49.5 万不同状态、进展配置与否定变体）、[游标模型](../../spec/capabilities/message-stream/verification.md)
（安全、进展与三个否定变体）、生命周期组合与驱动器模型按各自验证页说明的覆盖与回退；模型都不
覆盖跨协调域、门、受理未裁决窗口、多 Run 并存、正文安装与授权变化。本决定接受目标设计与这些
有限工件，不接受实现已完成：tools、local-execution、session、projection、human-decisions、run 的
提供者设计要按新版本重写，message-stream、hooks-compat 与 model-execution 的提供者设计尚未写，
Run / Session / run-driver 三个新包的实施在这些设计之后。三份提案"未决项"里未划去的各条
（跨协调域交接、PF-004 子 Session 与派发、PF-015 制品、传输参数、模型族投影细则、客户端持久化）
是接受时明确保留的未完成义务。

需求消费基线固定为 `eda8e3b`（保留引用
`refs/tags/requirements-baseline/2026-09-15-tool-execution-message-stream-hooks`）：在 D-012 基线之上
新增 PF-025，修订 PF-005.C10（U-47）、PF-013.C5（等待期间自动消费排队文本）与 PF-009 C1 / C2 / C7；
确认条款与覆盖归三份提案的消费记录
（[工具执行](../proposals/tool-execution/requirements.md)、[消息流](../proposals/message-stream/requirements.md)、
[hooks](../proposals/hooks-compat/requirements.md)）。
