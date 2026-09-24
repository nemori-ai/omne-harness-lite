# capability.stream-assembly v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.stream-assembly, 1)`——
  `family = capabilities`、`topic = stream-assembly`、规范路径 `spec/capabilities/stream-assembly/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-009 rev 8、PF-006 rev 19、PF-013 rev 12** 为准（2026-09-24 逐版复核，见[验证入口「变化的影响」](../verification.md#变化的影响)）
- **精确语义依赖**：

  | 坐标 | 消费 clauses | 取它的什么 |
  |---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.arrival-events · v1` | [`S-4`](../../../data/arrival-events/v1/contract.md#s-4-到达事件不是记录条目)、[`S-5`](../../../data/arrival-events/v1/contract.md#s-5-信封与目标)、[`S-6`](../../../data/arrival-events/v1/contract.md#s-6-六种事件)、[`S-7`](../../../data/arrival-events/v1/contract.md#s-7-块索引)、[`S-8`](../../../data/arrival-events/v1/contract.md#s-8-开块)、[`S-9`](../../../data/arrival-events/v1/contract.md#s-9-块头)、[`S-11`](../../../data/arrival-events/v1/contract.md#s-11-填追加片段)、[`S-12`](../../../data/arrival-events/v1/contract.md#s-12-填整体替换)、[`S-13`](../../../data/arrival-events/v1/contract.md#s-13-封口)、[`S-14`](../../../data/arrival-events/v1/contract.md#s-14-砍)、[`S-15`](../../../data/arrival-events/v1/contract.md#s-15-记账)、[`S-16`](../../../data/arrival-events/v1/contract.md#s-16-收尾)、[`S-17`](../../../data/arrival-events/v1/contract.md#s-17-一条流的形状)、[`S-18`](../../../data/arrival-events/v1/contract.md#s-18-块的一生)、[`S-19`](../../../data/arrival-events/v1/contract.md#s-19-归约一块此刻是什么)、[`S-20`](../../../data/arrival-events/v1/contract.md#s-20-封口块等于归约)、[`S-21`](../../../data/arrival-events/v1/contract.md#s-21-第一个内容步骤)、[`S-22`](../../../data/arrival-events/v1/contract.md#s-22-节流只动填合并不改结果砍了要说)、[`S-23`](../../../data/arrival-events/v1/contract.md#s-23-执行帧的另外四条)、[`S-24`](../../../data/arrival-events/v1/contract.md#s-24-违反语法由消费一方判定并命名)、[`S-28`](../../../data/arrival-events/v1/contract.md#s-28-表示层拒绝值)、[`S-29`](../../../data/arrival-events/v1/contract.md#s-29-表示层拒绝不是判定也不修补) | 本能力吃的就是这套语法：事件没有身份（所以位置由接受一侧数，跨进程要协议自带序号）、目标的两种、六种事件的含义、次序规则、归约、「以封口块为准」的前提、首个内容步骤、节流与砍、帧的四条、表示层拒绝值的名字与次序 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | [`S-6`](../../../data/content-blocks/v1/contract.md#s-6-模态由媒体类型判定)、[`S-10`](../../../data/content-blocks/v1/contract.md#s-10-语音块与图块)、[`S-12`](../../../data/content-blocks/v1/contract.md#s-12-完整的工具调用)、[`S-13`](../../../data/content-blocks/v1/contract.md#s-13-半截的工具调用)、[`S-26`](../../../data/content-blocks/v1/contract.md#s-26-表示层拒绝值) | 交出的块是它的块：完整与半截的工具调用两种形状、「唯一解析点在到达装配」、半截调用两位皆假、内联语音的形状、块头模态的判定、嵌着的块不合形状时的拒绝值 |
  | `omne-harness-lite-design-2026-09-15 · data.call-accounts · v1` | [`S-4`](../../../data/call-accounts/v1/contract.md#s-4-未知是一个值不是零也不是缺席)、[`S-11`](../../../data/call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)、[`S-15`](../../../data/call-accounts/v1/contract.md#s-15-trimreason-与-trimsummary砍了要说)、[`S-19`](../../../data/call-accounts/v1/contract.md#s-19-每条到达流恰一份账两次发出两份)、[`S-20`](../../../data/call-accounts/v1/contract.md#s-20-缺账或被拒收记未知不伪造)、[`S-21`](../../../data/call-accounts/v1/contract.md#s-21-账进日志不进给模型看的上下文)、[`S-27`](../../../data/call-accounts/v1/contract.md#s-27-表示层拒绝值闭合) | 交出的账：「未知」的写法、`frames` 的形状、`TrimSummary` 的成员与三条等式、「恰一份」、缺账记全未知、账不进任何块、嵌着的账不合形状时的拒绝值 |

  **不依赖任何 capability 或 composition 契约。**`data.messages` v1 **不是依赖**：本能力不产出消息（[S-3](#s-3-本契约不拥有什么)），
  正文提到它的四个名字 `AssistantMessage`、`ToolInternalMessage`、`AssistantEnding`、`ToolInternalEnding` 与 `data.messages/v1#S-14` 那张收尾对应表，只为指明**宿主把结果包到哪里、结局怎样对**。
  `capability.tool-execution-runtime` v1 同样只被指路（工具侧的宿主在那里逐条承诺 [S-28](#s-28-宿主要兑现的前提)，解析不了的调用在那里收场），不是依赖：依赖方向是它 → 本契约。`capability.model-request-runtime` v1 同理（模型侧的宿主在 `capability.model-request-runtime/v1#S-51` 逐条承诺）。
  `data.loop-extension` v1 的 `FailureCause` 也不是依赖：本能力把收尾里的 `error` 原样交出，不读它。
- **本能力不发布 Schema**：线上形状归组合契约（[`spec/README.md`](../../../README.md)）。操作的输入输出以散文定含义，值类型引三份 data 契约的 `$defs` 名。
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `capability.stream-assembly/v1#S-10`。
  本文引另一份契约的条款一律带坐标，**裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 一条消息分次到达；封口交出完整的块；一条流必须有结局；账只记一次 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) | S-1、S-9、S-13、S-21 |
| 组装出来的必须与一次性拿到的一模一样 | [§5.5](../../../../product/PF-009-context-message-types/design.md#组装出来的必须与一次性拿到的一模一样) · [§6.8](../../../../product/PF-009-context-message-types/design.md#68-组装的结果与一次性拿到的必须相同) | S-27 |
| 流断在半路的五种收场；半截的调用记下来、不给模型看 | [§5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) | S-8、S-9、S-28 |
| 参数收齐了才算数，只解析一次，残缺的不解析 | [§5.6 工具调用的参数](../../../../product/PF-009-context-message-types/design.md#工具调用的参数收齐了才算数) · [§6.10](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行) | S-10、S-11、S-12 |
| 参数说完了却解析不了：不执行，结果记失败回给 agent（那一半归执行一侧） | [PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#参数说完了却解析不了的调用不执行以失败回给-agent) | S-11 |
| 用户看见了的，日志里必须有 | [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | S-7、S-9 |
| 砍了要说；帧多了要节流 | [§6.16](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢) · [§5.8 节流](../../../../product/PF-009-context-message-types/design.md#帧多了要节流规则就是-616-那一条) | S-12、S-14、S-15 |
| 执行帧就是那条消息的到达增量；大部分工具一帧不发 | [§5.8](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量) · [大部分工具不发这个](../../../../product/PF-009-context-message-types/design.md#大部分工具不发这个而那是正常形态) | S-13、S-37 |
| 发帧不能把工具本身搞失败 | [§6.17](../../../../product/PF-009-context-message-types/design.md#617-发帧发不出去不影响这次工具执行) | S-26 |
| 不留到达的过程；拼到一半的那份是在途状态，由运行时持有、不是日志、不是消息，运行时失去连续性它就没了 | [§9.2](../../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程) · [在途状态](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) | S-4、S-7、S-29 |
| 首 token 指交出的第一样内容，不论模态 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) | S-16 |
| 两次发出是两条流；停了看首 token | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) | S-29 |
| 工具执行停了就不重来 | [PF-006 §6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来) | S-22、S-29 |
| 到达装配自写，是三层的第三层（落 core、纯计算）；唯一的解析点在到达装配这一步 | [D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) 选择表第三行、保留前提 1 | S-1、S-4、S-10、S-17～S-22 |
| 拼到一半的那份由运行时持有、不落日志——本能力只算，状态由宿主持有 | [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) Q18 | S-4、S-29 第二行 |
| 宿主因所依赖的服务换了提供者而重建时，它手里的值随之丢失 | [basis：必需服务换提供者会使插件体重跑](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | S-29 第二行 |
| 规格形式；部署边界 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-23～S-26、S-29 |
| 统一语言正式名 | [到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly) · [在途状态](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival) · [增量到达](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival) · [执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) · [一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) · [工具执行](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) · [调用账目](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account) · [消息](../../../../ubiquitous_language/terms/record-and-context.md#ul-message--消息--message) | 全部 |

**没有产品行的条款，依据各落在哪**（产品负责人尚未逐条追认的主线裁定汇编在 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md)）：

| 条款 | 依据 |
|---|---|
| [S-4](#s-4-装配状态是调用方持有的一个值)、[S-17](#s-17-每个操作写全九件事)～[S-22](#s-22-abandon放弃)：五个作用于调用方持有的状态值的纯操作；路由归宿主；收尾不产出消息 | D-035 选择表第三行（落 core、纯计算）与 D-038 Q18（在途状态由运行时持有），见上表 |
| [S-7](#s-7-快照交出什么)：快照含开着的块已到的片段、不带砍的汇总 | [PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)（rev 8） |
| [S-15](#s-15-节流在到达装配之前投递一侧的节流不进账)：节流分发出一侧与投递一侧，只有前者进账 | `data.arrival-events/v1#S-22` |
| [S-16](#s-16-首个内容的位置)：首个内容排除空载荷、零次填充就封口的块也算开口 | `data.arrival-events/v1#S-21` |
| [S-12](#s-12-被砍过内容的调用落成半截)、[S-13](#s-13-账) 的 `frames.emitted` 算式、[S-16](#s-16-首个内容的位置) 的位置进快照与结局、[S-22](#s-22-abandon放弃) 放弃也交出账、[S-23](#s-23-本能力自己的失败值) 的 `stream_not_finished` | 主线裁定，见 [D-040 §S4 S4-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s4arrival-events--stream-assembly报回的) |
| [S-14](#s-14-砍的汇总) 的去重规则：每一帧至多计一次「未原样送达」，归本能力 | 主线裁定，见 [D-040 §S4 S4-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s4arrival-events--stream-assembly报回的)（每帧至多计一次）与 [§五 K28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（归本能力）；`data.call-accounts/v1#S-15` 把它指派给本能力 |
| [S-2](#s-2-消费者)、[S-28](#s-28-宿主要兑现的前提) 第 7 条：`ToolInternalMessage` 只在交出的 `blocks` 非空时有，结局按 `data.messages/v1#S-14` 的对应表 | 主线裁定，见 [D-040 §五 K2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-11](#s-11-参数收齐却解析不了只标记)、[S-28](#s-28-宿主要兑现的前提) 第 5 条：解析不了的调用由工具执行运行时收场；工具侧宿主逐条承诺前提 | 主线裁定，见 [D-040 §五 K24、K23](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
| [S-28](#s-28-宿主要兑现的前提)：模型侧宿主逐条承诺第 1、2、4、6、7、8、9 条（原 G-2 闭合） | 主线裁定，见 [D-040 §六 L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)；承诺落在 `capability.model-request-runtime/v1#S-51` |

## 一、含义与使用范围

### S-1 本契约拥有什么

**[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)**：按 [`data.arrival-events` v1](../../../data/arrival-events/v1/contract.md) 的到达语法，把**一条**[分次到达](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival)的流拼起来——

- 一份**装配状态**怎样随每个被接受的事件前进，哪些事件不被接受、失败值叫什么；
- 块在状态里、在快照里、在收尾时各是什么——**唯一的参数解析点**就在这里（[D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) 保留前提 1）；
- 收尾时交出哪些块、一份什么账、这条流怎么结束的；
- 「一次[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)等于一次性到达」这条可判定的性质（[S-27](#s-27-一次到达装配等于一次性到达)）。

**它是纯计算**（D-035：三层落 core、自写）：五个操作都作用于**调用方持有**的状态值，
不持有任何一条流、不按目标查表、不计时、不写日志、不发请求、不执行工具、不通知任何人。
同样的输入永远得到同样的输出。

**本能力就是做到达装配的那一方**——词条弃用了「装配器」「流装配器」的说法（与 Agent 装配字面相撞），本文不用。
**装配状态**（无词条）是规格层的名字，读作「一条流的到达装配此刻做到了哪里」，不是统一语言词条；它装着的，是[在途状态](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)那份「拼到一半的」。

### S-2 消费者

| 消费者 | 消费什么 |
|---|---|
| `capability.model-request-runtime` v1（candidate） | 模型侧：每次发出一份状态；交出的块、账、结局，由它包成 `AssistantMessage`（结局写在 `AssistantEnding`）或不成消息，账落进那次发出的 `data.model-response`；首个内容的位置，是它判「开没开口」的观测点 |
| `capability.tool-execution-runtime` v1（candidate） | 工具侧：每次执行至多一份状态；收尾交出的 `blocks` **非空**时由它包成一条 `ToolInternalMessage`，结局按 `data.messages/v1#S-14` 那张对应表由收尾原因取；`blocks` 为空（一帧没发，或发过的块都没交出内容）就不落这条消息；`frames` 落进那次执行的 `ToolCallAccount` |
| 会话出站流与中途重进的观察者（经宿主；出站流的契约未建立） | [S-20](#s-20-snapshot读快照) 的快照与位置：先拿快照，再从那个位置之后接着收事件 |

**这三方都是调用方，没有一方是本能力的提供者**；两个宿主要兑现的前提列在 [S-28](#s-28-宿主要兑现的前提)——工具侧已在 `capability.tool-execution-runtime/v1#S-62` 逐条承诺，模型侧已在 `capability.model-request-runtime/v1#S-51` 逐条承诺（原 G-2 闭合）。

### S-3 本契约不拥有什么

- **语法与形状**：事件长什么样、单个事件的表示层拒绝值叫什么，归 `data.arrival-events` v1；块归 `data.content-blocks` v1；账与砍的汇总的形状归 `data.call-accounts` v1。**本契约引它们的名字，不复述定义。**
- **路由与持有**：哪份状态对应哪个目标、事件交给哪份状态、状态放在哪、活多久，归**宿主**（模型请求运行时、工具执行运行时）。本能力不知道别的流存在。
- **消息**：交出的块包成 `AssistantMessage` 还是 `ToolInternalMessage`、`ending` 取哪一格、成不成一条消息——[PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) 那张表——归宿主与 `data.messages` v1。本能力交出做这个决定要的全部事实（[S-8](#s-8-收尾结算交出什么)），**不做这个决定**。
- **落盘与记账**：把消息与账写进[会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)、写几次，归日志的写入方与承载账的记录一侧（`data.call-accounts/v1#S-19`）。
- **节流**：合并、截短、限额、拒收由做节流的那一方做；本能力只汇总它说出来的 `trim`（[S-15](#s-15-节流在到达装配之前投递一侧的节流不进账)）。
- **时刻**：本能力没有时钟。首个内容**是第几个事件**归本能力，**那一刻是什么时刻**归宿主（[S-16](#s-16-首个内容的位置)）。
- **拒绝与解析失败的后果**：被拒的事件怎么说，归宿主（[S-26](#s-26-被拒不改状态后果归宿主)）；解析不了的调用怎么回给模型，归工具执行运行时（[S-11](#s-11-参数收齐却解析不了只标记)）。

**适用范围**：一个部署之内的一条条流。本版单机交付，领域语义跨进程后必须原样成立；哪些由部署装配给、跨进程后要由协议兑现，见 [S-29](#s-29-部署装配给与协议给)。

## 二、装配状态与它交出的值

### 规格层 token 与词条的对应

| 规格层 token | 词条 |
|---|---|
| 本能力这件事 | [到达装配 · Arrival Assembly](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly) |
| 一份装配状态里已经拼起来的内容 | [在途状态 · In-Flight Arrival](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)——快照交出的就是词条列举的那三样（[S-7](#s-7-快照交出什么)） |
| `target.kind = "tool_execution"` 的流上的 `open`、`fill`、`close` | [执行帧 · Execution Frame](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) |
| 收尾时交出的账 | [调用账目 · Call Account](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account) 的一部分：模型侧是那次发出的用量与费用，工具侧是 `frames` 那一项 |

**下列是规格层的名字，不是词条（无词条）**：装配状态、位置（`position`）、首个内容的位置（`firstContentAt`）、结局（`ending`）、五个操作名、[S-23](#s-23-本能力自己的失败值) 的失败值。

### S-4 装配状态是调用方持有的一个值

**一份装配状态——一条流的[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)此刻做到了哪里——对应恰一条流（一个目标）**，由 [`start`](#s-18-start开一份状态) 交出，由 [`accept`](#s-19-accept接一个事件) 交出下一份。

- **它是值，不是对象**：`accept` 交出一份新的状态，**交进去的那份不变**。调用方拿着哪一份，哪一份就是这条流此刻的样子；
  同一份状态交给 `accept` 两次、各接一个不同的事件，会得到**两份分叉的状态**——只留一份、按次序接，是宿主的事（[S-29](#s-29-部署装配给与协议给) 第一行）。
- **它的内容由它接受过的事件唯一确定**：两份状态接受过同一串事件，在 `snapshot` 与 `closeOut` 上不可区分。**本契约不规定它的内部表示**，只规定这两个读法交出什么。
- **它不带会话、不带租户**：一份状态只在持有它的那个宿主、那个会话里有意义（[S-29](#s-29-部署装配给与协议给) 第三行）。
- **它不进会话日志，也不是消息**（[PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)）；收尾交出结果之后，它**不再有用**。

### S-5 位置

**一份状态的位置，是它已经接受的事件个数**：`start` 交出的状态位置为 `0`，每接受一个事件加一；**被拒的事件不计**（[S-26](#s-26-被拒不改状态后果归宿主)）。

- 位置只在这一条流里有意义，**不是事件的编号**：到达事件本身不带编号（`data.arrival-events/v1#S-4`），位置是接受这一侧数出来的。
- 快照带着它（[S-7](#s-7-快照交出什么)）：观察者拿到位置为 `n` 的快照之后，**从第 `n + 1` 个被接受的事件接着收**。两边数的是同一串事件，这是宿主要兑现的前提（[S-28](#s-28-宿主要兑现的前提)）。

### S-6 一块在状态里是什么

对这条流里每一个被接受过 `open` 的块索引，状态里有：

| 项 | 是什么 |
|---|---|
| 开块时说定的 | `kind`、`fill`、`id`、`visibility`、`head`（`data.arrival-events/v1#S-8`、`#S-9`） |
| 此刻的归约 | 它收到的全部填按填法归约（`data.arrival-events/v1#S-19`）：追加是相接，替换取最后一次；**没收到过填就没有归约** |
| 封没封口 | 至多封一次 |
| 封口时定下的那一块 | 封了口才有：除工具调用外是封口交出的那一块；工具调用是 [S-10](#s-10-工具调用在封口那一下解析且只解析这一次)～[S-12](#s-12-被砍过内容的调用落成半截) 在封口那一下定下的那一块 |

**块在状态里的次序就是开块的次序**，也就是索引从小到大；封口的次序不改变它（`data.arrival-events/v1#S-7`）。

### S-7 快照交出什么

**`snapshot` 交出 `{ blocks, position, firstContentAt? }`：这条流到此为止已到达的全部内容，按开块次序。**

| 这一块此刻 | 快照里的一项 |
|---|---|
| 已封口 | `{ index, closed: true, block }`：`block` 是封口时定下的那一块（[S-6](#s-6-一块在状态里是什么)） |
| 开着、收到过填 | `{ index, closed: false, opened, content }`：`opened` 是开块时说定的那几样；`content` 是**此刻的归约**——文本、思考与调用参数给文本，语音给字节（标准 base64），整交的三类给那一整块 |
| 开着、没收到过填 | `{ index, closed: false, opened }`：没有 `content`。**开了口还没交出东西，也是已到达的一件事** |

- **开着的追加块已到的片段在快照里**：一个后台工具正往日志块里一行行写，中途重进的人**看得到已经写出来的那几行**，
  否则他会先收到一个没见过开头的 `fill`（[PF-009 §6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)）。
  这正是 [PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)（rev 8）与[在途状态词条](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)列举的三样：已封口的块、开着的追加块已到的片段、开着的整体替换块最后一次填的内容。
- **开着的调用块给的是参数原文，不解析**：它还没收齐（[PF-009 §6.10](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行)）。
- **快照是值**：交出之后，这份状态再接受什么事件，都不改变已交出的快照；快照里也没有任何能反过来改动状态的东西。
- `position` 见 [S-5](#s-5-位置)；`firstContentAt` 见 [S-16](#s-16-首个内容的位置)，还没开口就缺席。
- **快照不带到此为止的砍的汇总**：中途重进的人看不到此前砍过什么，那份交代收尾时才有（[PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) rev 8）。

### S-8 收尾结算交出什么

**`closeOut` 与 `abandon` 交出同一个形状：`{ blocks, account, ending }`。**

| 成员 | 是什么 | 条款 |
|---|---|---|
| `blocks` | 按开块次序，每一块落成的样子；**没交出过任何内容的块不在里面** | [S-9](#s-9-一块怎样落) |
| `account` | 模型侧 `{ usage, cost, trims }`；工具侧 `{ frames: { emitted, trims } }` | [S-13](#s-13-账)、[S-14](#s-14-砍的汇总) |
| `ending` | `{ reason, error?, firstContentAt? }`：收尾的原因与成因原样照收尾事件；`firstContentAt` 是这条流交出第一样内容的位置，**没开过口就缺席** | [S-16](#s-16-首个内容的位置) |

- **这三样就是宿主包消息、记账要的全部事实**：[PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) 那张表按「为什么断」与「有没有内容到了用户眼前」分五行，
  前者是 `ending.reason`，后者是 `ending.firstContentAt` 在不在。**本能力交出事实，不查那张表。**
- **不产出消息、不铸任何身份**：`MessageId`、落盘时刻由宿主在包消息时给（`data.messages` v1）。结果里的块标识全部来自开块事件。
- **收尾之后的那一份状态仍可再结算**：同一份状态再调一次 `closeOut`，得到**同一个**结果——这是纯计算的相等，不是「记了两次」；只记一次是宿主的事（[S-28](#s-28-宿主要兑现的前提)）。

### S-9 一块怎样落

| 这一块收尾时 | 落成 |
|---|---|
| 已封口，不是工具调用 | 封口交出的那一块，原样（`data.arrival-events/v1#S-13`） |
| 已封口，工具调用 | 封口那一下定下的那一块：完整的调用、标了解析不了的调用、或半截的调用（[S-10](#s-10-工具调用在封口那一下解析且只解析这一次)～[S-12](#s-12-被砍过内容的调用落成半截)） |
| 开着，工具调用（**不论收没收到过填**） | **半截的调用**（`data.content-blocks/v1#S-13`）：`complete: false`、`rawArguments` 是参数原文的归约（没收到过填就是空串）、`callId` 与 `tool` 取块头、**`visibility` 两位都是 `false`**——不取开块时说的那两位 |
| 开着、收到过填，追加的文本或思考 | 文本块或思考块，`text` 是归约；思考块**不带** `opaque`（那份数据只随封口块来） |
| 开着、收到过填，追加的语音 | 语音块：`data` 是归约字节的内联形状（`data.content-blocks/v1#S-10`），`mediaType` 取块头 |
| 开着、收到过填，整体替换 | 最后一次填：文本与思考给那段文本（**可以是空串**——一块面板可以被清空）、调用参数给全文（仍按上两行落成半截的调用）、语音给那段字节、整交的三类给那一整块 |
| 开着、没收到过填，不是工具调用 | **不落**：它没交出过任何东西 |

- **开着的块按已到的样子落，不补全、不丢弃**：用户已经看见的那半句话，就是日志里那半句（[PF-009 §6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)）；
  **半截的调用照样落**——[到了我们这儿的数据，日志都要完整](../../../../product/PF-009-context-message-types/design.md#56-流断在半路)，给不给模型看是组装那一步的事，而两位皆假让两边都不取它。
- **半截调用的两位为什么不取开块时说的**：`data.content-blocks/v1#S-13` 把两位皆假写成了硬约束——给了模型，它会干等或者再发一次。这不是替生产者补标注，是那份契约对这种形状的定义。
- **开着的块落出来的，与封口时交出的，形状是同一种块**：宿主与日志分不出一块封没封口，也不需要分——一条消息被中断了由 `ending` 说，**不由块说**。
- **一块只按它自己的事件落**：别的块的事件、砍、记账都不改变它；[S-12](#s-12-被砍过内容的调用落成半截) 是唯一的例外，而且只对工具调用块。

### S-10 工具调用在封口那一下解析，且只解析这一次

**接受一个工具调用块的 `close` 的那一下，是这次调用参数唯一的解析点**（[D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) 保留前提 1、`data.content-blocks/v1#S-12`）：

1. 参数原文 ≝ 这块全部填按填法的归约（`data.arrival-events/v1#S-19`）；没收到过填就是空串。
2. 这块若在开着时被改过内容（[S-12](#s-12-被砍过内容的调用落成半截)），**不解析**，落成半截的调用。
3. 否则按 JSON 解析一次：
   - **成功** ⇒ 完整的调用块（`data.content-blocks/v1#S-12`）：`complete: true`，`callId` 与 `tool` 取块头，`arguments` 是解析得到的值，`id` 与 `visibility` 取开块时说的；
   - **失败** ⇒ 解析不了的那一种调用块（[S-11](#s-11-参数收齐却解析不了只标记)，`data.content-blocks/v1#S-12`）。

- **此后不再解析**：快照与收尾交出的都是封口那一下定下的那一块；**不从参数原文重算**。收尾时把它包进消息的宿主、执行它的一方，**直接用 `arguments`**。
- **封口之前从不解析**：开着的调用块在快照里是原文，收尾时仍开着就落成半截的——[残缺的 JSON 解析出来的东西比解析失败更危险](../../../../product/PF-009-context-message-types/design.md#工具调用的参数收齐了才算数)。
- **为什么在封口那一下而不是收尾时**：[解析只发生一次，收齐之后、动手之前](../../../../product/PF-009-context-message-types/design.md#工具调用的参数收齐了才算数)。宿主可以在这条流收尾之前就拿到一个已封口的调用去执行，那一刻它要的是已解析的那一块。

### S-11 参数收齐却解析不了：只标记

**参数收齐了（块已封口、开着时没被改过内容），JSON 解析却失败：本能力把这块落成 `data.content-blocks/v1` [S-12](../../../data/content-blocks/v1/contract.md#s-12-完整的工具调用) 里「解析不了」的那一种**：
`complete: true`，`callId` 与 `tool` 取块头，`rawArguments` 是参数原文（原样），`unparseable: true`，**不带 `arguments`**；`id` 与 `visibility` 取开块时说的（形状归 `data.content-blocks/v1#S-12`）。

- **它收齐了、登记了，但没有可用的参数**：它不是解析成功的那一种，**也不是半截的**（半截的参数没收齐、不登记）。
- **本能力只做这一件事——标记**。**不发起执行、以一条 `outcome = failed` 的结果回给模型**（[PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#参数说完了却解析不了的调用不执行以失败回给-agent)），
  这一半的拥有者是**工具执行运行时**：它在提交时收下这种调用、不起执行者、即刻收场 `failed` 并写那条 `ToolMessage`（`capability.tool-execution-runtime/v1#S-23`；`data.messages/v1#S-31`）。
  一个恰好读不懂的调用，不能被当作没发生，也不能被猜一个参数去执行。**它不是宿主要兑现的前提**：模型侧的宿主只把它照原样包进 `AssistantMessage`。
- 规范场景：[S-32](#s-32-参数收齐却解析不了)。

### S-12 被砍过内容的调用落成半截

**一个工具调用块，若在它开着的时候（开块之后、封口之前）这份状态接受过一个改变内容的 `trim`——原因是 `frame_too_long`、`quota_exhausted` 或 `rejected`，且索引是这一块或缺席——它就落成半截的调用**，封了口也一样。

- **理由**：参数原文少了一段，[解析它比解析失败更危险](../../../../product/PF-009-context-message-types/design.md#工具调用的参数收齐了才算数)——它可能恰好合法而少了半个字段（`data.arrival-events/v1#S-22`）。
- **索引缺席的那种也算**：它说的是「有一个增量没原样到，却说不出属于哪一块」，那一块可能正是这次调用。
  **判不出来不等于没被砍**；把一个可能残缺的调用当作收齐的去执行，就是放行。
- **合并（`rate_merged`）不算**：合并不改变归约（`data.arrival-events/v1#S-22`）。
- **封口之后的砍不改变它**：封口那一下已经定下那一块，宿主可能已经据此执行了。一个说「刚才那块被截过」的 `trim` 出现在封口之后，是生产的一方违反了「封口就是在说参数收齐了」（`data.arrival-events/v1#S-13`），**本能力照收那个 `trim` 进汇总，不改已定的那一块**。
- **只对工具调用块**：别的块被砍过，落的就是实际送达的内容（`data.arrival-events/v1#S-20`）。

### S-13 账

**模型侧**：`account = { usage, cost, trims }`。

- 这份状态接受过 `account` 事件 ⇒ `usage`、`cost` 原样取那一步的（`data.arrival-events/v1#S-15`）。
- **没接受过** ⇒ `usage` 四项全 `"unknown"`、`source: none`，`cost` 为 `cost_usd: "unknown"`、`source: none`——`data.call-accounts/v1#S-20` 那一份。**不记零、不估算、不借上一次的**：`"unknown"` 是一个值，不是零（`data.call-accounts/v1#S-4`）。
- `trims` 是 [S-14](#s-14-砍的汇总) 的汇总。**模型侧由宿主写进这次发出的响应体 `trims`**（`data.model-response/v1` 的 [S-19](../../../data/model-response/v1/contract.md#s-19-用量与费用) 第 5 条）；一次也没砍时那边缺席、这边各项为 `0`，两种写法指同一件事。

**工具侧**：`account = { frames: { emitted, trims } }`，就是 `ToolCallAccount.frames`（`data.call-accounts/v1#S-11`）的那一份——那次执行账的其余各项不来自这条流。

- `trims` 是 [S-14](#s-14-砍的汇总) 的汇总。
- `emitted` ≝ **这份状态接受过的 `open`、`fill`、`close` 的个数 ＋ `trims.merged` ＋ `trims.cut`**。
  一帧是工具交出的一个 `open`、`fill` 或 `close`（`data.arrival-events/v1#S-23`）：接受了的每个一帧；被合并掉的每个一帧；整个没送达的（额度用完、被拒收）每个一帧；被截短后送达的已经算在接受了的里面。
- **这条算式成立的前提**：工具侧的 `trim`、`finish` 由执行一侧的运行时发，不是帧（宿主前提，[S-28](#s-28-宿主要兑现的前提) 第 3 条）；
  每一帧至多被计一次「未原样送达」——**这一条是本能力的承诺**，由 [S-14](#s-14-砍的汇总) 的去重规则兑现，它认得出的配对靠 [S-28](#s-28-宿主要兑现的前提) 第 4 条的次序。
- **一帧没发是正常形态**：只有一个 `finish` 的流，`emitted = 0`、各项砍为零（[PF-009 §5.8](../../../../product/PF-009-context-message-types/design.md#大部分工具不发这个而那是正常形态)）。

**账只在收尾结算时交出一次值**；记进哪条记录、只记一次，是宿主的事（`data.call-accounts/v1#S-19`）。账**不进任何块**（`data.call-accounts/v1#S-21`）。

### S-14 砍的汇总

**`trims` 是这份状态接受过的全部 `trim` 按 `data.call-accounts/v1#S-15` 的口径汇总成的 `TrimSummary`：**

```text
merged                      = Σ trim.merged           （reason = rate_merged 的那些）
byReason.rate_merged        = merged
byReason.frame_too_long     = #{ trim : reason = frame_too_long ∧ ¬ 配对(trim) }
byReason.quota_exhausted    = #{ trim : reason = quota_exhausted }
byReason.rejected           = #{ trim : reason = rejected }
cut                         = byReason.quota_exhausted + byReason.rejected
omittedBytes                = Σ trim.omittedBytes     （reason ≠ rate_merged 的那些，配对的也计）

配对(t) ≝ t 的 reason 是 frame_too_long，且这份状态紧接着 t 接受的下一个事件是一个 reason = rejected 的 trim
```

- 一个 `trim` 说一次砍（`data.arrival-events/v1#S-14`）：截短与整个没送达的每个说**一个**增量，合并说**一组**。按上式，`data.call-accounts/v1#S-15` 的三条等式自动成立。
- **每一帧（每一个增量）至多被计一次「未原样送达」——去重是本能力的承诺**（`data.call-accounts/v1#S-15` 指派给本能力）：
  同一个增量**先被截短、后被拒收**，发出一侧说了一个 `frame_too_long`，宿主又替被拒的它说了一个 `rejected`；它**只按拒收计**——`cut` 里算一次，`byReason.frame_too_long` 里不再算。
  两个 `trim` 说的是不是同一个增量，本能力**只凭次序认**：截短的 `trim` 紧挨在它截短的那个增量之前交来，被拒的那一次之后宿主紧接着交它的 `rejected`（[S-28](#s-28-宿主要兑现的前提) 第 4 条）——
  截短后的增量被拒就不进状态，于是那两个 `trim` 在被接受的事件里**恰好相邻**；截短后的增量被接受了，它就夹在两者之间，不构成配对。
  **字节照计**：截掉的那段与被拒的那段都是没送到的内容，`omittedBytes` 两者都算。
  **不去重会怎样**：`merged + cut + byReason.frame_too_long ≤ frames.emitted` 那一式把同一帧数两次，只发了一帧的执行可能被说成砍了两帧（`data.call-accounts/v1#S-15`）。
- 这条规则对模型侧同样成立：模型侧的汇总里一个增量也不得被算两次。
- **四项 `byReason` 都出现**，没发生过的写 `0`。一个 `trim` 都没接受过，汇总各项全是 `0`。
- **汇总只算这条流上被接受的 `trim`**：本能力不知道、也不猜没说出来的砍。**砍了不说是做节流那一方的违约**，不是一份未知的账。

### S-15 节流在到达装配之前，投递一侧的节流不进账

- **进账的节流只有发出的一侧那一种**：在事件交给 `accept` **之前**合并、截短、限额（`data.arrival-events/v1#S-22`）。它砍了什么，以 `trim` 交给同一份状态，本能力汇总进 `trims`。
- **投递一侧**在到达装配之后、为观察者做的节流（出站流把片段合并了再推给界面）**不改变到达装配的结果，不进账，也不在本契约**——每个观察者合并得不一样，那份计数没有唯一的计数方。
- **本能力自己从不节流**：它不合并、不截短、不丢弃任何被接受的事件。

### S-16 首个内容的位置

**`firstContentAt` 是这份状态接受「第一个内容步骤」（`data.arrival-events/v1#S-21`）时的位置**；还没有这样的一步，它就缺席。

- 内容步骤是**载荷非空的 `fill`**，或**没收到过填、封口块内容非空的块的 `close`**。**空载荷不算**：空串的填、空文本的封口、参数原文为空串的调用封口——判据是「交出了内容」，一个空串什么也没交出。
- **零次填充就封口的块也算开口**：它的 `close` 就是那一步，只要封口块内容非空（`data.arrival-events/v1#S-21`）——记录里已经有一个完整的块。
- **一经确定不再变**：之后的事件不改变它。
- **本能力只给位置，不给时刻**：它没有时钟。宿主在 `accept` 交出的状态里第一次看到 `firstContentAt` 出现，那一刻就是[「已经开口说话了」](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)的时刻；据此判不判重发，归宿主与模型调用一侧。
- 它同时出现在快照与收尾结果的 `ending` 里：前者给正在进行时的判断，后者给包消息时的「有没有内容到了用户眼前」。

## 三、操作

### S-17 每个操作写全九件事

| # | 写什么 |
|---|---|
| ① | **输入与授权** |
| ② | **前置条件** |
| ③ | **提交点与原子性** |
| ④ | **返回与失败集合**（枚举闭合，没有「其他」） |
| ⑤ | **幂等边界** |
| ⑥ | **事件** |
| ⑦ | **缺席时的默认答案** |
| ⑧ | **在途操作的归属**（宿主撤除、换代、失去连续性时） |
| ⑨ | **部署装配给 vs 协议给**（[S-29](#s-29-部署装配给与协议给) 的哪几行） |

**五个操作都是纯计算**：没有提交点、不写任何存储、不发任何事件、不做授权判定——**持有状态的宿主就是唯一能用它的一方**，
会话与租户的判定在宿主那一侧已经做完（[S-29](#s-29-部署装配给与协议给) 第三行）。下面各表照写，不省略。

### S-18 `start`：开一份状态

| # | 内容 |
|---|---|
| ① | `target`：一个 `ArrivalTarget`（`data.arrival-events/v1#S-5`），**必填、没有默认值**。不需要授权：它只造一个值 |
| ② | 无。**同一个目标开第二份不是失败**：本能力不知道别的状态存在；一个目标恰一份状态、已收尾的目标不再开，是宿主的前提（[S-28](#s-28-宿主要兑现的前提)） |
| ③ | 无提交；交出一个值 |
| ④ | 成功：一份位置为 `0`、没有块、没有账、没收尾的状态，它的目标就是 `target`。失败：`malformed`（`target` 不合 `ArrivalTarget`）。**集合闭合** |
| ⑤ | 同一个 `target` 调两次，得到两份不可区分的状态 |
| ⑥ | 不发 |
| ⑦ | `target` 缺席或不合形状 ⇒ `malformed`；**不补一个目标，不从事件里猜** |
| ⑧ | 无在途：它是一步计算 |
| ⑨ | 第三、四行 |

### S-19 `accept`：接一个事件

| # | 内容 |
|---|---|
| ① | 一份状态；一个 `ArrivalEvent`（`data.arrival-events/v1#S-6`），都必填。**只收事件、不收信封**：事件属于哪条流，由宿主把它交给哪一份状态决定（[S-28](#s-28-宿主要兑现的前提) 第一条）。不需要授权 |
| ② | 无前置：任何状态都可以交进来；收尾之后的状态接什么都被拒（`event_after_finish`），**那是一次拒绝，不是前置不满足** |
| ③ | 无提交；**全有或全无**：成功交出一份新状态，拒绝时什么新状态也没有，交进来的那份不变 |
| ④ | 成功：下一份状态——位置加一，按[第二节](#二装配状态与它交出的值)前进（开块、归约、封口时定下那一块、记账、收尾、汇总砍、首个内容）。失败：[S-24](#s-24-表示层拒绝值原名引用) 的表示层拒绝值与 [S-23](#s-23-本能力自己的失败值) 的八个判定失败之一，**恰一个**，按 [S-25](#s-25-判定次序) 的次序取。**集合闭合** |
| ⑤ | 纯函数：同一份状态、同一个事件，永远同一个结果。**同一个事件接两次不是「幂等」**：第二次作用在第一次交出的新状态上，追加片段会被接两次——**去重是宿主与传输的事**（[S-29](#s-29-部署装配给与协议给) 第一行） |
| ⑥ | 不发。首个内容出现、一块封口、流收尾，都只是新状态里的事实，由宿主去读 |
| ⑦ | 事件缺席 ⇒ `malformed`；事件里任何必填成员缺席 ⇒ 按 `data.arrival-events/v1#S-28` 取值。**判不出来就拒**：要借开块才判得出的两项，开块不在时取序列失败值（[S-25](#s-25-判定次序)），不放行 |
| ⑧ | 无在途：一次调用在返回时就完成了。宿主在两次调用之间丢了状态，丢的是宿主手里的值（[S-29](#s-29-部署装配给与协议给) 第二行） |
| ⑨ | 第一、二、五、六行 |

**一个事件被接受时，状态怎样前进：**

| 事件 | 前进 |
|---|---|
| `open` | 记下这一块开块时说定的一切；块次序末尾多一块 |
| `fill` | 这一块的归约按填法更新；若这是第一个内容步骤，记下位置（[S-16](#s-16-首个内容的位置)） |
| `close` | 这一块封口：不是工具调用就记下封口块；是工具调用就在这一下解析（[S-10](#s-10-工具调用在封口那一下解析且只解析这一次)～[S-12](#s-12-被砍过内容的调用落成半截)）；若这是第一个内容步骤，记下位置 |
| `trim` | 计进汇总（[S-14](#s-14-砍的汇总)）；若改变内容、此刻有工具调用块开着，按 [S-12](#s-12-被砍过内容的调用落成半截) 记下那几块被改过内容。**不改任何块的内容** |
| `account` | 记下这份账 |
| `finish` | 记下原因与成因；此后什么都不再接受 |

### S-20 `snapshot`：读快照

| # | 内容 |
|---|---|
| ① | 一份状态，必填。不需要授权：**谁能读到快照，由持有状态的宿主与出站流决定**（[S-29](#s-29-部署装配给与协议给) 第三行） |
| ② | 无：开着的、收尾了的状态都可以读 |
| ③ | 只读，无提交 |
| ④ | 成功：`{ blocks, position, firstContentAt? }`（[S-7](#s-7-快照交出什么)）。失败：**无**。任何一份状态都有快照 |
| ⑤ | 同一份状态读几次都一样；交出的是值（[S-7](#s-7-快照交出什么)） |
| ⑥ | 不发 |
| ⑦ | 没有可缺席的输入。快照里的缺席各有意思：没有 `content` 是「开了口还没交出东西」，没有 `firstContentAt` 是「还没开口」——**都不是待补的值** |
| ⑧ | 无在途 |
| ⑨ | 第三、六行 |

### S-21 `closeOut`：收尾结算

| # | 内容 |
|---|---|
| ① | 一份状态，必填。不需要授权 |
| ② | **这份状态已经接受过 `finish`** |
| ③ | 无提交；交出一个值。**落盘、记账不在这里** |
| ④ | 成功：`{ blocks, account, ending }`（[S-8](#s-8-收尾结算交出什么)）。失败：`stream_not_finished`（②不满足）。**集合闭合** |
| ⑤ | 同一份状态结算几次，结果都相同；**只记一次是宿主的事** |
| ⑥ | 不发 |
| ⑦ | 没收尾就拒：**不替它补一个收尾**。没收到收尾而要结束这条流，走 [`abandon`](#s-22-abandon放弃)——那是宿主有意识的选择，不是本操作的默认 |
| ⑧ | 无在途 |
| ⑨ | 第七行 |

### S-22 `abandon`：放弃

**生产的一方失去了连续性、却没给 `finish`**——流结束了而收尾没来，或宿主要在自己被撤下之前把这条流结掉——宿主用它结束这条流。

| # | 内容 |
|---|---|
| ① | 一份状态，必填；`reason`：放弃的缘由，形状同 `finish.error`（`data.arrival-events/v1#S-16`：成因与可选的原样状态码），**可缺席**。不需要授权 |
| ② | **这份状态还没接受过 `finish`**。目标是工具执行时 `reason` 必须缺席：帧流断了不是一次模型调用的故障 |
| ③ | 无提交；交出一个值 |
| ④ | 成功：与 [S-21](#s-21-closeout收尾结算) 同一个形状，**等于**先接受 `finish { reason: "lost", error: reason }`、再结算。失败：`event_after_finish`（已收尾）· `malformed`（`reason` 不合形状，或目标是工具执行却带了 `reason`）。**集合闭合** |
| ⑤ | 同一份状态、同一个缘由，结果相同 |
| ⑥ | 不发 |
| ⑦ | `reason` 缺席 ⇒ 结局的 `error` 缺席——**说不出成因，不等于没有故障**，不补一个成因。**有意停下的**（用户叫停、宿主把它带走）不走这里：宿主交给 `accept` 一个 `finish { reason: "interrupted" }` |
| ⑧ | 本操作本身就是在途归属的收口：**只有状态还在，才放弃得了**。进程没了，状态随之没了（[S-29](#s-29-部署装配给与协议给) 第二行），**没有东西可以放弃**——那时的收场由宿主一侧追补（[PF-006 §6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)），不经本能力 |
| ⑨ | 第二、七行 |

- **放弃也交出账**：一份在放弃之前已经接受过 `account` 的状态，账就在里面；丢掉它，那笔真花掉的钱就从明细里消失了（`data.call-accounts/v1#S-19`）。
- **它不是恢复**：放弃不会让任何东西重来，只是把「这条流没有结局」变成「这条流以 `lost` 结束」。

## 四、失败值

### S-23 本能力自己的失败值

**要看这条流此前发生过什么才判得出的，是本能力的判定失败，恰为下面八个，集合闭合**：

| 失败值 | 什么时候 | 对应的语法规则 |
|---|---|---|
| `event_after_finish` | 状态已接受过 `finish`，又交来一个事件；或对它 `abandon` | `data.arrival-events/v1#S-17` |
| `index_reused` | `open` 的索引这条流开过（不论封没封口） | `data.arrival-events/v1#S-7` |
| `index_not_monotonic` | `open` 的索引没开过，却不大于此前开过的全部索引 | `data.arrival-events/v1#S-7` |
| `block_not_open` | `fill`、`close` 或带索引的 `trim` 的索引这条流没开过 | `data.arrival-events/v1#S-18`、`#S-14` |
| `block_already_closed` | `fill` 或 `close` 的索引已封口 | `data.arrival-events/v1#S-18` |
| `payload_kind_mismatch` | 往追加的块里填的不合那一类：不是字符串、是空串、语音的片段不是标准 base64、或填了一整块；或封口不合开块：工具调用块的封口带了块、其余类的封口没带块、封口块的 `kind`、`id`、`visibility` 与开块时说的不同、带了与块头不同的 `mediaType` | `data.arrival-events/v1#S-11`、`#S-13` |
| `account_duplicate` | 状态已接受过 `account`，又交来一个 | `data.arrival-events/v1#S-15` |
| `stream_not_finished` | 对没接受过 `finish` 的状态 `closeOut` | [S-21](#s-21-closeout收尾结算) |

- **没有 `target_unknown`、`target_already_open`**：本能力不持有目标表，路由归宿主（[S-3](#s-3-本契约不拥有什么)）。
- **没有「一条消息里 `id` 重复」的失败值**：`data.arrival-events/v1#S-24` 把这条语法规则交给了消费一侧，它在消息落进日志的那一道边界上被拒，值是 `data.messages/v1#S-39` 的 `block_id_duplicate`。**本能力不查它，也不据此修改标识。**
- **解析不了不是失败**：一个参数原文解析失败的调用块被**接受**，按 [S-11](#s-11-参数收齐却解析不了只标记) 标记。
- **没有「块头模态不符」的判定失败**：只看这一个 `open` 就判得出，它是表示层拒绝值 `head_modality_mismatch`（`data.arrival-events/v1#S-28`），按 [S-24](#s-24-表示层拒绝值原名引用) 原名引用。

### S-24 表示层拒绝值原名引用

**`accept` 对一个事件做的表示层判定，就是对信封 `{ target: 这份状态的目标, event }` 按 `data.arrival-events/v1#S-28` 的判定**，拒绝值原名携带、不改名：

- 本身的九个：`event_unknown`、`trim_reason_unknown`、`finish_reason_unknown`、`presentation_invalid`、`head_modality_mismatch`、`fill_kind_not_appendable`、`frame_media_inline`、`replace_payload_shape`、`malformed`；
- 嵌着的块不合 `data.content-blocks` v1：`kind_unknown`、`visibility_missing`、`incomplete_call_visible`、`call_in_result`、`modality_mismatch`（`data.content-blocks/v1#S-26`）；
- 嵌着的账不合 `data.call-accounts` v1：`negative_amount`、`unknown_with_source`（`data.call-accounts/v1#S-27`）。

三份契约的 `malformed` 是同一个值。**所以工具侧的状态接到 `account`、`max_tokens` 的收尾或带 `error` 的收尾，拒绝值是 `malformed`**——它们在信封上就判得出。

**要借开块才判得出的两项**——整体替换的块填了不合开块的内容（`replace_payload_shape`），帧流上往语音块填字节（`frame_media_inline` 的那一半）——
**只在那一块此刻开着时才判**，因为只有那时本能力手里有它的开块。

### S-25 判定次序

**一个事件有多处违例时，`accept` 取次序最前的那一个：**

```text
1. 表示层（S-24），按 data.arrival-events/v1#S-28 的次序：
   event_unknown > trim_reason_unknown = finish_reason_unknown（互斥）> 嵌着的值的拒绝值
     > presentation_invalid > head_modality_mismatch > fill_kind_not_appendable > frame_media_inline > replace_payload_shape > malformed
   —— 其中要借开块的两项，那一块此刻没开着（没开过或已封口）就不参与，往下判
2. event_after_finish
3. 按事件种类：
   open   ：index_reused > index_not_monotonic
   fill   ：block_not_open > block_already_closed > payload_kind_mismatch
   close  ：block_not_open > block_already_closed > payload_kind_mismatch
   trim   ：block_not_open
   account：account_duplicate
```

- **表示层在前**：认不出是哪种事件，就谈不上它来得合不合时宜（`data.arrival-events/v1#S-28` 末段）。
- **结构在内容之前**：索引重开、块没开，先于载荷合不合那一类——对着一个不存在的块，谈不上载荷合不合它。
- `index_reused` 在 `index_not_monotonic` 之前：重开的索引必然不大于已开过的，那一条更具体。
- 这个次序让两个实现对同一份状态、同一个事件给出**同一个**失败值，与校验的遍历次序无关。

### S-26 被拒不改状态，后果归宿主

- **被拒的事件对状态没有任何作用**：位置不加、归约不变、首个内容不动、汇总不计。交进来的那份状态照旧可以接下一个事件。
- **被拒不是一次判定、不是一次收场**（`data.arrival-events/v1#S-29`）：它不表示那次调用或那次执行失败了；**一个被拒的帧不影响那次执行**（[PF-009 §6.17](../../../../product/PF-009-context-message-types/design.md#617-发帧发不出去不影响这次工具执行)）。
- **不修补**：不给缺标注的开块补标注，不把追加开的图改成整体替换，不把重开的索引改成下一个，不把收尾之后的片段接进去。
- **后果归宿主**：被拒的那个增量整个没送达，由宿主**紧接着**以一个 `reason: "rejected"` 的 `trim` 交给同一份状态（`data.arrival-events/v1#S-29`）——这样它才进得了汇总。
  **「增量」只指生产者交出的事件**（模型侧是传输适配交来的事件，工具侧是帧）：宿主自己发的 `trim`、`finish` 被拒，是宿主的缺陷，**不再为它补一个 `rejected`**——那不是一个没送达的增量，补了会让 `emitted` 多算（[S-28](#s-28-宿主要兑现的前提) 第 4 条）。
  **收尾之后被拒的事件无处可说**：那时连 `trim` 也不再被接受（`event_after_finish`），它不进这条流的汇总；宿主要让这次拒绝在自己的观测里看得见（[S-28](#s-28-宿主要兑现的前提)）。

## 五、一次到达装配等于一次性到达

### S-27 一次到达装配等于一次性到达

**[组装出来的必须与一次性拿到的一模一样](../../../../product/PF-009-context-message-types/design.md#组装出来的必须与一次性拿到的一模一样)——那一节标题里的「组装」就是[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)——写成对本能力可判定的性质：**

对任何一串从 `start` 起被逐个接受、以 `finish` 结尾的事件 σ，构造它的**一次性形式** σ̂：

```text
σ̂ ≝ 按 σ 的开块次序，对每一块：
        它的 open
        ⧺ （它在 σ 里收到过填时）一个 fill，载荷是它全部填的归约
        ⧺ （它在 σ 里封了口时）它在 σ 里的那个 close
    ⧺ σ 的 account（若有）
    ⧺ σ 的 finish
```

**则 σ̂ 也被逐个接受，且 `closeOut` 对两者交出的 `blocks` 相等、`ending.reason` 与 `ending.error` 相等、`account` 的 `usage` 与 `cost` 相等。**

- **相等不含位置与首个内容**：位置、`firstContentAt` 是到达的历史——同一段内容分十次来，第一个内容步骤就在别处；
  一块整体替换的面板先填了「abc」后被清空，分次到达时开过口、一次性到达时没有。**这是对的**：那块内容确实到过用户眼前。
- **相等不含砍的汇总与 `emitted`**：σ̂ 没有砍，它们是那一次投递的事实，不是内容。
- **相等不含铸出来的身份**：`MessageId`、落盘时刻由宿主在包消息时铸（[S-8](#s-8-收尾结算交出什么)），不在本能力的结果里；结果里的块标识全部来自开块事件，σ 与 σ̂ 的开块相同，所以**块标识在相等里**。
- **前提**：σ 里没有在某个工具调用块开着时被接受的、改变内容的砍（[S-12](#s-12-被砍过内容的调用落成半截)）。
  有这样的砍，那个调用在 σ 里落成半截、在 σ̂ 里（没有砍）会被解析——**被砍过的序列本来就不是同一段内容**，这条性质不对它们作承诺。
- **违反时可观察到什么**：同一次回复，网络切分不同，落进日志的消息就不同——块的次序、整体替换的块留下哪一次、半截的调用有没有被当作收齐。
- **证据**：行为模型 `formal/Assembly.tla`——后一半（结果相等）是 `SplitInvariance`，前一半（σ̂ 也被逐个接受）是 `OneShotAccepted`，各有一个预期出反例的有效性核对配置（[S-30](#s-30-本版选用的形式工件)）；
  前一半只在模型建出的那几条语法规则上成立（不含载荷形状与块头），建模范围与盖不到的部分见 [`formal/README.md`](formal/README.md)。

## 六、宿主要兑现的前提

### S-28 宿主要兑现的前提

**本能力的每一条保证，都建立在持有状态的宿主兑现下面这几条之上**；宿主是 `capability.model-request-runtime` v1 与 `capability.tool-execution-runtime` v1（都是 candidate）。
**工具侧的宿主已逐条承诺**第 1～4、6、7、9 条（`capability.tool-execution-runtime/v1#S-62`；第 8 条只对模型侧）；**模型侧的宿主已逐条承诺**第 1、2、4、6、7、8、9 条（`capability.model-request-runtime/v1#S-51`；第 3 条只对工具侧；原 G-2 闭合，[D-040 §六 L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）。
下面的编号是外部引用的坐标，**只追加、不重排**。

1. **路由**：一个目标恰一份状态；事件按目标交给那一份；**已收尾的目标不再开新状态**，它的迟到事件丢弃，不交给同一次调用的下一次发出（`data.arrival-events/v1#S-5`）。
2. **串行**：同一份状态按事件的生产次序逐个 `accept`，每次都用上一次交出的新状态，**不让一份状态分叉**。
3. **工具侧谁发什么**：工具（经[发帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission)）只交出 `open`、`fill`、`close`；`trim` 与 `finish` 由执行一侧的运行时发，那一侧没有 `account`（`data.arrival-events/v1#S-23`）。
4. **砍了要说**：发出一侧的每次合并、截短、限额都以 `trim` 交给同一份状态，**截短的那个 `trim` 紧挨在它截短的那个增量之前交**；
   **`accept` 拒掉的每个增量，宿主紧接着（交下一个事件之前）以一个 `rejected` 的 `trim` 说出来，且只说一次**；
   「增量」只指生产者交出的事件（工具侧即帧），**宿主自己发的 `trim`、`finish` 被拒不补 `rejected`**；收尾之后被拒的，宿主在自己的观测里记下（[S-26](#s-26-被拒不改状态后果归宿主)）。
   这两处「紧挨」让 [S-14](#s-14-砍的汇总) 认得出「先截短、后拒收」的同一个增量。
5. **解析不了的调用**：**不再是宿主前提**。不发起执行、以一条 `outcome = failed` 的结果回给模型，归工具执行运行时（[S-11](#s-11-参数收齐却解析不了只标记)；`capability.tool-execution-runtime/v1#S-23`）；编号保留不复用。
6. **结束一条流**：生产者正常说完、被有意停下，交 `finish`；生产者失去连续性而没给 `finish`，或宿主要在自己被撤下之前结掉在途的流，调 `abandon`。**不让一份状态永远不收尾**。
7. **包消息与记账**：按 [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) 与 `data.messages` v1 把结果包成 `AssistantMessage`／`ToolInternalMessage`（或不成消息；`ToolInternalMessage` 只在交出的 `blocks` 非空时有，结局按 `data.messages/v1#S-14` 的对应表）；账记进承载它的记录，**恰一次**（`data.call-accounts/v1#S-19`）；出错断时已交付的块按 `data.model-response` v1 的 `delivered` 落。
8. **首个内容的时刻**：在 `accept` 交出的状态里第一次看到 `firstContentAt` 时取时刻，**先记下这件事，再把那个内容推给观察者**（[S-29](#s-29-部署装配给与协议给) 第五行）。
9. **快照与增量衔接**：给观察者的快照与它此后收到的事件，数的是同一串被接受的事件（[S-5](#s-5-位置)）；被拒的事件不推给观察者。

## 七、部署装配给与协议给

### S-29 部署装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版单机，但语义不变地可扩展为分布式。
本节的「装配」指**部署装配**（生产者、宿主与本能力怎样放在一个部署里），不是本能力做的[到达装配](../../../../ubiquitous_language/terms/record-and-context.md#ul-arrival-assembly--到达装配--arrival-assembly)。

> **本表只列跨部署形态会变的保证**。左列是单机时由部署装配（生产者、宿主、本能力在同一进程，宿主按调用次序交事件）顺带给出的；
> 右列是跨进程后**必须由协议重新兑现什么**，以及**做不到会怎样**。不在表里的条款在任何部署形态下一律成立。
> **这张表是契约的一部分，不是流程笔记。**

| # | 保证 | 单机由谁给 | 跨进程必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|---|
| 1 | **同一条流的事件逐个、按生产次序、不重不漏地交给同一份状态**（[S-4](#s-4-装配状态是调用方持有的一个值)、[S-19](#s-19-accept接一个事件)） | 宿主里一个消费循环，按生产者的调用次序 `accept`，拿上一次交出的状态接下一个 | 同一目标的事件**有序、恰好一次**送达接收方（事件没有序号，协议须自带）；本能力照旧校验索引 | 乱序：索引倒退、填落在没开的块上被拒——**内容少一段**；重复：`open`、`close` 会被判重拒掉，**一个追加片段却会被接两次，内容静默变长，没有任何一处报错**；丢失：等不到 `finish`，只能放弃成 `lost`；一份状态分叉：其中一支接的事件**静默丢失** |
| 2 | **状态随宿主存续**（[S-4](#s-4-装配状态是调用方持有的一个值)、[S-22](#s-22-abandon放弃)） | 状态是宿主手里的一个值，宿主在它就在；宿主因所依赖的服务换了提供者而重建时，它手里的值随之丢失（[basis](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)） | 状态**只在持有它的宿主所在的进程里**，不跨进程共享；别处要读只取快照（值）；宿主迁移时状态随它迁移，否则按丢失处理 | 丢失时这条流**没有结局、没有账**，已到达的内容全部丢失（[PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)）：模型侧等于这次调用停了，按首 token 判能不能重发（[PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)）；工具侧是执行宿主失去连续性，按[停了不重来](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)追补收场；**那次发出可能已经花掉的钱**要由承载账的一侧追补全未知的一份（`data.call-accounts/v1#S-20`） |
| 3 | **状态与快照只在所属会话里有意义**（[S-4](#s-4-装配状态是调用方持有的一个值)、[S-20](#s-20-snapshot读快照)） | 宿主绑定在一个会话上，只把它自己的流交给自己的状态，只把快照给这个会话的观察者 | 线上的信封与快照**带上会话与租户**，或通道本身绑定到一个会话；读快照在接收方按调用方的租户身份现判 | 两个会话里恰好相同的 `CallId` 撞到一起，**一个会话的帧落进另一个会话的消息**；或快照被另一个租户读到——跨租户可见 |
| 4 | **一次发出一份状态，收尾了的不再接**（[S-18](#s-18-start开一份状态)） | 同一进程里，前一次发出的状态收尾后被丢弃，后一次发出 `start` 一份新的 | 目标里的 `dispatch` 原样携带；**已收尾的目标的迟到事件丢弃**，不交给新的一次 | 第一次发出的迟到片段拼进第二次的回复 |
| 5 | **首个内容先被宿主记下，再到人眼前**（[S-16](#s-16-首个内容的位置)） | `accept` 同步交出新状态，宿主在同一步里取时刻、记下「已开口」，然后才推给观察者 | 投递与记下「已开口」之间的先后由协议保证；「那一刻」取哪一侧的时钟须写明 | 用户已经看见，而恢复时不知道已经开口，于是重发——**出现两份回复**；时钟取错一侧，据它算的时长失真（「开没开口」这个有无不受影响） |
| 6 | **快照与此后的增量衔接**（[S-5](#s-5-位置)、[S-7](#s-7-快照交出什么)） | 同一个宿主给出快照与此后的事件，位置在同一个计数上 | 位置与事件的序号在线上**可比较**，观察者据快照的位置取此后的事件 | 观察者重复或漏掉增量：重复的追加片段在他那边**被拼两次**，漏掉的那段他永远看不到 |
| 7 | **一个结果只被记一次**（[S-8](#s-8-收尾结算交出什么)、[S-13](#s-13-账)） | 宿主结算一次、追加一次 | 按那次发出的 `ResponseId`、那次执行的 `CallId` **幂等追加** | 账记两遍——钱翻倍；或同一条消息出现两次 |

## 八、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 | 证据 |
|---|---|---|---|---|---|---|
| P-1 | 块的次序是开块次序，与封口次序无关 | 不变量 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) · `data.arrival-events/v1#S-7` | `accept`（[S-6](#s-6-一块在状态里是什么)） | 先封口的块排到了前面 | TLA+ `BlockOrderIsOpenOrder` |
| P-2 | 收尾之后不接受任何事件 | 安全 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) | `accept`（`event_after_finish`） | 收尾之后又长出内容 | 规范场景 S-34、examples 第 5 节；TLA+ `FinishIsLast` **按构造，不作证据** |
| P-3 | 账至多一次；工具侧没有这一步 | 安全 | 同上 · D-035 | `accept`（`account_duplicate`、`malformed`） | 一次发出两份账，钱翻倍 | 规范场景 S-38（examples 第 5 节第 15、19 行）；TLA+ `AccountAtMostOnce`、`ToolHasNoAccount` **按构造，不作证据** |
| P-4 | 索引终身只开一次，开块索引严格递增 | 不变量 | `data.arrival-events/v1#S-7` | `accept`（`index_reused`、`index_not_monotonic`） | 一个整体替换的块被一个同号的新块顶掉 | 规范场景 S-38（第 4、5、25、26 行）；TLA+ `OpenIndicesIncrease` **按构造，不作证据** |
| P-5 | 填与封口只落在开着的块上 | 安全 | `data.arrival-events/v1#S-18` | `accept`（`block_not_open`、`block_already_closed`） | 封口之后又长出内容 | 规范场景 S-38（第 7、9、24 行）；TLA+ `FillsLandOnOpenBlocks` **按构造，不作证据** |
| P-6 | 没收尾就没有结算结果；放弃等于补一个 `lost` | 安全 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) | `closeOut`（`stream_not_finished`）、`abandon` | 一条没有结局的流被当作正常说完 | 规范场景 S-35；TLA+ `ResultOnlyWithFinish` **按构造，不作证据** |
| P-7 | 一次到达装配等于一次性到达（前提见 [S-27](#s-27-一次到达装配等于一次性到达)） | 不变量 | [PF-009 §6.8](../../../../product/PF-009-context-message-types/design.md#68-组装的结果与一次性拿到的必须相同) | 定义本身（[S-9](#s-9-一块怎样落)、`data.arrival-events/v1#S-19`） | 网络切分不同，落进日志的消息就不同 | TLA+ `SplitInvariance`、`OneShotAccepted`（有界，各配一个预期出反例的核对） |
| P-8 | 参数只在封口那一下解析一次；开着的、被砍过的不解析 | 安全 | [PF-009 §6.10](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行) · D-035 保留前提 1 | `accept` 的 `close`（[S-10](#s-10-工具调用在封口那一下解析且只解析这一次)、[S-12](#s-12-被砍过内容的调用落成半截)） | 残缺参数被解析成一个恰好合法、少了一半字段的调用，并被执行 | 规范场景 S-32、S-33；静态检查 SC-1 |
| P-9 | 被拒不改状态、不修补 | 安全 | `data.arrival-events/v1#S-29` | `accept`（[S-26](#s-26-被拒不改状态后果归宿主)） | 被拒的片段半截进了归约；或被「修好」后接了进去 | 规范场景 S-34、S-38 |
| P-10 | 快照是值，含已到达的全部内容 | 安全 | [PF-009 §6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | `snapshot`（[S-7](#s-7-快照交出什么)） | 重进的人看不到已经写出来的那几行；或他手里的快照被后来的事件改了 | 规范场景 S-36 |
| P-11 | 缺账记全未知，不伪造 | 安全 | `data.call-accounts/v1#S-20` | `closeOut`（[S-13](#s-13-账)） | 断在记账之前的发出记成零元 | 规范场景 S-35 |
| P-12 | 砍的汇总满足 `data.call-accounts/v1#S-15` 的三条等式；每一帧至多计一次「未原样送达」；工具侧 `merged + cut + byReason.frame_too_long ≤ emitted` | 不变量 | [PF-009 §6.16](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢) | 定义本身（[S-13](#s-13-账)、[S-14](#s-14-砍的汇总) 的去重规则）；配对靠宿主守 [S-28](#s-28-宿主要兑现的前提) 第 4 条的次序 | 汇总自相矛盾，读的人分不出砍了多少；先截短后拒收的一帧被算两次 | 性质测试（随机砍、合并与「先截短后拒收」）；examples 第 7c 节 |
| P-13 | 首个内容是第一个载荷非空的内容步骤，一经确定不变 | 不变量 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) | `accept`（[S-16](#s-16-首个内容的位置)） | 一个空串的填被当成开口，本可重发的调用不再重发 | 规范场景 S-31 |

**进展性质：本能力不拥有任何进展性质。**「一条流最终会有结局」要求生产者持续存活，或宿主替它放弃（[S-28](#s-28-宿主要兑现的前提) 第六条）——那是宿主的事。本能力每个操作都在一步之内返回。

### S-30 本版选用的形式工件

**选用一个 TLA+ 行为模型**：[`formal/Assembly.tla`](formal/Assembly.tla)，登记的配置是 [`formal/Assembly.cfg`](formal/Assembly.cfg)。

- **为什么是行为模型**：P-1～P-7 是对**事件序列**的承诺——多块并开、交错、封口次序任意、收尾、放弃——
  「一次到达装配等于一次性到达」更是两条序列在同一个折叠上的结果相等。只有行为模型能在有界范围内穷尽这些交错。
- **模型作证的只有 P-1 与 P-7**：P-2～P-6 在模型里就是 `accept` 的守卫本身，按构造成立，**不作证据**（证据是第八节列的规范场景与 examples 第 5 节）；
  P-1、P-7 各配一个预期出反例的有效性核对配置（共三份：[`Assembly_OrderByClose.cfg`](formal/Assembly_OrderByClose.cfg)、[`Assembly_ReplaceAsAppend.cfg`](formal/Assembly_ReplaceAsAppend.cfg)、[`Assembly_OneShotCloseFirst.cfg`](formal/Assembly_OneShotCloseFirst.cfg)），不登记为 formal task。
- **不建 Alloy**：块与账的结构约束归三份 data 契约，它们的 Schema 已经在判；本能力没有独立的结构关系要检查。
- **不建 JSON Schema**：线上形状归组合契约。
- 模型的条款映射、常量与前提、**盖不到的部分**（解析、被砍过的调用、快照、首个内容、砍的汇总、全部表示层判定）见 [`formal/README.md`](formal/README.md)；
  实际运行的工具、配置、范围与结果在[验证入口](../verification.md)。

### 规范场景

场景是本契约触发的证据形式；执行状态在[验证入口](../verification.md)，逐事件的手算在 [`examples.md`](examples.md)。

#### S-31 并开两块、一次砍、一次整体替换

一个工具执行的帧流：日志块以追加开、分几次填；日志块还开着时，截图面板以整体替换开、先后填两整张图；发出一侧合并了日志的两段并说一个 `rate_merged`；日志封口、面板封口、收尾。
**必须观察到**：`blocks` 次序是开块次序；面板留的是最后那张图；日志是各段相接；`frames.emitted` 与汇总按 [S-13](#s-13-账)、[S-14](#s-14-砍的汇总) 手算的一致；`firstContentAt` 是第一段日志的位置。实例：[`examples.md` 第 2 节](examples.md#2-并开两块一次砍一次整体替换)。

#### S-32 参数收齐却解析不了

一次模型回复开一个工具调用块，填入 `{"path": "a.md"` 后封口、正常收尾。
**必须观察到**：`accept` 接受了那个封口；结果里那一块是**解析不了的那一种**（`complete: true`、`rawArguments` 为原文、`unparseable: true`、没有 `arguments`），不是解析成功的那一种，也不是半截的。
「没有发起执行、以一条 `outcome = failed` 的结果回给模型」那一半归工具执行运行时，证据是它的规范场景（`capability.tool-execution-runtime/v1#S-64`）。

#### S-33 被砍过内容的调用落成半截

同一个调用块的参数分三次到，中间一段被截短、发出一侧说了一个 `frame_too_long`，之后封口。
**必须观察到**：结果里是**半截的调用**（`complete: false`，两位皆假），**没有被解析**——哪怕截短后的原文恰好是合法的 JSON。
另跑一支：只有 `rate_merged` 的合并——落成完整的调用。

#### S-34 收尾之后的事件被拒，状态不变

一份已接受 `finish` 的状态，再交来一个 `fill`、一个 `trim`、一个 `account`。
**必须观察到**：三个都得 `event_after_finish`；位置、快照、结算结果都与之前逐字相同；对它 `abandon` 也得 `event_after_finish`。

#### S-35 没收尾不能结算；放弃交出 `lost`

一份接受过几段文本、没接受过 `finish` 与 `account` 的模型侧状态。
**必须观察到**：`closeOut` 得 `stream_not_finished`；`abandon` 交出的 `ending.reason` 是 `lost`、没有 `error`、`firstContentAt` 在；
`account` 是全未知的那一份（`source: none`），**不是零**。

#### S-36 快照含开着的追加块的片段，快照是值

一条帧流上，日志块开着、已填三段。取快照 A；再接一段；取快照 B。
**必须观察到**：A 里日志块是 `closed: false`、`content` 是那三段相接；B 里是四段相接；**A 在接了第四段之后仍是三段**；A 的 `position` 比 B 小一。

#### S-37 一帧没发

一次工具执行的状态只接受了一个 `finish { reason: "end" }`。
**必须观察到**：`blocks` 为空，`frames.emitted = 0`，汇总各项为 `0`，`firstContentAt` 缺席。**这是正常形态，不是失败**。

#### S-38 失败值逐个

把 [`examples.md`](examples.md) 第 5 节的每一行交给 `accept`（或该行写的操作）。**必须观察到**：得到的失败值与那一行写的**逐字相同**；交进去的状态不变。

#### S-39 先截短、后拒收只计一次

一条帧流上，一个过长的填被发出一侧截短（交来一个 `frame_too_long` 的 `trim`，紧接着是截短后的那个填），那个填随即被拒（宿主紧接着交一个 `rejected` 的 `trim`）；另有一个过长的填被截短之后照常被接受。
**必须观察到**：被拒的那一帧在汇总里**只按拒收计一次**——`byReason.rejected` 算它、`byReason.frame_too_long` 不算它；截短后被接受的那一帧照常计进 `frame_too_long`；`omittedBytes` 两段都算；
`merged + cut + byReason.frame_too_long ≤ frames.emitted` 成立。实例：[`examples.md` 第 7 节 7c](examples.md#7-解析不了与被砍过)。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约。

#### CS-1 模型请求运行时收一次被用户叫停的回复

模型请求运行时在**回复吐了一段文本、一个工具调用正在收参数时用户叫停**时，交给 `accept` 一个 `finish { reason: "interrupted" }` 再 `closeOut`，依赖 [S-8](#s-8-收尾结算交出什么)、[S-9](#s-9-一块怎样落)、[S-13](#s-13-账)、[S-16](#s-16-首个内容的位置)，得到：
文本块是已到的那一段；调用落成半截、两位皆假；`ending.reason = interrupted`、`firstContentAt` 在——**「用户叫停、已有内容」那一行**，它据此包成 `AssistantMessage`、结局写进 `AssistantEnding`；账是上游报过的就用那份，没报就是全未知。**它不需要猜任何东西**。

#### CS-2 工具执行运行时收一段被中断的帧流

工具执行运行时在**一个后台工具开着日志块与面板、执行被中断**时，交给 `accept` 一个 `finish { reason: "interrupted" }` 再 `closeOut`，依赖 [S-9](#s-9-一块怎样落)、[S-13](#s-13-账)，得到：
已封口的块原样；开着的日志块是已写出的那几行；面板是最后一次填的那张图；`frames` 数出来了。`blocks` 非空，它据此包成 `ToolInternalMessage`，结局按 `data.messages/v1#S-14` 的对应表由 `interrupted` 取；**那次执行怎么收场另走 `ToolMessage`，不看这条流**。

#### CS-3 出站流给中途重进的观察者

会话出站流在**用户刷新页面、一条帧流正在进行**时，经宿主取 [S-20](#s-20-snapshot读快照) 的快照，依赖 [S-5](#s-5-位置)、[S-7](#s-7-快照交出什么)，得到：
已到达的全部内容与一个位置；此后从这个位置之后接着收。**跨进程时这一步要协议兑现**（[S-29](#s-29-部署装配给与协议给) 第六行）——如实记为「本版单机成立」。

#### CS-4 宿主的上游流结束了却没给收尾

模型请求运行时在**上游连接关闭、传输适配没来得及发 `finish`**时，调 `abandon`（能说出成因就带上），依赖 [S-22](#s-22-abandon放弃)，得到：
`ending.reason = lost`；已交付的块在 `blocks` 里——它据此把它们按 `data.model-response` 的 `delivered` 落、**不成为消息**；账照样在。

## 九、缺席怎么收

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| `start` 的 `target` | **拒绝**（`malformed`），不补 | [S-18](#s-18-start开一份状态) |
| `accept` 的事件，或事件的必填成员 | **拒绝**，按 `data.arrival-events/v1#S-28` 取值 | [S-19](#s-19-accept接一个事件) |
| 要借开块才能判的两项，而那一块没开着 | **不放行**：取序列失败值 | [S-25](#s-25-判定次序) |
| `finish`（对 `closeOut` 而言） | **拒绝**（`stream_not_finished`），不补收尾 | [S-21](#s-21-closeout收尾结算) |
| `abandon` 的 `reason` | 合法：结局没有 `error`，**不表示没有故障** | [S-22](#s-22-abandon放弃) |
| 模型侧的 `account` 那一步 | 账是全未知的那一份，不是零 | [S-13](#s-13-账) |
| 一块的填 | 合法：封口了就是封口块；开着的调用落成原文为空串的半截调用；其余开着的不落 | [S-9](#s-9-一块怎样落) |
| 一块的封口 | 合法：按已到的样子落；调用落成半截 | [S-9](#s-9-一块怎样落) |
| 首个内容 | 合法：`firstContentAt` 缺席 = 没开过口 | [S-16](#s-16-首个内容的位置) |
| 快照里一块的 `content` | 合法：开了口还没交出东西 | [S-7](#s-7-快照交出什么) |
| 宿主手里的状态（进程没了） | **不是本能力能收的**：没有东西可以放弃，收场由宿主一侧追补 | [S-22](#s-22-abandon放弃)、[S-29](#s-29-部署装配给与协议给) |

**本能力不定义任何恢复动作，也不承诺任何外部效果可逆**：它没有外部效果。

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**。

| # | 缺口 | 阻断谁 | owner |
|---|---|---|---|
| **G-1** | **已闭合**：解析不了的调用块的形状在 `data.content-blocks/v1#S-12`（`complete: true`、`rawArguments`、`unparseable: true`），[S-11](#s-11-参数收齐却解析不了只标记) 按它交出 | — | — |
| **G-2** | **已闭合（修复波 1b，[D-040 §六 L6](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）**：模型侧宿主在 `capability.model-request-runtime/v1#S-51` 逐条承诺 [S-28](#s-28-宿主要兑现的前提) 第 1、2、4、6、7、8、9 条（工具侧早已由 `capability.tool-execution-runtime/v1#S-62` 承诺第 1～4、6、7、9 条）；证据义务归那两份宿主契约 | — | — |
| **G-3** | **已闭合**：模型侧 `TrimSummary` 的家是 `data.model-response` 的 `trims`（它的 S-19 第 5 条） | — | — |
| **G-4** | **已闭合（2026-09-24，PF-009 rev 8）**：快照的内容与 [PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) 及[在途状态词条](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)一致，都含开着的追加块已到的片段 | — | — |
| **G-5** | **已闭合（2026-09-24，PF-009 rev 8）**：快照**不带**此前砍过什么，那份交代收尾时才有（[S-7](#s-7-快照交出什么)）；语义与本契约原写法相同，不出新版 | — | — |
| **G-6** | **已闭合**：一条消息里 `BlockId` 重复在落盘的接收边界上拒，值是 `data.messages/v1#S-39` 的 `block_id_duplicate`；本能力不另加失败值 | — | — |
| **G-7** | **已闭合（2026-09-24）**：原「只在施工简报里」的几项依据都有了持久落处——D-035、D-038 Q18、D-040 §S4 S4-c、PF-009 rev 8 与两份 data 契约，逐条见[设计依据](#设计依据)下的表 | — | — |

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **路由与持有**：目标到状态的对应、状态放在哪、活多久——归宿主。本能力**没有**「目标此刻有没有一条流」这种判定。
- **消息**：包成哪种消息、结局取哪一格、成不成消息——归宿主与 `data.messages`；[中断提醒](../../../../product/PF-009-context-message-types/design.md#613-只要发生了中断就补一条提醒)归 agent 循环一侧。
- **落盘与记账**：写进日志、记几次——归宿主与承载记录的一侧。
- **节流**：怎么砍、上限与额度——归做节流的那一方；投递一侧的节流不在任何账里（[S-15](#s-15-节流在到达装配之前投递一侧的节流不进账)）。
- **时刻与重发**：首个内容那一刻的时刻、能不能重发——归宿主与模型调用一侧。
- **执行**：本能力从不执行工具；解析不了的调用怎么回给模型，归工具执行运行时（[S-11](#s-11-参数收齐却解析不了只标记)）。
- **恢复**：进程没了之后的在途内容——不在任何地方（[PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程)），收场由宿主一侧追补。
- **生产者义务的核对**：封口块等于归约（`data.arrival-events/v1#S-20`）本能力**不重算、不比较**，以封口块为准。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；模型文件存在不表示已检查过，已检查的范围按那里写的为准。

## 十二、版本与规范工件

**本版是首版**，没有被采用的旧版本，没有语义或表示差异可记，也没有消费者迁移；`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`examples.md`](examples.md)、[`formal/Assembly.tla`](formal/Assembly.tla) 与 [`formal/Assembly.cfg`](formal/Assembly.cfg)；
[`formal/README.md`](formal/README.md) 拥有条款到模型的映射；三份有效性核对配置（[`formal/Assembly_OrderByClose.cfg`](formal/Assembly_OrderByClose.cfg)、[`formal/Assembly_ReplaceAsAppend.cfg`](formal/Assembly_ReplaceAsAppend.cfg)、[`formal/Assembly_OneShotCloseFirst.cfg`](formal/Assembly_OneShotCloseFirst.cfg)）**预期出反例、不登记为 formal task**。

**发布后**：本目录下的规范正文、实例与模型不可原地覆盖；修改发布新版本。
[已知缺口](#十已知缺口)已全部闭合（最后一项 G-2 于修复波 1b 闭合，**不改本契约语义**）。冻结之前在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。
