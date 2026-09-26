# data.arrival-events v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.arrival-events, 1)`——
  `family = data`、`topic = arrival-events`、规范路径 `spec/data/arrival-events/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-009 rev 8、PF-006 rev 19、PF-013 rev 12、PF-012 rev 14** 为准。
  2026-09-24 按各 topic 的 changelog 从起草时的 rev 逐版核到当前 rev：PF-009 rev 8 的「工具帧出错照常收尾」让帧流的 `lost` 多了两种来路（执行者没有回答、执行者换了代，[S-16](#s-16-收尾)）；
  「在途快照含已到片段」「开口是账」「入站语音整条到」与本契约既有条款一致；其余不改本契约条款。逐 topic 的记录见[验证入口「变化的影响」](../verification.md#变化的影响)
- **精确语义依赖**：

  | 坐标 | 消费 clauses | 取它的什么 | Schema 里怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | [`S-1`](../../content-blocks/v1/contract.md#s-1-七类块)、[`S-3`](../../content-blocks/v1/contract.md#s-3-blockid)、[`S-4`](../../content-blocks/v1/contract.md#s-4-两个标注)、[`S-5`](../../content-blocks/v1/contract.md#s-5-嵌套的块按合取取用)、[`S-6`](../../content-blocks/v1/contract.md#s-6-模态由媒体类型判定)、[`S-7`](../../content-blocks/v1/contract.md#s-7-媒体类型的规范形式)、[`S-10`](../../content-blocks/v1/contract.md#s-10-语音块与图块)、[`S-12`](../../content-blocks/v1/contract.md#s-12-完整的工具调用)、[`S-13`](../../content-blocks/v1/contract.md#s-13-半截的工具调用)、[`S-14`](../../content-blocks/v1/contract.md#s-14-callid)、[`S-26`](../../content-blocks/v1/contract.md#s-26-表示层拒绝值) | 七类块、块标识、两个标注、嵌套的块按合取取用（帧里嵌着的块给不了模型，[S-23](#s-23-执行帧的另外四条) ③）、模态判定、媒体类型、语音与图的两种 `data` 形状、工具调用的两种形状与「解析点在装配一侧」、`CallId`、嵌着的块不合形状时的拒绝值 | `$ref` 它的 `ContentBlock`、`BlockId`、`Visibility`、`MediaType`、`CallId` |
  | `omne-harness-lite-design-2026-09-15 · data.call-accounts · v1` | [`S-4`](../../call-accounts/v1/contract.md#s-4-未知是一个值不是零也不是缺席)、[`S-6`](../../call-accounts/v1/contract.md#s-6-usage四项-token-与来源)、[`S-8`](../../call-accounts/v1/contract.md#s-8-cost一次发出的费用)、[`S-11`](../../call-accounts/v1/contract.md#s-11-toolcallaccount一次工具执行的账)、[`S-15`](../../call-accounts/v1/contract.md#s-15-trimreason-与-trimsummary砍了要说)、[`S-19`](../../call-accounts/v1/contract.md#s-19-每条到达流恰一份账两次发出两份)、[`S-20`](../../call-accounts/v1/contract.md#s-20-缺账或被拒收记未知不伪造)、[`S-21`](../../call-accounts/v1/contract.md#s-21-账进日志不进给模型看的上下文)、[`S-27`](../../call-accounts/v1/contract.md#s-27-表示层拒绝值闭合)、[`S-37`](../../call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) | 记账那一步的载荷、「未知」的写法、工具执行的账另走 `ToolCallAccount`（所以帧流上没有记账这一步，[S-15](#s-15-记账)）、砍的四个原因与汇总口径、「至多一次」归语法、缺账记未知、账不进给模型看的上下文、嵌着的账不合形状时的拒绝值、模型调用的标识 | `$ref` 它的 `Usage`、`Cost`、`TrimReason`、`ModelCallId` |
  | `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1` | [`S-17`](../../loop-extension/v1/contract.md#s-17-failurecause) | 故障成因 `FailureCause` | `$ref` 它的 `$defs/FailureCause` |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [`S-33`](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) | 「表示层校验与判定分开」的口径（[S-29](#s-29-表示层拒绝不是判定也不修补)） | 不 `$ref` |

- **本契约不依赖任何 capability 或 composition 契约。**正文里出现的 `capability.stream-assembly`、`data.messages`、`data.model-response`
  都是**落点**：谁消费本语法、装出来的东西落在哪。方向是它们 → 本契约。
  其中 [`data.messages/v1#S-14`](../../messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾)（帧流的结局怎样对到 `ToolInternalEnding`）与 [`#S-10`](../../messages/v1/contract.md#s-10-assistantmessage-怎么收的尾)（回复流的结局怎样对到 `AssistantMessage` 的 `ending`）只以坐标指路（[S-16](#s-16-收尾)），本契约不据它们写出任何承诺，不登依赖。
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.arrival-events/v1#S-12`。
  本文引另一份契约的条款一律带坐标，**裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 一条消息是分次到达的；分次到达的东西不是第八种消息 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#55-一条消息是分次到达的) · [§6.7](../../../../product/PF-009-context-message-types/design.md#67-分次到达的东西不进消息类型清单) | S-1、S-4 |
| 能一点点长的四样，与开个口整个交出来的 | [§5.5 能一点点长出来的](../../../../product/PF-009-context-message-types/design.md#能一点点长出来的与要么没有要么整个有的) | S-11、S-12 |
| 五个步骤：开块、填、封口、记一次账、收尾；封口交出完整的块；一条流必须有结局；账只记一次 | [§5.5 到达的过程有它自己的语法](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) | S-6、S-13、S-15、S-16、S-17、S-18 |
| 填有两种模式，开块时说明；整体替换的块每次给整个新内容，图与文件也能开成整体替换 | [§5.5 「填」有两种模式](../../../../product/PF-009-context-message-types/design.md#填有两种模式开块的时候说明是哪一种) · [§6.15](../../../../product/PF-009-context-message-types/design.md#615-每一块自己说它是追加片段还是整体替换系统照办) | S-8、S-11、S-12、S-19 |
| 组装的结果与一次性拿到的相同 | [§5.5](../../../../product/PF-009-context-message-types/design.md#组装出来的必须与一次性拿到的一模一样) · [§6.8](../../../../product/PF-009-context-message-types/design.md#68-组装的结果与一次性拿到的必须相同) | S-19、S-20、S-22 |
| 工具调用参数收齐了才算数、只解析一次、残缺的不解析 | [§5.6](../../../../product/PF-009-context-message-types/design.md#工具调用的参数收齐了才算数) · [§6.10](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行) | S-13 |
| 执行帧就是 `ToolInternalMessage` 的到达增量，同一套语法；帧不进模型上下文；大部分工具不发帧；执行怎么收场，这条消息都照常收尾（rev 8 起覆盖失败与等不到应答） | [§5.8](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量) · [§6.14](../../../../product/PF-009-context-message-types/design.md#614-工具帧不进模型的上下文) · [大部分工具不发这个](../../../../product/PF-009-context-message-types/design.md#大部分工具不发这个而那是正常形态) | S-2、S-16、S-23 |
| 两种增量语义每一块自己说；系统不查工具定义 | [§5.8](../../../../product/PF-009-context-message-types/design.md#两种增量语义每一块自己说) | S-8 |
| 帧多了要节流；砍了要说，不许默默丢 | [§5.8](../../../../product/PF-009-context-message-types/design.md#帧多了要节流规则就是-616-那一条) · [§6.16](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢) | S-14、S-22 |
| 发帧不能把工具本身搞失败 | [§5.8](../../../../product/PF-009-context-message-types/design.md#发帧不能把工具本身搞失败) · [§6.17](../../../../product/PF-009-context-message-types/design.md#617-发帧发不出去不影响这次工具执行) | S-16、S-23 |
| 流断在半路的收场；用户看见了的日志里必须有 | [§5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | S-16 |
| 不留到达的过程；在途状态不是日志、不是消息 | [§9.2](../../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程) · [在途状态](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) | S-4 |
| 帧的形状由一份协议约定，不由工具定义声明；收到什么就按什么办 | [PF-006 §4 发帧](../../../../product/PF-006-tools-and-skills/design.md#发帧) · [帧长什么样](../../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明) | S-2、S-8、S-23 |
| 首 token 指交出的第一样内容，不论模态；整交的块开了口不算 | [PF-013 §5.4 「已经开口说话了」](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) | S-21 |
| 用户中断不是故障、不带成因；故障带成因与原样状态码 | [PF-013 还有一种没走完](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) · [§5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) | S-16 |
| 一次模型调用可以发出不止一次，两次发出是两条流 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) | S-5 |
| 语法借 `StreamChunk` 骨架并条款化：五步与块索引关联、封口交完整块、用量独立一步且在收尾前、失败归一为收尾、参数保持原始串；唯一解析点在装配器；一个索引终身只开一次 | [D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) 选择表第二行、保留前提 1、3、6、8 | S-6、S-7、S-13、S-17、S-24 |
| 规格形式；部署边界 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-25～S-29 |
| 统一语言正式名 | [增量到达](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival) · [在途状态](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival) · [执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) · [发帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission) · [内容块](../../../../ubiquitous_language/terms/record-and-context.md#ul-content-block--内容块--content-block) · [模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality) | 全部 |

> **来自裁决的条款，逐条点名**：
>
> | 条款 | 裁决 | 出处 |
> |---|---|---|
> | [S-7](#s-7-块索引) | 块索引由生产者给、装配一侧校验单调与唯一 | [D-038 Q4](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) |
> | [S-10](#s-10-呈现提示) | 块头带可选的呈现提示，取值集本版不定，非法值具名拒绝 | [D-038 Q17](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) |
> | [S-5](#s-5-信封与目标) 的 `dispatch` | 模型调用的目标按「哪一次发出」分开 | 主线裁定，见 [D-040 §一 S8-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s8model-response报回的) |
> | [S-8](#s-8-开块) 的「帧入口」 | 工具侧块的 `id` 由宿主的帧入口编，与 `data.content-blocks/v1#S-3` 同一处 | 主线裁定，见 [D-040 §一 S4-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s4arrival-events--stream-assembly报回的) |
> | [S-9](#s-9-块头)、[S-28](#s-28-表示层拒绝值) 的 `head_modality_mismatch` | 块头模态不符由本契约拒，进表示层拒绝值 | 主线裁定，见 [D-040 §五 K4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
> | [S-16](#s-16-收尾) 工具那一列 | 执行者没有回答、桥换代落 `lost`，只有有意停下才是 `interrupted`；对到 `ToolInternalEnding` 的表归 `data.messages` S-14 | 主线裁定，见 [D-040 §五 K2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加) |
> | [S-16](#s-16-收尾) 宿主放弃在途的流落 `lost`（`interrupted` 不含「宿主把它带走」）；回复流对到 `ending` 的表归 `data.messages` S-10 | 主线裁定，见 [D-040 §七 M1、M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |
>
> **没有产品行、属规格层推导的条款**：[S-8](#s-8-开块) 的 `id` 与 `visibility`、[S-13](#s-13-封口) 的「工具调用的封口不带块」、
> [S-15](#s-15-记账) 的「记账那一步就是 `{ usage, cost }`、引 `data.call-accounts` v1」（账只有一个家）与「工具执行这一侧没有记账这一步」、
> [S-16](#s-16-收尾) 的「成因引 `data.loop-extension` v1 的 `FailureCause`、不自定义」（同一件事一个取值域）、
> [S-22](#s-22-节流只动填合并不改结果砍了要说) 的「节流只动填」、[S-24](#s-24-违反语法由消费一方判定并命名) 的「`id` 重复在消息层拒，拒绝值 `block_id_duplicate` 归 `data.messages`」（`data.content-blocks/v1#S-3` 把这一查交给看得见整条消息的边界）——理由写在各条正文里。
> [S-25](#s-25-装配给与协议给) 由 SYS-DEPLOY 供给，[S-26](#s-26-规范表示)～[S-29](#s-29-表示层拒绝不是判定也不修补) 由 SYS-SPEC 供给。

## 一、目的与消费者

### S-1 本契约拥有什么

**到达语法的机器可读形状**：一条[消息](../../../../ubiquitous_language/terms/record-and-context.md#ul-message--消息--message)[分次到达](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival)时，
生产的一方交出的那串事件长什么样、各自是什么意思、在一条流里能以什么次序出现，以及一个事件不合形状时的**表示层拒绝值**。

**一份语法，两个生产者**：一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)的回复（它长成一条 `AssistantMessage`），
与一次[工具执行](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的[执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)（它们长成一条 `ToolInternalMessage`）。
**消费的一方不看生产者是谁**；两边不同的只有[第四节 S-23](#s-23-执行帧的另外四条) 那几条。

它是一份**数据契约**：它定义的是**值与值序列的合法性**，没有提交点、没有自己的状态、不做判定，**因此不需要插件**。
**按这套语法把一条流装配起来**——装配状态怎样随事件前进、收尾时交出哪些块与账——是 `capability.stream-assembly` 的事，它是本语法唯一的消费方式；
**装配状态由宿主持有**（模型请求运行时、工具执行运行时），事件按目标交给哪一份装配状态、交出的块包成哪种消息，也归宿主。

### S-2 消费者

| 消费者 | 消费什么 |
|---|---|
| `capability.stream-assembly`（同批起草） | 全部：信封、六种事件、语法次序、归约、拒绝值；**违反语法时的失败值由它命名**（[S-24](#s-24-违反语法由消费一方判定并命名)） |
| 模型调用一侧的传输适配（`capability.model-request-runtime` 之内，归提供者设计） | 把上游的流**只在这里**翻译成本语法（[D-035](../../../../record/decisions/message-and-stream-baseline/decision.md)）；[S-13](#s-13-封口) 的「参数保持原始串、不中间解析」、[S-16](#s-16-收尾) 的成因与状态码 |
| 工具执行一侧的发帧原语与 MCP 进度 → 发帧（`capability.tool-execution-runtime`、`capability.mcp-bridge`） | [S-23](#s-23-执行帧的另外四条) 与 [S-22](#s-22-节流只动填合并不改结果砍了要说)：帧的单位、帧里媒体只许引用、帧不给模型看、节流与「砍了要说」 |
| 会话出站流（呈现一侧订阅，契约未建立） | 信封与事件本身：中途重进的观察者先拿在途状态、再续收事件；[S-10](#s-10-呈现提示) 的呈现提示 |
| `data.call-accounts` v1 | 它的 `ToolCallAccount.frames`（是 `FrameAccount` 时的 `emitted`）数的「一帧」按 [S-23](#s-23-执行帧的另外四条) 的单位；那份契约以坐标引它、作定义性引用，**不登 catalog 依赖**——本契约已依赖那份契约，登了成环 |

### S-3 本契约不拥有什么

- **不拥有块与账的形状**：块归 `data.content-blocks` v1，用量与费用、砍的原因与汇总归 `data.call-accounts` v1——**本契约引用它们的 `$defs` 名，不复述定义**。
- **不拥有装配**：装配状态怎样前进、收尾时交出哪些块与账，归 `capability.stream-assembly`；
  谁持有装配状态、按目标路由事件、把交出的块包成哪种消息、首个内容那一刻是什么时刻，归宿主（模型请求运行时与工具执行运行时）。
- **不拥有消息**：`AssistantMessage`、`ToolInternalMessage` 长什么样归 `data.messages` v1；出错断时已交付的块放在 `data.model-response` v1 的 `delivered`。
- **不拥有「怎么砍」的参数**：长度上限、额度、拒收规则是做节流的那一方的具名参数（[G-4](#九已知缺口)）；本契约只拥有**砍了之后怎样在流上说**（[S-14](#s-14-砍)）。
- **不拥有成因的取值**：故障成因的八个值归 [`data.loop-extension/v1#S-17`](../../loop-extension/v1/contract.md#s-17-failurecause)。
- **不拥有传输**：事件经什么通道、按什么编码从生产者送到消费者，本契约不定；跨进程之后必须兑现什么，列在 [S-25](#s-25-装配给与协议给)。

## 二、含义与使用范围

**适用范围**：一个部署之内。本版单机交付，但每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论单机由装配给、跨进程后要由协议重新兑现，见 [S-25](#s-25-装配给与协议给)。

### 规格层 token 与词条的对应

| 规格层 token | 词条 |
|---|---|
| 一个 `ArrivalEnvelope` 的序列 | [增量到达 · Incremental Arrival](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival) 说的「分次到达」的那些动作 |
| `target.kind = "tool_execution"` 的那些 `open`、`fill`、`close` | [执行帧 · Execution Frame](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)；交出它们的那个动作是[发帧 · Frame Emission](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission) |
| `open` · `fill` · `close` · `account` · `finish` | PF-009 §5.5 语法的五步：开一个块 · 往里填 · 封上这个块 · 记一次账 · 收尾 |
| `trim` | PF-009 §6.16「砍了要说」的那一句话；**它不是 §5.5 五步之一**，是流上额外的一种事件 |
| `fill` 的两种填法 `append` · `replace` | PF-009 §5.5 的「追加片段」·「整体替换」 |
| 消费一侧持有的、拼到一半的那份 | [在途状态 · In-Flight Arrival](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)——本契约只引，不定义 |

**下列是规格层的名字，不是统一语言词条**，本契约不给它们「中文 · English」那种词条式标题：
`ArrivalEnvelope`、`ArrivalTarget`、`ArrivalEvent` 及六种事件的名字、`BlockKind`、`FillMode`、`BlockHead`、`PresentationHint`（呈现提示，**无词条**）、`FinishReason`、
块索引（`index`，**无词条**）。

**`dispatch`（第几次发出）说的是[一次发出 · Upstream Send](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)**：一次模型调用可以发出不止一次，每一次是一条流（[S-5](#s-5-信封与目标)）；成员名 `dispatch` 是规格层的 token。

### S-4 到达事件不是记录条目

**本契约的事件不进[会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)，不是记录条目，也不是消息。**
[日志只留收尾之后的那条消息，不留每个增量是怎么到的、分了几次到](../../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程)——
判据是「不会有人问那一刻用户屏幕上是什么」，**那份数据没有消费者**。
[拼到一半的那份也不是日志、不是消息](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)，它由运行时持有，形状与操作归 `capability.stream-assembly`。

因此：**任何为了「能回放当时的样子」而把事件逐个存下来的实现，都在本契约之外**，也得不到本契约的任何保证；
本契约的事件**没有身份**——没有事件标识、没有时间戳——因为没有谁需要事后指认某一个事件。
[分次到达的东西不进消息类型清单](../../../../product/PF-009-context-message-types/design.md#67-分次到达的东西不进消息类型清单)：一个正在长的块**不是第八种消息**。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `ArrivalEnvelope`、`ArrivalTarget` | 一个事件与它属于哪条流 | [S-5](#s-5-信封与目标) |
| `ArrivalEvent` | 六种事件之一 | [S-6](#s-6-六种事件) |
| 块索引 `index` | 一条流内指认一个块 | [S-7](#s-7-块索引) |
| `OpenEvent`、`BlockKind`、`FillMode` | 开块 | [S-8](#s-8-开块) |
| `BlockHead`、`PresentationHint` | 开块时说的块头 | [S-9](#s-9-块头)、[S-10](#s-10-呈现提示) |
| `FillEvent` | 填 | [S-11](#s-11-填追加片段)、[S-12](#s-12-填整体替换) |
| `CloseEvent` | 封口 | [S-13](#s-13-封口) |
| `TrimEvent` | 砍了一次 | [S-14](#s-14-砍) |
| `AccountEvent` | 记一次账 | [S-15](#s-15-记账) |
| `FinishEvent`、`FinishReason` | 收尾 | [S-16](#s-16-收尾) |

### S-5 信封与目标

**每个事件装在一个信封里：`{ target, event }`。`target` 说这个事件属于哪一条正在到达的消息。**

一条会话的出站流上**同时有好几条消息在到达**——一批并行的工具执行、转了后台的执行、模型的回复——
**事件必须自己说它属于谁**，否则拼不起来。`ArrivalTarget` 恰两种形状：

| `target.kind` | 成员 | 这条流长成什么 |
|---|---|---|
| `model_call` | `callId`：那次模型调用的 `ModelCallId`；`dispatch`：**第几次发出**，整数 `≥ 1` | 一条 `AssistantMessage` 的块，或按收场不成消息——包成哪种、成不成，归宿主与 `data.messages` |
| `tool_execution` | `callId`：那次工具执行的 `CallId`（`data.content-blocks/v1#S-14`） | 一条 `ToolInternalMessage` 的块（一帧没发时什么都没有） |

- **一个目标就是一条流。**两个信封的目标相等，当且仅当 `kind` 相同，且各成员逐个相等（标识逐码点相等，`dispatch` 数值相等）。
- **模型调用按「哪一次发出」分开**：[一次模型调用可以发出不止一次，两次发出是两条流、两份账](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)，
  每次发出各有自己的开块、收尾与记账。**只带 `callId` 不带 `dispatch` 的目标，会让第一次发出的迟到事件落进第二次的消息里**——所以 `dispatch` 必带。
  `(callId, dispatch)` 与 `data.model-response` v1 里那份响应体的「哪次调用、第几次发出」**是同一对值**。
- **工具执行一次一条流**：[一次工具执行对应一条 `ToolInternalMessage`](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)，**转了后台之后仍是同一条**。
- **`ModelCallId` 与 `CallId` 都不透明**：本契约不解析它们，不从中读出会话、租户或次序。
  `ModelCallId` 的形状由 [`data.call-accounts/v1#S-37`](../../call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) 给出（会话内唯一）；`CallId` 的形状与唯一范围归 `data.content-blocks/v1#S-14`。
- **目标里没有会话、没有租户**：一个目标**只在它所属的那个会话里有意义**——这是装配给的（[S-25](#s-25-装配给与协议给) 第二行）。

### S-6 六种事件

**`event` 恰为六种之一，按判别成员 `t` 区分：`open`、`fill`、`close`、`trim`、`account`、`finish`。**

前五个里的四个加上 `finish` 是 [PF-009 §5.5 那套语法的五步](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)；
`trim` 是[「砍了要说」](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢)那一句，它**不改变任何块**（[S-14](#s-14-砍)）。

- `t` 的取值**闭合**（[S-27](#s-27-判别式与枚举闭合)）：出现了但不是这六个之一，是表示层拒绝 `event_unknown`；**不忽略它继续，也不按最像的一种处理**。
- **本版没有「改写已封口的块」「重开一段」这类事件**：取代只发生在一个整体替换的块里、在它封口之前（[S-12](#s-12-填整体替换)）；
  [工具执行停了不重来](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)，没有第二段。

### S-7 块索引

**`index` 是一个非负整数，由生产的一方给出，在一条流（一个目标）内指认一个块。**

- **唯一**：一条流里，**一个索引终身只开一次**——开过的索引，封口之后也不再开。
- **单调**：一条流里每一次 `open` 的索引，**严格大于**这条流此前开过的所有索引；**不要求连续**，中间可以跳号。
- `fill`、`close` 与带索引的 `trim` 用它指回一个已开的块。
- **它不是块的身份**：块的身份是 `BlockId`（[S-8](#s-8-开块)），它在会话日志里靠 `(messageId, id)` 指认（`data.content-blocks/v1#S-3`）；
  索引只在这条流里有意义，流收尾之后**不留下来**。
- **块在消息里的次序就是开块的次序**，因此也就是索引从小到大的次序；**封口的次序任意**（多块可以同时开着，[S-18](#s-18-块的一生)）。

**为什么由生产者给而不是由消费一侧编**：同时开着几个块时，一个整体替换的块要能被后来的 `fill` 指回；
由消费一侧编号，就要求生产者按消费一侧的编号说话——那等于要求事件严格按生产顺序到达并由两边各数一遍。
**消费一侧只校验**：索引重开、索引倒退各是一个失败值（[S-24](#s-24-违反语法由消费一方判定并命名)）。

### S-8 开块

**`open` 开一个块，并在这一下把这块的一切「此后不再变」的事说定：**

| 成员 | 必填 | 含义 |
|---|---|---|
| `index` | 是 | 块索引（[S-7](#s-7-块索引)） |
| `kind` | 是 | 这一块是七类里的哪一类（`BlockKind`，与 `data.content-blocks/v1#S-1` 的七类一一对应，本契约不另立类） |
| `fill` | 是 | 这一块怎么填：`append` 追加片段，或 `replace` 整体替换（`FillMode`） |
| `id` | 是 | 这一块的 `BlockId`（`data.content-blocks/v1#S-3`） |
| `visibility` | 是 | 这一块的两个[块标注](../../../../ubiquitous_language/terms/record-and-context.md#ul-block-annotation--块标注--block-annotation)（`data.content-blocks/v1#S-4`） |
| `head` | 否 | 块头：媒体类型、调用身份、呈现提示（[S-9](#s-9-块头)） |

- **填法说在开块这一下，此后这块怎么填就定了**（[PF-009 §6.15](../../../../product/PF-009-context-message-types/design.md#615-每一块自己说它是追加片段还是整体替换系统照办)）。
  系统**不查工具定义**，也没有「声明与行为不符」这种错——[收到什么就按什么办](../../../../product/PF-006-tools-and-skills/design.md#帧长什么样由一份协议约定不由工具定义声明)。
  一条流里各块**各说各的**：先开几个追加片段的块、最后开一个整体替换的块，是允许的。
- **`append` 只对四类成立**：`text`、`thinking`、`tool_call`、`voice`——[能一点点长出来的只有这四样](../../../../product/PF-009-context-message-types/design.md#能一点点长出来的与要么没有要么整个有的)。
  其余三类（`image`、`file`、`tool_result`）以 `append` 开块，是表示层拒绝 `fill_kind_not_appendable`。**`replace` 对七类都成立**。
- **`id` 与 `visibility` 为什么在开块时就要说**：一块可能**永远等不到封口**——被用户叫停、写到上限、帧流断了——
  而[用户看见了的，日志里必须有](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)。
  消费一侧要能在没有封口的情况下把这块落成一个合法的块，而块的身份与标注**不能由它替生产者决定**：
  补一个标注就是[替没表过态的一方表了态](../../../../product/PF-010-context-management-and-assembly/design.md#要求二成分必须是明确标了给模型读的)。
  工具调用块更是**从不带着封口块到达**（[S-13](#s-13-封口)）。
- **`visibility` 缺一即拒**：缺席或缺任一位，拒绝值取 `data.content-blocks/v1#S-26` 的 `visibility_missing`——**是同一件事：这一块没表过态**。
- **`id` 的唯一范围是这条流装出的那整条消息**，含这条流里交出的块内嵌的块（`data.content-blocks/v1#S-3`）。分配它的一方要看得见整条消息：
  **模型侧是生产的一方**（传输适配），**工具侧是宿主的帧入口**——工具作者与 MCP 桥经它交帧，它是工具侧唯一看得见整条消息的一处（与 `data.content-blocks/v1#S-3` 同一处，主线裁定，见 [D-040 §一 S4-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s4arrival-events--stream-assembly报回的)）。
  一条消息里 `id` 重复在哪一步被拒，见 [S-24](#s-24-违反语法由消费一方判定并命名)。

### S-9 块头

**`head` 可选，是 `{ mediaType?, callId?, tool?, presentation? }`；它说的是这块从开块起就知道、此后不变的事。**

| 成员 | 对哪几类有意义 | 约束 |
|---|---|---|
| `mediaType` | `voice` **必带**；`image`、`file`、`text`、`thinking` 可带；`tool_call`、`tool_result` **不得带** | `MediaType` 的规范形式（`data.content-blocks/v1#S-7`）。**它的模态必须与块的类型相符**：`voice` → `audio`，`image` → `image`，`text`／`thinking` → `text`（按 `data.content-blocks/v1#S-6` 的 `modalityOf`）；`file` 任意 |
| `callId` | **只有 `tool_call`，且必带** | `CallId`：这次调用**已登记**的标识（`data.content-blocks/v1#S-14`）——模型给的 id 怎样登记成不撞的 `CallId`，是生产者一侧的事 |
| `tool` | **只有 `tool_call`，且必带** | 模型面那个工具条目的 name，非空 |
| `presentation` | 任意 | [S-10](#s-10-呈现提示) |

- **`voice` 为什么必带 `mediaType`**：一段语音可能永远等不到封口，消费一侧要用它落成语音块，而语音块的媒体类型必填（`data.content-blocks/v1#S-10`）。
- **`tool_call` 为什么必带 `callId` 与 `tool`**：封口时消费一侧要用它们拼出那个调用块（[S-13](#s-13-封口)）；
  它们是[调用的元数据，不是参数](../../../../record/decisions/message-and-stream-baseline/decision.md)，不能随「填」换掉。
- **模态不符**（例如 `voice` 带 `image/png`）**是本契约的表示层拒绝 `head_modality_mismatch`**（[S-28](#s-28-表示层拒绝值)；主线裁定，见 [D-040 §五 K4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：只看这一个 `open` 事件就判得出，不需要这条流此前的任何事件，所以按 [S-24](#s-24-违反语法由消费一方判定并命名) 的判定时机归本契约，**不另由消费一侧命名**。
  它只在 `mediaType` 合乎规范形式时判；不合规范形式的，是嵌着的值不合 `data.content-blocks` v1，取那边的 `malformed`，不判模态（与 `data.content-blocks/v1#S-10` 同一条规矩）。
  **缺了必带的成员、或给不该给的类带了**是本契约的表示层拒绝 `malformed`。
- **块头与封口块必须说同一件事**：封口块或整块的填若带了 `mediaType`，必须与块头的逐字相同（[S-13](#s-13-封口)）。

### S-10 呈现提示

**`presentation` 可选，是 `{ hint, language? }`：告诉呈现一侧这块该怎么画——同是 `text/plain`，日志要逐行折叠、终端输出要等宽带色。**

- **缺席的意思是「照 `mediaType` 呈现」**；块头也没有 `mediaType` 时，照块的类型呈现。**缺席不是一个待补的值。**
- **`hint` 与 `language` 各自的取值集，本版不定**——它们是呈现一侧的具名集合，owner 是呈现层（[G-3](#九已知缺口)）。
- **非法值具名拒绝，不静默降级**：`presentation` 不合形状（缺 `hint`、空串、多出成员），或 `hint`／`language` 不在那个集合里，
  是表示层拒绝 `presentation_invalid`；**不把它当成缺席、不改用 `mediaType` 接着画**——
  一块被悄悄换了画法的面板，看的人分不出它原本想怎么画。
- **由此，在 [G-3](#九已知缺口) 闭合之前，任何带 `presentation` 的块头都得 `presentation_invalid`**：取值集是空的，没有一个值判得出合法。
  **这不是「先放行、以后再收紧」**——判不出来就是拒绝。

### S-11 填：追加片段

**对一个以 `append` 开的块，`fill.payload` 是一个片段；这块此刻的内容，是它收到的全部片段按到达次序依次相接。**

| 块的类型 | 片段是什么 |
|---|---|
| `text`、`thinking` | 一段**非空**文本 |
| `tool_call` | 参数原文的一段**非空**文本——**原样，不解析**（[S-13](#s-13-封口)） |
| `voice` | 一段**非空**字节，写成标准 base64（RFC 4648 §4，带填充，无换行与空白）；相接的是**解码后的字节** |

- **片段非空**：空片段什么也没交出，却会被当成「开了口」（[S-21](#s-21-第一个内容步骤)）——所以不许有。
- 片段不合它那一类（不是字符串、是空串、`voice` 的片段不是那种 base64），名字归消费一侧（[S-24](#s-24-违反语法由消费一方判定并命名)）。

### S-12 填：整体替换

**对一个以 `replace` 开的块，`fill.payload` 是这块的整个新内容；这块此刻的内容，是它收到的最后一次填。**

| 块的类型 | 整个新内容是什么 |
|---|---|
| `text`、`thinking` | 整段文本（可以是空串——一块面板可以被清空） |
| `tool_call` | 参数原文的全文 |
| `voice` | 整段语音字节，标准 base64，**非空** |
| `image`、`file`、`tool_result` | **一整块**，是 `data.content-blocks` v1 的 `ContentBlock`；它的 `kind`、`id`、`visibility` 必须与开块时说的相同，带 `mediaType` 时必须与块头的相同 |

- [「只有四样能填」说的是追加片段那一种](../../../../product/PF-009-context-message-types/design.md#填有两种模式开块的时候说明是哪一种)：
  图、文件、工具结果也能开成整体替换的块——一块不断刷新的截图面板，每次填交出整张新图，封口时留最后那一张。
  **它仍然是「开个口，整个交出来」，只是交出来不止一次。**
- **取代只发生在这一块里，不跨块**：后来的填替换的是它自己先前填进去的内容，**不是前面别的块**。
- 整个新内容不合开块时说的那一块，是表示层拒绝 `replace_payload_shape`。**要看得见这块的开块才判得出**——本契约要借开块才能判的拒绝值有两个，它是其一；另一个是帧流上往语音块填字节的 `frame_media_inline`（[S-23](#s-23-执行帧的另外四条)、[S-28](#s-28-表示层拒绝值)）。

### S-13 封口

**`close` 封上一个块：此后这块不再变。除工具调用块外，封口交出的是完整的那一块。**

| 块的类型 | `close.block` |
|---|---|
| `tool_call` | **不带。**参数原文就是这块收到的全部填按 [S-19](#s-19-归约一块此刻是什么) 归约的结果；**解析由消费一侧在封口这一下做，且只做这一次** |
| 其余六类 | **必带**，是 `data.content-blocks` v1 的 `ContentBlock`；`kind`、`id`、`visibility` 与开块时相同，带 `mediaType` 时与块头的相同 |

- **封口交出完整的那一块**：[消费的一方可以自己把增量拼起来，但不必——两边各拼一次，就有了两个可能不一致的答案](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)。
  所以**封口块就是这块的最终内容**；它与各次填的关系是生产者的义务（[S-20](#s-20-封口块等于归约)）。
- **工具调用为什么例外**：[没收齐的参数不解析；解析只发生一次，收齐之后、动手之前](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行)，
  而[唯一的解析点在装配器](../../../../record/decisions/message-and-stream-baseline/decision.md)（D-035 保留前提 1：传输一侧**不得中间解析**）。
  完整的调用块要带解析后的 `arguments`（`data.content-blocks/v1#S-12`）——让生产者交出它，就是让生产者去解析。
  **所以工具调用块封口时不带块，参数保持原始串，由消费一侧在这一下解析。**
- **封口的意思是「这一块到齐了」，不是「流停了」**：一块被写到上限截断、被用户叫停、帧流断了，**生产者不得替它封口**——
  它就留在开着的状态，由消费一侧按收场处理（半截的工具调用落成 `data.content-blocks/v1#S-13` 的形状）。
  对工具调用块这一条是硬的：**封口就是在说「参数收齐了」**，一个被截断的调用若被封口，它残缺的参数就会被当成收齐的去解析。
- 封口块与开块说的不是同一块、工具调用块的封口带了块、其余类的封口没带块——名字归消费一侧（[S-24](#s-24-违反语法由消费一方判定并命名)）。

### S-14 砍

**`trim` 说「有增量没有原样送达」：`{ index?, reason, merged?, omittedBytes? }`。它只记，不改任何块。**

[节流可以合并相邻的增量，但不许默默丢弃；砍了多少、为什么砍，都要能看出来](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢)。
`reason` 取 `data.call-accounts` v1 的 `TrimReason` 四值之一（[`S-15`](../../call-accounts/v1/contract.md#s-15-trimreason-与-trimsummary砍了要说)），**本契约不另列一份**；四值以外是表示层拒绝 `trim_reason_unknown`。

| `reason` | 一个 `trim` 说的是 | `merged` | `omittedBytes` |
|---|---|---|---|
| `rate_merged` | 一次合并：若干个增量合成一个送达，或整体替换的块被取代的几次填被去掉 | **必带**，`≥ 1`：因这次合并**不再单独送达**的增量个数（`n` 个合一记 `n − 1`） | **不得带**——合并不丢内容 |
| `frame_too_long` | 一个增量超过长度上限，被截短后送达 | 不得带 | **必带**，`≥ 1`：截掉的字节数 |
| `quota_exhausted` | 一个增量因额度用完**整个没有送达** | 不得带 | **必带**，`≥ 0`：它的载荷字节数 |
| `rejected` | 一个增量因被拒收**整个没有送达** | 不得带 | **必带**，`≥ 0`：它的载荷字节数 |

- **一个 `trim` 对应一次砍**：`frame_too_long`、`quota_exhausted`、`rejected` 各说**一个**增量；一次合并说**一组**。
- `index` 给出时指这次砍落在哪一块上，必须是这条流已开过的索引；**缺席的意思是「落不到某一块上」**——例如被拒收的那个事件本身不合形状、读不出它属于哪一块。
- **字节怎么数**照 `data.call-accounts/v1#S-15`：文本按 UTF-8，二进制按原字节；整块的载荷与不带载荷的事件怎样计字节，本版未定（[G-5](#九已知缺口)）。
- **一条流上全部 `trim` 的汇总，就是那条流的 `TrimSummary`**（`data.call-accounts/v1#S-15`）——汇总的算式由 `capability.stream-assembly` 写明。
- **它不改任何块**：`trim` 之后各块照旧；被截短的那个增量，送达的就是截短之后的样子。

### S-15 记账

**`account` 是这次发出的账：`{ usage, cost }`，两项都必带，分别是 `data.call-accounts` v1 的 `Usage` 与 `Cost`。**

- **拿不到的数写 `"unknown"`，不写缺席**（[`data.call-accounts/v1#S-4`](../../call-accounts/v1/contract.md#s-4-未知是一个值不是零也不是缺席)）：
  上游一个用量都没报，就是四项全 `"unknown"`、`source: none`；费用拿不到，就是 `cost_usd: "unknown"`、`source: none`。**不写零，不写估算。**
- **一条流至多一次，且在收尾之前**：[账只记一次——记两次就是两次计费](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)。
  [D-035 把「至多还是恰好」留给了语法](../../call-accounts/v1/contract.md#s-19-每条到达流恰一份账两次发出两份)，**本契约定为至多一次**：
  流可能在记账之前就断了，语法不能要求一个断了的流交出它交不出的东西。**承载记录那一侧的「恰好一份」**由缺账记未知兑现（[`data.call-accounts/v1#S-20`](../../call-accounts/v1/contract.md#s-20-缺账或被拒收记未知不伪造)）。
- **只有 `model_call` 这一侧有这一步**：一次工具执行的账是 `ToolCallAccount`，由工具执行记录携带、经发帧以外的路子报（`data.call-accounts/v1#S-11`）；
  它的 `frames` 那一份由消费一侧从这条流上数出来。**`tool_execution` 目标上出现 `account` 是表示层拒绝 `malformed`**——
  一段帧流没有 token 用量，也没有一次发出的费用，给它写四个 `"unknown"` 就是把「没有这回事」说成「有但数不出」。
- **账不进给模型看的上下文**（[`data.call-accounts/v1#S-21`](../../call-accounts/v1/contract.md#s-21-账进日志不进给模型看的上下文)）：本事件没有任何成员会被装进消息。
- 载荷不合 `data.call-accounts` v1 的形状，拒绝值取那份契约 S-27 的值，原名携带（[S-28](#s-28-表示层拒绝值)）。

### S-16 收尾

**`finish` 是一条流的结局：`{ reason, error? }`。每条流恰一次，是这条流的最后一个事件。**

[一条流必须有结局——没有结局，等着的那一方永远不知道该不该继续等](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)。
`reason` 取 `FinishReason` 四值之一，四值以外是表示层拒绝 `finish_reason_unknown`：

| `reason` | 意思 | `model_call` | `tool_execution` |
|---|---|---|---|
| `end` | 生产者正常说完了 | 模型正常收尾 | 执行结束，帧流跟着收尾 |
| `max_tokens` | 写到上限被截断 | 合法 | **不合法**（`malformed`）：帧流没有 token 上限 |
| `interrupted` | 被**有意**停下：有人决定让它停 | [用户发起的停下——不是故障、不带成因](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)：直接叫停、插队顺带、用户取消了这次运行 | 那次执行被有意停下——收场为 `interrupted` 的全部情形（用户、插队、人拒绝回复、会话归档、运行被取消、前台上限到点、agent 掐掉已转后台的那段执行），帧流跟着收尾 |
| `lost` | **生产的一方失去了连续性**，或消费一侧不再等它 | [故障](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码)：流断了、上游出错了；**或宿主放弃了在途的流**——系统发起的运行取消（会话归档、宿主停止）、宿主被撤下（有序撤除、替换）。后一种**不是故障**：那一次发出的收场由模型调用一侧记（被中断、发起方 `run_cancelled`，`data.model-response`） | **帧流**断了；**执行者没有回答**（等待到了它自己声明的到点）；**执行者换了代**（经 MCP 桥的动作随桥换代或卸载没了下文）；**持有装配状态的宿主被撤下**、放弃在途的帧流——都**不影响那次执行的收场**，那一次怎么收场另走 `ToolMessage`（[§6.17](../../../../product/PF-009-context-message-types/design.md#617-发帧发不出去不影响这次工具执行)） |

- **`error` 只在 `model_call` 且 `reason = lost` 时可带**，是 `{ cause, statusCode?, inBand? }` 那一类的故障描述：
  `$ref` [`data.loop-extension/v1#S-17`](../../loop-extension/v1/contract.md#s-17-failurecause) 的 `FailureCause`，[状态码原样带着、不翻译](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它)；
  `inBand: true` 只能与 `statusCode` 同在，在即那个状态码是流已开始之后带内错误的 `code`、不是 HTTP 状态（与 `data.model-response/v1#S-15` 同一个成员、同一个意思；主线裁定，D-040 §八 N-40 ④）。
  **别的组合带了是 `malformed`**：被中断不是故障，不带成因；帧流断了不是一次模型调用的故障。
- **`lost` 不带 `error` 是合法的**：生产者知道断了、却说不出为什么。**缺席不等于「没有故障」**，成因怎样定归模型调用一侧（`data.model-response` v1），本契约不替它补。
- **只有有意停下才是 `interrupted`**（主线裁定，见 [D-040 §五 K2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：等待到点是执行者没有回答、桥换代是执行者没了——都不是谁决定让它停，写成 `interrupted`，读的人会去找一个并不存在的叫停者。
- **宿主放弃在途的流一律是 `lost`**（主线裁定，见 [D-040 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；与桥换代同类）：宿主停止或被撤下时，它对还开着的每一份装配状态做放弃动作（`capability.stream-assembly`），不以 `interrupted` 收尾；**这时不带 `error`**——那不是一次故障，没有成因可写。
  模型侧于是只有用户发起的停下才是 `interrupted`——那样收尾的回复落成的 `interrupted_by_user` 才找得到那个叫停的人。**回复流的四个结局怎样对到 `AssistantMessage` 的 `ending`，对应表只在 [`data.messages/v1#S-10`](../../messages/v1/contract.md#s-10-assistantmessage-怎么收的尾)**。
  **帧流的这四个结局怎样对到 `ToolInternalMessage` 的 `ending`，对应表只在 [`data.messages/v1#S-14`](../../messages/v1/contract.md#s-14-toolinternalmessage-怎么收的尾)**；本契约只定 `finish` 这一步的四个取值与它们的意思（PF-009 rev 8：执行怎么收场，已交付过块的那条消息都照常收尾）。
- **生产者自己断了、连 `finish` 都没来得及发**的情形，由消费一侧的放弃动作补上一个 `lost`（`capability.stream-assembly`）；
  **本契约不允许生产者用别的事件代替 `finish`**，也不把「很久没有事件」当成结局。

## 四、语法：一条流里的次序

### S-17 一条流的形状

**一条流（一个目标）上的事件序列，必须能读成下面这个形状：**

```text
流   ≝  { open | fill | close | trim }*  [ account ]  { open | fill | close | trim }*  finish
         —— account 至多一次；finish 恰一次、且是最后一个
```

- **`finish` 之后再没有任何事件**：不只是不再有填，**任何事件都不再有**。
- **`account` 至多一次，只能在 `finish` 之前**；它前后都可以有别的事件——账是整次发出的，**记账之后仍开着的块照常可以封口**。
- **没有「流的开头」这个事件**：一条流从它的第一个事件开始；哪条流此刻存在，由消费一侧的登记决定（`capability.stream-assembly`）。

### S-18 块的一生

**对一条流里的每个块索引：**

```text
块  ≝  open  fill*  [ close ]
       —— open 恰一次；fill 只落在已开、未封口的块上；close 至多一次
```

- **多块可以同时开着**：一块开着的时候可以开下一块，两块的填可以交错，封口次序任意。
  所以「先往外吐日志、最后给一块汇总面板」这条路走得通，一个进度条也可以一直开着、日志块开了又封。
- **一块可以永远不封口**：流收尾时仍开着的块怎么落，归消费一侧（[S-13](#s-13-封口) 说了为什么生产者不得替它封口）。
- **`trim` 的索引只须已开过**：封口之后再说一句「这块刚才被合并过几次」是允许的——它不改块。

### S-19 归约：一块此刻是什么

**一块此刻的内容，由它收到的填按开块时的填法归约而来：**

```text
append 块：  content ≝ fill₁.payload ⧺ fill₂.payload ⧺ … ⧺ fillₙ.payload      （文本逐字相接；语音相接解码后的字节）
replace 块： content ≝ fillₙ.payload                                         （最后一次；没有填时没有内容）
```

- **归约只看这一块自己的填**：别的块的事件夹在中间，不改变它。
- **归约与切分无关**：同一段内容分十次送来还是一次送来，归约相同——追加是相接，替换取最后一次，两者都**不因切分或合并而改变**。
  这就是[「组装出来的必须与一次性拿到的一模一样」](../../../../product/PF-009-context-message-types/design.md#组装出来的必须与一次性拿到的一模一样)在语法这一层的来由；
  把它写成对装配结果可判定的性质、并用行为模型检查，是 `capability.stream-assembly` 的事。

### S-20 封口块等于归约

**生产者的义务：一块若收到过填，它的封口块在内容上必须等于这些填的归约**——
`text`／`thinking` 的 `text` 等于归约的文本；`voice` 的字节等于归约的字节；`image`／`file`／`tool_result` 的封口块等于最后一次填的那一块。
没收到过填的块（开了就封，整交的块就是这样），封口块就是它的全部内容。

- **消费一侧不重算、不比较**：它以封口块为准（[S-13](#s-13-封口)）。所以这条等式违反时**不会在运行时被发现**，
  一个中途重进的观察者看到的最后一次填，会与落进日志的那一块不同——**这条义务的证据只能落在生产者一侧**（[验证入口](../verification.md)）。
- **经过节流之后同样成立**：砍掉内容的节流（截短、额度、拒收）发生在生产者一侧时，封口块反映的是**实际送达的内容**，不是节流之前的（[S-22](#s-22-节流只动填合并不改结果砍了要说)）。

### S-21 第一个内容步骤

**一条流上「交出了第一样内容」的那一步，是它第一个载荷非空的 `fill`，或者它第一个没收到过填、而封口块内容非空的块的 `close`——哪个在前算哪个。**

这就是 [PF-013 首 token 的判据](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)落在语法上的位置：

| 这一块怎么到 | 什么时候算开口 |
|---|---|
| 能一点点长的（追加片段） | **第一片到了**——片段非空（[S-11](#s-11-填追加片段)），所以第一片一定是内容 |
| 整体替换 | **第一次非空的填到了**——一次空串的填（清空一块面板）什么也没交出 |
| 开个口、整个交出来 | **整块交出来了**——`open` 不算，封口那一下算 |

- **空载荷不算**：载荷是空串的 `fill`；没收到过填就封口、而封口块的文本是空串的文本块或思考块（思考块只带着不透明数据也算空——那份数据没有人看得见）；
  没收到过填就封口的工具调用块（参数原文是空串）。**判据是「交出了内容」，一个空串什么也没交出。**
- **`open`、`trim`、`account`、`finish` 都不是内容**：响应头到了不算，开了口还没交出东西也不算——[判据是「交出了内容」，不是「流有了动静」](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)。
- **不看模态**：文本、思考、调用参数、语音的第一片，图与文件的整块交出，哪个先到都算。
- **本契约只说「是哪一步」**：`capability.stream-assembly` 在装配状态里记下它是第几个事件；那一刻是什么时刻、据此能不能重发，归宿主与模型调用一侧。

### S-22 节流只动填，合并不改结果，砍了要说

[一个工具可以每秒产出上千个增量，必须有节制；节流的规则不另立](../../../../product/PF-009-context-message-types/design.md#帧多了要节流规则就是-616-那一条)：

- **本契约说的节流，是发出的一侧在事件交给装配之前做的**：它砍了什么，就在这条流上以 `trim` 说出来，进这条流的汇总（`TrimSummary`）。
  **投递的一侧在装配之后、为观察者做的节流**（出站流把片段合并了再推给界面）不改变落下的内容，**不进账，也不在本契约**。
- **节流只动 `fill`**：`open`、`close`、`trim`、`account`、`finish` **从不被合并、截短或丢弃**。
  它们撑着这条流的结构——丢一个 `finish`，这条流就永远没有结局；丢一个 `close`，一块完整的内容就只能按没到齐落。
- **两种合并不改变归约**（[S-19](#s-19-归约一块此刻是什么)）：把同一块**相邻的**追加片段合成一个；把整体替换的块被后来的填取代掉的那几次去掉。
  「相邻」只看这一块自己的填，中间夹着别的块的事件不算打断；**跨过这块的封口不算相邻**（封口之后本就没有填）。
  这两种节流**是安全的**，但仍要说：每次合并发一个 `rate_merged` 的 `trim`。
- **别的砍都改变结果**：截短（`frame_too_long`）、额度用完（`quota_exhausted`）、拒收（`rejected`）——**每砍一次发一个 `trim`**，不许默默丢；
  而且封口块反映实际送达的内容（[S-20](#s-20-封口块等于归约)）。
- **对工具调用块，任何改变内容的砍都让这次调用落不成完整的调用**：参数原文少了一段，解析它比解析失败更危险。
  消费一侧怎样落它，归 `capability.stream-assembly`。
- **谁来节流、上限与额度取多少**，是做节流的那一方的具名参数（[G-4](#九已知缺口)）；本契约只要求**砍了就在流上说**。

### S-23 执行帧的另外四条

**目标是 `tool_execution` 时，这条流就是那次执行的[执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)，另有四条：**

1. **一帧 ≝ 工具经[发帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission)交出的一个 `open`、`fill` 或 `close`。**
   `trim`、`finish` 不是帧——它们由执行一侧的运行时发，不是工具说的话；这一侧没有 `account`（[S-15](#s-15-记账)）。
   `data.call-accounts/v1` 的 `ToolCallAccount.frames`（是 `FrameAccount` 时的 `emitted`）数的就是这个单位。
2. **帧里的媒体块只许引用，不许内联**：这条流上任何地方（`fill` 的整块、`close` 的块、它们内嵌的任意一层）出现的语音块或图块，
   `data` 都必须是 `AttachmentRef` 那种形状（`data.content-blocks/v1#S-10` 让两种形状可判别）；
   以 `append` 或 `replace` 开的 `voice` 块，它的填就是内联字节，因此**帧流上的语音块只能开了就封、封口块带引用**。
   违反是表示层拒绝 `frame_media_inline`。**模型回复一侧不受这条限制**，可以内联。
3. **帧里的块都不给模型看**：`open` 的 `visibility.toModel`、整块的填与封口块的 `visibility.toModel` 都必须是 `false`——
   [工具帧不进模型的上下文，不是默认不进、可以配置，是不进](../../../../product/PF-009-context-message-types/design.md#614-工具帧不进模型的上下文)。
   违反是表示层拒绝 `malformed`。嵌在里面的块按合取取用（`data.content-blocks/v1#S-5`），容器不给，里面的就给不了。
4. **收尾没有 `max_tokens`，`lost` 不带成因**（[S-16](#s-16-收尾)）；**帧流的收尾不是那次执行的收场**——执行怎么收场只看 `ToolMessage`。

**大部分工具一帧都不发**：那样的执行**这条流上可能只有一个 `finish`**，或者根本没有被登记成一条流——[没收到就是没有，那是正常形态](../../../../product/PF-009-context-message-types/design.md#大部分工具不发这个而那是正常形态)。

### S-24 违反语法由消费一方判定并命名

**本契约定义什么是合法的事件序列；一个事件不合序列时的失败值，由消费它的那一方命名**——
`capability.stream-assembly` 是本语法唯一的消费方式，它的失败集合里有这些名字。本契约只列出每条序列规则，不另起同义值：

| 序列规则 | 条款 |
|---|---|
| `finish` 之后再没有事件 | [S-17](#s-17-一条流的形状) |
| 一个索引终身只开一次；开块索引严格递增 | [S-7](#s-7-块索引) |
| `fill`、`close` 只落在已开、未封口的块上；`trim` 的索引已开过 | [S-18](#s-18-块的一生)、[S-14](#s-14-砍) |
| 追加片段合它那一类；封口块与开块说的是同一块；工具调用块的封口不带块、其余类必带 | [S-11](#s-11-填追加片段)、[S-13](#s-13-封口) |
| `account` 至多一次 | [S-15](#s-15-记账) |
| 一条消息里 `id` 不重复 | [S-8](#s-8-开块) |

**事件属于哪一条流，不是一条序列规则**：宿主按目标把事件交给那条流的装配状态；
一个目标此刻没有对应的流，是宿主路由的事，不是一个到达语法的失败值。

**「一条消息里 `id` 不重复」这一条，消费一侧的失败集合里没有对应的名字**：它在消息落进日志的那一道边界上被拒，拒绝值是 `data.messages` 的 `block_id_duplicate`——
晚于这条流本身，那时整条消息被拒（规格层推导：`data.content-blocks/v1#S-3` 把「一条消息里块标识唯一」交给看得见整条消息的边界；原 G-6）。流上不另设失败值。

**判定时机决定名字归谁**：单个信封就判得出的，是本契约的表示层拒绝（[S-28](#s-28-表示层拒绝值)）——**块头的模态与块的类型相符**（[S-9](#s-9-块头)，`head_modality_mismatch`）就是这一种，所以它不在上表；要看这条流此前发生过什么才判得出的，是消费一侧的判定。
例外有两个——`replace_payload_shape` 与帧流上往语音块填字节的 `frame_media_inline`：它们要借开块，却归本契约（[S-12](#s-12-填整体替换)、[S-23](#s-23-执行帧的另外四条)）。

## 五、装配给与协议给

### S-25 装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的保证**——单机由装配（生产者与消费者在同一进程、按调用次序交事件）顺带给出的那些；
> 右列写跨进程后**必须由协议重新兑现什么**，以及**做不到会怎样**。不在表里的条款在任何部署形态下一律成立。
> **这张表是契约的一部分，不是流程笔记。**

| 保证 | 单机由谁给 | 跨进程必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **同一条流的事件按生产次序、不重不漏到达**（[S-17](#s-17-一条流的形状)、[S-18](#s-18-块的一生)） | 生产者按次序调用消费一侧，一次调用交一个事件 | 同一目标的事件**有序、恰好一次**送达；本语法的事件没有序号，协议须自带 | 乱序：开块索引倒退、填落在没开的块上，被当作违反语法拒掉——**内容少了一段**；重复：一个 `open`、`close` 会被判重拒掉，**一个追加片段却会被接两次，内容静默变长，没有任何一处报错**；丢失：可能永远等不到 `finish`，只能由消费一侧放弃成 `lost` |
| **目标只在它所属的会话里有意义**（[S-5](#s-5-信封与目标)） | 宿主在它所属的会话里按目标把事件交给那条流的装配状态 | 线上的信封须**带上会话与租户**，或者通道本身绑定到一个会话，由协议保证不串 | 两个会话里恰好相同的 `CallId` 撞到一起，**一个会话的帧落进另一个会话的消息**——跨租户可见 |
| **`dispatch` 分开两次发出**（[S-5](#s-5-信封与目标)） | 同一进程里前一次发出的生产者已经停了，后一次才开 | `dispatch` 在线上原样携带；**已收尾的目标的迟到事件必须被丢弃而不是被接进新的一次** | 第一次发出的迟到片段拼进第二次的回复 |
| **首个内容步骤的时刻**（[S-21](#s-21-第一个内容步骤)） | 同一个时间源 | 事件本身不带时刻；跨进程后「交出第一样内容」的时刻只能取消费一侧收到它的时刻，须说明取哪一边 | 时刻偏离发出时刻；「开没开口」这个**有无**不受影响，据它**算出的时长**会失真 |
| **表示层校验在每个接收边界重做**（[S-28](#s-28-表示层拒绝值)） | 消费一侧收下事件时一次 | **每个接收边界各自重验**，不信任上游「已校验过」 | 一个远端生产者的内联媒体、给模型看的帧块穿过中间层进了日志，而日志只增不改 |
| **封口块等于归约**（[S-20](#s-20-封口块等于归约)） | 同一个生产者既发填也发封口块 | 节流或转发的中间方若改动了填，**必须同时改动封口块**，或者不改动内容 | 观察者看到的与落进日志的不同 |

## 六、表示与边界校验

### S-26 规范表示

- **规范表示**：[`arrival-events.schema.json`](arrival-events.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/arrival-events/v1/arrival-events.schema.json`
- **定义项（14 项）**：`ArrivalEnvelope`、`ArrivalTarget`、`ArrivalEvent`、`OpenEvent`、`FillEvent`、`CloseEvent`、`TrimEvent`、`AccountEvent`、`FinishEvent`、
  `BlockKind`、`FillMode`、`BlockHead`、`PresentationHint`、`FinishReason`。消费者 `$ref` 这些定义，**不复制一份同义类型**。
- **外部引用**：`ContentBlock`、`BlockId`、`Visibility`、`MediaType`、`CallId` 取自 `data.content-blocks` v1；`Usage`、`Cost`、`TrimReason`、`ModelCallId` 取自 `data.call-accounts` v1；
  `FailureCause` 取自 `data.loop-extension` v1。
- **根模式不约束任何文档**：本文件是共享定义的登记处；一个信封按 `$defs/ArrivalEnvelope` 校验。
- **成员名一律 camelCase**；枚举值一律 snake_case 字符串；事件的判别成员叫 `t`，目标的判别成员叫 `kind`（与块的 `kind` 不相干）。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-27 判别式与枚举闭合

`t`、`target.kind`、`BlockKind`、`FillMode`、`FinishReason`、`TrimReason` 各是一个**闭合集合**，没有「其他」。
遇到未知取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。
一个认不出的 `t` 被当成 `fill`，一段不该给模型看的内容就可能被接进一块给模型看的块里——**静默降级就是放行**。

### S-28 表示层拒绝值

**一个信封不合本契约的形状时，拒绝值恰为下面九个之一，集合闭合：**

| 拒绝值 | 什么时候 | 条款 |
|---|---|---|
| `event_unknown` | `event.t` 出现了，但不是六个之一 | [S-6](#s-6-六种事件) |
| `trim_reason_unknown` | `trim.reason` 不是 `TrimReason` 四值之一 | [S-14](#s-14-砍) |
| `finish_reason_unknown` | `finish.reason` 不是 `FinishReason` 四值之一 | [S-16](#s-16-收尾) |
| `presentation_invalid` | 块头带了 `presentation`，它不合形状，或 `hint`／`language` 不在取值集里（本版取值集为空，[G-3](#九已知缺口)） | [S-10](#s-10-呈现提示) |
| `head_modality_mismatch` | `open` 的块头带了合乎规范形式的 `mediaType`，它的模态与块的类型不相符（`voice` 要 `audio`、`image` 要 `image`、`text`／`thinking` 要 `text`，按 `data.content-blocks/v1#S-6` 的 `modalityOf`） | [S-9](#s-9-块头) |
| `fill_kind_not_appendable` | `open` 以 `append` 开了 `image`、`file` 或 `tool_result` | [S-8](#s-8-开块) |
| `frame_media_inline` | 目标是 `tool_execution`，而信封里任何一层出现内联的语音或图；或往帧流上的 `voice` 块填字节 | [S-23](#s-23-执行帧的另外四条) |
| `replace_payload_shape` | 往 `replace` 块填的整个新内容不合开块时说的那一块 | [S-12](#s-12-填整体替换) |
| `malformed` | 其余一切不合形状：缺必填成员、多出成员、类型不对、`index` 为负、`dispatch` 小于 1、`fill` 的整块不是 `image`／`file`／`tool_result`、`close` 带了 `tool_call` 块、块头缺必带成员或给了不该带的成员、`trim` 的 `merged`／`omittedBytes` 按原因该带未带或不该带而带、`tool_execution` 目标上的 `account`、`max_tokens`、`error`、帧里给模型看的块、`error` 配了 `lost` 以外的收尾。**判据只有一条**：不合 Schema，或违反本表其余八行没有覆盖的本契约规则；上面只是举例 | 各条 |

**嵌着的值不合它自己那份契约时，拒绝值取那份契约的名字，原名携带，不改成本契约的：**

- `fill` 的整块、`close` 的块、开块的 `visibility` 不合 `data.content-blocks` v1 ⇒ 取它 [S-26](../../content-blocks/v1/contract.md#s-26-表示层拒绝值) 的值（`kind_unknown`、`visibility_missing`、`incomplete_call_visible`、`call_in_result`、`modality_mismatch`、`malformed`）；
- `account` 的 `usage`／`cost` 不合 `data.call-accounts` v1 ⇒ 取它 [S-27](../../call-accounts/v1/contract.md#s-27-表示层拒绝值闭合) 的值（`negative_amount`、`unknown_with_source`、`malformed`）。

**三份契约里的 `malformed` 是同一个值**：「不合形状」，不再细分出自哪一份。

**一个信封有多处违例时，取优先级最高的那个**，次序固定：

```text
event_unknown  >  trim_reason_unknown = finish_reason_unknown（互斥，不会同时出现）
  >  嵌着的值的拒绝值（按那份契约自己的次序取它给出的那一个；它给出的若是 malformed，按本契约的 malformed 排）
  >  presentation_invalid  >  head_modality_mismatch  >  fill_kind_not_appendable  >  frame_media_inline  >  replace_payload_shape  >  malformed
```

`head_modality_mismatch` 紧跟 `presentation_invalid`：两者都是块头里的一项读得出、却与块对不上；它排在开块填法（`fill_kind_not_appendable`）之前，因为块头说错了这是什么，填法对不对就无从谈起。

越靠前，越说明这个信封在根上读不懂——认不出是哪种事件，就谈不上别的。**`malformed` 是剩余项，不是「其他」**。

**这些拒绝值怎样落进消费一侧的失败集合**：`capability.stream-assembly` 原名引用，不另起同义值；
它自己的判定失败（[S-24](#s-24-违反语法由消费一方判定并命名)）排在全部表示层拒绝之后。
**要借开块的那两个值，只在那一块此刻开着时才判得出**：块没开过或已封口，它们无从判起、不参与，取消费一侧的序列失败值——判不出来不等于放行。

### S-29 表示层拒绝不是判定，也不修补

口径取 [`data.identity-values/v1#S-33`](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开)：

- **被拒的信封在进入任何判定之前被拒**：这次拒绝**不表示**「这次调用失败了」「这次执行失败了」，**不得**被记成一次收场。
  一个被拒的帧**不影响那次执行**（[§6.17](../../../../product/PF-009-context-message-types/design.md#617-发帧发不出去不影响这次工具执行)）。
- **不修补**：不给缺标注的开块补标注，不把 `append` 开的图改成 `replace`，不把内联的媒体换成引用，不把未知的 `t` 当 `fill`，
  不替一个缺 `error` 的 `lost` 补成因。**修补等于替生产者做了一个它没做的决定。**
- **被拒的增量是一次「砍」**：它整个没有送达，按 `rejected` 计进这条流的汇总（`data.call-accounts/v1#S-15`）——
  由收到拒绝的那一方（宿主）以一个 `rejected` 的 `trim` 说出来；装配只汇总 `trim`（`capability.stream-assembly`）。
- **表示合法不表示任何资格**：信封合形状，不说明它的目标属于调用者所在的会话，也不说明块里的引用可读。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-5](#s-5-信封与目标) 目标 | **管得到**：两种形状、`dispatch ≥ 1`、无多余成员 | 目标此刻有没有一条流、属于哪个会话——消费一侧 |
| [S-6](#s-6-六种事件)、[S-27](#s-27-判别式与枚举闭合) 六种事件与闭合 | **管得到**：`oneOf` 六种 | 拒绝值的**名字**由 [S-28](#s-28-表示层拒绝值) 定 |
| [S-7](#s-7-块索引) 索引 | 管非负整数 | 唯一、单调——消费一侧（[S-24](#s-24-违反语法由消费一方判定并命名)） |
| [S-8](#s-8-开块) 开块 | **管得到**：必填成员、`append` 只对四类 | `id` 在消息内唯一——消息落日志的边界（`data.messages` 的 `block_id_duplicate`，[S-24](#s-24-违反语法由消费一方判定并命名)） |
| [S-9](#s-9-块头) 块头 | **管得到**：哪类必带、哪类不得带 | 媒体类型的模态与类型相符——**任何接收边界**只看这一个事件就判得出，拒绝值 `head_modality_mismatch`（[S-28](#s-28-表示层拒绝值)）；Schema 不按 `modalityOf` 写 |
| [S-16](#s-16-收尾) 的结局对到 `ToolInternalEnding` 与 `AssistantMessage` 的 `ending` | **管不到** | 对应表在 `data.messages/v1#S-14`（帧流）与 `#S-10`（回复流） |
| [S-10](#s-10-呈现提示) 呈现提示 | 管形状 | 取值集——[G-3](#九已知缺口)；本版一律拒 |
| [S-11](#s-11-填追加片段)、[S-12](#s-12-填整体替换) 填 | 管 `payload` 是字符串或三类之一的整块 | 片段合不合那一类、整块合不合开块——要看开块 |
| [S-13](#s-13-封口) 封口 | 管封口块不是工具调用块 | 封口块与开块是否同一块、该不该带块——要看开块 |
| [S-14](#s-14-砍) 砍 | **管得到**：四个原因各自该带什么 | `index` 已开过——消费一侧 |
| [S-15](#s-15-记账)、[S-16](#s-16-收尾) | **管得到**：载荷形状、工具侧不记账、成因只配模型侧的 `lost` | 至多一次、最后一个——消费一侧 |
| [S-19](#s-19-归约一块此刻是什么)、[S-20](#s-20-封口块等于归约) | **管不到** | 归约由消费一侧按定义求；等式是生产者义务 |
| [S-22](#s-22-节流只动填合并不改结果砍了要说) | **管不到** | 做节流的一方 |
| [S-23](#s-23-执行帧的另外四条) 帧的四条 | 管工具侧不记账、没有 `max_tokens`、不带成因、**顶层**块不给模型看 | 内联媒体在任意一层——接收边界遍历；语音填字节——要看开块 |

**非法输入的含义**：Schema 校验失败 ⇒ 这个信封**不是**一个到达事件 ⇒ 按 [S-28](#s-28-表示层拒绝值) 取拒绝值、按 [S-29](#s-29-表示层拒绝不是判定也不修补) 收场。
**Schema 通过也可能仍然非法**：上表「管不到」那一列属于形状的几条由接收边界兑现。

## 七、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 每个事件说自己属于哪条流；两次发出是两条流 | 不变量 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) | Schema（[S-5](#s-5-信封与目标)） | 一条流的片段拼进另一条消息 |
| P-2 | 一条流恰一个结局，且在最后 | 安全 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) | 消费一侧（[S-16](#s-16-收尾)、[S-17](#s-17-一条流的形状)） | 收尾之后又长出内容；或等的一方永远不知道该不该继续等 |
| P-3 | 账至多一次、在收尾之前；只有模型侧有 | 安全 | 同上 · D-035 | 消费一侧（至多一次）＋ Schema（工具侧没有）（[S-15](#s-15-记账)） | 一次发出两份账，钱翻倍 |
| P-4 | 填法在开块时说定，`append` 只对四类 | 不变量 | [PF-009 §6.15](../../../../product/PF-009-context-message-types/design.md#615-每一块自己说它是追加片段还是整体替换系统照办) | Schema（[S-8](#s-8-开块)） | 一张图被一段段拼起来 |
| P-5 | 归约与切分、合并无关 | 不变量 | [PF-009 §6.8](../../../../product/PF-009-context-message-types/design.md#68-组装的结果与一次性拿到的必须相同) | 定义本身（[S-19](#s-19-归约一块此刻是什么)）；装配结果上的检查归 `capability.stream-assembly` | 同一回复分次到达与一次到达装出不同的消息 |
| P-6 | 工具调用参数原样到达，只在封口那一下解析一次 | 安全 | [PF-009 §6.10](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行) · D-035 保留前提 1 | Schema（封口不带调用块）＋ 生产者不得中间解析（[S-13](#s-13-封口)） | 残缺参数被解析成一个恰好合法、少了一半字段的调用 |
| P-7 | 被截断、被叫停、断了的块不被封口 | 安全 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) | 生产者（[S-13](#s-13-封口)） | 半截的调用被当成收齐的去解析、去执行 |
| P-8 | 砍了要说；结构性事件从不被砍 | 安全 | [PF-009 §6.16](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢) | 做节流的一方（[S-14](#s-14-砍)、[S-22](#s-22-节流只动填合并不改结果砍了要说)） | 面板被悄悄截短；或一条流永远没有结局 |
| P-9 | 帧里媒体只引用、帧块不给模型看 | 安全 | [PF-009 §6.14](../../../../product/PF-009-context-message-types/design.md#614-工具帧不进模型的上下文) | Schema（顶层）＋ 接收边界（任意层）（[S-23](#s-23-执行帧的另外四条)） | 帧把大段字节内联进会话；或工具的过程进了模型的上下文 |
| P-10 | 未表过态的块被拒，不被补标注 | 安全 | [PF-010 要求二](../../../../product/PF-010-context-management-and-assembly/design.md#要求二成分必须是明确标了给模型读的) | Schema（[S-8](#s-8-开块)） | 一块没表过态的内容进了模型那一份 |
| P-11 | 表示非法即拒，拒绝值唯一，不修补 | 安全 | SYS-SPEC | 每个接收边界（[S-28](#s-28-表示层拒绝值)、[S-29](#s-29-表示层拒绝不是判定也不修补)） | 两个实现对同一个坏信封报不同的名字；或坏信封被「修好」后接了进去 |

**进展性质：本契约不拥有任何进展性质。**「一条流最终会有结局」要求生产者持续存活，或者有一方替它放弃——
那是消费一侧（`capability.stream-assembly` 的放弃动作）与调用它的恢复逻辑的事，本契约只要求结局存在且唯一。

**本契约不建形式工件**：序列的行为——多块并开、交错、收尾、放弃、「一次装配 == 一次性到达」——**恰是装配的行为**，
它的行为模型在 `capability.stream-assembly` v1 的 `formal/Assembly.tla`，**本契约不另造一份平行的状态机**；
单个信封的结构约束 Schema 本身就能判。本契约触发的义务登记在[验证入口](../verification.md)。

### 规范场景

场景是本契约触发的证据形式；执行状态在[验证入口](../verification.md)，实例在 [`examples.md`](examples.md)。

#### S-30 帧只许引用

一个工具执行的帧流上，封口交出一张图。**必须观察到**：图的 `data` 是 `AttachmentRef` 时被接受；`data` 是 `{ inline: … }` 时拒绝值 `frame_media_inline`，
**图没有被改成引用后接受，也没有被丢掉后接受其余部分**。另跑一支：同样的图在模型回复的流上内联——被接受。

#### S-31 工具调用的封口不带块

一次模型回复开一个 `tool_call` 块、分三次填入参数原文、封口。**必须观察到**：封口不带块时被接受；
封口带了一个 `complete: true` 的调用块时拒绝（Schema 这一关就拒，`malformed`）。**生产的一方从头到尾没有解析过参数。**

#### S-32 以追加开图

`open` 以 `append` 开 `image`。**必须观察到**：拒绝值 `fill_kind_not_appendable`；**不被改成 `replace` 后接受**。
正例：以 `replace` 开 `image`，每次填一整张图。

#### S-33 呈现提示本版一律拒

块头带 `{ "presentation": { "hint": "log" } }`。**必须观察到**：拒绝值 `presentation_invalid`；**不被当作缺席、改照 `mediaType` 画**。
正例：不带 `presentation` 的块头被接受。**[G-3](#九已知缺口) 闭合后，本场景的正反例随取值集重写**。

#### S-34 工具侧没有账

目标是 `tool_execution` 的信封装着一个 `account`。**必须观察到**：拒绝值 `malformed`；**不被当作四项全未知的账接受**。

#### S-35 拒绝值逐个

把 [`examples.md`](examples.md) 里每一条反例交给接收边界。**必须观察到**：得到的拒绝值与那一行写的**逐字相同**；第 11 节的几处违例按 [S-28](#s-28-表示层拒绝值) 的次序取。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约。

#### CS-1 装配器拼一条回复

`capability.stream-assembly` 在**一次模型回复先吐思考、再吐文本、最后吐两个工具调用、写到上限截断**时，
依赖 [S-7](#s-7-块索引)、[S-8](#s-8-开块)、[S-13](#s-13-封口)、[S-16](#s-16-收尾)、[S-18](#s-18-块的一生)、[S-19](#s-19-归约一块此刻是什么)，得到：
块的次序（索引序）、每块的标识与标注（开块时已定）、封口块或归约出来的内容；被截断的那个调用**没有封口**、参数原文是它收到的填的相接——
它据此落成半截的调用块，**不需要猜任何东西**。

#### CS-2 装配器接一段帧流

`capability.stream-assembly` 在**一个后台工具一直开着一个进度面板、日志块开了又封、中途被中断**时，依赖 [S-12](#s-12-填整体替换)、[S-18](#s-18-块的一生)、[S-23](#s-23-执行帧的另外四条)，得到：
面板是整体替换的块，此刻内容是最后一次填；已封口的日志块各自完整；收尾是 `interrupted`、没有账、没有 `max_tokens`。

#### CS-3 传输适配翻译上游的流

模型调用一侧的传输适配在**上游在参数流到一半时断开、没有发终止事件**时，依赖 [S-13](#s-13-封口)、[S-16](#s-16-收尾)，得到：
它**不替那个调用封口**、不解析那段参数；发一个 `finish { reason: "lost" }`，能说出成因就带 `error`（状态码原样），说不出就不带。
**它连 `finish` 都发不出的时候**（进程没了），由消费一侧放弃——那不是它的事。

#### CS-4 出站流给中途重进的观察者续增量

会话出站流在**用户刷新页面、一条帧流正在进行**时，依赖 [S-4](#s-4-到达事件不是记录条目)、[S-5](#s-5-信封与目标)，得到：
事件按目标分得开；观察者先拿在途状态（`capability.stream-assembly` 的快照，带一个位置：那份状态已接受了几个事件）再续收之后的事件。
**本契约不给事件编号**，所以「快照之后从哪一个事件接着收」由宿主拿那个位置与出站流在同一个会话的运行时里对齐（装配给），跨进程后是 [S-25](#s-25-装配给与协议给) 第一行。

## 八、缺席怎么收

**本契约没有操作，因此没有提交点、没有幂等边界。**下面写的是值与序列层面的缺席各是什么意思：

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| `target`、`event`、`t` | **拒绝**（`malformed`）——说不出属于谁、是哪种事件 | [S-5](#s-5-信封与目标)、[S-6](#s-6-六种事件) |
| 模型侧目标的 `dispatch` | **拒绝**（`malformed`）——不补成 1 | [S-5](#s-5-信封与目标) |
| 开块的 `id`、`kind`、`fill` | **拒绝**（`malformed`） | [S-8](#s-8-开块) |
| 开块的 `visibility` 或其中一位 | **拒绝**（`visibility_missing`），不补任何值 | [S-8](#s-8-开块) |
| `voice` 块头的 `mediaType`；`tool_call` 块头的 `callId`、`tool` | **拒绝**（`malformed`） | [S-9](#s-9-块头) |
| 块头整个缺席 | 合法——除了上一行那几类 | [S-9](#s-9-块头) |
| `presentation` | **合法**：照 `mediaType` 呈现，不是待补的值 | [S-10](#s-10-呈现提示) |
| 一块的填 | **合法**：整交的块开了就封；开着没填的块在收尾时怎么落归消费一侧 | [S-18](#s-18-块的一生) |
| 一块的封口 | **合法**：被截断、叫停、断了的块就是没有封口 | [S-13](#s-13-封口) |
| 除工具调用外某块封口时的 `block` | **拒绝**——名字归消费一侧 | [S-13](#s-13-封口)、[S-24](#s-24-违反语法由消费一方判定并命名) |
| `trim` 的 `index` | **合法**：这次砍落不到某一块上 | [S-14](#s-14-砍) |
| `account` | **合法**：流在记账之前断了；承载记录一侧记全未知（`data.call-accounts/v1#S-20`） | [S-15](#s-15-记账) |
| `account` 里拿不到的数 | 写 `"unknown"`；成员缺席是**拒绝** | [S-15](#s-15-记账) |
| `finish` | **不是本契约能收的**：流还没结束；生产者没了由消费一侧放弃成 `lost` | [S-16](#s-16-收尾) |
| `lost` 的 `error` | **合法**，且不表示「没有故障」；不补成因 | [S-16](#s-16-收尾) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 九、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**。

| # | 缺口 | 阻断谁 | owner |
|---|---|---|---|
| G-1 | **已闭合（2026-09-24 整批对齐）**：`ModelCallId` 已在 [`data.call-accounts/v1#S-37`](../../call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid)，`$ref` 解析通过，catalog 补登 | — | — |
| G-2 | **已闭合（2026-09-24 整批对齐）**：`FailureCause` 在 [`data.loop-extension/v1#S-17`](../../loop-extension/v1/contract.md#s-17-failurecause)，`$ref` 解析通过、形状就是八值枚举（状态码是本契约 `error` 的另一个成员），catalog 补登 | — | — |
| **G-3** | **呈现提示的取值集未定**：`hint` 与 `language` 各取哪些值（草案对照 omne-next 列过九种渲染提示） | 任何要带呈现提示的生产者——**本版一律 `presentation_invalid`** | **呈现层（PF-016）**；取值集定下后以新版本加入本契约或由它引用 |
| **G-4** | **节流的参数与执行者未定**：单个增量的长度上限、一条流可送达的额度、哪些帧会被拒收，由谁（发帧原语、出站流）施行；模型回复一侧是否允许改变内容的砍 | 任何要节流的一方；`TrimSummary` 里三种改变内容的原因能否在模型侧出现 | **`capability.tool-execution-runtime` 与 PF-006 的 owner**；模型侧那一问归 **PF-009 的 owner** |
| **G-5** | **整块载荷与不带载荷的事件怎样计 `omittedBytes`**：`data.call-accounts/v1#S-15` 只给了文本与二进制两种口径 | 砍掉或拒收一个整块的填、一个开块或封口时的字节数 | **整批对齐的执行者（主线）**，必要时回 `data.call-accounts` |
| G-6 | **已闭合（2026-09-24 整批对齐）**：一条消息里块 `id` 重复在消息层的接收边界拒，拒绝值 `block_id_duplicate` 归 `data.messages`；流上不另设失败值（[S-24](#s-24-违反语法由消费一方判定并命名)） | — | — |
| G-7 | **已闭合（2026-09-24 整批对齐；第一轮评审修复改写依据）**：Q4、Q17 已落为 [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md)；`dispatch` 与帧入口链到 D-040 §一 S8-c、S4-a；其余几项改写成规格层推导、理由写在各条（[设计依据](#设计依据)下方） | — | — |

## 十、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **装配**：装配状态、收尾交出的块与账、放弃、快照——归 `capability.stream-assembly`；持有装配状态、按目标路由、包成消息——归宿主。
- **消息与响应体**：`AssistantMessage`、`ToolInternalMessage` 归 `data.messages`；出错断时已交付的块放在 `data.model-response` 的 `delivered`。
- **中断提醒**：[只要发生了中断就补一条提醒](../../../../product/PF-009-context-message-types/design.md#613-只要发生了中断就补一条提醒)是 agent 循环一侧的事，不在这条流上。
- **重试与首 token 之后的处置**：本契约只说哪一步是第一个内容（[S-21](#s-21-第一个内容步骤)），不判能不能重发。
- **执行的收场**：帧流的收尾不是执行的收场（[S-23](#s-23-执行帧的另外四条)）。
- **节流的参数**（[G-4](#九已知缺口)）与**呈现提示的取值**（[G-3](#九已知缺口)）。
- **事件的持久化、回放、事件标识与时间戳**（[S-4](#s-4-到达事件不是记录条目)）。
- **传输**：通道、编码、送达保证——跨进程后须兑现什么见 [S-25](#s-25-装配给与协议给)。
- **体积上限**：片段、整块、一条流的大小上限本版不设；若要设，是做节流的那一方的具名参数。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十一、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；
`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`arrival-events.schema.json`](arrival-events.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`**：理由在[性质一节](#性质)末尾——序列行为的模型在 `capability.stream-assembly` v1，本契约不另造平行模型。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#九已知缺口)任一项被裁决后，凡改变本契约语义或表示的（G-3 给出取值集、G-4 改变可砍的事件），都出 **v2**。接受状态、冻结记录与执行结果都在本版本目录之外维护。
