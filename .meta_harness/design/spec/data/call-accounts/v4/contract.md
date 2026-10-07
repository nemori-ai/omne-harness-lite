# data.call-accounts v4

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.call-accounts, 4)`——
  `family = data`、`topic = call-accounts`、规范路径 `spec/data/call-accounts/v4/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：当前采用范围见 catalog；以前驱 data.call-accounts/v3 的已接受范围为输入，状态以 registry 为准。
- **当前设计依据与需求 rev**：PF-000 rev 1、PF-001 rev 25、PF-002 rev 32、PF-006 rev 23、PF-009 rev 9、PF-012 rev 21、PF-013 rev 17、PF-015 rev 20；仅消费 [source-alignment.md](source-alignment.md) 逐项列出的范围，历史接受与裁决保持其原 rev。
  **继承依据的映射**：另取 **PF-000 rev 1** 的一节（记录条目上挂什么）。产品依据到本契约的映射：PF-012 rev 11 把 I-11 收窄进了产品正文（[S-39](#s-39-晚到的账) 改引它）、PF-009 rev 8 把「已开口」记进那次调用的账（[第二节](#一份账挂在哪)写明它不在本契约的值里），其余不改本契约条款
- **所引的产品版本**：PF-013 rev 10 起凭据只在租户层与出厂格、PF-002 rev 18 起组织那一层不持有 MCP 凭据——两条到当前 rev 仍成立（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)）
- **精确语义依赖**：

  | 坐标 | 消费 clauses | 取它的什么 | Schema 里怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | [`S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围) | 时刻的规范形式 | `$ref` 它的 `$defs/Instant`：`wallClock` 的两个时刻、补账的 `at` |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [`S-5`](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)、[`S-11`](../../identity-values/v1/contract.md#s-11-scopelayeridentity)、[`S-17`](../../identity-values/v1/contract.md#s-17-身份参数没有默认值)、[`S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) | 租户身份、作用域层身份、身份参数没有默认值（`initiator` 不从「当前租户」补）、不透明标识的交换表示 | `$ref` 它的 `$defs/TenantId`、`$defs/ScopeLayerIdentity`（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)）；`ResponseId`、`RunId`、`ModelCallId` 按 S-31 散文定形、不 `$ref` |
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v2` | [`S-14`](../../content-blocks/v2/contract.md#s-14-callid) | 一次工具调用的身份 `CallId` 与它的唯一范围（一份会话日志） | `$ref` 它的 `$defs/CallId`：`ToolCallAccount.callId`、补账的工具执行目标 |
  | `omne-harness-lite-design-2026-09-15 · data.asset-model · v2` | [`S-3`](../../asset-model/v2/contract.md#s-3-能力标识与它的规范串) | 能力标识的规范串 `<category>/<name>` | 不 `$ref`：`CostItem.service` 只是非空字符串，接入点那一种按规范串写（[S-9](#s-9-costitem一次工具执行里的一笔)） |
- **本契约不依赖任何 capability 或 composition 契约，也不依赖 `data.model-response`。**正文里出现的 `data.model-response`（拥有 `ModelResponse` 的契约）、
  `capability.tool-execution-runtime`（拥有工具执行记录的契约）、`data.arrival-events`、`capability.stream-assembly`、`capability.model-request-runtime`，**都是落点**：谁兑现、谁读。
  方向是消费者 → 本契约。`ResponseId` 的**含义**以 `data.model-response/v2` S-6 为准，本契约按同一条散文自写形状，**不引用、不登依赖**——那份契约引用本契约，反向引用会成环。
  **三处以坐标指到消费者、却不登依赖**，各有理由：外部效果确定性的判据指向 `capability.tool-execution-runtime/v2#S-14`、每帧至多计一次的去重指向 `capability.stream-assembly/v2#S-14`——都是**落点**（谁判、谁兑现），本契约只定值的含义；
  「一帧」的单位取 `data.arrival-events/v2#S-23` ① ——**定义性引用**，那份契约依赖本契约，登记会让依赖图成环（[验证入口「对齐义务」](../verification.md#对齐义务)登了复核）。这两处都照 [registry「互引成环的登记口径」](../../../../registry/README.md#covers)（主线裁定，见 D-060 §七 M2）
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.call-accounts/v4#S-12`

本批ACK增量的精确产品依据为 PF-013 rev17 §6.19；前驱PF-012 rev21、PF-015 rev20及其他继承条款保留原适用范围。规范共S-1～S-43，接受依据仍只指前驱版本，不提升本候选。新旧条款与消费者逐项见 [consumer-impact.md](consumer-impact.md)。


本轮交叉修订方向见 technical-choices-r4，仍为 candidate；当前产品来源逐项核对见 [source-alignment.md](source-alignment.md)。历史接受/裁决 rev 不因本轮改写。


本版 ACK 增量依据 PF-013 rev17 §6.19、技术选择r2与性质对账。后继 data.call-accounts/v4 全部为candidate，历史接受/证据不自动覆盖ACK。未ACK保证保留；ACK合法之后的保留/读取例外见本版末节。

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 一次执行留一份账，账不进上下文；账让人看清是哪个工具在拖后腿 | [PF-006 §5.4 每一次执行都留一份账](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账) | S-10、S-11、S-21 |
| 账只记一次；「记一次账」是到达语法的一步，在收尾之前 | [PF-009 §5.5 到达的过程有它自己的语法](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) | S-19、S-23 |
| 帧是 `ToolInternalMessage` 的到达增量，走同一套语法；帧多了要节流，规则同 §6.16 | [PF-009 §5.8 执行帧就是这条消息的到达增量](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量) · [帧多了要节流](../../../../product/PF-009-context-message-types/design.md#帧多了要节流规则就是-616-那一条) | S-11、S-15 |
| 砍了要说，不许默默丢 | [PF-009 §6.16](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢) | S-15 |
| 成本两层：明细按尝试、汇总按 Run；成本重算不出来 | [PF-012 成本两层，缺哪一层都会算错](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) | S-23、S-25 |
| 成本条目至少带哪次尝试、成本项与数量、时间；**I-11**：终结之后不再发起新的成本产生动作，已发起的账迟到了照样落、归这个 Run、标明迟到 | [PF-012 §6.16](../../../../product/PF-012-agent-loop-and-run/design.md#616-日志里至少要有这几种-run-相关的条目) · [§6.17](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（I-11 自 rev 11 起如此） | S-3、S-25、S-39 |
| 首 token 之前重发，两笔都照实记；费用拿不到记未知、不是零，拿到了再补一条 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) | S-4、S-17～S-20 |
| 每一次发出只走一家，换一家就是再发一次；试过又失败的那几次是留痕 | [PF-013 §5.5 试过又失败的那几次](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) | S-19；第二节「一份账挂在哪」 |
| 用量记在凭据所在的那个范围头上 | [UL-model-credential](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) · [PF-013 §6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) | S-3（不归本契约） |
| 使用成本按租户归属、能逐条列出；本版到明细为止 | [PF-001 §6.4 隔离](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) | S-3、S-25 |
| 每条记录条目无条件带租户身份与寿命宿主 | [PF-000 §5.5](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段) | S-3、S-25 |
| 实际费用不能被目录估算冒充；取不到标 unknown | D-019 | S-8 |
| 三层的起点；用量是独立的一步、在收尾之前；「账只一次」是至多还是恰好，留给语法契约 | D-035 | S-19 |
| 所有模型请求经 OpenRouter | [SYS-LLM](../../../../foundation/cross-system-constraints/requirements.md#sys-llm) | S-8 |
| 规格形式；单机交付、语义不变地可扩展 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) | S-26～S-29 |
| **产品负责人 2026-09-23 的三句裁决**：「我们需要完整的响应体带着 input_tokens, output_tokens, cache_tokens 以及 cost_usd」；「ToolCallAccount 这个确实有用，因为工具内部很可能调用其他的服务从而产生费用」；缓存 token「拆两项」 | D-058 8b、8c、Q13 | S-6、S-7、S-8、S-9、S-11 |
| 主线裁定：I-11 收窄与 `late`（S2-d，产品正文已跟上）；工具执行的账加外部效果的确定性、实际停止时刻与 `late`（S13-f）；`CostItem.service` 对接入点取能力标识规范串（S2-e）；帧砍汇总的「每帧至多计一次」是做砍一方的前提（S4-b）；三个归属标识的家在本契约（S8-c） | D-060 §一的 S2、S13、S4、S8 各节 | S-9、S-11、S-14、S-15、S-37、S-39 |
| 主线裁定（S25 第一轮修复波）：外部效果的判据只在 `capability.tool-execution-runtime` S-14、本契约只定两值含义（K1）；工具执行的判重键与补账目标身份 = 会话日志归属 ＋ `callId`（K5）；`ModelResponse.late` 与晚到的账同一口径（K14）；在途状态丢了时 `frames` 写 `"unknown"`（K50） | D-060 §五 | S-11、S-15、S-17、S-22、S-23、S-25、S-39 |
| 两种归属分记：用量记在凭据所在的那一格、成本按租户归属；凭据只在租户层与出厂格，所以两者只在走出厂格那一把时分叉 | [UL-model-credential](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential) · [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) · [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上)——**规格层推导**：两条产品行合起来，账上缺一项就会把其中一种归属算错；主线已接受，见 D-060 §六 N-5「C-12 两种成本归属」 | S-38 |
| 正式名 | [UL-call-account](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account) · [UL-upstream-send](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send) · [UL-model-call](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call) · [UL-tool-execution](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution) · [UL-execution-frame](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) · [UL-incremental-arrival](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival) · [UL-run-attempt](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt) | 全部 |

> **没有产品行的条款**：[S-16](#s-16-responseid)（标识的表示）、[S-27](#s-27-表示层拒绝值闭合)～[S-29](#s-29-判别式与枚举闭合)（表示与校验）
> 由 SYS-SPEC 那一行供给；[S-26](#s-26-装配给的保证-vs-协议须给的保证) 由 SYS-DEPLOY 那一行供给。
> [S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse)、[S-22](#s-22-有效费用)、[S-24](#s-24-汇总不重复计) 的「每笔钱只有一个权威位置」是**规格层的推导**：
> 依据是「账只记一次」与「拿到了再补一条」两行合起来——同一笔钱在两处各有一份权威，补账只会落到其中一处。

## 一、目的与消费者

### S-1 本契约拥有什么

**一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)或一次[工具执行](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的账**——
[调用账目](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account)这项属性里「花了什么、产出多少」的那一部分：
用量、费用、一次执行里的逐笔费用、砍掉了多少增量、执行跑了多久，以及**事后补账**；
外加三条从这些值推出来的规则：派生量（[S-7](#s-7-派生量cache_tokens-与-total_tokens)）、有效费用（[S-22](#s-22-有效费用)）、汇总（[S-23](#s-23-汇总已知之和与未知笔数)～[S-25](#s-25-按尝试记明细按-run-汇总)）。

它是**共用值**：写它的有两方（模型调用一侧、工具执行一侧），读它的有到达语法、按 Run 汇总的读面与成本明细。
**写两遍必然分叉**——尤其是「未知算不算零」这一条，一处算错，整本账就错——所以它先定，其余引用它。

它是一份**数据契约**：**没有操作、没有状态转移、没有提交点，因此不需要插件。**
有状态的是**承载它的记录**（`ModelResponse`、工具执行记录、补账），它们的写入归各自的契约；
本契约只定这些值是什么、怎样才合法、怎样从它们求出一个数。

### S-2 消费者

| 消费者 | 消费什么 |
|---|---|
| [`data.model-response`](../../model-response/README.md) v1（拥有 `ModelResponse`）与写它的 [`capability.model-request-runtime`](../../../capabilities/model-request-runtime/README.md) v1 | `Usage`、`Cost` 作为一次发出的账；`TrimSummary`（模型侧的砍）；[S-19](#s-19-每条到达流恰一份账两次发出两份)、[S-20](#s-20-缺账或被拒收记未知不伪造) 的「一流一账、缺账记未知」；[S-37](#s-37-三个归属标识的家runidattemptidmodelcallid) 的三个标识；[S-39](#s-39-晚到的账) 的 `late` |
| [`capability.tool-execution-runtime`](../../../capabilities/tool-execution-runtime/README.md) v1（拥有工具执行记录） | `ToolCallAccount`、`CostItem`、`TrimSummary`；[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse) 的镜像规则、[S-12](#s-12-总额未知不当零加) 的总额、[S-13](#s-13-经本系统调模型的用量汇总) 的用量汇总、[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)、[S-39](#s-39-晚到的账) |
| [`data.arrival-events`](../../arrival-events/README.md) v1 | 「记一次账」那一步的载荷：`Usage`、`Cost`；[S-37](#s-37-三个归属标识的家runidattemptidmodelcallid) 的 `ModelCallId`。**`TrimReason` 的四个值照抄本契约，不另列一份** |
| [`capability.stream-assembly`](../../../capabilities/stream-assembly/README.md) v1 | [S-19](#s-19-每条到达流恰一份账两次发出两份)～[S-21](#s-21-账进日志不进给模型看的上下文) 的证据义务：一条流一份账、缺账记未知、账不进上下文；[S-15](#s-15-trimreason-与-trimsummary砍了要说) 的汇总 |
| [`data.messages`](../../messages/README.md) v1、[`data.loop-extension`](../../loop-extension/README.md) v1 | [S-37](#s-37-三个归属标识的家runidattemptidmodelcallid) 的三个标识；拓展件输入里的 `Usage`、`Cost` |
| **按 Run 汇总成本的派生读面**（PF-012 那一侧，尚无契约） | [S-22](#s-22-有效费用)～[S-25](#s-25-按尝试记明细按-run-汇总) 的求值规则；**失败值的名字归它自己** |
| **成本明细**（PF-001 §6.4 那一侧，尚无契约） | 每一份账就是一条可逐条列出的明细；归属身份从承载它的条目取（[S-3](#s-3-本契约明确不拥有什么)） |

### S-3 本契约明确不拥有什么

- **不拥有承载它的记录。**`ModelResponse` 的其余部分（路由留痕、收场、时序、回复）归模型调用一侧；
  工具执行记录的其余部分（收场、落在哪、前后台、等待）归工具执行一侧。**本契约的值是它们的成员，不是它们。**
- **不带会话、运行、尝试。**[每条记录条目都无条件带租户身份与寿命宿主](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)，
  [成本条目要带哪次尝试](../../../../product/PF-012-agent-loop-and-run/design.md#616-日志里至少要有这几种-run-相关的条目)——
  **这些挂在承载它的条目上**，汇总据条目分组（[S-25](#s-25-按尝试记明细按-run-汇总)）。
  **唯一的例外是两项归属**（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)）：成本归谁（发起者）、用量归谁（凭据所在那一格）——两者可以不同（唯一分叉点是出厂格那一把），账上分记。
- **不拥有「用哪把凭据」的判定。**一次发出走的是哪一格的[模型凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)，
  由模型调用一侧判定、记在它的路由留痕上（`data.model-response` 的 `route.credentialScope`）；本契约只定「用量归那一格」这条含义（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)）。
- **不拥有计量口径、预算、额度与超限拦截。**[本版到明细为止](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)：
  账是明细，不是账单；**不定义按什么计价、何时结算、怎么出账单**。
- **不拥有价目表与估算。**按目录费率算出来的数**不是本契约的任何一个值**（[S-8](#s-8-cost一次发出的费用)）。
- **不拥有「怎么砍」。**什么时候合并、长度上限多少、额度多少、什么帧被拒收，归到达语法与装配的契约；
  本契约只拥有**砍了之后怎么记**（[S-15](#s-15-trimreason-与-trimsummary砍了要说)）。
- **不拥有「什么时候写账、写进哪条条目、由谁写」**——归承载它的记录的契约。
- **不做币种换算。**只有美元（[S-5](#s-5-金额美元十进制不截断)）。

## 二、含义与使用范围

**适用范围**：**一个部署之内。**本版单机交付，但每一条的领域语义在跨进程之后原样成立；
哪些结论由装配给、哪些须由协议重新兑现，见[第六节](#六装配给与协议给)。

### 一份账挂在哪

[调用账目](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-call-account--调用账目--call-account)的词条说它是
「一次模型调用或一次工具执行身上的一项属性」。落到值上是两种形状：

| 挂在 | 用本契约的什么 | 一份对应什么 |
|---|---|---|
| 一次模型调用 | `Usage` ＋ `Cost`，由 `ModelResponse` 携带；`ResponseId` 指认那份响应 | **[一次发出](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)**：[每一次发出只走一家，换一家就是再发一次](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)——一次发出一条流、一份账。**一次模型调用发出几次，就有几份** |
| 一次工具执行 | `ToolCallAccount`，由工具执行记录携带；`callId` 指认那次执行 | 一次工具执行一份 |

> **一次发出**的定义与「一次模型调用 ↔ 若干次发出」的关系归[那条词条](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send)；本契约只拿它说明「一份账对应什么」。
>
> **「已经开口」不在本契约的值里。**[PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) 把「已经开口」记进那次模型调用的账目、带开口时刻；
> 它落成模型请求运行时写的一条日志记录（`data.messages` v2 的「已开口」），**不是** `Usage`／`Cost` 的成员——本契约拥有的是账目里可以被加总、被补、被砍的那一部分。

### 三种「没有数」，互不替代

| 写法 | 意思 |
|---|---|
| `0` | 数过了，就是零 |
| `"unknown"` | 这一项存在，但数不出来（[S-4](#s-4-未知是一个值不是零也不是缺席)） |
| 成员缺席 | **只对写明「可缺席」的成员合法**，含义逐个写在各条（如 `reasoning_tokens` 缺席 = 上游没报） |

### 命名的一个例外

**本族成员沿用上游用量报文的命名**：`input_tokens`、`output_tokens`、`cache_read_tokens`、`cache_write_tokens`、
`reasoning_tokens`、`cost_usd`、`upstream_inference_cost_usd`、`total_usd` 用 snake_case，与产品负责人的原话一致；
**其余成员一律 camelCase**，与 `data.identity-values`、`data.offer-expiry` 相同。

### 与相近概念的差异

- **账 ≠ [工具产出](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-output--工具产出--tool-output)。**产出是给读者的东西，账是关于这一次的事实。
- **账 ≠ 账单。**账单是聚合与计价，本版没有（[S-3](#s-3-本契约明确不拥有什么)）。
- **`Cost` ≠ 价目表估算**（[S-8](#s-8-cost一次发出的费用)）。
- **`TrimSummary` ≠ 到达语法里「砍了一次」的那一步。**那一步是 `data.arrival-events` 的事件，逐次说；
  `TrimSummary` 是一条流收尾时的汇总。**本契约只拥有后者。**
- **「账」在词条里还包括「落在哪」**；那一项由工具执行记录携带，**不在本契约的值里**。本契约拥有的是词条所指里可以被加总、被补、被砍的那一部分。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `Unknown` | 字面量 `"unknown"`：这一项存在但数不出来 | [S-4](#s-4-未知是一个值不是零也不是缺席) |
| `Usage` | 一次发出的 token 用量 | [S-6](#s-6-usage四项-token-与来源)、[S-7](#s-7-派生量cache_tokens-与-total_tokens) |
| `Cost` | 一次发出的费用 | [S-8](#s-8-cost一次发出的费用) |
| `CostItem` | 一次工具执行里的一笔费用 | [S-9](#s-9-costitem一次工具执行里的一笔)、[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse) |
| `ToolCallAccount` | 一次工具执行的账 | [S-11](#s-11-toolcallaccount一次工具执行的账)～[S-14](#s-14-wallclock) |
| `FrameAccount` | 一次工具执行发了几帧、砍了多少；数不出来时整份写 `"unknown"` | [S-11](#s-11-toolcallaccount一次工具执行的账)、[S-15](#s-15-trimreason-与-trimsummary砍了要说) |
| `TrimReason` | 一个增量为什么没有原样送达，四值闭合 | [S-15](#s-15-trimreason-与-trimsummary砍了要说) |
| `TrimSummary` | 一条消息的增量到达过程里，合并与截掉的汇总 | [S-15](#s-15-trimreason-与-trimsummary砍了要说) |
| `ResponseId` | 一份 `ModelResponse` 的标识 | [S-16](#s-16-responseid) |
| `CostCorrection` | 事后补账 | [S-17](#s-17-costcorrection事后补账)、[S-18](#s-18-原账不改) |
| `RunId`、`AttemptId`、`ModelCallId` | 运行、尝试序号、模型调用的标识 | [S-37](#s-37-三个归属标识的家runidattemptidmodelcallid) |
| `initiator`、`credentialScope`（成员） | 成本归谁、用量归谁 | [S-38](#s-38-两种归属用量归凭据那一格成本归发起者) |
| `late`（成员） | 晚到的账 | [S-39](#s-39-晚到的账) |

### S-4 未知是一个值，不是零，也不是缺席

`"unknown"` 表示**这一项存在、但数不出来**——[费用拿不到时明细里记「未知」，不是零](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)，
本契约把这条推广到每一个数。它与 `0`、与成员缺席**在 Schema 与条款里都可区分**，三者互不替代：

- **不得把 `"unknown"` 当 `0`**——加总、比较、呈现都不行（[S-12](#s-12-总额未知不当零加)、[S-23](#s-23-汇总已知之和与未知笔数)）；
- **不得把 `"unknown"` 丢掉或跳过**——它要被计数（[S-23](#s-23-汇总已知之和与未知笔数)）；
- **不得用估算、上一次的数、同类调用的均值替掉它**（[S-8](#s-8-cost一次发出的费用)）；
- **必填成员不得以缺席表达「不知道」**——缺席是非法值（[S-27](#s-27-表示层拒绝值闭合) 的 `malformed`），「不知道」只有 `"unknown"` 一种写法。

**`"unknown"` 是一个值，不是一次失败**：数不出来的是那一项，不是这份账——**账照常成立、照常被计入**，
汇总把它单独计数（[S-23](#s-23-汇总已知之和与未知笔数)）。

**可缺席的成员恰是下面这几个，各有写明的含义**，**缺席都不等于零**，消费者不得补成零：

| 成员 | 缺席的意思 |
|---|---|
| `Usage.reasoning_tokens` | 上游没报 |
| `Cost.upstream_inference_cost_usd` | 上游没报 |
| `CostItem.quantity`、`CostItem.reference` | 报账方没给（`model_call` 那一笔的 `reference` 例外，必填，[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse)） |
| `ToolCallAccount.usage` | 这次执行没有经本系统调模型（[S-13](#s-13-经本系统调模型的用量汇总)） |
| `ToolCallAccount.wallClock.endedAt` | 写账时没有可记的结束时刻（[S-14](#s-14-wallclock)） |
| `ToolCallAccount.credentialScope` | 这次执行的自有费用没经任何一格上的凭据产生（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)） |
| `ToolCallAccount.stoppedAt` | 写账之前没有观察到执行者停下（[S-14](#s-14-wallclock)） |
| `ToolCallAccount.late`、`CostCorrection.late` | **落下时它归属的尝试仍是当前的、运行尚未终结**（[S-39](#s-39-晚到的账)）——这是一个确定的意思，不是「没说」 |

### S-5 金额：美元、十进制、不截断

本契约的一切金额（`cost_usd`、`upstream_inference_cost_usd`、`total_usd`、补账的 `cost_usd`）：

- **币种固定为美元，单位为一美元**；没有币种成员，也没有第二种币种；
- **取值是交换表示里那个 JSON 数字字面量所表示的精确十进制数**，不是它在某种二进制浮点里的近似；
- **精度不截断**：不设小数位上限；任何一跳都不得舍入、截断或改写成更少的有效数字——上游给了几位就是几位；
- **加总是精确的十进制加法**（[S-12](#s-12-总额未知不当零加)、[S-23](#s-23-汇总已知之和与未知笔数)）：`0.1` 与 `0.2` 之和是 `0.3`。

金额 `≥ 0`，负数是非法值（[S-27](#s-27-表示层拒绝值闭合) 的 `negative_amount`）：**金额只有「花掉的」这一个方向**，补账可以把数改小，但不能是负数。

> 「一个 JSON 数字按二进制浮点解析会丢位」是**实现要解决的事**，不是本条放宽的理由：
> 解析与序列化这些成员必须保住精确十进制，见 [G-9](#十已知缺口)。

### S-6 `Usage`：四项 token 与来源

`Usage` 是**一次发出**的 token 用量。四项**必填**，各为 `整数 ≥ 0` 或 `"unknown"`：

| 成员 | 含义 |
|---|---|
| `input_tokens` | 这次请求的输入里，**既不是从缓存读出、也不是写入缓存**的那部分 |
| `cache_read_tokens` | 输入里**命中缓存、从缓存读出**的那部分 |
| `cache_write_tokens` | 输入里**写入缓存**的那部分 |
| `output_tokens` | 输出，**含推理**（若有） |

**三项输入两两不相交，合起来是这次请求的全部输入。**这是 [S-7](#s-7-派生量cache_tokens-与-total_tokens) 两个派生量成立的前提。
各家上游怎么报、怎么换算到这三项，归模型调用一侧的传输适配——例如一家上游把缓存读出的部分算进它报的输入总数，
适配时就要减出来；**本契约只定换算的结果必须满足这条不相交**，映射本身的核对是 [G-6](#十已知缺口) 的一项。

另有两个成员：

- **`reasoning_tokens`**（可缺席，`整数 ≥ 0`）：`output_tokens` 里属于推理的那部分，**是它的子集**——
  两者都是数时 `reasoning_tokens ≤ output_tokens`。**上游报了才有**；缺席 = 上游没报，**不是零**。
  它没有 `"unknown"` 这个取值：没报就不出现。
- **`source`**（必填）：这组数从哪来，闭合两值——

| `source` | 含义 | 约束 |
|---|---|---|
| `upstream` | 上游随这次发出报回了用量 | 四项里**至少一项是数**；报了哪项记哪项，没报的那项记 `"unknown"` |
| `none` | 上游没有报回用量（失败、被中断、断流、没给） | 四项**全部**是 `"unknown"`，且**没有** `reasoning_tokens` |

违反这两行约束的，是 [S-27](#s-27-表示层拒绝值闭合) 的 `unknown_with_source`。

> **为什么 `upstream` 不许四项全未知**：那样的值与 `none` 无从区分，却声称「上游报过」——它把一次没拿到用量说成了拿到了。

### S-7 派生量：`cache_tokens` 与 `total_tokens`

```text
cache_tokens ≝ cache_read_tokens + cache_write_tokens
total_tokens ≝ input_tokens + cache_read_tokens + cache_write_tokens + output_tokens
```

**任一加数为 `"unknown"`，和就是 `"unknown"`。**`reasoning_tokens` 不另加——它已在 `output_tokens` 里。

**两者只在条款里定义，不是成员**：Schema 里没有它们，交换与存储表示里**不得**出现它们。
存下来就多了一份可以与四项对不上的数，而对不上时没人说得清该信哪个。

> 产品负责人要的是 `cache_tokens`，裁的是**拆两项存、总数派生**（设计依据倒数第二行）：
> 读缓存与写缓存计价不同，合成一个数就回推不出钱。

### S-8 `Cost`：一次发出的费用

| 成员 | 含义 |
|---|---|
| `cost_usd`（必填） | 这一次发出**上游报回的实际费用**——本系统所有模型请求[经 OpenRouter](../../../../foundation/cross-system-constraints/requirements.md#sys-llm)，即它随这次响应报回的那个费用——美元（[S-5](#s-5-金额美元十进制不截断)），或 `"unknown"` |
| `upstream_inference_cost_usd`（可缺席） | 上游另报的「**上游供应商那一侧的推理实收**」：上游用它账户里登记的供应商自有密钥出门时（上游报文里的 `is_byok` 情形）才有意义。**上游报了才有**，缺席 ≠ 零 |
| `source`（必填） | 闭合三值，见下 |

| `source` | 含义 | 约束 |
|---|---|---|
| `upstream_usage` | `cost_usd` 取自上游随这次发出报回的费用 | `cost_usd` 是数 |
| `later_correction` | `cost_usd` 取自一条补账 | `cost_usd` 是数；**只出现在有效费用里**（[S-22](#s-22-有效费用)），**原账里不会有**（[S-18](#s-18-原账不改)） |
| `none` | 这次发出的费用拿不到 | `cost_usd` 是 `"unknown"`，且**没有** `upstream_inference_cost_usd` |

违反约束的，是 [S-27](#s-27-表示层拒绝值闭合) 的 `unknown_with_source`。

**`cost_usd` 绝不是估算。**按目录费率算出来的数不能冒充实际费用，取不到就标 unknown：
拿不到就是 `"unknown"`，**不得**拿价目表、上一次同类调用或任何非上游报回的数填进来；
估算若要保留，**另存，不进本契约的任何一个值**。

> **`upstream_inference_cost_usd` 与 `cost_usd` 之间本契约不定任何关系**：两者说的是两个不同收款方的数；
> `is_byok` 情形下 `cost_usd` 的确切含义**尚未核实**（[G-6](#十已知缺口)）。本契约照上游报回的原样记，**不推断、不互相推算**。

### S-9 `CostItem`：一次工具执行里的一笔

[工具内部很可能调用其他的服务从而产生费用](#设计依据)，**一次执行可以有多笔**。每一笔：

| 成员 | 含义 |
|---|---|
| `service`（必填，非空字符串） | **谁收的这笔钱**，三种来路之一：工具声明的某个依赖的名字（外部服务、附件存储）；某个 MCP 接入点——写成它的**能力标识规范串**（`data.asset-model` v2 [S-3](../../asset-model/v2/contract.md#s-3-能力标识与它的规范串) 的 `<category>/<name>`，例如 `mcp/github`；取规范串是主线裁定，见 D-060 §一 S2-e，串的写法以 asset-model S-3 为准）；或字面量 `model_call`——**这次执行经本系统发出的一次模型调用**（[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse)）。**`model_call` 是保留值**，不得作任何依赖或接入点的名字；规范串恒含 `/`，永不等于它 |
| `cost_usd`（必填） | 这笔的金额（[S-5](#s-5-金额美元十进制不截断)），或 `"unknown"` |
| `quantity`（可缺席） | `{ amount: 数 ≥ 0, unit: 非空字符串 }`：报账方自报的计量——调用次数、字节、秒……**本契约不解释 `unit`、不换算、不跨笔相加**，它只供对账与诊断 |
| `reference`（可缺席；`model_call` 那一笔必填） | 对方的账单号或请求号，事后对账用；不透明，**本契约不解析** |
| `source`（必填） | **`cost_usd` 这个数从哪来**，闭合四值，见下 |

| `source` | 含义 | 约束 |
|---|---|---|
| `tool_reported` | 工具作者报的 | `cost_usd` 是数 |
| `service_reported` | 运行时从它管得着的那个服务收来的 | `cost_usd` 是数 |
| `model_response` | 取自一份 `ModelResponse` 的 `Cost` | `cost_usd` 是数；**`service` 必为 `model_call`** |
| `none` | 这笔的金额拿不到 | `cost_usd` 是 `"unknown"` |

**`source` 说的是这个数的来路，不是这笔是谁报的**：工具报了一笔「用了一次搜索，价钱不知道」，
那一笔是 `source: none`，`quantity` 照记。「数 ↔ 来源」对不上的，是 `unknown_with_source`；
`model_response` 配了别的 `service`，或 `model_call` 配了 `tool_reported`／`service_reported`，是 `malformed`（[S-27](#s-27-表示层拒绝值闭合)）。

**不经本系统发出的模型调用**——工具自己去调某个外部模型服务——**是一个外部服务**，按它的依赖名记，不是 `model_call`。

> **接入点那一种已定**（规范串）；**依赖名与另两种不相交还没有保证**——一个依赖名恰好写成 `mcp/github` 或恰好叫 `model_call`，
> 要等 `data.tool-definition` 给依赖名定字符集（它的 G-1），见 [G-4](#十已知缺口)。

### S-10 `model_call` 那一笔是镜像，权威在那份 `ModelResponse`

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

一次工具执行**经本系统**发出的每一次模型调用，都各自留下自己的 `ModelResponse`，带着它自己的 `Usage` 与 `Cost`——
**各次调用各有自己的账**。工具执行的账里为它记的那一笔 `model_call`，**是那份账的镜像，不是第二份权威**：

- **一份 `ModelResponse` 在这次执行的账里恰有一笔 `model_call`**，它的 `reference` 是那份响应的 `ResponseId`（[S-16](#s-16-responseid)）；
  同一个 `ResponseId` 在一份账的 `items` 里出现两次，是 `malformed`；
- 它的 `cost_usd` 是**写账那一刻**那份响应的 `Cost.cost_usd`：是数就记那个数、`source: model_response`；
  是 `"unknown"` 就记 `"unknown"`、`source: none`；
- **那份响应此后被补账**（[S-17](#s-17-costcorrection事后补账)），镜像**不跟着改**——原账不改（[S-18](#s-18-原账不改)）。
  现时的数以那份响应的有效费用为准（[S-22](#s-22-有效费用)），镜像经 `reference` 找得到它；
- **汇总不计镜像**（[S-24](#s-24-汇总不重复计)）。

**为什么要镜像**：「这次执行连同它替自己调的模型一共花了多少」，是
[看清楚是哪个工具在拖后腿](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)要的那个数。
**为什么它不能是权威**：同一笔钱在两处各有一份权威，补账只会落到其中一处，汇总就会在两个数之间摇摆。

### S-11 `ToolCallAccount`：一次工具执行的账

| 成员 | 含义 |
|---|---|
| `callId`（必填） | 这次执行的 `CallId`（`data.content-blocks` v2 的 `$defs/CallId`，[`#S-14`](../../content-blocks/v2/contract.md#s-14-callid)） |
| `initiator`（必填） | 发起这次执行所属运行的租户身份——**成本归它**（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)） |
| `credentialScope`（可缺席） | 这次执行的自有费用经哪一格上的凭据产生——**用量归它**；没经范围上的凭据就缺席（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)） |
| `externalEffect`（必填） | 两个取值的含义：`confirmed`——收场时它在外面的动作已经了结（或根本没开始）；`unknown`——**它在外面还可能做了事、花了钱，账上的费用可能不全**（此后到的费用走补账，[S-17](#s-17-costcorrection事后补账)）。**哪一次执行取哪一个值，判据只有一处**：[`capability.tool-execution-runtime/v2#S-14`](../../../capabilities/tool-execution-runtime/v2/contract.md#s-14-停止与外部效果分开说) 的外部效果确定性（它把三值投到这两个值上）；本契约不另列判据（主线裁定，见 D-060 §五 K1） |
| `cost`（必填） | `{ total_usd, items }`：`items` 是这次执行的逐笔费用（`CostItem` 的数组，可为空）；`total_usd` 是总额（[S-12](#s-12-总额未知不当零加)） |
| `usage`（可缺席） | 这次执行经本系统调模型的用量汇总（[S-13](#s-13-经本系统调模型的用量汇总)） |
| `frames`（必填） | `FrameAccount` 或 `"unknown"`。`FrameAccount` 是 `{ emitted: 整数 ≥ 0, trims: TrimSummary }`：这次执行[发帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-frame-emission--发帧--frame-emission)发了几帧，以及砍了多少（[S-15](#s-15-trimreason-与-trimsummary砍了要说)）；`"unknown"`：数这两样的那份[在途状态](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)丢了（例如停机，恢复时追补这份账），发了几帧、砍了多少数不出来——**不写 0**（主线裁定，见 D-060 §五 K50） |
| `wallClock`（必填） | `{ startedAt, endedAt? }`：这次执行的起止时刻（[S-14](#s-14-wallclock)） |
| `stoppedAt`（可缺席） | 写账之前**已观察到**执行者停下的时刻（[S-14](#s-14-wallclock)） |
| `late`（可缺席，只取 `true`） | 这份账落下时它归属的尝试已被取代或运行已经终结（[S-39](#s-39-晚到的账)） |

**一次工具执行恰一份**，由工具执行记录携带；[它不进 agent 的上下文](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)（[S-21](#s-21-账进日志不进给模型看的上下文)）。

**`items` 的两条来路合在同一个数组里**：工具作者报的（`tool_reported`），与运行时从它管得着的服务收来的（`service_reported`、`model_response`）。
**报账怎么报、报错了怎么收场，归工具执行一侧的契约**；本契约只要求：**被拒的那一笔不得按零记入，也不得被修补之后记入**（[S-20](#s-20-缺账或被拒收记未知不伪造)）。

**`frames.emitted` 数的是工具自己交出的帧**——[执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)
[就是它那条 `ToolInternalMessage` 的到达增量](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)；
「一帧」的单位是 [`data.arrival-events/v2#S-23`](../../arrival-events/v2/contract.md#s-23-执行帧的另外四条) 第 1 条：工具经发帧交出的一个开块、填或封口（那份契约定义单位，本契约只数；定义性引用，不登依赖，理由见抬头）。
**一帧都没发是正常形态**：`frames.emitted = 0`，`trims` 各项为零。**`"unknown"` 不是「没发帧」**：它说的是发没发、发了几帧，这份账已经答不出来。

**`frames` 写 `"unknown"` 只有一种情形**：持有帧计数的那份在途状态随它的持有者失去连续性而没了（停机之后恢复时才追补这份账）。
计数的一方还在、却丢了计数，是它违约，不是 `"unknown"`（[S-15](#s-15-trimreason-与-trimsummary砍了要说)）。**哪一次写 `"unknown"` 由写这份账的一方判**（`capability.tool-execution-runtime`）。

### S-12 总额：未知不当零加

```text
total_usd ≝ Σ items[i].cost_usd      （全部是数时；精确十进制加法，S-5）
total_usd  = "unknown"               （任一 items[i].cost_usd 为 "unknown" 时）
```

- **有一笔未知，总额就是未知。**一个数字总额配一笔未知的，是 [S-27](#s-27-表示层拒绝值闭合) 的 `total_not_unknown`——
  **把未知当零加，正是这个值要挡的事。**
- 全部是数时，`total_usd` 必须**恰等于**各笔之和；不等——含全部是数却写了 `"unknown"`——是 `malformed`。
- **`items` 为空时总额是 `0`**，含义是「**这次执行没有记下任何一笔费用**」，**不是**「这次执行没有产生费用」的承诺：
  一个调了外部服务却不报账的工具，账上就是空的。这条界线由谁补、补成什么，见 [G-5](#十已知缺口)。

`total_usd` **含镜像**（[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse)）：它回答「这次执行连同它替自己调的模型一共花了多少」。
**汇总不用它**，用的是[自有部分](#s-22-有效费用)（[S-24](#s-24-汇总不重复计)）。

### S-13 经本系统调模型的用量汇总

`usage` **出现当且仅当** `items` 里至少有一笔 `model_call`。出现时，它是那几笔所指的各份 `ModelResponse` 的 `Usage` 的**逐项汇总**：

- 四项各自相加；**任一份在该项上是 `"unknown"`，汇总的该项就是 `"unknown"`**；
- `reasoning_tokens` **只在每一份都有时**才出现，取其和；有一份没报，汇总里就不出现——**不按零补**；
- `source`：四项全为 `"unknown"` 时是 `none`，否则是 `upstream`（与 [S-6](#s-6-usage四项-token-与来源) 的约束一致）。

它与镜像同理**不是权威**：各次调用各有自己的账，这里只是汇总，**不进任何 token 汇总**（[S-24](#s-24-汇总不重复计)）。
**没有经本系统调模型时它缺席——缺席不是零用量，是没有这回事。**`usage` 与 `model_call` 那几笔一出一缺的，是 `malformed`。

### S-14 `wallClock`

- **`startedAt`**（必填）：这次执行开始的时刻；**`endedAt`**（可缺席）：它结束的时刻。
  二者都是 `data.offer-expiry` v1 的 `Instant`（[`data.offer-expiry/v1#S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围)：带时区偏移的 RFC 3339 时间点，按时间点语义比较，不按字典序）。
- **`endedAt` 缺席 ⇔ 写账的一方没有可记的结束时刻**——这次执行在写账时还没结束，或者它的运行时失去了连续性、
  结束的那一刻没被观察到。**缺席不得被补成写账时刻、`startedAt` 或任何别的时刻**；「跑了多久」只在两者都在时才求得出。
- 两者都在时 **`endedAt ≥ startedAt`**，否则是 `malformed`；两者**取自同一个时间源**（[S-26](#s-26-装配给的保证-vs-协议须给的保证)）。

- **`stoppedAt`**（可缺席）：写账**之前**已观察到执行者停下的那一刻——例如停机恢复时先回收执行者、再追补收场。
  **写账时还没观察到就缺席**：工具执行一侧「收场先落、停止后发」，被中断的那一次写账时执行者还没停下，它此后的实际停止记在执行记录上，**账不改**（[S-18](#s-18-原账不改)）。
  出现时 `stoppedAt ≥ startedAt`，否则是 `malformed`。

**何时写这份账，归工具执行一侧的契约**；本契约只定一份账里这几个时刻的含义，以及「一次执行恰一份」（[S-11](#s-11-toolcallaccount一次工具执行的账)）。

### S-15 `TrimReason` 与 `TrimSummary`：砍了要说

[节流可以合并相邻的增量，但不许默默丢弃；砍了多少、为什么砍，都要能看出来](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢)——
[对模型的回复与对工具的帧是同一条](../../../../product/PF-009-context-message-types/design.md#帧多了要节流规则就是-616-那一条)。
`TrimSummary` 是**一条消息的[增量到达](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival)过程**收尾时对这件事的汇总。

**`TrimReason` 闭合四值**——一个增量为什么没有原样送达：

| 值 | 这个增量怎么了 | 计入 |
|---|---|---|
| `rate_merged` | 因速率节流，与相邻的增量**合并**成一个送达。追加片段的块，内容一个字不丢，只是条数少了；整体替换的块只留最新那一次——被取代的那几次本来就不会留在封口的块里 | `merged` |
| `frame_too_long` | 单个增量超过长度上限，**被截短**后送达 | `omittedBytes`（截掉的那部分） |
| `quota_exhausted` | 这条消息可送达的额度已用完，**此后的增量整个没有送达** | `cut`、`omittedBytes` |
| `rejected` | 增量**被拒收**、整个没有送达：它不合到达语法，或不合运行时对帧的规则 | `cut`、`omittedBytes` |

**长度上限多少、额度多少、哪些规则会拒收，不归本契约**（[S-3](#s-3-本契约明确不拥有什么)）：它们是到达语法与装配那一侧的具名参数与条款。

**`TrimSummary` 的成员**（全部必填，全部 `整数 ≥ 0`）：

| 成员 | 含义 |
|---|---|
| `merged` | 因合并而**不再单独送达**的增量个数：`n` 个合成一个，记 `n − 1` |
| `cut` | **整个没有送达**的增量个数 |
| `omittedBytes` | 被截掉或整个没送达的增量载荷的字节数——文本按 UTF-8 计，二进制按原字节计。**合并不计**：追加片段合并不丢内容，整体替换被取代的那几次本来就不留 |
| `byReason` | 四个 `TrimReason` **各一项，四项都必须出现**；值是受该原因影响的增量个数 |

**它们之间必须对得上**（Schema 管不到，违反是 `malformed`）：

```text
byReason.rate_merged                         = merged
byReason.quota_exhausted + byReason.rejected = cut
cut = 0 ∧ byReason.frame_too_long = 0        ⇒ omittedBytes = 0
```

在 `ToolCallAccount` 的 `frames` 是 `FrameAccount` 时另有一式：`merged + cut + byReason.frame_too_long ≤ frames.emitted`——砍的不会比发的多；`frames` 是 `"unknown"` 时没有这一式可核。
**它成立的前提是做砍的那一方对每一帧至多计一次「未原样送达」**：同一帧先被截短、后又被拒收，只按拒收计一次（主线裁定，见 D-060 §一 S4-b）；
这条去重规则由做砍的一方承诺（[`capability.stream-assembly/v2#S-14`](../../../capabilities/stream-assembly/v2/contract.md#s-14-砍的汇总)），不是本契约替它去重。

**`TrimSummary` 由做合并与截断的那一方计数**，不来自生产者自报：砍的那一方必然知道自己砍了什么，所以 **`TrimSummary` 没有「拿不到」这一支**，也没有 `"unknown"`。
那一方活着却丢了计数，是它违约，不是一份未知的账；**它连同在途状态一起没了**，整份 `frames` 写 `"unknown"`（[S-11](#s-11-toolcallaccount一次工具执行的账)），不是一份各项未知的 `TrimSummary`。

> **`byReason` 为什么四项都得在**：缺一项，读的人分不出「这个原因一次都没发生」与「这一项没记」——
> 那正是把缺席当成零。**写 `0` 才是零。**

### S-16 `ResponseId`

`ResponseId` 指认**一份 `ModelResponse`**——按模型调用一侧的形状，一次发出一份（[第二节那张表](#一份账挂在哪)）。
**它的家在 `data.model-response`**（那份契约的 S-6，含义以那里为准）；本契约只按同一条散文写出形状供 `CostItem.reference` 与补账目标使用，
**不 `$ref` 那一份、不登依赖**——那份契约引用本契约的 `Usage`、`Cost`，反向引用会成环（主线裁定，见 D-060 §一 S8-c）。

- **不透明。**交换表示按 [`data.identity-values/v1#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文：
  非空字符串；首字符与末字符都不属于该条逐个列出的那个空白码点集合；相等是逐码点精确相等，不做任何规范化；
  **消费者不解析它**，不从中读出时间、次序或归属。Schema 按那条散文写出形状，**不另立一套空白定义**。
- **部署内唯一，不回收、不复用。**补账靠它找目标（[S-17](#s-17-costcorrection事后补账)）；一个被复用的 `ResponseId` 会让一条补账落到另一次发出头上。
- **由模型请求运行时在那一次发出出门时定下**，此后这次发出的任何结算都用它；具体词法（长度、字符集）归实现。
- **它不是上游的请求号。**上游回的请求号（事后向上游查账用）是 `ModelResponse` 的另一个成员，归模型调用一侧，本契约不定义它。

### S-17 `CostCorrection`：事后补账

[费用拿不到时记未知，拿到了再补一条](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)。
补账是**一条独立追加的值**，不是对原账的修改（[S-18](#s-18-原账不改)）。

| 成员 | 含义 |
|---|---|
| `target`（必填） | 补的是谁，闭合两种：`{ kind: "model_response", responseId }`——一次发出的费用；`{ kind: "tool_execution", callId }`——一次工具执行**自有部分**的费用（[S-22](#s-22-有效费用)）。缺 `target`、`kind` 不在两值内、缺对应标识、`kind` 与标识对不上、带多余成员，是 `correction_without_target` |
| `cost_usd`（必填） | 补上的金额：**必须是数**，`≥ 0`（[S-5](#s-5-金额美元十进制不截断)）。**补账没有 `"unknown"`**——什么也没拿到，就不写补账 |
| `obtainedVia`（必填） | 这个数怎么拿到的，闭合两值：`generation_endpoint`——按请求号向上游查回的；`manual`——人工录入的。**`generation_endpoint` 只配 `model_response` 目标**：工具执行没有上游请求号可查，配了是 `malformed` |
| `at`（必填） | 这条补账写下的时刻（`Instant`），**在写下它的那一次写入里定死**，此后不改 |
| `late`（可缺席，只取 `true`） | 落下时目标所属的尝试已被取代或运行已经终结（[S-39](#s-39-晚到的账)） |

**一个目标可以有多条补账**，按 `at` 取最新的一条（[S-22](#s-22-有效费用)）。

**补账按目标标识的唯一范围找目标，目标的身份因此是：**

| `target.kind` | 目标身份 | 理由 |
|---|---|---|
| `model_response` | `responseId` | `ResponseId` 部署内唯一（[S-16](#s-16-responseid)） |
| `tool_execution` | **（会话日志归属，`callId`）**：补账条目所在的会话日志，与那份 `ToolCallAccount` 的条目所在的会话日志是同一份，且 `callId` 逐码点相等 | `CallId` 只在一份会话日志内唯一（`data.content-blocks/v2` [S-14](../../content-blocks/v2/contract.md#s-14-callid)）：两个会话可以各有一次 `CallId = c1` 的执行，它们是两次执行 |

「会话日志归属」由承载补账与承载那份账的**记录条目**给（[S-3](#s-3-本契约明确不拥有什么)），补账的值里不带它；拿一个 `CallId` 跨会话去找，会落到另一次执行头上。
工具执行的判重键与补账目标身份取这一对键，是主线裁定（见 D-060 §五 K5），S-22、S-23、S-25 同用。
**判重（[S-23](#s-23-汇总已知之和与未知笔数) 第 4 件）用的是同一对键**。

> **`tool_execution` 目标补的是自有部分，不是 `total_usd`。**一次工具执行替自己调的模型各有自己的 `ModelResponse`，
> 那些钱由 `model_response` 补账去补；一条工具执行补账若覆盖含镜像的总额，同一笔模型费用就会被两条补账各改一次。
> 工具执行的账上本就没有叫 `cost_usd` 的成员——「覆盖该目标的费用」在这一侧**就是覆盖它的自有部分**。

### S-18 原账不改

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

一份账——已发布ready中的原事实或最终 `ModelResponse` 里的 `Usage`／`Cost`、一份 `ToolCallAccount`——**一经写下就不再改变**；
补账（[S-17](#s-17-costcorrection事后补账)）**只追加，不删除，不改写**——[拿到了再补一条](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)，是补，不是改。

- **纠正一个数的唯一方法是再追加一条补账。**没有「撤销一条补账」：要改回去，再补一条（按 `at` 取最新）。
- **原账里的 `Cost.source` 只会是 `upstream_usage` 或 `none`**；`later_correction` 只出现在求值得到的有效费用里（[S-22](#s-22-有效费用)）。
  原账里出现 `later_correction`，说明有人改过原账。
- **有效费用与汇总都在读的时候求，不回写**：求出来的数不是账，**不得**作为账或补账写回（[S-23](#s-23-汇总已知之和与未知笔数) 九件事第 3 件）。

## 四、一条流一份账，进日志不进上下文

### S-19 每条到达流恰一份账；两次发出两份

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

- **一条到达流，收尾时恰有一份账**：[账只记一次——记两次就是两次计费](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)。
  承载原事实**恰有一份**：ready/final按S-40同ResponseId选择一份；`ModelResponse` 的 `Usage` 与 `Cost` 各一个，工具执行记录的 `ToolCallAccount` 一个。
- **流上「记一次账」那一步至多出现一次、出现在收尾之前**——这一半是到达语法的条款，归 `data.arrival-events` 与 `capability.stream-assembly`
  （D-035 把「至多还是恰好」留给了语法契约）。
  **本契约给的是承载记录这一侧的「恰好一次」**：流上那一步缺了，承载记录照样有一份账——全未知的那一份（[S-20](#s-20-缺账或被拒收记未知不伪造)）。
- **两次发出是两条流、两份账、两笔钱。**[首 token 之前重发，上游可能已经开始计费；两笔都是真花掉的，照实记](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)。
  同一次模型调用的几次发出、同一次运行的几次尝试里重发的同一个请求，**一律各记各的**；汇总**不按「逻辑上是同一次调用」去重**（[S-23](#s-23-汇总已知之和与未知笔数)）。
- **失败的发出也有账。**[试过又失败的那几次是留痕](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程)，
  它们可能已被计费；它们的账与成功的那一次一样被计入。

### S-20 缺账或被拒收：记未知，不伪造

承载记录拿不到一份合法的账——流上那一步缺了，或那一步的载荷被表示层拒收（[S-27](#s-27-表示层拒绝值闭合)）——时，它记下的是：

| 该记的 | 记成 |
|---|---|
| `Usage` | 四项全 `"unknown"`，`source: none`，没有 `reasoning_tokens` |
| `Cost` | `cost_usd: "unknown"`，`source: none` |

**不得记零**（[拿不到的费用记「未知」，不是零](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)），
**不得记估算，不得把被拒的值修补之后再记**（例如把负数改成零）。
拒收本身**要看得见**（[S-28](#s-28-表示层校验与判定分开)），但它**不改变这份账的记法**。
（`TrimSummary` 不在这张表里：它由砍的那一方计数，没有拿不到这一支，[S-15](#s-15-trimreason-与-trimsummary砍了要说)。）

**工具执行一侧**：报账时被拒的那一笔**不进 `items`**，也**不以零进**。这次执行的账因此少了一笔——
那一笔若是真有的费用，它就落在 [S-12](#s-12-总额未知不当零加) 那条界线下的「没记下」里；
要不要把「报了但被拒」变成一笔 `source: none` 的未知，归工具执行一侧的契约（[G-5](#十已知缺口)）。

**停机时在途的那一次发出**：它的流没有收尾，承载记录可能根本没写下。
承载记录那一侧若**能知道**有一次发出没有收尾，它追补的就是全未知的那份账；它能不能知道，归那一侧的契约（[G-10](#十已知缺口)）——
**知道了却不追补，那笔可能已经花掉的钱就从明细里消失了。**

### S-21 账进日志，不进给模型看的上下文

- 账**随承载它的记录进[会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)**，
  [不进 agent 的上下文](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账)：
  [给模型看的上下文](../../../../ubiquitous_language/terms/record-and-context.md#ul-model-facing-context--给模型看的上下文--model-facing-context)里
  **不出现**任何一份账、任何一条补账、任何一个汇总的数——agent 拿它们做不出判断，却要白占位置。
- **账不是内容块**：它不在任何消息的块里，也就没有[块标注](../../../../ubiquitous_language/terms/record-and-context.md#ul-block-annotation--块标注--block-annotation)可言，
  不经「给人看／给模型看」那两位决定去留。
- 本契约的值**没有任何成员能携带给模型读的文本**——这是 Schema 管得到的一半（成员封闭）；
  **「组装时不取」那一半 Schema 管不到**，证据义务落在上下文组装、`capability.stream-assembly` 与两侧运行时（[验证入口](../verification.md)）。

## 五、有效费用与汇总

### S-22 有效费用

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

对一个目标，它**此刻的费用**在读的时候按下式求：

```text
一次发出 r（S-40 选出的唯一 ready/final 原事实）：
  current(r)     ≝ 最新补账(r).cost_usd       若有以 r 为目标的补账
                 ≝ r 的 Cost.cost_usd          否则（可能是 "unknown"）

一次工具执行 t（一份 ToolCallAccount）：
  own(t)         ≝ Σ { i.cost_usd | i ∈ t.cost.items, i.service ≠ model_call }
                   —— 其中有一笔为 "unknown" 则为 "unknown"；没有这样的笔则为 0
  currentOwn(t)  ≝ 最新补账(t).cost_usd       若有以 t 为目标的补账
                 ≝ own(t)                      否则
```

`current`、`own`、`currentOwn` 是**本条的记号**，不是词条，也不是成员。`own(t)` 就是 [S-17](#s-17-costcorrection事后补账) 说的「自有部分」。
「以 r／t 为目标的补账」按 [S-17](#s-17-costcorrection事后补账) 的目标身份认：r 按 `responseId`；t 按（会话日志归属，`callId`）。

- **「最新」按 `at` 比**：同一目标的补账里 `at` 最晚的那一条。
  **两条 `at` 相同**：金额也相同，取哪条都一样；**金额不同，就判不出哪条是最新**——这个目标的有效费用**求不出来**，
  求值以**明确失败**收场（[S-23](#s-23-汇总已知之和与未知笔数)），**不得任取一条，也不得回退到原账**。
- **以 `Cost` 的形状呈现有效费用时**：取自补账的是 `{ cost_usd: 补上的数, source: "later_correction" }`，
  原账若有 `upstream_inference_cost_usd`，照原样带上；没有补账时就是原账那个 `Cost`。

### S-23 汇总：已知之和与未知笔数

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

[明细按尝试记、汇总按 Run 算](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)。
对**一组**账——一次尝试的，或一个运行的（[S-25](#s-25-按尝试记明细按-run-汇总)）——以及归在同一组的补账，汇总是**一对数**：

```text
目标集合  ≝ 组内每一次发出 r  ∪  组内每一次工具执行 t
knownSum     ≝ Σ current(r)（为数的） + Σ currentOwn(t)（为数的）        —— 精确十进制加法（S-5）
unknownCount ≝ |{ r : current(r) = "unknown" }| + |{ t : currentOwn(t) = "unknown" }|
```

- **未知单独计数，不当零加。**`unknownCount > 0` 时，**`knownSum` 不是总额**，只是「已知的那部分」——
  金额非负（[S-5](#s-5-金额美元十进制不截断)），所以它是总额的**下界**。任何呈现**不得**在 `unknownCount > 0` 时把 `knownSum` 单独当作这组的总额给出。
- `unknownCount = 0` 时，`knownSum` 就是这组的总额。
- **不按调用去重，不按收场过滤**（[S-19](#s-19-每条到达流恰一份账两次发出两份)）：失败的、被中断的、重发的、崩溃后重来的，每一次发出各是一个目标。
- **不计镜像**（[S-24](#s-24-汇总不重复计)）。
- **token 用量按组汇总时同式**：四项各自求「已知之和、未知笔数」，**只取各份 `ModelResponse` 的 `Usage`**。

**汇总求值的九件事**（它是本契约唯一的求值；读面按它求，名字与呈现归读面）：

| 九件事 | 汇总求值 |
|---|---|
| **1 输入与授权** | 一组账与补账，**已由承载它们的条目归到同一组**（[S-25](#s-25-按尝试记明细按-run-汇总)）。本契约不定授权：谁读得到这组账，归读面所属的契约 |
| **2 前置** | 每个输入值表示合法（[S-27](#s-27-表示层拒绝值闭合)）。**有一个不合法就不开始求值**，以那个拒绝值收场——**不跳过它，也不把它当 `"unknown"`** |
| **3 提交点与原子性** | **没有。**纯计算，不写任何东西；结果**不是账**，不得写回成账或补账（[S-18](#s-18-原账不改)） |
| **4 返回与失败** | `(knownSum, unknownCount)`；或**明确失败**，恰三种情形：**孤立补账**——一条补账的目标不在这组里；**补账平局**——同一目标两条补账 `at` 相同而金额不同（[S-22](#s-22-有效费用)）；**重复的账**——同一个 `ResponseId`，或同一份会话日志归属下的同一个 `CallId`，在组里出现两份账（判重键就是 [S-17](#s-17-costcorrection事后补账) 的目标身份：**不同会话里相同的 `CallId` 是两次执行，不是重复**）。**三种失败的名字归读面所属的契约**；本契约只要求它们**是失败、彼此可分、且不与 `"unknown"` 混同** |
| **5 幂等与重发** | 确定性：同一组输入恒得同一结果，与输入的次序无关 |
| **6 事件** | 无 |
| **7 缺席时的默认答案** | 空组 ⇒ `(0, 0)`，含义是「**这组里没有账**」；某目标没有补账 ⇒ 用原账；工具执行没有 `usage` ⇒ 它没有经本系统调模型。**一份本该在组里却没归进来的账，求值看不见**——那是归属的缺口（[G-3](#十已知缺口)），不是一个零 |
| **8 在途归属** | 还没写下的账（流还没收尾）不在组里；结果只对**读到的那一组**成立。此后追加的账与补账会改变下一次的结果：`knownSum` 可因补账变大或变小；`unknownCount` 因补账变小、因新账变大 |
| **9 装配给／协议给** | [S-26](#s-26-装配给的保证-vs-协议须给的保证) 的「一份账只落一次」「补账的新旧可比」「镜像与权威同组」「补账找得到目标」四行 |

> **孤立补账为什么不能忽略**：忽略它，那笔补上的钱就从这组的账里消失了，而读的人看到的是一个完全正常的数。
> **重复的账为什么不去重了事**：两份相同的账说明「记了两次」已经发生，默默去重会把这件事藏起来——它正是[账只记一次](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法)要挡的那种错。

### S-24 汇总不重复计

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

**每一笔钱恰有一个权威位置，汇总只从权威位置取：**

| 这笔钱 | 权威在 | 汇总取 | 不取 |
|---|---|---|---|
| 一次发出的模型费用——不论这次调用是 agent 自己发的，还是一次工具执行替自己发的 | 那份 `ModelResponse` 的 `Cost` ＋ 以它为目标的补账 | `current(r)` | 工具执行账里那笔 `model_call` 镜像 |
| 一次工具执行自己花的（外部服务、附件存储、MCP 对端） | 那份 `ToolCallAccount` 里 `service ≠ model_call` 的各笔 ＋ 以它为目标的补账 | `currentOwn(t)` | `total_usd`（含镜像） |

**由此有一条前提**：一次工具执行替自己发出的每一次模型调用，它的 `ModelResponse` **必须与这次工具执行归在同一组**——
否则按上表它哪一组都不进，这笔钱从汇总里消失。**这条归属由承载记录的条目给**，本契约只写下要求（[G-3](#十已知缺口)）。

`ToolCallAccount.usage` 同理**不进任何 token 汇总**：token 只按 `ModelResponse` 的 `Usage` 汇总（[S-23](#s-23-汇总已知之和与未知笔数) 最后一条）。

### S-25 按尝试记明细，按 Run 汇总

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

- **明细**：每一份账与每一条补账各是一笔明细，[按尝试增量记，崩溃前记多少算多少](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)。
  「这笔属于哪次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)、哪个运行、哪个租户」**由承载它的记录条目给**
  （[S-3](#s-3-本契约明确不拥有什么)；[PF-012 §6.16](../../../../product/PF-012-agent-loop-and-run/design.md#616-日志里至少要有这几种-run-相关的条目)、
  [PF-000 §5.5](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)）。
- **补账跟着它的目标分组**，不跟着它被写下的那一刻：一条补账归到它的目标所在的每一组。
  补账若按写下时所在的尝试分组，它的目标就不在那一组里——[S-23](#s-23-汇总已知之和与未知笔数) 会把它判成孤立补账。
- **汇总**：[S-23](#s-23-汇总已知之和与未知笔数) 对**一次尝试的组**求，就是这次尝试的成本；对**一个运行的组**求，就是这段工作的成本。
  **同一个求值，两种分组**，不另立规则。
- 于是[「这个运行的成本减去最后一次尝试的成本，就是崩溃浪费掉的钱」](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错)
  在两边都 `unknownCount = 0` 时是一个数；**任一边有未知，这个差也是未知**——两个下界相减什么也不界定。
- **成本按租户逐条列出**（[PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)）：每一份账就是一条；
  按租户分组同样用 [S-23](#s-23-汇总已知之和与未知笔数)，组由条目上的租户身份决定。**这样的组跨会话**，所以组里的工具执行一律按（会话日志归属，`callId`）指认——判重与补账找目标都用这一对键（[S-17](#s-17-costcorrection事后补账)）。

**三种边界情形的归组**：跨尝试的工具执行，账挂在执行记录上，归哪次尝试由那条记录的条目给——`capability.tool-execution-runtime` 按提交时的 `(run, attempt)` 归（落点，本契约不另定）；
在它发起的运行终结之后才结束的后台执行、运行终结之后才到的补账，**照样归该运行并标 `late`**（[S-39](#s-39-晚到的账)；[PF-012 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) 已如此收窄）。
**仍无答案的一种**见 [G-3](#十已知缺口)：工具执行替自己发出的模型调用怎样保证与它同组（[S-24](#s-24-汇总不重复计)）。

## 六、装配给与协议给

### S-26 装配给的保证 vs 协议须给的保证

**这张表本身是契约的一部分**：装配给的那些，演化到跨进程时**不会自动成立**。

| 保证 | 单机由谁给（装配给） | 跨进程之后谁重新兑现（协议给） | 做不到会怎样 |
|---|---|---|---|
| **金额保住精确十进制**（[S-5](#s-5-金额美元十进制不截断)） | 同一实现里解析与序列化这些成员时保住字面量的精确值 | 每一跳的编码都须保住那个十进制字面量；任何中间方不得按二进制浮点重新编码 | 加总与补账比较出现舍入差：`total_usd` 与各笔之和对不上，一份合法的账被判 `malformed`——或者更糟，一份错账被悄悄接受 |
| **一份账只落一次**（[S-19](#s-19-每条到达流恰一份账两次发出两份)） | 承载记录与它的流在同一进程收尾，写一次 | 账跨进程送达时，须按承载记录的标识（`ResponseId`、`CallId`）幂等落盘——至少一次的投递会把同一份账落两遍 | 两份相同的账，钱翻倍；[S-23](#s-23-汇总已知之和与未知笔数) 能把它判成失败，**但只在两份落进同一组时** |
| **补账的新旧可比**（[S-17](#s-17-costcorrection事后补账)、[S-22](#s-22-有效费用)） | 同一个时间源写 `at` | 须定义时钟偏差上界，或为同一目标的补账给出与时钟无关的全序；**定义之前不得跨节点比较 `at` 取最新**（[G-8](#十已知缺口)） | 较旧的补账因为时钟快被当成最新，汇总用错数，没有任何报错 |
| **起止时刻同源**（[S-14](#s-14-wallclock)） | 执行与写账在同一时间源下 | 执行在一个节点、写账在另一个节点时，须说明两个时刻各取自哪一边 | 求出负的或失真的时长 |
| **镜像与权威同组**（[S-24](#s-24-汇总不重复计)） | 同一本会话日志、同一套条目归属 | 工具执行与它替自己发出的模型调用分落两处时，须保证二者归到同一组 | 那笔模型费用从汇总里消失，且没有任何报错 |
| **补账找得到目标**（[S-17](#s-17-costcorrection事后补账)、[S-23](#s-23-汇总已知之和与未知笔数)） | 同一存储 | 目标身份跨节点仍成立——`ResponseId` 部署内唯一，工具执行的（会话日志归属，`callId`）两段都随补账与账一起过边界；补账与目标归到同一组 | 孤立补账：[S-23](#s-23-汇总已知之和与未知笔数) 以失败收场；更糟的是被悄悄忽略 |

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) 要求领域语义在分布式演化中不变，
因此右两列不是「以后再说」，而是**本契约已经记下的待兑现项**（[G-8](#十已知缺口)）。

## 七、表示与边界校验

- **规范表示**：[`call-accounts.schema.json`](call-accounts.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/call-accounts/v4/call-accounts.schema.json`
- **定义项**（13 项）：`Unknown`、`ResponseId`、`Usage`、`Cost`、`CostItem`、`ToolCallAccount`、`FrameAccount`、`TrimReason`、`TrimSummary`、`CostCorrection`、`RunId`、`AttemptId`、`ModelCallId`。
  **外部引用**：`Instant` 取自 `data.offer-expiry` v1；`CallId` 取自 `data.content-blocks` v2；`TenantId`、`ScopeLayerIdentity` 取自 `data.identity-values` v1。
  消费者 `$ref` 这些定义，**不复制一份同义类型**——`Usage`、`Cost`、`CostItem`、`CostCorrection`、`TrimReason`、`TrimSummary`、`RunId`、`AttemptId`、`ModelCallId` **在全批契约里只有这一个家**；`ResponseId` 的家在 `data.model-response`，本契约的那一份是为避免成环按同一散文自写的形状。
- **根模式不约束任何文档**：本文件是共享定义的登记处，不是某个消息的形状。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-27 表示层拒绝值（闭合）

本契约的值在任何一处边界被校验时，不合法就以**恰一个**拒绝值收场。**恰五个，没有第六个，没有「其他」**：

| 拒绝值 | 什么时候 |
|---|---|
| `correction_without_target` | 一条 `CostCorrection` 缺 `target`，或 `target` 不是那两种之一（`kind` 不在两值内、缺对应标识、`kind` 与标识对不上、带多余成员） |
| `malformed` | **结构不合**：缺必填成员、多出成员、类型不对、枚举外的值；**或组合约束被违反**：`reasoning_tokens ≤ output_tokens`（[S-6](#s-6-usage四项-token-与来源)）；`model_response` 只配 `model_call`、`model_call` 只配 `model_response`／`none`、`model_call` 必带 `reference`、同一个 `ResponseId` 不镜像两次（[S-9](#s-9-costitem一次工具执行里的一笔)、[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse)）；全部是数时 `total_usd` 恰等于各笔之和（[S-12](#s-12-总额未知不当零加)）；`usage` 与 `model_call` 同出同缺（[S-13](#s-13-经本系统调模型的用量汇总)）；`endedAt ≥ startedAt`、`stoppedAt ≥ startedAt`（[S-14](#s-14-wallclock)）；`TrimSummary` 的三式与帧数一式（后者只在 `frames` 是 `FrameAccount` 时核，[S-15](#s-15-trimreason-与-trimsummary砍了要说)）；`generation_endpoint` 只配 `model_response` 目标（[S-17](#s-17-costcorrection事后补账)） |
| `negative_amount` | 任一金额、token 数、计量数、帧数、字节数为负 |
| `unknown_with_source` | 数与来源对不上：`Usage` 的两行（[S-6](#s-6-usage四项-token-与来源)）、`Cost` 的三行（[S-8](#s-8-cost一次发出的费用)）、`CostItem` 的四行（[S-9](#s-9-costitem一次工具执行里的一笔)）——**某个值声称的来源与它实际有没有数不一致** |
| `total_not_unknown` | `ToolCallAccount` 里有一笔 `cost_usd` 为 `"unknown"`，而 `total_usd` 是数 |

**一个值同时犯了几条，按下面的次序逐项核，报第一个不过的**——次序让不同实现对同一个坏值给出同一个答案：

1. `correction_without_target`（只对 `CostCorrection`）；
2. `malformed` 的**结构**那一半——这一步只核类型，**金额与计数的正负不在这一步核**；
3. `negative_amount`；
4. `unknown_with_source`；
5. `total_not_unknown`；
6. `malformed` 的**组合约束**那一半。

**名字归本契约**：在边界上校验这些值的一方——到达语法的装配、报账、补账的写入者、读面——用这五个名字；
它们可以把这五个值包进自己的失败集合，**不改名、不合并、不另起同义值**。

### S-28 表示层校验与判定分开

- 拒收**在任何求值之前**发生：一个被拒的值不进有效费用、不进汇总，**也不被当成 `"unknown"`**（[S-23](#s-23-汇总已知之和与未知笔数) 九件事第 2 件）。
- 拒收**不表示**这次发出或这次执行没有发生，**也不表示它没花钱**。承载记录照 [S-20](#s-20-缺账或被拒收记未知不伪造) 记全未知的账，
  这次调用照常存在、照常进 `unknownCount`。
- 拒收**要看得见**：被拒的是哪个值、得了五个拒绝值里的哪一个，要留下可查的痕迹——**痕迹落在哪归承载记录与装配的契约**，本契约只要求它不被吞掉。
- 反过来：**表示合法不表示数是对的。**Schema 与 [S-27](#s-27-表示层拒绝值闭合) 查的是形状与自洽，查不出上游报错了数、工具报少了钱。

### S-29 判别式与枚举闭合

`Usage.source`、`Cost.source`、`CostItem.source`、`TrimReason`、`CostCorrection.target.kind`、`CostCorrection.obtainedVia`、`ToolCallAccount.externalEffect`、`late`（只有 `true`），
以及 `Unknown` 的那一个字面量，都是**闭合集合**。未知取值**一律拒收**——`target.kind` 那一个是 `correction_without_target`，其余是 `malformed`：
**不映射到「最接近」的值，不当缺省，不忽略该成员继续。**`"Unknown"`、`"UNKNOWN"`、`null`、`""` 都不是 `"unknown"`。

`TrimSummary.byReason` 的键集合**就是** `TrimReason`：四个键必须都在，多一个不认识的键是 `malformed`。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 表达不了的那部分归谁 |
|---|---|---|
| [S-4](#s-4-未知是一个值不是零也不是缺席) 未知 ≠ 零 ≠ 缺席 | **管得到表示**：`"unknown"` 是一个常量，必填成员不许缺，`null` 不被接受 | 「不当零加、要计数」是求值规则，归 [S-12](#s-12-总额未知不当零加)、[S-23](#s-23-汇总已知之和与未知笔数) |
| [S-5](#s-5-金额美元十进制不截断) 金额 | 管非负、管是数 | **精确十进制与不截断管不到**——JSON Schema 看不见字面量的位数；归实现（[G-9](#十已知缺口)） |
| [S-6](#s-6-usage四项-token-与来源) Usage | 管四项必填、取值域、两行来源约束、`none` 不带 `reasoning_tokens` | `reasoning_tokens ≤ output_tokens`；三项输入不相交（那是上游映射的事，[G-6](#十已知缺口)） |
| [S-7](#s-7-派生量cache_tokens-与-total_tokens) 派生量 | **管「不是成员」**：成员封闭，存了会被拒 | 派生式本身 |
| [S-8](#s-8-cost一次发出的费用) Cost | 管三行来源约束 | 「不是估算」——形状一模一样，归模型调用一侧的传输适配与静态检查 |
| [S-9](#s-9-costitem一次工具执行里的一笔)／[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse) CostItem 与镜像 | 管四行来源约束、`model_response ⇒ model_call`、`model_call ⇒ reference` 且形如 `ResponseId`、`model_call ⇒ source ∈ {model_response, none}` | 同一 `ResponseId` 不重复；镜像的数等于写账那一刻那份响应的数；`service` 的命名空间（[G-4](#十已知缺口)） |
| [S-12](#s-12-总额未知不当零加) 总额 | **管 `total_not_unknown` 那一支** | 全部是数时恰等于各笔之和 |
| [S-13](#s-13-经本系统调模型的用量汇总) 用量汇总 | 管 `usage` 与 `model_call` 同出同缺 | 汇总的数等于各份响应的逐项和 |
| [S-14](#s-14-wallclock) wallClock | 管时刻形状（`Instant`） | `endedAt ≥ startedAt`（时刻按时间点语义比较，不按字典序）；同源 |
| [S-15](#s-15-trimreason-与-trimsummary砍了要说) TrimSummary | 管四个计数非负、`byReason` 四键齐全且只有这四键；`frames` 恰是 `FrameAccount` 与 `"unknown"` 之一 | 三式与帧数一式；`"unknown"` 只在在途状态丢了时写（[S-11](#s-11-toolcallaccount一次工具执行的账)） |
| [S-16](#s-16-responseid) ResponseId | 管非空、首尾不是那个显式空白集合里的码点 | 部署内唯一、不复用、不来自上游请求号 |
| [S-17](#s-17-costcorrection事后补账) CostCorrection | 管两种目标、金额为数且非负、`generation_endpoint ⇒ model_response` | 目标存在、同一目标的新旧、`at` 同源 |
| [S-18](#s-18-原账不改)～[S-21](#s-21-账进日志不进给模型看的上下文)、[S-23](#s-23-汇总已知之和与未知笔数)～[S-25](#s-25-按尝试记明细按-run-汇总) | **一概管不到**——它们约束的是写入路径、流、组装与求值 | 场景与静态检查，见[验证入口](../verification.md) |

**Schema 校验失败只说明「拒绝」，不说明是五个里的哪一个**；是哪一个，按 [S-27](#s-27-表示层拒绝值闭合) 的次序定。
**校验失败不得降级为「按默认处理」或「尽力而为」。**

## 八、性质与规范场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 未知不当零：任一加总里 `"unknown"` 不被计作 0；有一笔未知，总额就是未知 | 不变量 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) | Schema（[S-12](#s-12-总额未知不当零加) 的条件约束）＋ 求值（[S-23](#s-23-汇总已知之和与未知笔数)） | 一个运行里有一次费用拿不到，它的成本仍显示成一个确定的数 |
| P-2 | 原账不改；原账里没有 `later_correction` | 不变量 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token)（「拿到了再补一条」） | 承载记录的写入路径只追加（[S-18](#s-18-原账不改)） | 补账之后，原响应体里的费用变了 |
| P-3 | 一条流恰一份账 | 安全 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) | `capability.stream-assembly` 与承载记录的写入（[S-19](#s-19-每条到达流恰一份账两次发出两份)） | 同一次发出两份账，钱翻倍 |
| P-4 | 每笔钱只计一次：镜像与含镜像的总额不进汇总 | 安全 | 同上 ＋ [PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) | 求值（[S-24](#s-24-汇总不重复计)） | 工具替自己调模型的钱在运行的汇总里出现两次 |
| P-5 | 两次发出，两笔钱都在 | 安全 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) | 求值不去重、不按收场过滤（[S-19](#s-19-每条到达流恰一份账两次发出两份)、[S-23](#s-23-汇总已知之和与未知笔数)） | 首 token 之前重发之后，运行的成本只算了一次 |
| P-6 | 缺账记未知，不记零、不记估算 | 安全 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) · D-019 | 承载记录的写入（[S-20](#s-20-缺账或被拒收记未知不伪造)） | 流断了之后账上是 0 |
| P-7 | 费用不是估算 | 安全 | D-019 | 模型调用一侧的传输适配（[S-8](#s-8-cost一次发出的费用)） | 上游没报费用，账上却有一个数 |
| P-8 | 账不进给模型看的上下文 | 安全 | [PF-006 §5.4](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账) | 上下文组装、`capability.stream-assembly`（[S-21](#s-21-账进日志不进给模型看的上下文)） | 给模型看的上下文里出现 token 数或费用 |
| P-9 | 砍了要说 | 安全 | [PF-009 §6.16](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢) | 做砍的那一方的计数（[S-15](#s-15-trimreason-与-trimsummary砍了要说)） | 面板被截短了，`TrimSummary` 却全是零 |
| P-10 | 汇总的失败不混同为未知，也不被忽略 | 安全 | 缺席即明确失败的通用收场 | 读面（[S-23](#s-23-汇总已知之和与未知笔数) 第 4 件） | 孤立补账被忽略，汇总照常返回一个数 |
| P-11 | 终结之后落的账不消失，且看得出是晚到的 | 安全 | [PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（rev 11 起） | 写下它的那一方（[S-39](#s-39-晚到的账)） | 后台工具在运行终结之后收场，那笔钱不在运行的汇总里；或它在里面却分不出是终结之后才落的 |
| P-12 | 用量与成本的归属分记，不互相推 | 不变量 | [PF-001 §6.4](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) ＋ [UL-model-credential](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)（规格层推导，[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)） | 写账的一方（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)） | 租户用官方档案走了出厂格那一把凭据，钱却记到了出厂格头上 |

**进展性质：本契约不拥有任何进展性质。**值不会「最终成为」别的值；补账何时到、会不会到，**本契约不承诺**——
上游的事后查询可能永远查不到，那一笔就永远是 `"unknown"`，这是一个合法的终态。

**本契约不建行为模型，也不建结构模型**，理由在[第十二节](#十二版本差异与规范工件)。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。
每条写明**必须观察到**什么；演练的落点在别的契约，本契约只断言数与记法。

#### S-30 缺账记未知

一次模型调用的流在「记一次账」之前断了；另跑一支：那一步到了，但载荷里有一个负的 token 数。
**必须观察到**：两支里那份 `ModelResponse` 的 `Usage` 都是四项全 `"unknown"`、`source: none`，`Cost` 都是 `"unknown"`、`source: none`——**不是 0**；
第二支的拒收留下了可查的痕迹、拒绝值是 `negative_amount`；把它放进它所在的组求汇总，`unknownCount` 恰为 1。
落点：`capability.stream-assembly` 与模型调用一侧。

#### S-31 首 token 之前重发，两笔都记

同一次模型调用发出两次：第一次在首 token 之前断（上游报回了费用），第二次完整。
**必须观察到**：两份 `ModelResponse`、两个 `ResponseId`、两份账；运行那一组的 `knownSum` 是两笔之和，**不因「同一次调用」去重**。
再跑一支：第一次的费用拿不到——`knownSum` 只含第二笔，`unknownCount = 1`。

#### S-32 补账改读数，不改原账

一份 `ModelResponse` 的费用 `"unknown"`（`source: none`）。追加补账 A（`at = t₁`），再追加补账 B（`at = t₂ > t₁`）。
**必须观察到**：原响应体**逐字节不变**；有效费用是 B 的数、`source: later_correction`；汇总用 B 的数。
再追加补账 C（`at = t₂`，金额与 B 不同）：**必须观察到**求值**明确失败**（补账平局）——不是任取一条，不是 `"unknown"`，也不是回退到原账。

#### S-33 工具执行三笔、一笔未知、一笔镜像

一次工具执行：一笔工具报的外部服务费（数）、一笔 MCP 对端（`"unknown"`、`source: none`）、一笔 `model_call` 镜像（数，`reference` 指向同组里的那份 `ModelResponse`）。
**必须观察到**：`total_usd = "unknown"`；运行那一组的汇总里，那份 `ModelResponse` 的费用**只出现一次**，这次执行只贡献一个 `"unknown"`（`unknownCount` 加 1）；
追加一条以这次执行为目标的补账之后，它贡献补账的数，`unknownCount` 减 1。**逐项数值见 [`examples.md` 第 9 节](examples.md#9-手算汇总规则)。**

#### S-34 账不进给模型看的上下文

一次运行里有模型调用、有工具执行、有补账。组装下一次请求的上下文。
**必须观察到**：给模型看的那一份里**没有**任何 token 数、费用、补账或汇总的数。
落点：上下文组装与 `capability.stream-assembly`；**只看返回的消息不够，要核组装的输入**。

#### S-35 砍了要说

一个工具在节流之下连发大量追加片段的帧，其中一帧超长，最后撞上额度。
**必须观察到**：那次执行的 `TrimSummary` 满足 [S-15](#s-15-trimreason-与-trimsummary砍了要说) 的三式与帧数一式；`byReason` 四键齐全；
「送达的 + `merged` + `cut` = `emitted`」；被截短那一帧的截掉部分计入 `omittedBytes`。**不存在一帧没送达、却哪一项都没计上。**

#### S-36 拒绝值逐个

把 [`examples.md`](examples.md) 里每一条反例交给边界上的校验方。
**必须观察到**：每一条得到的拒绝值与那一行写的**逐字相同**（按 [S-27](#s-27-表示层拒绝值闭合) 的次序）；被拒的值**没有**原样或被修补后记下。

### S-37 三个归属标识的家：RunId、AttemptId、ModelCallId

账按尝试记明细、按 Run 汇总（[S-25](#s-25-按尝试记明细按-run-汇总)），所以「哪次运行、第几次尝试、哪次模型调用」这三个标识的**交换表示定在本契约**，供 `data.model-response`、`data.messages`、`data.arrival-events`、`data.loop-extension` 引用，不各自另定：

| 定义 | 是什么 | 表示 |
|---|---|---|
| `RunId` | 一次[运行](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run--运行--run)的标识；会话内唯一、不回收不复用，由 loop 在开始一次运行时产生 | 不透明字符串，按 `data.identity-values` v1 S-31 的散文（同 [S-16](#s-16-responseid)） |
| `AttemptId` | 一次运行的第几次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)：尝试的身份是 (运行, 第几次)、不另存，所以它是**从 1 起的整数序号**，与 `RunId` 合起来才完整 | `integer ≥ 1` |
| `ModelCallId` | 一次[模型调用](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)的标识；**会话内唯一**（不属于任何运行的调用也有它，所以不按运行划范围）、不回收不复用，由模型请求运行时在打开一次新调用时产生；一次调用发出多次时，各次发出以 `(ModelCallId, dispatch)` 指认，`dispatch` 归 `data.model-response` | 不透明字符串，同上 |

这三个值的**产生**归各自的能力（loop、模型请求运行时），本契约只定表示与唯一范围；产生前无值，不得用占位值代替。
家在本契约，理由是它们首先在账上被消费（主线裁定，见 D-060 §一 S8-c）。

### S-38 两种归属：用量归凭据那一格，成本归发起者

**一笔钱有两个「归谁」，两者可以不同，账上分记，不互相推**（规格层推导：[成本按租户归属](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)与[用量记在凭据所在的那个范围头上](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)两条各自成立，账上缺一项就会把其中一种归属算错；出厂格那一把由部署装配给，见 D-060 §一 S16-f）。
**出厂格那一把是唯一分叉点**：凭据只在租户层与出厂格，租户用的永远是自己那一把，所以用量那一格与发起者只在走出厂格那一把时不同——分记就是为了这一处不被合并掉：

| 归属 | 成员 | 是什么 | 为什么要分记 |
|---|---|---|---|
| **成本归发起者** | `initiator: TenantId`（`data.identity-values` v1 [S-5](../../identity-values/v1/contract.md#s-5-tenantid-的构成与相等)） | 发起这次运行的那个租户身份 | [成本按租户归属](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)；用了别的组织分享来的资产，钱也记在**用的一方**头上 |
| **用量归凭据那一格** | `credentialScope`（`data.identity-values` v1 [S-11](../../identity-values/v1/contract.md#s-11-scopelayeridentity) 的 `ScopeLayerIdentity` 的租户那一支；模型调用那边另有出厂格一支，形状归 `data.model-response`） | 这笔花费经哪一格上的凭据产生 | [用量记在凭据所在的那个范围头上](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-credential--模型凭据--model-credential)。**凭据只在租户层与出厂格**（[PF-013 rev 10 裁决 33](../../../../product/PF-013-model-profiles-and-invocation/design.md)；MCP 凭据只在租户层，[PF-002 rev 18](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的)）。用租户自己那一把时，用量那一格就是发起租户，两项归属重合；**唯一的分叉点是出厂格那一把**：租户没配自己那一把、用官方档案走了它时，用量落在出厂格，钱仍归发起这次运行的租户。不分记，这一笔要么让出厂格背了钱，要么让租户的用量里混进出厂格那一把的用量 |

**落在哪**：

- **工具执行的账**：`ToolCallAccount.initiator` 必填；`ToolCallAccount.credentialScope` 在这次执行的自有费用经范围上的凭据产生时出现（本版只有 [MCP 凭据](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp-credential--mcp-凭据--mcp-credential)，**它只在租户那一格**：组织那一层不持有它（PF-002 rev 18），它也不在工作区格与出厂格上），否则缺席。
  它替自己发出的模型调用各有自己的 `ModelResponse`，那几笔的两种归属在那边记，**镜像那一笔不另记**（[S-10](#s-10-model_call-那一笔是镜像权威在那份-modelresponse)）。
- **一次发出的账**（`ModelResponse` 上的 `Usage`／`Cost`）：**用量那一格**由 `data.model-response` 的 `route.credentialScope` 记下（它还要能写「出厂格那一把」，形状归那份契约）；
  **发起者**本版**不在响应体上另记**——承载响应体的记录条目[无条件带租户身份](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段)，而那条条目的租户就是发起这次运行的租户；
  响应体上 `initiator` 这个名字已被「谁中断了它」占用（`data.model-response` 的中断发起方），**不再给第二个含义**（[G-12](#十已知缺口)）。
- **同名不同义，按名字跨契约关联会错**：本契约的 `initiator` 是**成本归属的租户**（`TenantId`）；`data.model-response` 与 `data.messages`（[S-49](../../messages/v2/contract.md#s-49-模型请求运行时写的五种记录不是消息)、[S-50](../../messages/v2/contract.md#s-50-调用终结的三支)）里同名的 `initiator` 是**中断的发起方**。两者不互相推，也不因同名而可比较。
- **`initiator` 不是「当前租户」的现查结果**：它在写账那一刻由写入方按那次运行的事实写下，此后不改（[S-18](#s-18-原账不改)）；身份参数没有默认值（`data.identity-values/v1#S-17`）。
- **两者都不是授权依据**：账上写着哪一格，不表示那一格的人读得到这份账——谁读得到归读面所属的契约（[S-23](#s-23-汇总已知之和与未知笔数) 第 1 件）。

### S-39 晚到的账

**一份账或一条补账落下时，它锚定的那次尝试已被新的尝试取代，或它归属的那次运行已经终结——它仍然落下、仍归那次运行（与那次尝试），并标 `late: true`。**
**锚定的尝试按账的种类定**：`ToolCallAccount` 与 `CostCorrection` 看它**归属**的那次尝试（承载它的条目给，[S-25](#s-25-按尝试记明细按-run-汇总)）；`ModelResponse` 看这一次发出**所在**的那次尝试——它自己带的 `attemptId`（[S-37](#s-37-三个归属标识的家runidattemptidmodelcallid) 的 `AttemptId`），**不看条目把它归到哪一次**（主线裁定，见 D-060 §四「K14」那一行与 §七 M25：「所属尝试」读作「发出所在的尝试」）。
所以对账在第 n+1 次尝试里补写一次在第 n 次尝试里出门的发出时，条目可以把它归到 n+1，那一条仍是晚的——它出门所在的第 n 次已被取代。

- **依据**：[PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式)（rev 11 起）：终结之后「不再有新发起的效果与花钱的动作。终结之前已经发起的那些，账在终结之后才到的，照样落账、归这个 Run，并标明是迟到的」；收窄的来由见 D-060 §一 S2-d——原句「终结之后日志里不再出现属于它的成本条目」与「按 Run 汇总成本」直接相抵，后台工具在运行终结之后结束是产品明写的路径，那笔钱不能凭空消失。
- **谁会晚到**：运行终结之后才收场的后台执行（`ToolCallAccount`）；尝试被栅栏关掉之后才结算的一次发出（它的 `ModelResponse`）；运行终结之后才拿到的补账（`CostCorrection`）。
- **缺席的意思是确定的**：落下时它归属的尝试仍是当前的、运行尚未终结。**可选、只取 `true`**，`late: false` 不是合法写法——「不晚」只有一种表示。
- **`ModelResponse` 上的 `late` 与本条同一含义、同一写法**：可选、只取 `true`，只在发出所在的那次尝试被栅栏关掉之后才结算时写；缺席 = 不晚（主线裁定，见 D-060 §五 K14，锚点按上一段）。形状归 `data.model-response`，那份契约引用本条（本契约不反向引用它，见头部）。
- **它不改变归属，也不改变汇总**：晚到的账照样按 [S-25](#s-25-按尝试记明细按-run-汇总) 归组、按 [S-23](#s-23-汇总已知之和与未知笔数) 计入；`late` 只让读的人看得出「这笔是终结之后才落的」，
  于是一个运行的汇总在终结之后**仍可能变**（[S-23](#s-23-汇总已知之和与未知笔数) 第 8 件）。
- **由写下它的那一方判**：它知道那次尝试与运行此刻的状态；本契约不提供判定，只给标记与含义。

## 九、缺席与恢复

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是**值层面的缺席怎么收敛**：

| 缺席的是什么 | 收敛到哪 | 谁收口 |
|---|---|---|
| 上游没报用量或费用 | `"unknown"`，`source: none`（[S-6](#s-6-usage四项-token-与来源)、[S-8](#s-8-cost一次发出的费用)） | 模型调用一侧 |
| 流上缺「记一次账」那一步，或那一步被拒收 | 全未知的账（[S-20](#s-20-缺账或被拒收记未知不伪造)），拒收留痕（[S-28](#s-28-表示层校验与判定分开)） | `capability.stream-assembly` ＋ 模型调用一侧 |
| 工具报的一笔被拒 | 不进 `items`，不以零进（[S-20](#s-20-缺账或被拒收记未知不伪造)） | 工具执行一侧（[G-5](#十已知缺口)） |
| 补账一直不来 | 永远 `"unknown"`；汇总照计 `unknownCount`——**合法终态** | 无人需要动作 |
| 补账的目标找不到，或同一目标的补账平局 | 汇总**明确失败**（[S-23](#s-23-汇总已知之和与未知笔数)） | 读面 |
| 系统重启 | 已写下的账随会话日志留存；**在途的发出没有账**，由承载记录那一侧追补（[S-20](#s-20-缺账或被拒收记未知不伪造)、[G-10](#十已知缺口)） | 承载记录的契约 |
| 写账时读不到时间源 | `startedAt` 必填，**本契约不给替代时刻**；写账方不得编一个别处的时刻，怎样收场归它自己的契约 | 工具执行一侧 |
| 一份账没归进它该在的组 | 汇总看不见它——**不是零，是归属的缺口** | [G-3](#十已知缺口) |
| 一次执行的在途状态丢了、数不出发了几帧砍了多少 | `frames: "unknown"`（[S-11](#s-11-toolcallaccount一次工具执行的账)）；**不写 0、不写部分计数** | 工具执行一侧（判定在 `capability.tool-execution-runtime`） |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆**：钱花掉了就是花掉了，账只能如实记、事后补，不能撤。

## 十、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决，实现不得据一个看起来合理的猜测推进。

| # | 缺口 | owner | 闭合条件 |
|---|---|---|---|
| ~~G-1~~ | **已闭合（2026-09-23 对齐波）**：`data.content-blocks` v2 已成稿，`CallId` 的定义在它的 [S-14](../../content-blocks/v2/contract.md#s-14-callid)，catalog 补登依赖；`CallId` 的唯一范围是一份会话日志——[S-17](#s-17-costcorrection事后补账) 的补账目标与 [S-23](#s-23-汇总已知之和与未知笔数) 的「重复的账」按它读：同一 `CallId` 在不同会话里是不同的执行，补账须与目标落在同一份会话日志的归属里 | — | — |
| ~~G-2~~ | **已闭合**：三句裁决落在 D-058（8b、8c、Q13），设计依据改为链接 | — | — |
| G-3 | **收窄**：三种边界情形的归组已写进 [S-25](#s-25-按尝试记明细按-run-汇总)（跨尝试归提交它的那次；终结之后落的归该运行、标 `late`——后者的产品依据 PF-012 I-11 自 rev 11 起已在正文）。**仍无答案**：[S-24](#s-24-汇总不重复计) 要求工具执行替自己发出的模型调用与它同组——一次后台执行在它的尝试被取代之后才调模型，那次调用的 `ModelResponse` 归哪次尝试，**无人给出** | `capability.tool-execution-runtime` 与 `capability.model-request-runtime` 的 owner（同组的兑现） | 两份能力契约写明工具内部发起的模型调用怎样带上执行所属的 `(run, attempt)` |
| G-4 | **收窄**：MCP 接入点那一种已定为能力标识规范串（[S-9](#s-9-costitem一次工具执行里的一笔)）。**依赖名与规范串、保留值 `model_call` 不相交还没有保证**：依赖名的字符集归 `data.tool-definition`（它的 G-1） | `data.tool-definition` 的 owner | 依赖名的词法排除 `/` 与 `model_call` |
| G-5 | **`items` 为空、或报账被拒之后，账上「没记下」与「没花钱」分不开**（[S-12](#s-12-总额未知不当零加)、[S-20](#s-20-缺账或被拒收记未知不伪造)）：一个声明了外部服务依赖、却一笔都没报的工具，要不要由运行时补一笔 `source: none` 的未知 | PF-006 的 owner；工具执行一侧的契约 | 裁定规则并写进工具执行一侧的契约；若改变本契约的记法，出新版本 |
| G-6 | **上游语义未核实**：`is_byok` 情形下 `usage.cost` 的确切含义；上游对首 token 之前被中断、首 token 之后断流的请求是否计费、是否仍报回费用；各家上游的 token 字段怎样换算到 [S-6](#s-6-usage四项-token-与来源) 那三项不相交的输入。见[传输复用研究](../../../../../research/model-request-transport-sources/research.md)的未核对各行 | research（`model-request-transport-sources`）；模型调用一侧的传输适配 | 官方文档或受控实测核实；映射写进模型调用一侧的契约。**本契约的记法不因此改变**：上游报什么记什么，没报记未知 |
| G-7 | **`obtainedVia` 对工具执行目标实际只剩 `manual`**：收场之后才到的费用走补账（主线裁定，见 D-060 §一 S13-f），而「报账方在收场之后才报来」这条来路**没有取值**；一个外部服务提供可查的账单接口、由运行时自动取回，同样没有 | 主线（取值名）；产品负责人（取值集） | 裁定取值并加进 `obtainedVia`；在那之前工具执行一侧的晚到报账只能以记录条目留下，进不了有效费用 |
| G-8 | **跨进程的兑现方式未定义**：[S-26](#s-26-装配给的保证-vs-协议须给的保证) 右两列——精确十进制的逐跳保真、账的幂等落盘、补账新旧的全序或时钟偏差上界、起止时刻取自哪一边、镜像与权威同组、补账目标跨节点可达 | 架构设计（本版单机不阻断） | 分布式演化启动时逐行给出协议，作为本契约的新版本发布 |
| G-9 | **精确十进制在实现里怎样保住**：常见的 JSON 解析把数字读成二进制浮点，超过约 17 位有效数字就丢位，且 `0.1 + 0.2` 不等于 `0.3` | realization | 提供者设计写明这些成员按精确十进制解析、加总与序列化，并有一条会在丢位时失败的测试 |
| G-10 | **收窄**：拥有 `ModelResponse` 的一侧、拥有工具执行记录的一侧、到达语法与流装配都已成稿（候选）。**仍无契约**：按 Run 汇总的读面（[S-23](#s-23-汇总已知之和与未知笔数) 三种失败的名字）、上下文组装（账不进上下文，[S-21](#s-21-账进日志不进给模型看的上下文)） | PF-012、PF-010 那一侧 | 两份契约成稿，认领 [S-32](#s-32-补账改读数不改原账)、[S-33](#s-33-工具执行三笔一笔未知一笔镜像)、[S-34](#s-34-账不进给模型看的上下文) 各自的演练 |
| ~~G-11~~ | **已闭合（2026-09-24 第一轮评审修复）**：I-11 收窄与 `late`、外部效果与停止时刻、接入点规范串、每帧至多计一次、三个归属标识的家都已落在 D-060 §一，依据行已改为链接；两种归属分记改以产品行加规格层推导为依据（[设计依据](#设计依据)倒数第二行） | — | — |
| G-12 | **一次发出的账上没有另记发起者**（[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)）：[S-38](#s-38-两种归属用量归凭据那一格成本归发起者) 要账上分记两项，而一次发出的账挂在 `ModelResponse` 上、那里的 `initiator` 已是中断发起方；本版取承载条目的租户作发起者 | 主线 | 确认「一次发出的发起者取条目租户」，或给响应体上的这一项另起一个名字（`data.model-response` 新版本） |

## 十一、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **不定义承载记录**：`ModelResponse` 的路由留痕、收场、时序、回复，工具执行记录的收场、落点、前后台与等待，都不在这里。
- **不定义归属**：账里没有会话、运行、尝试；它们在条目上（[S-3](#s-3-本契约明确不拥有什么)）。**账里的租户身份只有一处**：`ToolCallAccount.initiator`（成本归谁，[S-38](#s-38-两种归属用量归凭据那一格成本归发起者)）——它是归属的一项，不是这份账属于哪个租户的读取依据，也不是授权依据；条目自己的租户身份仍在条目上。
- **不定义计价、结算、账单、预算、额度与超限拦截。**
- **不定义价目表，也不承诺任何估算可用。**
- **不定义怎么砍**：节流的时机、长度上限、额度、拒收规则。
- **不定义上游字段到本契约成员的映射**（[G-6](#十已知缺口)）。
- **不定义读面**：谁读得到哪一组账、怎样呈现、失败值叫什么。
- **不定义任何操作、状态转移、提交点与事件。**本契约唯一的求值是纯计算（[S-23](#s-23-汇总已知之和与未知笔数)）。
- **不承诺补账一定会来。**
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在**不表示**形状已被校验过。

## 十二、版本差异与规范工件

**本版由已接受CA3演进为CA4候选，新增S-43 ACK小账见证**，S-40～S-42补ready/final同ResponseId来源选择，S-1～S-39未变义务继承。消费者影响见consumer-impact.md；
`registry/lineage.json` 不因本契约而增加条目。

**本版的规范工件**：本文件、[`call-accounts.schema.json`](call-accounts.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`。**理由：本契约**没有状态转移**——原账不改（[S-18](#s-18-原账不改)）本身就是「没有这条边」；
它的性质要么是单个值的形状与自洽（Schema 与 [S-27](#s-27-表示层拒绝值闭合) 的组合约束，由正反实例检验），
要么是一个纯计算的算术规则（[S-22](#s-22-有效费用)～[S-24](#s-24-汇总不重复计)，由逐项手算与规范场景检验）——
本data不另拥有行为状态机；本批ready/final接替交错由RT11 ReferenceLifecycle模型承接。
「一流一账」「缺账记未知」是**流与写入**的性质，要检查它们的行为模型归 `capability.stream-assembly` 与承载记录的契约，
**它们消费本契约的值定义，本契约不另造一份平行模型**。
**这不是把义务省掉**：本契约触发的义务是**正反实例校验、组合约束的边界测试、静态检查与规范场景**，逐条登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#十已知缺口)任一项被裁决后，凡改变本契约语义或表示的，都出后继版本，**推荐版本不自动升级消费者**。
接受状态、冻结记录与执行结果都在本版本目录之外维护。


## 十三、未处分完整结果也进入原账

### S-40 同一 ResponseId 的 ready 与 final

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

本版candidate依据PF-013 rev17、PF-012 rev21、PF-015 rev20。流已经真实收尾、完整真实usage/cost已由结果事实marker发布时，必须计入原Run/Session，即使永远无人处分。未收尾且无已发布结果的原规则不变，不能凭正在流出的token估造一份账。

先按会话+ResponseId选择唯一原事实：同一合法当前前缀中final已确认则取final；否则ready已确认则取ready引用的完整原usage/cost；两者都没有则按原在途/恢复义务解释，不能把源缺席当零或从记录集合忽略该已知发出。ready存在但payload不可得/不能验证时总账读面明确unavailable，不能跳过它后仍返回成功总账。

这项选择属于实际日志/成本读面，先于S-22有效费用及S-23汇总。现有纯summarize消费的是显式已选唯一账值，签名不必新增持久查询能力；纯函数不能承担取得marker或授权。物理存了ready和final不意味着两笔费用。两次不同ResponseId的实际发出仍分别计费，不按CallKey把重试合并。

### S-41 原归属、镜像与补账

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

S-10的model_call费用项仍指同一次实际模型响应事实，source/model_response及ResponseId的形状不变。ready阶段已发布的原账可作该原ResponseId的费用来源，后续final接替不重复加一次镜像。S-16/S-17的补账目标不变：仍会话+原ResponseId，同目标最新有效补账应用一次；不得为ready另立账身份或另一补账目标。

S-25原tenant/session/run/attempt/initiator归属由原承载壳给，ready与final壳必须相等；新Run查询不迁账。S-39合法迟到账仍归原请求，final的late只说明实际final提交时点；ready无late不是未迟到断言。Usage与Cost数字/来源保持原事实，未知仍为unknown，不以估算、目录价格或缺记录填0。

### S-42 成本读面组合的九项义务

本版增加S-43合法ACK小账见证来源；同ResponseId的选择与原值一致性按S-43，未ACK维持本条原义。

不是新增通用账务服务；这是把日志事实交给现有纯S-22/S-23前的组合责任。

| # | 承诺 |
|---|---|
| ① | 显式已授权Session/Run范围、同一当前来源前缀、已知发出、ready/final引用和补账 |
| ② | 当前读取授权；来源完整且归属核实，不以调用方换Run迁移 |
| ③ | 禁止同ResponseId双加、unknown当0、源缺席静默略过 |
| ④ | 只读，无提交；S-40先选唯一值，再原有效费用与汇总，不回写账 |
| ⑤ | 原S-23已知之和与未知笔数；ready/final接替不改变原值，补账按原关系解释 |
| ⑥ | 坏表示沿S-27；来源或授权不可判由组合调用方unavailable，不创造账内失败枚举 |
| ⑦ | 同前缀重复同结果；新final只接替同次ready，不新增一笔 |
| ⑧ | 缺源明确失败；实际合法unknown记未知笔数，两者不可互换 |
| ⑨ | 无业务事件；诊断所选来源阶段和ResponseId，脱敏且不交模型上下文 |

MR11/MS8只是这些原事实的拥有者说明，按既有防互引规则不反登CA→MR/MS依赖；本契约不复制其payload。结构schema除版本身份外沿CA2，新增性质须由跨记录模型/真实读面验证。

| 缺口 | owner | 影响 |
|---|---|---|
| G-13 ready/final完整来源和唯一选择的实际组合 | runtime/成本读面owner | 未开始真实验证；纯sum绿不证明总账收全 |

报给主线：ready计账与final接替为brief裁定；保留纯sum签名并在实际读面先选择是主线澄清。未升级完整ToolRuntime或Run实现，未自我接受。

## 十六、ACK最小原账见证

### S-43 final、ACK见证与ready的唯一来源

S-10/S-18/S-19/S-22～S-25/S-40～S-42按同一个ResponseId的原账身份选择唯一来源：合法可独立读取final优先，其次合法ACK中的原ready账见证，其次可验证ready。合法ACK见证由MS8 S-57定义性引用拥有，MS8以本契约Usage/Cost定义取形，不反向登记CA→MS/MR造成环。ACK不是新的成本项、费用镜像或补账；witness的Usage/Cost是原上游事实，**不是已经应用补账的有效汇总**。

同时存在的原来源必须逐值一致：ResponseId/call/dispatch及原tenant/session/run/attempt、outcome、usage/cost、credentialScope/provider和已知upstreamRequestId/时序都对原事实核验；源损坏不可用优先级遮蔽。原完整大payload经合法ACK释放后，不再要求读取它以核已验证见证，否则清理会使账永久不可读；其他仍在权威日志里的必要小锚点继续核。没有合法ACK而来源缺失/坏仍明确失败，不当零或空账。

final可在ACK前后或交错提交；它只取代所选原账来源，不再加一次。ACK保存的pending观察不是永久处分状态。无回复或ended目标不造ready见证；先前每个failed dispatch自己的final不删除、不按CallKey合一笔。补账目标、同一事实去重、有效费用及unknown算法不变，未知不能填零；后来的真实补账仍归原ResponseId/原Run/Session。可以继续将已选唯一账输入交原纯summarize，不扩通用账务系统。

G-14：真实读面在ready→ACK见证→final与迟到补账之间的来源核验和至多计一次，owner为成本读面/日志/模型运行时；未开始。报给主线：不新增费用形状或记账身份，只扩原账来源。

本版新增规范工件还包括同目录 ACK 正反实例、consumer-impact.md、verification.md 与 source-alignment.md；数据包Schema及MS8语义摘要向量、RT12 ACK行为模型按registry逐资源列出。前驱继承模型/实例只保留原范围，不冒充新ACK证据。
