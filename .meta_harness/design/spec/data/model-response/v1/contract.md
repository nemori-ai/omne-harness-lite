# data.model-response v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.model-response, 1)`——
  `family = data`、`topic = model-response`、规范路径 `spec/data/model-response/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-013 rev 8**、**PF-009 rev 7**、**PF-004 rev 10**、**PF-012 rev 10**、**PF-001 rev 16** 为准；
  其中 PF-013 rev 5–8 与 PF-009 rev 5–7 **全文待产品负责人确认**，本契约引用的首 token 判据与请求参数都落在这几版里
- **精确语义依赖**（引用名字，不复制定义）：

  | 坐标 | 取它的什么 | 状态 |
  |---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.call-accounts · v1` | `$defs/Usage`、`$defs/Cost`（[S-19](#s-19-用量与费用)）；`CostCorrection` 与「按 Run 汇总」的规则（[S-5](#s-5-与别的形状的关系)、[S-19](#s-19-用量与费用)）；`$defs/RunId`、`$defs/AttemptId`、`$defs/ModelCallId`（[S-7](#s-7-所属的那次调用)、[S-8](#s-8-第几次发出)）；`$defs/TrimSummary`（[S-19](#s-19-用量与费用) 的 `trims`）；S-38「用量归凭据那一格」的含义（[S-9](#s-9-路由留痕) 的 `credentialScope`） | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v1` | `$defs/ContentBlock`（[S-14](#s-14-回复与已交付部分) 的 `delivered`）、`$defs/AttachmentRef`（[S-20](#s-20-上游原始响应留存) 的 `raw.body`） | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.messages · v1` | `$defs/AssistantMessage` 及其 `response`、`ending` 两个成员（[S-14](#s-14-回复与已交付部分)、[S-13](#s-13-收场与其余成员的条件关系)） | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.model-profile · v1` | `$defs/ModelProfileRef`、`$defs/ProviderName`、`$defs/ModelRequestParameters`、`$defs/ModelProfileSnapshot`（[S-9](#s-9-路由留痕)、[S-11](#s-11-交给传输适配的参数与没发出去的项)）；「上游不认的项不静默丢」这条义务的留痕落在本契约 [S-11](#s-11-交给传输适配的参数与没发出去的项) | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.loop-extension · v1` | `$defs/FailureCause` 的八个取值（[S-15](#s-15-故障的成因与原样状态码)）——**名字由它定，本契约 `$ref`** | 候选 |
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | [S-22](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 定的时间点表示 `$defs/Instant`（[S-17](#s-17-首-token-与时序)） | 已接受、已冻结 |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 不透明标识的交换表示——**按它的散文自定义** [S-6](#s-6-responseid) 的 `ResponseId`，不 `$ref` 那里的 `OpaqueIdentifier`；[S-16](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值) 按归属层显式携带身份值，据以写出 [S-7](#s-7-所属的那次调用) 的租户归属一段；[S-11](../../identity-values/v1/contract.md#s-11-scopelayeridentity) 的 `ScopeLayerIdentity`（[S-9](#s-9-路由留痕) 的 `credentialScope`） | 已接受、已冻结 |

- **本契约不依赖任何 capability 契约。**正文里出现的 `capability.model-request-runtime` 标的是
  **「谁写这条响应体、谁兑现某条性质」这个落点**，方向是那份能力契约 → 本契约；它不在 catalog 的 `dependencies` 里
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.model-response/v1#S-13`

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 每一次发出只走一家；试过又失败的那几次各是一条留痕，不进方程 | [PF-013 §5.5 试过又失败的那几次，留痕，不进方程](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) | S-4、S-8、S-23、S-24 |
| 一次模型调用的状态与三个终态 | [PF-013 flows §3.2 一次模型调用](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) | S-4、S-12、S-16、S-23 |
| 选中模型与有效模型；有效模型由层级求值与调模型之前的拓展件两件事决定 | [PF-013 §4 选中模型 与 有效模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) | S-9、S-10 |
| 请求参数在档案上；一次请求实际带了什么留痕；不认的项不静默丢 | [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) | S-11 |
| 三类事实归本层定死；首 token 的判据与它的优先关系；回复完整回来却落不了盘的那一例 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) · [「已经开口说话了」优先于其余各类](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) | S-13、S-14、S-15、S-16、S-17 |
| 用户中断不是故障，不带成因 | [PF-013 §5.4 还有一种「没走完」](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) | S-12、S-13 |
| 八个成因；状态码原样带着，不翻译 | [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) | S-15 |
| 重试挂件看得到什么 | [PF-013 §5.12 它看得到什么](../../../../product/PF-013-model-profiles-and-invocation/design.md#它看得到什么) | S-3、S-5、S-23 |
| 停机之后看首 token；两次发出两笔钱照实记；费用拿不到记未知 | [PF-013 §5.13 停机之后：能不能重来，只看首 token](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) | S-17、S-18、S-19、G-7 |
| 成因在这个边界上分类；事实归本 topic、策略归拓展件 | [PF-013 §6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分) · [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) | S-15、S-23 |
| 成因封闭、兜底也要留痕；状态码另外原样带着 | [PF-013 §6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着) | S-15 |
| 错误信息外泄之前要脱敏；条目不可变，写错就是永久的 | [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) | S-21 |
| 流断在半路的五行表；故障断的已交付部分记在账里、不成为消息 | [PF-009 §5.6 流断在半路](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) | S-13、S-14 |
| 每条模型产出的内容记下实际生成它的模型；每一次模型请求有可追溯的实际组成 | [PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) · [§6.1 不变式 I-5](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) | S-5、S-9、G-9 |
| 成本明细按尝试记、汇总按 Run 算 | [PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) | S-5、S-19 |
| 模型回复在落盘之前被否决：那份回复没有落盘，要再试就重来 | [PF-012 消息落盘之前的否决](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)；**主线 2026-09-23 裁定**（与 `data.loop-extension` 对齐）：这次调用照常结束、记下否决，再试由 loop 另起一次新的模型调用 | S-13、S-14、S-23 |
| 使用成本按租户归属、能出明细 | [PF-001 §6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-19、G-3 |
| 响应 ID、实际服务商、实际费用及来源显式交给模型执行 owner；拿不到标 unknown；无隐藏重试 | [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) | S-9、S-19、S-24、G-8 |
| 所有模型请求统一经 OpenRouter | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) | S-9（`upstreamRequestId` 是 OpenRouter 的 generation id） |
| 单机交付，语义可扩展为分布式 | [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | [第四节](#四装配给与协议给) |
| 完整响应体带四类 token 与 `cost_usd`；缓存拆读写两项；原始响应体留、走附件存储、保留期是设置项 | [D-038 8b](../../../../record/decisions/message-and-shape-rulings/decision.md#追加要求三条) ／ [Q14](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) | S-19、S-20 |
| 凡有回复即说清它成没成为消息；被系统拿去用的回复（压缩摘要、旁路提问）不成消息、账照记 | 主线裁定 2026-09-23，待产品负责人确认（读数报回 S8-e；对账块 D） | S-13、S-14 |
| 模型侧砍量的汇总落在响应体上 | 主线裁定 2026-09-23，待产品负责人确认（对账块 D；账本 S4） | S-19 |
| 档案快照随每一次发出留痕，档案不加修订身份；凭据那一格（含出厂格由装配配置的那一把）随发出留痕 | 主线裁定 2026-09-23，待产品负责人确认（账本 C-R1、C-12、S16-f） | S-9 |
| 被中断的发起方三值；首 token 之前失联可以再发；首 token 之后停机是被中断而非故障 | 主线裁定 2026-09-23，待产品负责人确认（账本 RP-24、S16-g） | S-12、S-13、S-23 |
| 尝试序号属于每一次发出、发出序号跨尝试连续；不属于任何运行的调用归会话 | 主线裁定 2026-09-23，待产品负责人确认（账本 C-R7、C-14） | S-7、S-8 |
| 统一语言正式名 | [执行与收场](../../../../ubiquitous_language/terms/execution-and-outcome.md) · [能力与组成](../../../../ubiquitous_language/terms/capabilities-and-composition.md) · [记录与上下文](../../../../ubiquitous_language/terms/record-and-context.md) · [Agent 运行与循环](../../../../ubiquitous_language/terms/agent-runtime-loop.md) | 全部用词 |

> **这张表里没有产品行的条款**：[S-26](#s-26-schema-的范围)～[S-28](#s-28-表示层拒绝与判定分开) 与 [S-25](#s-25-装配给的保证与协议须给的保证)
> 的依据是 [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) 与 SYS-DEPLOY——表示、校验与「表示层不等于判定」是规格形式的要求。
> [S-18](#s-18-首-token-缺席是一条断言) 是规格层从 §5.13 推出的：「缺席 = 可重发」只有在缺席是确知时才安全。

## 一、目的与消费者

### S-1 本契约拥有什么

**一次发出的完整响应体**：这一次发出之后，系统就这一次知道的全部事实——

- **回复**（若有）：这一次拿回来的那一份，以及它**有没有成为消息**——它可能在落盘之前被否决，也可能本来就被系统拿去用、不成消息；
- **已交付但不成消息的部分**：开了口却没有交出回复时（首 token 之后的故障、开口之后被中断），用户已经看见的那些块；
- **用量与费用**，以及这一次的流上砍了多少；
- **路由留痕**：有效模型与它当时的档案快照、它怎么来的、走的那一家、用的凭据在哪一格、上游回报的名字与请求 id、交出去的参数与没发出去的项；
- **收场**，故障时的**成因**与**原样的状态码**，被中断时**谁中断的**；
- **时序**，其中首 token 是本层自己观察到的事实；
- **上游原始响应**的留存引用。

**一次模型调用可能被发出多次，每次发出留一条**——试过又失败的那几次同样各是一条（[S-4](#s-4-一次调用一次发出一条响应体)）。

它是一份**数据契约**：没有操作、没有状态转移、没有提交点，**因此不需要插件**。
有操作的是写它的那个运行时与读它的那些消费者，它们的义务各归自己的契约；本契约只说**这条记录是什么、哪些组合合法、各成员承诺什么**。

### S-2 本契约不拥有什么

- **请求怎么发、三类事实怎么判、要不要重试、什么时候算试尽**——归 `capability.model-request-runtime`。
  本契约只记下判的结果（[S-12](#s-12-收场)、[S-15](#s-15-故障的成因与原样状态码)），不定判法。
- **成因的定义**——`FailureCause` 八个取值的名字与含义由 `data.loop-extension` v1 定，本契约 `$ref` 引用。
- **账的形状**——`Usage`、`Cost`、`CostCorrection` 与汇总规则归 `data.call-accounts` v1。
- **消息与块的形状**——`AssistantMessage` 归 `data.messages` v1，`ContentBlock`、`AttachmentRef` 归 `data.content-blocks` v1。
- **档案与参数词表**——`ModelProfileRef`、`ProviderName`、`ModelRequestParameters` 归 `data.model-profile` v1。
- **到达语法**——一条回复怎样一段段到达、怎样拼成块，归 `data.arrival-events` 与 `capability.stream-assembly`；本契约只收拼好之后的结果。
- **上交条目**——一次调用了结不了时交出去的那条，形状归 [PF-011 §5.8](../../../../product/PF-011-off-nominal-handling/design.md#58-上交交的是什么)（PF-011 rev 4）；
  本契约的响应体不是上交条目，也不代替它。
- **记录条目壳**——这条响应体作为载荷落进哪条[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)、那条条目带的会话、租户、效力与寿命宿主，归 loop 那一程（[G-3](#七已知缺口)）。
- **重试次数、退避时长、任何时限数值**——[PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)：那是拓展件的配置。
- **不承诺任何对外交换格式。**[S-26](#s-26-schema-的范围) 只约束语义表示；线上形状归把它送过进程边界的那份 composition。

### S-3 消费者

| 消费者 | 读或写什么 |
|---|---|
| **模型请求运行时**（[UL-model-call](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) 注意②，能力契约 `capability.model-request-runtime`） | **写**：每一次发出结束时恰一条（[S-4](#s-4-一次调用一次发出一条响应体)、[S-22](#s-22-写下即不变)）；带回复的那一条由调用方与回复消息同一提交写下，其余由运行时写，分工归那份能力契约 |
| `data.messages` 的 `AssistantMessage` | 它的 `response` 成员**指回**产出它的那条响应体的 `id`（[S-14](#s-14-回复与已交付部分)） |
| **重试挂件**（挂在「调模型之后」、收场维度＝失败的[拓展件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)，[PF-013 §5.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#它看得到什么)） | 它只凭 `data.loop-extension/v1#S-14` 的失败主体下结论（档案快照、这次调用已有的发出记录、成因、状态码）；那些都是本契约同一次调用序列（[S-23](#s-23-同一次调用的响应体序列)）背后的同一批事实：走过哪几家、各自的收场、开没开口 |
| 拓展件在「调模型之后」拿到的输入（`data.loop-extension` 的 subject） | 完整回复那一维取 `reply`、`usage`、`cost`；失败那一维取 `failure.cause`、`failure.statusCode`，档案快照与 `route.profileSnapshot` 是同一份（[S-5](#s-5-与别的形状的关系)） |
| **可追溯组成**（[PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)、[I-5](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式)） | 「这一次实际用了哪条档案、怎么来的、带了哪些参数、丢了哪些」——`route` 整体（[S-9](#s-9-路由留痕)～[S-11](#s-11-交给传输适配的参数与没发出去的项)）；其余组成不在这里（[G-9](#七已知缺口)） |
| **成本两层**（[PF-012](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)）与成本明细（[PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)） | 每条的 `usage`、`cost` 是按尝试记的明细；按 Run 汇总是派生（[S-5](#s-5-与别的形状的关系)、[S-19](#s-19-用量与费用)） |
| `data.call-accounts` 的 `CostCorrection` | 它的目标之一是一条响应体，取的就是 `id`（[S-19](#s-19-用量与费用)） |
| **停机恢复**（loop 那一程） | 读 `timing.firstTokenAt` 的有无判能不能重发（[S-17](#s-17-首-token-与时序)、[S-18](#s-18-首-token-缺席是一条断言)） |
| **排查的人** | `failure.statusCode`、`failure.upstreamError`、`route.upstreamRequestId`、`stopReason`、`raw`（[S-15](#s-15-故障的成因与原样状态码)、[S-20](#s-20-上游原始响应留存)） |

## 二、含义与使用范围

### S-4 一次调用、一次发出、一条响应体

**三样东西，不要混读：**

| | 是什么 | 有几条 |
|---|---|---|
| [一次模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) | 把攒好的一次请求发给模型，到拿回完整一份、上交或被中断为止 | —— |
| **一次发出** | 这次调用里**向上游发出的一次请求**；[每一次发出只走一家](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)，换一家、退避之后再来都是**再发一次** | 一次调用有 0 到多次 |
| **一条响应体**（无词条；`ModelResponse`） | 一次发出结束之后留下的那一条 | **每一次发出恰好一条** |

**每一次发出恰好留一条响应体**，不论它成了、断了还是被中断——
[试过又失败的那几次照样是发生的事](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)，
哪一家、什么时候、上游回了什么状态码，**都查得到**。

**一次都没发出的调用没有响应体。**两种情形：「发不出去」那一类在出门之前就上交了
（[PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) 的「待发出 → 上交」），
以及在「待发出」时就被用户中断了。它们的事实由上交条目与中断提醒承载，不由本契约承载（[S-16](#s-16-发出了的才有响应体)）。

**响应体进会话日志，不进给模型看的上下文。**它是一条[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)的载荷；
试过又失败的那几次[不进方程，也不进模型的上下文](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)。
**进上下文的只有 `reply` 那条消息本身**，经组装按块标注取用；响应体的其余成员一概不进。

### S-5 与别的形状的关系

| 那个形状 | 与本契约的关系 |
|---|---|
| **到达事件流**（`data.arrival-events`） | 一次发出的那条流收尾时：`account` 事件带的就是本条的 `{ usage, cost }`；`finish` 的 reason 落成本条的 `outcome`——`end` → `complete`、`max_tokens` → `truncated`、`interrupted` → `interrupted`、`lost` → `failed`；装配器交出的消息成为 `reply`，交出的已交付块成为 `delivered`。**两处例外不由这张映射决定**：流在第一个事件之前就失败（连不上、上游直接回错误状态）没有 `finish`，由模型请求运行时判为 `failed`；上游正常收尾却一样内容都没有（[§5.4 判据例一](../../../../product/PF-013-model-profiles-and-invocation/design.md#判据怎么用三个例子)：回复是空的），归不归故障由能力判定，本契约只要求判成故障时按 `failed` 写 |
| **`AssistantMessage`**（`data.messages`） | `reply` 就是它；`reply.response` 等于本条 `id`；`reply.ending` 与 `outcome` 一一对应（[S-13](#s-13-收场与其余成员的条件关系)）。**只有 `replyDisposition = persisted` 的那份 `reply` 是会话日志里的一条消息**；被否决的、被系统拿去用的那份从未成为消息，它带着的 `MessageId` 在日志里找不到对应的消息 |
| **Loop 在「消息落盘之前」的否决**（`data.loop-extension`） | 否决落在一份 `complete`／`truncated` 的回复上时，本条记 `replyDisposition = { vetoed: { by, reason? } }`，**这次调用照样结束**；要再试，是 loop 在下一次迭代另起的一次**新的模型调用**（新的 `callId`），不是本次调用的下一次发出（[S-23](#s-23-同一次调用的响应体序列)） |
| **重试挂件** | 读同一次调用的 `ModelResponse` 序列（每次发出一条，按 `dispatch`）决定还试不试；三类事实（[S-23](#s-23-同一次调用的响应体序列)）它推翻不了 |
| **「调模型之后」的 subject**（`data.loop-extension`） | `outcome` 为 `complete` 或 `truncated` 的那条对应完整回复那一维（`reply`、`usage`、`cost`）；`failed` 的那条对应失败那一维（`failure.cause`、`failure.statusCode`、档案快照）。**`interrupted` 的那条不对应两维中任何一维**：被中断的调用不触发这个位置（`data.loop-extension/v1#S-2`） |
| **中断提醒**（`data.messages` 的 `interrupted` 来源） | 一次调用以 `interrupted` 或 `failed` 收尾时 loop 追加的那条提醒，它说的「有没有内容」必须与**最后那条**响应体的 `timing.firstTokenAt` 有无一致。**试过又失败、随后又发了一次的那几条不对应任何提醒** |
| **成本两层** | 按尝试记明细 = 这里每一条的 `usage`、`cost`；**按 Run 汇总是派生**：把同一 Run 下全部响应体的费用连同指向它们的 `CostCorrection` 按 `data.call-accounts` 的规则加起来，`unknown` 单独计数、不当零加。**汇总值不存进任何一条响应体** |
| **停机恢复** | `timing.firstTokenAt` 缺 → 这一次没开口，[新的一次尝试照常再发](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)；有 → 算「说到一半断了」，不重发。两次发出两条响应体、两笔钱都照实记（[S-19](#s-19-用量与费用)） |

## 三、值、身份与结构关系

| 成员 | 精确含义与取值约束 | 身份、相等或引用规则 |
|---|---|---|
| `id` | 这条响应体的标识，[S-6](#s-6-responseid) | 部署内唯一，逐码点相等 |
| `call` | 所属的那次模型调用，[S-7](#s-7-所属的那次调用) | `callId` 在一份会话日志内指认恰一次调用；`runId` 属于某个运行时必有 |
| `dispatch` | 该次调用的第几次发出，整数 ≥ 1，跨尝试连续，[S-8](#s-8-第几次发出) | `(call.callId, dispatch)` 在一份会话日志内唯一 |
| `attemptId` | 这一次发出落在第几次执行尝试里，[S-8](#s-8-第几次发出) | 与 `call.runId` 同在同缺 |
| `route` | 路由留痕，[S-9](#s-9-路由留痕)～[S-11](#s-11-交给传输适配的参数与没发出去的项) | 引用档案、那一家、凭据那一格与参数词表 |
| `outcome` | 四值之一，[S-12](#s-12-收场) | 闭合枚举 |
| `initiator` | 谁中断的，三值之一，[S-12](#s-12-收场) | 只在 `interrupted` 上，且在那里必有 |
| `stopReason` | 上游原样的收尾理由，可缺 | 不翻译，不据它推断收场 |
| `reply` | 这一次拿回来的那一份回复，[S-14](#s-14-回复与已交付部分) | 它的 `response` 等于本条 `id` |
| `replyDisposition` | 回复落盘成了消息、在落盘之前被否决，还是被系统拿去用了，[S-14](#s-14-回复与已交付部分) | 与 `reply` 同在同缺 |
| `delivered` | 开了口却没有回复时已交付的块，[S-14](#s-14-回复与已交付部分) | 与 `reply` 互斥 |
| `failure` | 成因、原样状态码、上游错误原文，[S-15](#s-15-故障的成因与原样状态码) | 只在 `failed` 上 |
| `timing` | 发出、首 token、结束三个时刻，[S-17](#s-17-首-token-与时序) | `firstTokenAt` 缺席是断言，[S-18](#s-18-首-token-缺席是一条断言) |
| `usage`、`cost` | 这一次发出的用量与费用，[S-19](#s-19-用量与费用) | 拿不到记 `unknown`，不是零、不是缺席 |
| `trims` | 这一次发出的流上砍了多少，[S-19](#s-19-用量与费用) | 缺席即一次也没砍 |
| `raw` | 上游原始响应留存，[S-20](#s-20-上游原始响应留存) | 排查用，不进任何视图 |

### S-6 ResponseId

**一条响应体的标识。**不透明、**部署内唯一**——不只在一次调用、一个 Run 或一个会话内唯一——**不回收、不复用**。

- **由写下这条响应体的一方铸**，在写下的那一刻；消费者不得解析它推断任何事实（时间、顺序、所属的调用）。
- **它的家就在本契约。**`data.messages` 的 `AssistantMessage.response` 与 `data.call-accounts` 的 `CostCorrection` 指的都是它；
  `data.call-accounts` 那边按同一条散文自己写出形状、**不 `$ref` 本契约**（免得两份契约互相依赖成环），含义以这里为准。
- **交换表示与相等规则按 [`data.identity-values/v1#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文**：非空字符串，首字符与末字符都不属于 S-31 逐个列出的那个空白码点集合，相等是逐码点精确相等。
  Schema 照那张码点表写出自己的 pattern，**不跨契约 `$ref` 那里的 `OpaqueIdentifier`**——那一项的说明限它自己的文件复用。
- **它不是上游给的请求 id**，也不从上游 id 推出。上游 id 是另一个系统的标识，可能没有、可能重复出现在两次发出里（上游侧的重放），
  而本系统的每一条响应体必须有一个自己的、确定存在的身份。上游 id 另记在 [`route.upstreamRequestId`](#s-9-路由留痕)。

### S-7 所属的那次调用

`call = { runId?, callId }`。**`callId` 必有，没有默认值，不从环境、进程状态或「当前在跑的那一个」补齐**；它在一份会话日志之内指认恰一次模型调用。

| 成员 | 是什么 | 本契约承诺到哪 |
|---|---|---|
| `runId` | 这次调用所属的[运行](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run)。**这次调用属于某个运行时必有；不属于任何运行（由会话本身发起，归会话）时必无**——缺席是一条断言，不是「不知道」（主线裁定 2026-09-23，待产品负责人确认；账本 C-14） | **只引用**：`RunId` 的定义在 [`data.call-accounts/v1#S-37`](../../call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) |
| `callId` | 这条响应体属于哪一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) | **只引用**：`ModelCallId` 的定义在 `data.call-accounts/v1#S-37`，会话内唯一。**它不是工具调用的 `CallId`** |

**一次调用可以跨尝试**：停机之后新的一次尝试以同一个 `callId` 续接它（`capability.model-request-runtime`），所以**「落在第几次尝试」不是调用的属性，是每一次发出的属性**——它在 [S-8](#s-8-第几次发出) 的 `attemptId` 上，不在 `call` 里（主线裁定 2026-09-23，待产品负责人确认；账本 C-R7）。

**租户归属不在这里。**本契约的响应体不带 TenantId：它是记录条目的载荷，[条目自己声明租户身份](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)。
这使 [`data.identity-values/v1#S-16`](../../identity-values/v1/contract.md#s-16-按归属层显式携带身份值) 的持久形状义务落在条目壳上，而条目壳尚无契约（[G-3](#七已知缺口)）。
**任何把响应体脱离条目单独存放的实现，都必须自己带上归属身份**，不得据 `runId` 现查「当前租户」补齐。

### S-8 第几次发出

`dispatch` 是**该次调用的第几次发出**，从 1 起；`attemptId` 是**这一次发出**落在那次运行的第几次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)里（整数 ≥ 1，定义在 `data.call-accounts/v1#S-37`；它是序号，只与 `call.runId` 合起来才指认一次尝试），与 `call.runId` 同在同缺。

- **同一次调用内从 1 起、逐次加一，不重、不跳，跨尝试连续**：同一次调用的第 n 次发出，不论落在哪次尝试，都是第 n 次。每一次发出恰好留一条（[S-4](#s-4-一次调用一次发出一条响应体)），所以第 n 条存在就意味着第 1 到 n−1 条都存在；
  重试挂件据此知道自己[已经走到第几家](../../../../product/PF-013-model-profiles-and-invocation/design.md#它看得到什么)。
- **`dispatch` 的先后就是发出的先后。**第 n+1 次发出不早于第 n 次的 `endedAt`（[S-17](#s-17-首-token-与时序)）——一次调用同一时刻只有一次发出在途。
- **停机丢失连续性的那一次**，由 `capability.model-request-runtime` v1 S-33 的对账在下一次尝试里补写（`interrupted`、`initiator = runtime_lost`，[S-12](#s-12-收场)）；在补写之前，这条序列在那一处是断的，**消费者不得把断处读成「没有发出过」**。

### S-9 路由留痕

**这一次发出实际用了谁。**

| 成员 | 精确含义 | 缺席意味着什么 |
|---|---|---|
| `profile` | **这一次的[有效模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model)**，以 `ModelProfileRef` 引用那条[档案](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-profile--模型档案--model-profile) | 不许缺 |
| `profileSnapshot` | **这次调用打开时绑定的那条档案在那一刻的副本**（[`data.model-profile/v1#S-27`](../../model-profile/v1/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本) 的 `ModelProfileSnapshot`）：发出与重试消费的那些属性与 `updatedAt`。档案后来改了、被撤回了，这里不变——「当时用的是哪条档案」由 `profile` 指认、「它当时是什么样」由它回答；**档案不另有修订身份**（主线裁定 2026-09-23，待产品负责人确认；账本 C-R1） | 不许缺 |
| `selectedBy` | 有效模型怎么来的，[S-10](#s-10-有效模型怎么来的) | 不许缺 |
| `provider` | **本层为这一次发出指定的那一家**。每一次发出只走一家（[S-24](#s-24-一条响应体对应上游的一次请求)），它必须是 `profileSnapshot` 里「允许的供应商」之一 | 不许缺 |
| `credentialScope` | **这一次发出用的凭据在哪一格**：出厂格（`{ layer: factory }`，那一把由部署装配配置，主线裁定 2026-09-23，账本 S16-f），或租户格（`data.identity-values` 的 `ScopeLayerIdentity` 的租户那一支）。**没有组织那一支**：模型凭据只在租户层与出厂格（[PF-013 rev 10 裁决 33](../../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--组织那一层不持有凭据每人租户层自取)，2026-09-24 规格修订批收窄）。**用量记在这一格头上**（[`data.call-accounts/v1#S-38`](../../call-accounts/v1/contract.md#s-38-两种归属用量归凭据那一格成本归发起者)）。它不是凭据本身，也不是凭据的引用——凭据不进任何记录（[S-21](#s-21-写入之前脱敏)） | 不许缺：出了门就用过一把凭据 |
| `upstreamModel` | **上游回报的模型名，原样**——可能与路由名不同 | **上游没有回报**：没连上、首字节之前断了、错误响应里没带。**不得以路由名、档案里的任何名字或 `provider` 填充**——那是把「我们请求了什么」冒充成「上游说它用了什么」 |
| `upstreamRequestId` | 上游给这次请求的 id，原样；经 [OpenRouter](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) 发出时即它的 generation id，用于事后对账与补账（[S-19](#s-19-用量与费用)） | 上游没给 |
| `parameters` | [S-11](#s-11-交给传输适配的参数与没发出去的项) | 不许缺；一项参数都没有时是空的那一组，不是缺席 |
| `droppedParameters` | [S-11](#s-11-交给传输适配的参数与没发出去的项) | 一项也没丢 |

**「上一条回复是哪个模型生成的」就是它**——[PF-004 §6.6](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) 要求「每一条模型产出的内容，记下实际生成它的模型；事后回看不改成当前选的那个」。
沿 `AssistantMessage.response` 找到本条，读 `route.profile` 与 `route.upstreamModel`，就是答案；**它是那一次求值的历史答案，不随选中模型后来的切换改变**（[S-22](#s-22-写下即不变)）。

> **`provider` 记的是「我们指定的那一家」，不是「上游说它实际用了哪一家」。**两者在「只走一家、不许上游回退」（[S-24](#s-24-一条响应体对应上游的一次请求)）的前提下应当相同；
> [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) 要求实际服务商显式交给模型执行 owner，而**上游回报的实际执行方与指定的那一家不一致时本版没有成员可记**（[G-8](#七已知缺口)）。

### S-10 有效模型怎么来的

[有效模型由两件事决定](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型)：选中模型经层级求值，再经「调模型之前」的拓展件可能的改写。
`selectedBy` 记的是**最后一个定下这一次有效模型的那一步**：

| 取值 | 含义 |
|---|---|
| `session` | [层级求值](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-scope-evaluation--作用域求值--scope-evaluation)取到的就是会话的[选中模型](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-selected-model--选中模型--selected-model)那一格，且没有拓展件改它 |
| `layer_lock` | 层级求值取到的是上层带[不可覆盖标记](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-immutable-marker--不可覆盖标记--immutable-marker)的那一格，且没有拓展件改它。**不论锁住的那条是否恰好与选中的相同**——看的是值从哪一格来，不是值是否相等 |
| `{ extension: <name> }` | 「调模型之前」有拓展件给出了 `select_model` 结论，并且它是最后生效的那一件；`extension` 是那件拓展件的名字。**拓展件改掉有效模型[必须留下结论](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论)，这里是它在响应体上的回指**，不是第二份结论 |

**闭合。**没有「未知」这一值：有效模型算不出来是一件[非常态](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-off-nominal--非常态--off-nominal)，那时这一次根本发不出去，也就没有响应体（[S-16](#s-16-发出了的才有响应体)）。

### S-11 交给传输适配的参数与没发出去的项

- **`parameters`**：本层交给传输适配的那一组[模型请求参数](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-request-parameters--模型请求参数--model-request-parameters)——
  **档案上的默认值，经「调模型之前」的拓展件为这一次覆盖之后的结果**。它说的是这一次，不是档案；档案后来改了参数，这里不变（[S-22](#s-22-写下即不变)）。
- **`droppedParameters`**：`parameters` 里**传输适配认不得、没有发给上游**的那些项的名字。
  [上游不认的项不静默丢，留痕](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案)——它就是那条留痕。
  **真正发给上游的 = `parameters` 去掉 `droppedParameters`。**

三条约束：

1. **项名取统一词表的成员名**（`data.model-profile` 的 `ModelRequestParameters`），且每一个都必须是这一次 `parameters` 里确实出现的项。
2. **缺席即一项也没丢**，所以缺席是一条断言：一个丢了项却不写 `droppedParameters` 的传输适配违反本条。**空数组不是合法写法**——「一项也没丢」只有一种表示。
3. **`extra` 里的上游私有透传项不进 `droppedParameters`**：它们原样透传，传输适配不判认不认得；上游是否采纳本层观察不到。

### S-12 收场

`outcome` 是**这一次发出**的收场，闭合四值：

| 取值 | 含义 | 这次调用随之落在哪（[PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用)） |
|---|---|---|
| `complete` | 上游正常收尾，拿回完整一份 | 完整一份（终态）。**回复在落盘之前被否决也一样**：这次调用照样结束，否决记在 `replyDisposition` 上（[S-14](#s-14-回复与已交付部分)） |
| `truncated` | 写到输出上限被截断。**主路径走完了，[不是非常态](../../../../product/PF-013-model-profiles-and-invocation/design.md#判据怎么用三个例子)** | 完整一份（终态，含撞上输出上限）；被否决时同上 |
| `interrupted` | **这一次发出被中断了**，`initiator` 说是谁：`user` 用户中断了这次调用（直接，或插队顺带）；`run_cancelled` 它所在的运行被取消、或它的宿主停下；`runtime_lost` 失去了连续性、由恢复时的对账补写（主线裁定 2026-09-23，待产品负责人确认；账本 RP-24、S16-g）。[那是控制动作或停机，不是一次故障](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)，**不带任何成因** | 被中断（终态）；**例外**：`runtime_lost` 且没有首 token 时，这次调用可以在新的一次尝试里续接、再发一次（[S-23](#s-23-同一次调用的响应体序列)） |
| `failed` | 这一次发出出了**故障** | 回到在途再发一次（策略说再试），或上交 |

**收场只看 `outcome`。**`stopReason` 是上游原样的收尾理由，留给排查；消费者**不得**据它推断收场，也不得拿它去改写 `outcome`——上游的词会变，收场不会。

**`interrupted` 与 `failed` 形态几乎一样**（都可能发生在首 token 之后、都留下半句话），**但不得互相替代**：
把中断记成失败，[用户每插一次队，记录里就多一条「模型调用失败」](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里)；
把失败记成中断，一次真的故障就不带成因、不上交。

### S-13 收场与其余成员的条件关系

**这张表是本契约的核心。**每一行都是一种合法组合，**表外的组合一律非法**：

| `outcome` | `reply` | `replyDisposition` | `delivered` | `failure` | `timing.firstTokenAt` |
|---|---|---|---|---|---|
| `complete` | **必有**，`ending = complete` | **必有**，三值之一 | 无 | 无 | **必有** |
| `truncated` | **必有**，`ending = truncated_at_limit`（没长完的工具调用也在里面） | **必有**，三值之一 | 无 | 无 | **必有** |
| `interrupted`，有回复（`initiator` 不是 `runtime_lost`） | **必有**，`ending = interrupted_by_user`——内容是已交付的那部分 | **必有**，三值之一 | 无 | **无** | **必有** |
| `interrupted`，开了口、没有回复 | **无** | 无 | **有才带**：写入者手里还有已交付的块就必带；失去连续性之后在途内容已不在，可以缺席 | **无** | **必有** |
| `interrupted`，没开口 | **无**——[不伪造一条空的](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) | 无 | 无 | **无** | **无** |
| `failed`，首 token 之前 | **无** | 无 | 无 | **必有**，`cause ≠ interrupted_mid_reply` | **无** |
| `failed`，首 token 之后 | **无**——[出错断的不成为消息](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) | 无 | **必有** | **必有**，`cause = interrupted_mid_reply` | **必有** |

**逐行的理由都在产品正文里，本条只把它们合成一张判定表：**

- **有 `reply` ⇔ 这一次拿回了一份可以成为消息的回复**：正常收尾、截断、叫停时已有内容，这三种[落成一条完整的消息](../../../../product/PF-009-context-message-types/design.md#56-流断在半路)；
  `reply.ending` 取 `data.messages` 的三值之一，**与 `outcome` 一一对应**，不许错配。
  **三种都还要过「消息落盘之前」那一关**，过没过、或者本来就被系统拿去用，记在 `replyDisposition`（[S-14](#s-14-回复与已交付部分)；主线裁定 2026-09-23，待产品负责人确认，读数报回 S8-e）。
- **失去连续性补写的那一条没有回复**（`initiator = runtime_lost`）：在途内容随进程没了，没有人还拿着一份可以成为消息的回复。
  **开了口之后被中断、没有交出回复**（宿主没先让调用方写下回复就停了，或失去连续性）：已交付的块有才带在 `delivered`，[没有的由中断提醒兜底](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)。
- **故障断的不成为消息**，已交付的那部分[记在这次尝试的账里](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)——就是 `delivered`。
- **用户中断不带成因**；**故障必带成因**。
- **首 token 之后的故障，成因一律是 `interrupted_mid_reply`**：[只要首 token 已经出来，无论上游最后返回什么，都归它](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)。
  上游最后回的状态码（比如 429）**照样原样带着**（[S-15](#s-15-故障的成因与原样状态码)），但它不改变成因。
- **反过来，`interrupted_mid_reply` 只出现在首 token 之后。**首 token 之前的故障，照[那张表](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它)取其余七个成因之一。

> **回复完整回来了，却在[落盘之前被否决](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路)**
> （比如[转换件转不成](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)）：
> **收场仍是 `complete` 或 `truncated`**——这一次发出本身走完了主路径；`reply` 照记，`replyDisposition = { vetoed: { by, reason? } }`，**它没有成为消息**；**不带 `failure`**。
> **这次调用就此结束**；要再试，是 loop 在下一次迭代另起的一次**新的模型调用**（新的 `callId`），
> 所以[「首 token 之后不许重发」](#s-17-首-token-与时序)在这里**没有例外**——新调用的发出不是这次调用的重发（[S-23](#s-23-同一次调用的响应体序列)）。

### S-14 回复与已交付部分

- **`reply` 是这一次拿回来的那一份回复本身**，不是它的摘要或副本：`reply.response` **必须等于**本条 `id`，这是 `AssistantMessage` 指回响应体的唯一依据。
  **同一次调用至多一条响应体带 `reply`，且它是这次调用的最后一条**（[S-23](#s-23-同一次调用的响应体序列)）。
- **`replyDisposition` 说这份回复有没有成为消息**，**凡 `reply` 存在即必带，`reply` 缺席即不带**（主线裁定 2026-09-23，待产品负责人确认；读数报回 S8-e）：

  | 取值 | 含义 |
  |---|---|
  | `persisted` | 它过了「消息落盘之前」那一关，**落盘成了会话日志里的一条消息** |
  | `{ vetoed: { by, reason? } }` | 它在「消息落盘之前」被否决，**没有成为消息**。`by` 是否决它的那件[拓展件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)的名字（[转换件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)也算），`reason` 是它给出的理由，有就带 |
  | `{ consumed: { by } }` | 它**本来就不成为消息**，被系统拿去用了：`by ∈ { compaction, side_query }`——压缩时生成摘要的那次调用、旁路提问的那次调用。**账照记**（主线裁定 2026-09-23，待产品负责人确认；对账块 D） |

  **被否决的那份回复只活在这条响应体里**：它带着的 `MessageId` 在会话日志里找不到对应的消息；
  用户可能已经看见它一段段冒出来，[那部分记在这次尝试的账里](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)——就是这条响应体。
  **否决不改写收场**：`outcome` 仍是原来那一个，不带 `failure`，这次调用照样结束（[S-12](#s-12-收场)）。
- **`interrupted` 的那份 `reply` 同样过「消息落盘之前」那一关**：被叫停时已经交出来的半截回复，照样可能被否决；否决了它就不成为消息，这次调用仍以被中断结束、不再发出（原 G-12）。
- **同一条消息在日志里只有一份权威内容。**`reply` 在响应体里、消息又是会话日志里的一条消息——
  两者落成同一条记录条目的两个面，还是两条条目，归条目壳（[G-3](#七已知缺口)）；**无论怎样落，都不得出现两份可以各自改、各自分叉的内容**——
  [同一件事两处登记必然分叉](../../../../product/PF-013-model-profiles-and-invocation/design.md#55-上交交给谁看模型说没说出话)。
- **`delivered` 是开了口却没有交出回复时已交付、不成为消息的那部分**——首 token 之后的故障，或开了口之后被中断而没有回复（[S-13](#s-13-收场与其余成员的条件关系)）；块的形状取 `data.content-blocks` 的 `ContentBlock`：
  已封口的块照原样，断在半路的块取断开那一刻它已有的内容；**没长完的工具调用照 `data.content-blocks` 的规则两位皆假**。
  [用户看见了的，会话日志里必须有](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)——它就是那一「有」。
- **`reply` 与 `delivered` 互斥。**一条响应体里已交付的内容要么在 `reply` 里，要么在 `delivered` 里，**不能两处都放**。
- **`delivered` 缺席即没有已交付的内容**；空数组不是合法写法。

### S-15 故障的成因与原样状态码

`failure = { cause, statusCode?, upstreamError? }`，**只在 `outcome = failed` 上出现，且在那里必有**（[S-13](#s-13-收场与其余成员的条件关系)）。

- **`cause`**：八个成因之一。**名字与定义归 `data.loop-extension` 的 `FailureCause`，本契约 `$ref` 它、不复述**；
  八个取值按 [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) 的顺序是
  `withdrawn` · `scope_disallowed` · `modality_mismatch` · `credential_unavailable` · `request_rejected` · `upstream_unavailable` · `interrupted_mid_reply` · `unrecognized`。
  **成因在这个边界上分类**（[§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分)）：由写响应体的那一层认出来，不丢给外层按异常形态去猜。
- **成因说的是这一次发出。**`upstream_unavailable` 在产品正文里带着「且试尽了」——**那是上交的条件，不是这一次的分类**：
  一条带 `upstream_unavailable` 的响应体只说「这一次上游给不出回复」，**不表示这次调用已经试尽**。试没试尽由重试挂件判，结论落在它自己的结论条目里。
- **`statusCode`**：上游返回的状态码，**原样带着，不翻译**。[成因回答「谁能了结」，状态码回答「上游到底怎么了」，两者不互相替代](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着)。
  **上游没有返回状态码时缺席**（连不上、超时、没到上游）——**缺席不是 0，也不得补一个「看起来合理」的值**。
- **`upstreamError`**：上游在错误里给出的 `code`、`message` 与原样错误体 `raw`，**脱敏之后原样**（[S-21](#s-21-写入之前脱敏)）；三样都没有就不写这个成员。
- **`localError`**：本层自己出的错——传输适配报错、解不开上游的回应——的原文，**脱敏之后原样**；没有就不写。它与 `upstreamError` 分开：一个是上游说的，一个是本层遇到的。
- **兜底值不许用来偷懒**（[§6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着)）：
  带 `unrecognized` 的那一条**必带认不出来的那样东西**——`statusCode`、`upstreamError`、`localError` 或 `raw` 至少其一；Schema 管得到，缺了即 `malformed`（[S-27](#s-27-表示层拒绝值)）。**留下的是不是真的那样东西**仍是判定层的事。

### S-16 发出了的才有响应体

**响应体只记发出了的那几次**（[S-4](#s-4-一次调用一次发出一条响应体)）。由此：

- **`withdrawn`、`scope_disallowed`、`modality_mismatch` 三个成因不出现在任何一条响应体上。**它们[都发生在出门之前](../../../../product/PF-013-model-profiles-and-invocation/design.md#最后一行不再往下细分)——
  请求根本没到上游，也就没有「一次发出」可记。它们随上交条目与「调模型之后」失败那一维的输入走。
- **`credential_unavailable` 只以「配了而上游拒绝它」的那一半出现**；「范围没配凭据」那一半同样在出门之前。
- **Schema 形状上放过这三个值**（`cause` 直接引用八值枚举）；写入者不写它们，是**判定层**的约束，证据形式在[验证入口](../verification.md)。

### S-17 首 token 与时序

`timing = { sentAt, firstTokenAt?, endedAt }`，三个都是 [`data.offer-expiry/v1#S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 定的时间点。

| 成员 | 是什么时刻 |
|---|---|
| `sentAt` | 这一次发出离开本层、交给传输的时刻 |
| `firstTokenAt` | **本层观察到首 token 的时刻**。[首 token 指这次回复交出的第一样内容，不论模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类)：能一点点长的块（文本、思考、工具调用的参数、语音）是**第一片到了**；整个交出的块（图、文件）是**整块交出来了**。**响应头到了不算，整交的块开了口还没交出来也不算** |
| `endedAt` | **本层确认这一次发出已经结束的时刻**：收到收尾、判定故障、收到中断，或恢复时确认它已失去连续性（[G-7](#七已知缺口)）。它不是上游那边的结束时刻 |

- **先后**：`sentAt ≤ firstTokenAt ≤ endedAt`，没有 `firstTokenAt` 时 `sentAt ≤ endedAt`。跨字段比较不在形状约束内，由写入者兑现。
- **三个时刻来自同一个时间源**（[S-25](#s-25-装配给的保证与协议须给的保证)），否则「首 token 之前还是之后」在两个时钟之间会判出两个答案。
- **首 token 是这一层自己观察到的事实，与上游最后返回什么无关**（[§5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#最后一行不再往下细分)）。
  它决定两件事：**这一次的故障成因是不是 `interrupted_mid_reply`**（[S-13](#s-13-收场与其余成员的条件关系)），以及**停机之后能不能重发**——
  [之前可以，之后一律不](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)。本契约只记这一事实，「重不重发」由能力按它判。
- **有首 token 就不许重发，没有例外。**回复在落盘之前被否决也不例外：那次调用以 `complete`／`truncated` 加 `replyDisposition = { vetoed }` 结束（[S-13](#s-13-收场与其余成员的条件关系)），
  要再试是 loop 另起的一次**新的模型调用**，它的发出从它自己的 `dispatch = 1` 数起，不是被否决那次调用的重发。

### S-18 首 token 缺席是一条断言

**`firstTokenAt` 缺席的意思是「本层确知这一次没有开口」，不是「不知道开没开口」。**

它必须是断言，因为消费者会据它**放行一次重发**：把「判不出来」写成缺席，一次已经吐了半句的回复就会被再发一遍，
[记录里躺着两份回复，而用户只看见过一份半](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)。

**写入者判不出来时，不得写成缺席。**本版的响应体形状**没有「判不出」这一取值**——
典型情形是停机之后在途状态已经没了（[在途状态由运行时持有，失去连续性它就没了](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)）。
那时怎样收场、首 token 的观察怎样在失去连续性之后仍判得出，**本契约只禁止「写成缺席」这一种答法**，其余归 [G-7](#七已知缺口)。

### S-19 用量与费用

`usage` 与 `cost` 的形状取 `data.call-accounts` 的 `Usage`、`Cost`，**本契约不复述**；成员名 `input_tokens`、`output_tokens`、`cache_read_tokens`、`cache_write_tokens`、`cost_usd` 沿用上游用量报文的命名，那是 `data.call-accounts` 的规定。

本契约在它之上只承诺四件事：

1. **每一次发出各记各的。**一次调用发出两次，就是两条响应体、两份用量、**两笔钱**，[都照实记](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)——
   请求到了上游、首 token 还没出来，上游可能已经开始计费，**重发不使前一笔消失**。
   这与[「账只记一次」](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)不冲突：那说的是一条流里记一次，这里是两次发出、两条流。
2. **拿不到记 `unknown`，不记零，也不缺席**——失败了、被中断了、上游没给，都一样（[D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md)：实际费用不能被目录估算冒充）。
   这一次发出的流收尾前没有交出 `account` 事件时，`usage` 与 `cost` 按 `data.call-accounts` 的「来源 = 无」写，**不伪造**。
3. **事后补账不改这条响应体**：拿到了实际费用，追加一条 `data.call-accounts` 的 `CostCorrection`，目标是 `{ kind: model_response, responseId: <本条 id> }`（[S-22](#s-22-写下即不变)）。
   经 `route.upstreamRequestId` 向上游补查是补账的一条来路。
4. **按 Run 汇总是派生，不存进响应体**（[S-5](#s-5-与别的形状的关系)）。[明细按尝试记、汇总按 Run 算](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)：
   `call.runId` 与 `attemptId` 给出每一笔落在哪次运行的哪次尝试；不属于任何运行的调用归会话，它的钱怎样汇总归 `data.call-accounts`。
   [成本要能算到发起它的那个租户头上](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)——租户身份由承载本条的记录条目给（[S-7](#s-7-所属的那次调用)、[G-3](#七已知缺口)）；**用量那一格**是 `route.credentialScope`（[S-9](#s-9-路由留痕)）。
5. **砍了要说**：这一次发出的流上若有合并或截掉，汇总落在 `trims`（`data.call-accounts` 的 `TrimSummary`，[`#S-15`](../../call-accounts/v1/contract.md#s-15-trimreason-与-trimsummary砍了要说)，由砍的那一方计数）；**缺席即一次也没砍，全零的汇总不是合法写法**（主线裁定 2026-09-23，待产品负责人确认；对账块 D）。

### S-20 上游原始响应留存

`raw = { headers?, body? }`：上游原始响应的留存，**排查用**。

- **不进给模型的上下文，也不进任何面向人的呈现**；读它的只有排查的人。
- `headers`：上游响应头，**脱敏之后原样**，**不得含凭据**（[S-21](#s-21-写入之前脱敏)）。头名的大小写与同名多值怎样合并，本契约不规定。
- `body`：原始响应体**存进附件存储**之后的引用，形状取 `data.content-blocks` 的 `AttachmentRef`。
  **它不是[附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment)**——那个词说的是工具执行的产出；这里只借同一种存储与同一种引用形状（上游原始响应留存：无词条）。
- **保留期是一项设置**，不在本契约定（[G-4](#七已知缺口)）。**过了保留期、附件被清理之后，`body` 的引用可能取不到**：
  取不到**不改变响应体其余任何成员的含义**，也不得据此判定响应体损坏；清理附件不改写响应体（[S-22](#s-22-写下即不变)）。
- **上游有回报时应当留。**`raw` 缺席有两种来路——上游什么都没回，或者留存本身没成——本版**不区分**这两种。
  **留存没成不阻止响应体写下**：那一条的用量、费用与收场比它的原始字节更要紧，**也不得为了凑齐而伪造任何一项**。
  两项都没有就不写 `raw`；空对象不是合法写法。

### S-21 写入之前脱敏

**响应体的任何成员都不得含凭据。**[上游返回的原文里可能带着凭据](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏)——鉴权头的片段、密钥的前几位；
而响应体写下即不变（[S-22](#s-22-写下即不变)），**写错了就是永久的**。

- **脱敏发生在写入之前**，覆盖 `failure.upstreamError`（`code`、`message`、`raw`）、`raw.headers` 与 `raw.body` 指向的那份留存。
  **不是写下之后再清理**：日志只增不改，事后清理做不到。
- **脱敏之后仍叫「原样」**：除去凭据之外不翻译、不改写、不摘要。
- **什么算凭据、哪些头要剥、怎样判定一段文本里有凭据**，归写入者所在的能力（[G-5](#七已知缺口)）。本契约只立「不得含」这条结果。

### S-22 写下即不变

**一条响应体在这一次发出结束时写下一次，此后不再改变。**它是[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)的载荷，条目一旦写下就不再改变——要改变，靠追加。

- **没有「写到一半」的响应体**：这一次发出还在途时，它的中间状态归运行时持有，不是一条响应体。
- **费用更正**：追加 `CostCorrection`（[S-19](#s-19-用量与费用)），原响应体不动。
- **选中模型后来切换、档案后来改了参数或被撤回**，都不回头改任何一条已写下的响应体——[事后回看不改成当前选的那个](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定)。
- **原始响应附件按保留期清理**，是附件存储上的事，不是对响应体的改写（[S-20](#s-20-上游原始响应留存)）。

### S-23 同一次调用的响应体序列

**同一次调用（同一个 `call`）的全部响应体，按 `dispatch` 排成 R₁ … Rₙ（n ≥ 0），满足：**

1. **`dispatch` 恰是 1 … n**（[S-8](#s-8-第几次发出)）。n = 0 即这次调用一次都没发出（[S-16](#s-16-发出了的才有响应体)）。
2. **除了最后一条，每一条都是下面两种之一，且都没有 `firstTokenAt`**：`failed`、成因是 `upstream_unavailable` 或 `unrecognized`；或 `interrupted`、`initiator = runtime_lost`（首 token 之前失去连续性，新的一次尝试续接再发，主线裁定 2026-09-23，待产品负责人确认；账本 S16-g）。
   理由在 [PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) 与 [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件)：
   `complete`、`truncated`、`interrupted` 都是这次调用的终态；**「已经开口说话了」「重试没用」两类是事实，[重试挂件推翻不了](../../../../product/PF-013-model-profiles-and-invocation/design.md#有三件事它改不动)**，
   所以 `interrupted_mid_reply`、`credential_unavailable`、`request_rejected` 之后**不会再有下一次发出**；「发不出去」那三个成因根本不上响应体。
   **只有策略那一类（`upstream_unavailable`、`unrecognized`）之后才可能再发**——而发不发由重试挂件定；**没开口就失去连续性的那一次之后可以续接再发**，发给同一家。
3. **至多一条带 `reply`，且它是 Rₙ。**它的 `replyDisposition` 不论是哪一种，这次调用都到此为止。
4. **没有例外。**回复在落盘之前被否决之后的再试**不在这条序列里**：它是 loop 另起的一次新的模型调用（新的 `callId`），有它自己的一条序列、从 `dispatch = 1` 数起
   （[S-13](#s-13-收场与其余成员的条件关系) 的引注、[`examples.md` E-8](examples.md#e-8-同一个-run-里前后两次调用前一次的回复被否决)）。

**这条序列性质的保护者是写响应体的那一方**（`capability.model-request-runtime`）：它只在策略那一类之后、或没开口就失去连续性之后才发起下一次。
重试挂件**读**这条序列，不写它。

### S-24 一条响应体对应上游的一次请求

**一次发出 = 上游的一次请求，恰对应一条响应体。**

- **传输层不得在一次发出之内隐藏重试。**[让上游在一次请求里自己按次序换家，那几条留痕就全没了——在我们这边它只是一次请求](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)；
  [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) 的比较门同样点名「无隐藏重试」。
- **每一次发出只指定一家，并且不许上游替我们回退到别家。**换一家是**再发一次**，由重试挂件决定，**各留一条**。
- **它的兑现方是传输适配**（pi-ai 定向 fork，D-019）与发出它的能力；本契约只立这条对应关系，证据形式在[验证入口](../verification.md)。

## 四、装配给与协议给

### S-25 装配给的保证与协议须给的保证

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。
**这张表本身是契约的一部分**：左列单机时由装配顺带给出的，在跨进程之后**不会自动成立**。

| 保证 | 单机由谁给 | 跨进程之后谁重新兑现 | 做不到会怎样 |
|---|---|---|---|
| **一条响应体对应上游的一次请求**（[S-24](#s-24-一条响应体对应上游的一次请求)） | **装配给**：传输适配与模型请求运行时同进程，重试只能由运行时发起 | **协议给**：传输若跑在另一个进程或节点，须把「一次发出」作为可对账的单元交回，任何重试都由调用方发起并各自留痕 | 留痕丢失：重试挂件看到的次数少于实际，**两笔钱只记一笔** |
| **三个时刻同源可比**（[S-17](#s-17-首-token-与时序)） | **装配给**：同一进程、同一时间源 | **协议给**：观察首 token 的一方与写响应体的一方若不在同一节点，须定义时钟偏差上界并纳入契约 | 「首 token 之前还是之后」判错——**把已经开口的判成没开口，重发一份** |
| **首 token 的观察可以被判出来**（[S-18](#s-18-首-token-缺席是一条断言)） | **装配给——只到进程还活着为止**：观察与写入在同一进程；**停机之后不成立**（[G-7](#七已知缺口)） | **协议给**：观察者须在任何可能丢失连续性之前让「已经开口」这件事可恢复，且先于它宣称这一次结束 | 停机或网络分区之后，已开口的一次被读成没开口，**记录里躺着两份回复** |
| **`(call, dispatch)` 唯一、同一次调用内不重不跳**（[S-8](#s-8-第几次发出)） | **装配给**：同一次调用只有一个写入者（它的模型请求运行时），在一个进程里逐次发号 | **协议给**：发号须由一处给出；多个节点替同一次调用写响应体时要有唯一的序号来源 | 同号两条或跳号：**重试挂件数错已经试过几家** |
| **`ResponseId` 部署内唯一**（[S-6](#s-6-responseid)） | 单一生成点 | **协议给**：跨节点标识分配；唯一是承诺，不是「碰撞概率足够低」 | `AssistantMessage.response` 指到两条，**「这句话是哪个模型说的」答出两个答案** |
| **凭据不进响应体**（[S-21](#s-21-写入之前脱敏)） | 写入点只有一个，在那里脱敏 | **协议给**：每个写入点各自在写入之前脱敏，不得把脱敏集中到下游某一处 | **凭据永久留在不可变的记录里** |

## 五、表示与边界校验

### S-26 Schema 的范围

交换与存储表示由 [`model-response.schema.json`](model-response.schema.json) 约束，JSON Schema **Draft 2020-12**，
`$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/model-response/v1/model-response.schema.json`。
根模式约束一条 `ModelResponse`。

| `$defs` | 是什么 | 本契约的落点 |
|---|---|---|
| `ModelResponse` | 一条响应体；收场的条件关系以 `allOf` 的 `if/then` 表达 | [S-4](#s-4-一次调用一次发出一条响应体)、[S-13](#s-13-收场与其余成员的条件关系) |
| `ResponseId` | 响应体标识，**家在本契约**；按 `identity-values` S-31 的散文自定义 pattern | [S-6](#s-6-responseid) |
| `ReplyDisposition` | `persisted`、`{ vetoed: { by, reason? } }` 或 `{ consumed: { by } }` | [S-14](#s-14-回复与已交付部分) |
| `ModelCallRef` | `{ runId?, callId }` | [S-7](#s-7-所属的那次调用) |
| `RunId`、`AttemptId`、`ModelCallId` | 运行标识、尝试序号、模型调用标识；三者都只 `$ref` `data.call-accounts` 的同名定义 | [S-7](#s-7-所属的那次调用)、[S-8](#s-8-第几次发出) |
| `CredentialScope` | 凭据那一格：`{ layer: factory }` 或 `ScopeLayerIdentity` 的租户那一支 | [S-9](#s-9-路由留痕) |
| `Route` | 路由留痕 | [S-9](#s-9-路由留痕)～[S-11](#s-11-交给传输适配的参数与没发出去的项) |
| `SelectedBy` | 有效模型怎么来的 | [S-10](#s-10-有效模型怎么来的) |
| `ResponseOutcome` | 收场四值 | [S-12](#s-12-收场) |
| `Failure`、`UpstreamError` | 故障与上游错误原文 | [S-15](#s-15-故障的成因与原样状态码) |
| `Timing` | 三个时刻 | [S-17](#s-17-首-token-与时序) |
| `RawResponse` | 上游原始响应留存 | [S-20](#s-20-上游原始响应留存) |

**它能约束的**：必需成员都在、没有多余成员、枚举取值闭合、`dispatch ≥ 1`、「缺席」与「空」只有一种写法（`delivered`、`droppedParameters`、`upstreamError`、`raw` 都不许写成空，`trims` 不许全零）、`replyDisposition` 与 `reply` 同在同缺、`initiator` 只在 `interrupted` 上且在那里必有、`runtime_lost` 不带 `reply`、`attemptId` 与 `call.runId` 同在同缺、`unrecognized` 至少带一样痕迹、
[S-13](#s-13-收场与其余成员的条件关系) 那张表的每一格。

**它不能约束的**：`reply.response` 等于 `id`（[S-14](#s-14-回复与已交付部分)）；三个时刻的先后与同源（[S-17](#s-17-首-token-与时序)）；
`firstTokenAt` 缺席是否确知（[S-18](#s-18-首-token-缺席是一条断言)）；`droppedParameters` 是否都在 `parameters` 里、有没有漏报（[S-11](#s-11-交给传输适配的参数与没发出去的项)）；
`provider` 是否是档案允许的一家（[S-9](#s-9-路由留痕)）；`upstreamModel` 有没有被冒填（[S-9](#s-9-路由留痕)）；
三个「发不出去」成因不上响应体（[S-16](#s-16-发出了的才有响应体)）；`unrecognized` 带的痕迹是不是真的那样东西（[S-15](#s-15-故障的成因与原样状态码)）；`delivered` 在写入者手里还有已交付的块时有没有漏带（[S-13](#s-13-收场与其余成员的条件关系)）；`credentialScope` 是不是真用的那一格（[S-9](#s-9-路由留痕)）；
同一次调用的序列性质（[S-23](#s-23-同一次调用的响应体序列)）；脱敏（[S-21](#s-21-写入之前脱敏)）；无隐藏重试（[S-24](#s-24-一条响应体对应上游的一次请求)）；写下即不变（[S-22](#s-22-写下即不变)）。
**Schema 校验通过不表示这些条款成立**；它们的证据形式在[验证入口](../verification.md)。

**引用的形状由各自的家决定**：`call.runId`、`attemptId`、`call.callId`、`usage`、`cost`、`trims`（`data.call-accounts`），`reply`（`data.messages`），`delivered`、`raw.body`（`data.content-blocks`），`route.profile`、`route.profileSnapshot`、`route.provider`、`route.parameters`（`data.model-profile`），`route.credentialScope` 的租户那一支（`data.identity-values`），`failure.cause`（`data.loop-extension`）；整批对齐核过引用解析（[验证入口「变化的影响」](../verification.md#变化的影响)）。

### S-27 表示层拒绝值

**一个值不是合法的响应体时，给出下列闭合集合中恰一个拒绝值。**没有「其他」。

| 拒绝值 | 什么时候给 | Schema 里在哪 |
|---|---|---|
| `malformed` | 形状不合，且不属于下面任何一个具名情形：缺必需成员、类型不对、有多余成员、引用的外部形状不合、「空」写成了空数组或空对象、`trims` 全零；**另含几种无专名的跨成员情形**：`replyDisposition` 与 `reply` 不同在同缺；`initiator` 在 `interrupted` 上缺席或出现在别处；`runtime_lost` 带了 `reply`；`attemptId` 与 `call.runId` 不同在同缺；`unrecognized` 一样痕迹都没带 | 各成员定义；`ModelResponse.allOf` 标 `malformed` 的六支 |
| `outcome_unknown` | `outcome` 是字符串但不在四值之内 | `ResponseOutcome` |
| `dispatch_zero` | `dispatch` 是整数但小于 1 | `ModelResponse.properties.dispatch` |
| `cause_unknown` | `failure.cause` 是字符串但不在八个成因之内 | `Failure.properties.cause` |
| `reply_missing` | `complete`／`truncated` 没有 `reply` | `allOf` 第一支 |
| `reply_on_failure` | `failed` 带了 `reply` | `allOf` 第二支 |
| `reply_and_delivered` | 同时带 `reply` 与 `delivered` | `allOf` 第三支 |
| `failure_missing` | `failed` 没有 `failure` | `allOf` 第四支 |
| `failure_on_interrupted` | `interrupted` 带了 `failure` | `allOf` 第五支 |
| `failure_on_success` | `complete`／`truncated` 带了 `failure`——回复在落盘之前被否决也不例外，那记在 `replyDisposition` 上 | `allOf` 第六支 |
| `reply_ending_mismatch` | `reply.ending` 与 `outcome` 错配（`complete` ↔ `complete`、`truncated` ↔ `truncated_at_limit`、`interrupted` ↔ `interrupted_by_user`） | `allOf` 第七支的三个分支 |
| `first_token_inconsistent` | `firstTokenAt` 的有无与收场、回复、已交付部分或成因对不上：成因是 `interrupted_mid_reply` 却没有它；`failed` 有它而成因不是 `interrupted_mid_reply` 或没有 `delivered`；有 `reply` 或 `delivered` 却没有它 | `allOf` 第八支的五个分支 |

**一个值同时违反几条时，按下面的次序取第一条被违反的，给恰一个值**——拒绝值说明的是第一处不合，不是违规的全集：

1. **成员各自的形状**：先 `outcome_unknown`、`dispatch_zero`、`cause_unknown`，其余成员层面的不合一律 `malformed`；
2. **跨成员的条件**：`reply_missing` → `reply_on_failure` → `reply_and_delivered` → `failure_missing` → `failure_on_interrupted` → `failure_on_success` → `reply_ending_mismatch` → `first_token_inconsistent`，最后是上一行列的那几种无专名的跨成员情形，给 `malformed`。

**「`delivered` 只出现在开了口却没有回复的那几行」不单列一支**：按上面的次序它必然先撞上 `reply_missing`、`reply_and_delivered` 或 `first_token_inconsistent` 之一
（`complete`／`truncated` 必带 `reply`；带 `reply` 即与 `delivered` 冲突；`delivered` 要求有首 token）。

**`first_token_inconsistent` 的范围比账本括注宽**：账本括注只写了「`interrupted_mid_reply` 却无 `firstTokenAt`，或反之」，
本条把「`firstTokenAt` 的有无与 [S-13](#s-13-收场与其余成员的条件关系) 那张表对不上」一并归到这个值下，没有另起新名。

### S-28 表示层拒绝与判定分开

**表示非法的输入在进入任何判定之前被拒绝**，与 [`data.identity-values/v1#S-33`](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) 同一规矩：

- **拒绝不表示这次发出没有发生**，也不表示这次调用失败了。一个被判为 `malformed` 的值说明**写入者写坏了**，
  正确的收场是那个写入者的缺陷被暴露出来，**不是**把这次发出当成「没发过」而再发一次，也**不是**把它当成一次 `failed`。
- **表示合法不表示任何条款成立**：[S-26](#s-26-schema-的范围) 列的那些 Schema 管不到的条款，一条都不因校验通过而成立。
- **校验失败不得降级为「按默认处理」或「尽力而为」**：不补一个 `outcome`、不把缺了的 `firstTokenAt` 当作「没开口」、不把缺了的 `failure` 当作「没认出来」。

## 六、性质与规范场景

### 性质

| 类别 | 性质 | 条款 | 来源 |
|---|---|---|---|
| 不变量 | 每一次发出恰好留一条响应体；一次都没发出的调用没有 | S-4、S-8、S-16 | [PF-013 §5.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)、[flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) |
| 不变量 | 收场与回复、已交付部分、故障、首 token 的组合只取 S-13 表中六行之一 | S-13 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路)、[PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) |
| 不变量 | 一条响应体写下即不变 | S-22 | [UL-record-entry](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry) |
| 不变量 | 同一次调用至多一条带 `reply`，且是最后一条 | S-14、S-23 | [PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) |
| 不变量 | 正常收尾与截断的回复都说得出有没有成为消息；被否决的那份不在日志里冒充一条消息 | S-13、S-14 | [PF-012 消息落盘之前的否决](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路) |
| 安全 | **绝不能**：首 token 之后的故障被记成可重发的成因；**绝不能**：有首 token 的一次调用再发一次——回复被否决之后的再试是另一次调用 | S-13、S-17、S-23 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) |
| 安全 | **绝不能**：「不知道开没开口」被写成「没开口」 | S-18 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) |
| 安全 | **绝不能**：用户中断被记成故障，或故障被记成中断 | S-12、S-13 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) |
| 安全 | **绝不能**：拿不到的用量或费用被记成零；重发之后前一笔钱消失 | S-19 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token)、[D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) |
| 安全 | **绝不能**：上游不认的参数被静默丢掉 | S-11 | [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) |
| 安全 | **绝不能**：凭据写进响应体 | S-21 | [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) |
| 安全 | **绝不能**：上游没回报的模型名被路由名冒填 | S-9 | [D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md)（同一条理由：不把路由名填进实际服务商字段） |

**本契约没有进展性质**：它不拥有「一次发出最终会结束」这类承诺——那是写它的能力的事（发出有没有超时、谁收口）。
它只承诺**结束之后写下的那一条是什么**。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。
**每一条都需要一个实现了模型请求运行时的提供者**；Schema 正反实例在 [`examples.md`](examples.md)。

#### S-29 两次发出，两条响应体，两笔钱

让一次调用的第一次发出以上游 503 失败（首 token 之前），重试挂件换一家再发，第二次正常收尾。
**必须观察到**：恰两条响应体，`dispatch` 为 1、2，`call` 相同，`route.provider` 不同；第一条 `failed`、成因 `upstream_unavailable`、`statusCode = 503`、没有 `firstTokenAt`、没有 `reply`；
第二条 `complete`、带 `reply` 且 `reply.response` 等于它的 `id`；**两条各有自己的 `usage` 与 `cost`**，按 Run 汇总时两笔都计入（拿不到的那一笔计为「未知」，不当零）。
**绝不能观察到**：只有一条响应体，或第一笔费用消失。手算见 [`examples.md` 末节](examples.md#四按尝试记明细按-run-汇总)。

#### S-30 首 token 之后的故障

让上游在吐出第一段文本之后断开，最后回一个 429。
**必须观察到**：一条 `failed`，成因 `interrupted_mid_reply`，`statusCode = 429` 原样，`firstTokenAt` 在，`delivered` 含已交付的那段文本，**没有 `reply`**；
**这次调用不再有第二次发出**，哪怕重试挂件被换成一件「见 429 就重试」的拓展件。

#### S-31 用户中断的两支

同一次演练里跑两支：在首 token **之前**中断，在首 token **之后**中断。
**必须观察到**：两条都是 `interrupted`、都**不带 `failure`**；之前那条没有 `reply`、没有 `firstTokenAt`；之后那条有 `reply`（`ending = interrupted_by_user`，内容是已交付的那部分）、有 `firstTokenAt`。
**绝不能观察到**：任何一条被记成 `failed`。两支必须同跑，只跑一支证明不了「中断不带成因」对两种情形都成立。

#### S-32 没发出去的调用没有响应体

让选中的档案被撤回，再发起一次调用。
**必须观察到**：这次调用上交、成因「已下架」随上交条目走，**没有任何一条响应体**；日志里也找不到一条带 `withdrawn` 的响应体。

#### S-33 参数不静默丢

让档案或「调模型之前」的拓展件带上一项传输适配认不得的统一参数。
**必须观察到**：那一条响应体的 `route.parameters` 含该项，`route.droppedParameters` 列出它的名字；**发给上游的请求里没有它**。
**绝不能观察到**：`droppedParameters` 缺席而那一项实际没发出去。

#### S-34 凭据不进响应体

让上游错误与响应头里带上一段已知的凭据样式文本。
**必须观察到**：写下的响应体里——`failure.upstreamError`、`raw.headers`，以及 `raw.body` 指向的那份留存——**找不到那段文本**。
本场景的判据依赖脱敏规则本身（[G-5](#七已知缺口)），在规则定下之前只能用「已知凭据原文不出现」这一种判法。

## 七、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| G-1 | **已闭合（2026-09-23）**：主线裁定 `RunId` 的家在 `data.call-accounts` v1，本契约 `$ref` 那里（[S-7](#s-7-所属的那次调用)）；定义已在 [`data.call-accounts/v1#S-37`](../../call-accounts/v1/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid)。编号保留不重排 | — | — |
| G-2 | **已闭合（2026-09-23）**：同上，`ModelCallId` 与 `AttemptId` 的家也定在 `data.call-accounts` v1；`data.arrival-events` 本地那一份同样改为引用那里（对齐波的事） | — | — |
| G-3 | **租户归属与条目壳**：响应体不带 TenantId，归属靠承载它的记录条目；条目壳（带会话、Run、尝试与租户，声明效力与寿命宿主）**尚无契约**。`reply` 与日志里那条消息落成一条条目还是两条也等它（[S-7](#s-7-所属的那次调用)、[S-14](#s-14-回复与已交付部分)、[S-19](#s-19-用量与费用)） | loop 那一程（主线） | 条目壳的契约成立，并兑现 `data.identity-values/v1#S-16` 的持久形状义务 |
| G-4 | **原始响应留存的保留期**：它是一项设置，归 PF-002 那套设置机制，本契约不定（[S-20](#s-20-上游原始响应留存)） | 块 A／PF-002 | 那项设置立起来（名字、归属的资产、默认值由谁给） |
| G-5 | **脱敏规则**：什么算凭据、哪些头要剥、怎样识别错误原文里的凭据（[S-21](#s-21-写入之前脱敏)） | `capability.model-request-runtime` | 能力契约写出规则与它的证据形式；S-34 的判据随之具体化 |
| G-6 | **已闭合（2026-09-23）**：主线裁定（与 `data.loop-extension` 对齐）——回复在落盘之前被否决时，收场仍是 `complete`／`truncated`，记 `replyDisposition = { vetoed: { by, reason? } }`，这次调用照样结束；再试由 loop 另起一次新的模型调用（新的 `callId`），首 token 规则不加例外（[S-13](#s-13-收场与其余成员的条件关系)、[S-14](#s-14-回复与已交付部分)、[S-17](#s-17-首-token-与时序)、[S-23](#s-23-同一次调用的响应体序列)、[`examples.md` E-8](examples.md#e-8-同一个-run-里前后两次调用前一次的回复被否决)） | — | — |
| G-7 | **已闭合（2026-09-24 整批对齐）**：补写者与时点、两支的收场由 `capability.model-request-runtime` v1 S-33 的对账给出——首 token 之前与之后都是 `interrupted`、`initiator = runtime_lost`，前者可续接再发（[S-12](#s-12-收场)、[S-23](#s-23-同一次调用的响应体序列)）；「已开口」先落耐久记录再交出内容，判不出时不写成缺席，由那份契约的 S-15 兑现。首 token 之后停机记成被中断而不是「说到一半断了」的故障，是主线裁定（账本 S16-g），PF-013 §5.13 的措辞待产品修订 | — | — |
| G-8 | **实际执行方与指定的那一家不一致时没有成员可记**：[D-019](../../../../record/decisions/model-provider-pi-ai-fork/decision.md) 要求实际服务商显式交给模型执行 owner（[S-9](#s-9-路由留痕)） | 块 C 提供者设计 ＋ `capability.model-request-runtime` | 查清「只指定一家、禁止回退」时上游是否仍可能换家；可能就加一个成员（新版本），不可能就把它写成 S-24 的前提 |
| G-9 | **可追溯组成的其余部分不在这里**：[I-5](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) 要的「当时装的是什么」除了档案与参数，还有这一次组装出的系统提示词与上下文视图；本契约只兑现档案与参数那一半（[S-3](#s-3-消费者)） | PF-010 组装的能力 ＋ 块 C 请求契约 | 请求组成的留痕有了家，并说明怎样与本条的 `id` 关联 |
| G-10 | **OpenRouter 真实费用字段的取证**：提供者层事实，不进条款；详情只记在[验证入口的已知缺口](../verification.md#已知缺口) | 块 C 提供者设计 | 钉 SDK 版本时一并取证，结果回填到验证入口 |
| G-11 | **已闭合（2026-09-23）**：两条裁决已落为 [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md)（8b ／ Q14）；设计依据已改成链接 | — | — |
| G-12 | **已闭合（2026-09-24 整批对齐）**：主线裁定 `replyDisposition` 凡 `reply` 存在即必带（读数报回 S8-e）；被中断的那份回复被否决之后不成为消息，这次调用仍以被中断结束（[S-14](#s-14-回复与已交付部分)） | — | — |
| G-13 | **`run_cancelled` 那一支交出的回复，`ending` 只能取 `interrupted_by_user`**：`data.messages/v1#S-10` 的 `ending` 三值里被中断只有「用户叫停」一种，而运行被取消、宿主停下时交出的半截回复不是用户叫停的（[S-13](#s-13-收场与其余成员的条件关系) 的映射照旧是 `interrupted ↔ interrupted_by_user`） | 主线 → `data.messages` ＋ PF-009 §5.6 | 产品说清运行被取消时已交付的半截回复落不落成消息；落就给 `ending` 一个不冒称用户的值，不落就在本契约把那一支收成「没有回复、带 `delivered`」 |

## 八、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记。

**本版的规范工件**：本文件、[`model-response.schema.json`](model-response.schema.json)、[`examples.md`](examples.md)——**实例是规范工件，不是说明材料**。
**不建 `formal/`**：本契约没有状态转移；收场的条件关系是一张有限的判定表，由 Schema 的条件约束逐格表达、由正反实例逐格演示，
在给定规模里找反例的结构模型只会与 Schema 同义。[S-23](#s-23-同一次调用的响应体序列) 的序列性质是写响应体那一方的**行为**，
需要行为模型时归 `capability.model-request-runtime`，不在这里复制一份状态机。
接受状态、冻结记录与执行结果都在本版本目录之外维护，本文件不填进度、通过状态或哈希。
