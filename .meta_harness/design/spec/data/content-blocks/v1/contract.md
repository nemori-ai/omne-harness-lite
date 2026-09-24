# data.content-blocks v1

> 候选规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.content-blocks, 1)`——
  `family = data`、`topic = content-blocks`、规范路径 `spec/data/content-blocks/v1/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：`candidate`——语义可被审阅；接受、采用与冻结均未由有权者闭合，不得据此发布或声称消费者已采用
- **设计依据**：见[下一节](#设计依据)。产品依据以 **PF-009 rev 7、PF-010 rev 5、PF-013 rev 8、PF-006 rev 19、PF-002 rev 16、PF-001 rev 16、PF-012 rev 10** 为准（PF-006 由 rev 17 对到 rev 19：2026-09-24 按它 changelog 的 rev 18、rev 19 两节逐条核过本契约条款，**语义无影响**；rev 18 补的产品正文让几处原先只有主线裁定的依据有了产品行，已在设计依据表对上；PF-006 rev 18–19 本身待产品负责人确认）
- **精确语义依赖**：`omne-harness-lite-design-2026-09-15 · data.identity-values · v1` 的两条——
  [`#S-31` 不透明标识的交换表示](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示)（`BlockId`、`CallId` 与 `AttachmentRef` 的 `storage`／`key` 按它的散文表示；Schema **不** `$ref` 它的 `OpaqueIdentifier`——那一项自述不单独被引用，主线 2026-09-23 裁定各契约按散文自写形状）、
  [`#S-34` 语义身份与实现地址分开](../../identity-values/v1/contract.md#s-34-语义身份与实现地址分开)（[S-21](#s-21-attachmentref)、[S-23](#s-23-块不携带租户身份) 据它写出「引用是地址不是资格」）。
  **不依赖 `data.offer-expiry`**：块上本版没有时间点
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.content-blocks/v1#S-13`。
  本文引另一份契约的条款一律带坐标，**`S-31` 这类裸号只指本契约**

## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 七类块；块是载体，不是模态；视频装在文件块里 | [PF-009 §4 消息的内容是一串块](../../../../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本) | S-1、S-11 |
| 两个标注：互不决定、四种组合、在块上不在消息上、只说取不取 | [PF-009 §4 每个块带两个标注](../../../../product/PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗) · [§6.11](../../../../product/PF-009-context-message-types/design.md#611-每个块都带给人看--给模型看两个标注) | S-4 |
| 块上两位由产生者在落盘那一刻写、之后不动；压缩另带名单、不翻这一位 | [PF-010 §5.7 那两个标注仍然是这件事的前提](../../../../product/PF-010-context-management-and-assembly/design.md#那两个标注仍然是这件事的前提) | S-4、S-22 |
| 成分必须明确标了给模型读才给；标注缺失、不明一律不给 | [PF-010 要求二](../../../../product/PF-010-context-management-and-assembly/design.md#要求二成分必须是明确标了给模型读的) · [§6.2](../../../../product/PF-010-context-management-and-assembly/design.md#62-没有明确标了给模型读的不进模型那一份) | S-4、S-5、S-26 |
| 半截的工具调用：记下来、两边都不给；参数收齐之后才解析、只解析一次 | [PF-009 §5.6 半截的工具调用](../../../../product/PF-009-context-message-types/design.md#半截的工具调用记下来但不给模型看) · [工具调用的参数收齐了才算数](../../../../product/PF-009-context-message-types/design.md#工具调用的参数收齐了才算数) · [§6.10](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行) | S-12、S-13 |
| 内容是块，不在进日志时压成文本；转换件的产出挂原块、原块不动 | [PF-009 §6.6](../../../../product/PF-009-context-message-types/design.md#66-内容是块不在进日志时压成文本) | S-19 |
| 模态恰四种；块的模态由媒体类型定；思考与工具调用是文本的用途；四种之外的文件只是一个引用 | [PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态) | S-6、S-7、S-10、S-11 |
| 转换件：输入非文本模态的块或文件块；输出别的模态的块（不能是文件块）外加 transcript；挂原块、落盘前写好之后不变；交不出 transcript 即失败；本版不是资产 | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件) · [§5.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面) | S-19、S-20 |
| 六种收场，全都以正常的工具返回消息到达、语义写在消息里 | [PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种) | S-15、S-17 |
| 占位一律说清原因；原因是取值、落在转后台／被中断／失败三格 | [PF-006 §6.7 占位消息一律要说清原因](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因) · [§6.12 停机之后它不重来](../../../../product/PF-006-tools-and-skills/design.md#停机之后它不重来) · [它的宿主是谁](../../../../product/PF-006-tools-and-skills/design.md#它的宿主是谁决定了什么会带走它) | S-18 |
| 工具的产出：进消息的部分、附件；卸载后原始结果存在外面 | [PF-006 §4 工具的产出](../../../../product/PF-006-tools-and-skills/design.md#工具的产出) · [卸载](../../../../product/PF-006-tools-and-skills/design.md#卸载) | S-11、S-15、S-21 |
| ② 型斜杠命令：skill 正文逐字成一块、人附带的参数另成一块 | [PF-002 §4 Slash Command](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command) | S-8 |
| 资产身份是「类别 ＋ name」；八类 | [PF-002 §4 身份是类别＋name](../../../../product/PF-002-assets-settings-and-permissions/design.md#身份是类别--name其余归实现) · [PF-001 §4 范围化对象](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#范围化对象) | S-20 |
| 会话日志只增不改，是唯一真相来源 | [PF-012 §4 会话日志](../../../../product/PF-012-agent-loop-and-run/design.md#会话日志) · [§5.2](../../../../product/PF-012-agent-loop-and-run/design.md#52-会话日志是唯一的真相来源) | S-14、S-22 |
| 数据契约自研；块身份与嵌套寻址、供应商回放数据的位置留给数据契约起草 | [D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) | S-3、S-9 |
| 文本块带来源标记（Q1）；思考块带上游原样的不透明数据（Q2） | [D-038 十九处分岔](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) | S-8、S-9 |
| **主线裁定 2026-09-23，待产品负责人确认**：占位原因补 `backgrounded_at_start`、`run_cancelled`、`terminated_by_agent` 三行；参数收齐却解析不了的调用保留原文、标 `unparseable`、不执行、结果记 `failed` 回给模型；来源标记补 `slash_command_expansion`、`slash_command_record`（斜杠命令留痕不是第八类块）；派生表示本版恒由系统产出；只给了引用的附件按媒体类型落块；执行帧块由帧入口编号；桥换代时在途的调用落 `abnormal_interruption` | 主线在任务区账本里的推导（D-038 明言不含这些），**设计链里尚无决定记录**——见 [G-8](#八已知缺口) | S-3、S-8、S-12、S-18、S-20、S-34 |
| 占位原因「前台超时」：前台上限到点而工具不许转后台，被中断；**取值名 `foreground_timeout` 由主线 2026-09-24 定** | [PF-006 rev 18 §6.7 占位消息一律要说清原因](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因)「前台超时」一行 · [§6.6 前台上限与并发上限](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限) | S-18 |
| 参数说完了却解析不了的调用：不执行，结果记失败、原因写明解析不了，回给 agent；与流断在半路的半截调用分开 | [PF-006 rev 18 §5.5「参数说完了却解析不了的调用」](../../../../product/PF-006-tools-and-skills/design.md#参数说完了却解析不了的调用不执行以失败回给-agent) | S-12 |
| 占位原因补齐：「发起时就在后台」「运行被取消」进 §6.7 的表；「被 agent 停掉」写在后台收场的提醒里、不在占位上 | [PF-006 rev 18 §6.7](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因) | S-18 |
| 规格形式；部署边界；租户隔离 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) · [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 见下方引文 |
| 统一语言正式名 | [记录与上下文](../../../../ubiquitous_language/terms/record-and-context.md) · [执行与收场](../../../../ubiquitous_language/terms/execution-and-outcome.md) · [能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) | 全部英文名 |
| 内容块在消息内可被单独指到；存储未定义 | [domain_objects 内容块](../../../../domain_objects/objects.md#ul-content-block--内容块) · [待裁：存储](../../../../domain_objects/pending.md#存储) | S-3、G-1 |

> **没有产品行、或产品行不足以单独支撑的条款，逐条点名：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-7](#s-7-媒体类型的规范形式)、[S-24](#s-24-规范表示)～[S-27](#s-27-表示层拒绝不是判定也不修补) | **SYS-SPEC**：规范表示、闭合枚举、表示层拒绝值与「表示层不等于判定」是规格形式的要求，产品正文不承诺这一层 |
> | [S-3](#s-3-blockid) 的唯一范围、[S-5](#s-5-嵌套的块按合取取用)、[S-14](#s-14-callid) 的唯一范围 | **规格层推导**：D-035 把「块身份与嵌套寻址」留给数据契约；依据分别写在各条正文里 |
> | [S-8](#s-8-文本块与来源标记) 的 `origin`、[S-9](#s-9-思考块与不透明数据) 的 `opaque` | 产品负责人 2026-09-23 对内容块形状的两项裁决，落在 [D-038 Q1、Q2](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔)。**`origin` 的取值集合不来自 D-038**：那里的「含义」列写的是「模型 / 用户 / 工具 / 系统」，本契约的四个取值都是斜杠命令相关的来路（前两个随起草简报、后两个随主线裁定），两处对不上，已报主线 |
> | [S-16](#s-16-结果里不发起调用) | **无产品出处**：起草简报里的裁定（结果里不发起调用），理由写在条款正文。产品正文只说工具结果「自己又是一串块」，没说里面不许有什么 |
> | [S-12](#s-12-完整的工具调用) 的 `unparseable` 一种、[S-18](#s-18-占位原因与它落在哪一格) 的 `backgrounded_at_start`、`run_cancelled`、`terminated_by_agent` 三个取值、[S-8](#s-8-文本块与来源标记) 的后两个来路、[S-20](#s-20-派生表示的产出者与能力标识) 的「恒为 `system`」、[S-34](#s-34-只给了引用的附件落成哪一类块) | **主线裁定 2026-09-23，待产品负责人确认**（设计依据表里「主线裁定 2026-09-23」那一行）；各条的产品前提写在条款正文里。**其中 S-12 的 `unparseable` 与 S-18 的三个取值，PF-006 rev 18 已补了产品正文**（设计依据表「参数说完了却解析不了」「占位原因补齐」两行）——形状与取值名仍是主线裁定 |
> | [S-23](#s-23-块不携带租户身份) | **SYS-TENANT** 加 `data.identity-values/v1#S-34` |
> | [第四节](#四装配给与协议给) | **SYS-DEPLOY** |

## 一、目的与消费者

### 这份契约拥有什么

**内容块的含义与形状**：一条消息装的那串块里，每一块是什么、带什么、怎么指认、哪些组合非法。
具体是：七类块与它们的八个形状、块底座、两个标注、块的模态怎么判、工具调用与工具结果块、
执行收场与占位原因的取值、派生表示与 transcript、`AttachmentRef` 与能力标识的形状，
以及一个值不合形状时的**表示层拒绝值**。

它是一份**数据契约**：没有操作、没有提交点、没有状态转移，**因此不需要插件**。
它被消息、到达事件、流装配、工具运行时、模型请求运行时与上下文组装共享，写两遍必然分叉，
所以它先定型，其余契约**引用它的 `$defs` 名与成员名，不复述定义**。

**它不拥有**：消息有哪几种与各自的成员（`data.messages`）；块怎样一段段到达、怎样封口（`data.arrival-events`、`capability.stream-assembly`）；
压缩的点名名单与「此刻模型可读」的计算（`data.messages` 与 PF-010）；模态投影与转换件的调度（PF-013）；
组装时取哪一份表示（PF-010）；存储本身（[G-1](#八已知缺口)）。逐条见[第九节](#九明确不承诺)。

### 消费者

| 消费者 | 消费什么 |
|---|---|
| [`data.messages`](../../messages/README.md) v1 | 全部块定义；尤其 [S-3](#s-3-blockid)（`(messageId, id)` 指认一个块，含嵌套）、[S-5](#s-5-嵌套的块按合取取用)、[S-14](#s-14-callid)（同一个 `CallId` 可落在不止一个工具结果块上）、[S-22](#s-22-落盘之后整块不变) |
| [`data.arrival-events`](../../arrival-events/README.md) v1 | 封口交出的就是一个 `ContentBlock`；[S-10](#s-10-语音块与图块) 的内联／引用两种可判别形状（「帧里的媒体块只许引用」是它的规则）；[S-3](#s-3-blockid) 的帧入口编号 |
| [`capability.stream-assembly`](../../../capabilities/stream-assembly/README.md) v1 | [S-12](#s-12-完整的工具调用)／[S-13](#s-13-半截的工具调用)：收齐才解析、解析不了只标记、半截调用的形状与标注；[S-26](#s-26-表示层拒绝值) 的拒绝值 |
| [`data.call-accounts`](../../call-accounts/README.md) v1 | `$defs/CallId`（[S-14](#s-14-callid)） |
| [`data.model-response`](../../model-response/README.md) v1 | `ContentBlock`（已交付而不成消息的部分）、`AttachmentRef`（原始响应留存） |
| [`data.tool-definition`](../../tool-definition/README.md) v1、[`data.model-profile`](../../model-profile/README.md) v1 | `Modality`、`MediaType`、`CapabilityId`、`InlineBytes`、`AttachmentRef`、`ContentBlock`（工具的模态声明与结果形状、档案的输入输出模态） |
| [`data.asset-model`](../../asset-model/README.md) v1 及各类正文契约（`data.skill-package`、`data.slash-command`、`data.connector`、`data.mcp-endpoint`、`data.loop-extension`） | `CapabilityId`（[S-20](#s-20-派生表示的产出者与能力标识)）、`MediaType`、`AttachmentRef`；来源标记（[S-8](#s-8-文本块与来源标记)）与附件落块（[S-34](#s-34-只给了引用的附件落成哪一类块)） |
| [`capability.tool-execution-runtime`](../../../capabilities/tool-execution-runtime/README.md) v1 | 工具返回的内容落成 [S-15](#s-15-工具结果块) 的 `blocks`；[S-16](#s-16-结果里不发起调用)～[S-18](#s-18-占位原因与它落在哪一格)；`offloaded`（[S-21](#s-21-attachmentref)）；执行帧里的块 |
| [`capability.model-request-runtime`](../../../capabilities/model-request-runtime/README.md) v1 与传输适配 | 回复里的块；[S-9](#s-9-思考块与不透明数据) 的 `opaque`；[S-6](#s-6-模态由媒体类型判定) 与 [S-10](#s-10-语音块与图块) |
| [`capability.modality-projection`](../../../capabilities/modality-projection/README.md) v1 | [S-6](#s-6-模态由媒体类型判定)、[S-19](#s-19-派生表示与-transcript)、[S-20](#s-20-派生表示的产出者与能力标识) |
| PF-010 上下文组装（无契约） | [S-4](#s-4-两个标注)、[S-5](#s-5-嵌套的块按合取取用)、[S-13](#s-13-半截的工具调用)、[S-19](#s-19-派生表示与-transcript) |

> 上表没有一行是本契约的依赖：方向一律是消费者 → 本契约，登记在各消费者自己的 catalog 条目里（**消费 clauses 以 catalog 为准，本表只作索引**）。

## 二、含义与使用范围

**适用范围**：一个部署之内，块出现在哪里都一样——消息的块序列、工具结果块的 `blocks`、派生表示的 `blocks`、
执行帧与到达事件交出的块。本版完整交付是单机，但每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论在单机由装配给出、分布式后必须由协议重新兑现，列在[第四节](#四装配给与协议给)。

### 规格层 token 与词条的对应

交换表示用 token，对外文档用词条名，**两者不得互相替代**。

| 规格层 token | 词条 |
|---|---|
| `ContentBlock` | [内容块 · Content Block](../../../../ubiquitous_language/terms/record-and-context.md#ul-content-block--内容块--content-block) |
| `kind`: `text` · `thinking` · `voice` · `image` · `file` · `tool_call` · `tool_result` | 内容块词条列的七类：文本 · 思考 · 语音 · 图 · 文件 · 工具调用 · 工具结果 |
| `Visibility`：`toHuman` · `toModel` | [块标注 · Block Annotation](../../../../ubiquitous_language/terms/record-and-context.md#ul-block-annotation--块标注--block-annotation)：给人看 · 给模型看 |
| `Modality`：`text` · `image` · `audio` · `video` | [模态 · Modality](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality)：文本 · 图 · **语音** · 视频。**`audio` 这个 token 对应的是词条的「语音 Voice」**——取媒体类型那一段的名字，与 [S-6](#s-6-模态由媒体类型判定) 的判定式同形 |
| `renderings` · `DerivedRendering` | [派生表示 · Derived Rendering](../../../../ubiquitous_language/terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering) |
| `transcript` | [transcript](../../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript) |
| `ExecutionOutcome` | [执行收场 · Execution Outcome](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)，六个 token 的对应在 [S-17](#s-17-六种收场) |
| `CapabilityId` | [能力标识 · Capability Identifier](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier) |
| `offloaded` 指向的那一份 | [被卸载的原始结果 · Offloaded Result](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-offloaded-result--被卸载的原始结果--offloaded-result) |
| `FileBlock.attachment` 指向的那一份 | [附件 · Attachment](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment)（工具产出的附件；也可以是别处存进存储、以文件块引用的一份，见下） |

**下列是规格层的名字，不是统一语言词条**，因此本契约与 Schema 里**不给它们「中文 · English」那种词条式标题**：
`BlockId`、`CallId`、`BlockBase`、`MediaType`（媒体类型）、`AttachmentRef`（**无词条**）、`InlineBytes`（内联字节的 base64 串）、
`PlaceholderReason`（占位原因，取值对应 PF-006 §6.7 那张表的行）、`origin`（来源标记）、
`IncompleteToolCallBlock`（没长完的工具调用，[增量到达词条](../../../../ubiquitous_language/terms/record-and-context.md#ul-incremental-arrival--增量到达--incremental-arrival)的注意 ① 说的就是它，本身无词条）。

> **`AttachmentRef` 的所指比「附件」宽。**它指向存储里的一份字节——可以是工具产出的[附件](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-attachment--附件--attachment)，
> 可以是[被卸载的原始结果](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-offloaded-result--被卸载的原始结果--offloaded-result)（词条明说它**不是**附件），
> 也可以是一段语音、一张图以引用形状存着的那份字节。**「存储里的一份字节」这个概念没有词条**；
> 本契约只用 `AttachmentRef` 这个结构名，不给它下产品定义。

### 与相近概念的差异

- **块 ≠ 消息。**消息有七种、按谁在说话分，归 `data.messages`；块是消息的内容。**标注在块上，不在消息上。**
- **块的类型 ≠ 模态。**七类块是载体，四种模态是内容的形态；思考与工具调用是文本的用途。
  块上**不存**模态——存一份就会与媒体类型对不上（[S-6](#s-6-模态由媒体类型判定)）。
- **派生表示 ≠ 块序列里的块。**它挂在原块上，不另立对象，也不改变原块（[S-19](#s-19-派生表示与-transcript)）。
- **派生表示 ≠ 卸载的占位。**占位替换了原件，原件离开了消息；派生表示与原件并存。
- **半截的工具调用 ≠ 半条消息。**一条完整的消息可以装着一个没长完的块；「半条消息不是消息」归 `data.messages` 与到达语法。
- **块 ≠ 在途状态。**拼到一半、还没封口的东西[不是块也不进日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)；本契约只说封口之后的块。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `ContentBlock` | 七类块之一，八个形状恰合其一 | [S-1](#s-1-七类块) |
| `BlockBase` | 每类块共有的成员 | [S-2](#s-2-块底座) |
| `BlockId` | 块在一条消息里的标识 | [S-3](#s-3-blockid) |
| `Visibility` | 两个标注 | [S-4](#s-4-两个标注)、[S-5](#s-5-嵌套的块按合取取用) |
| `Modality`、`MediaType` | 模态与媒体类型 | [S-6](#s-6-模态由媒体类型判定)、[S-7](#s-7-媒体类型的规范形式) |
| `TextBlock` … `ToolResultBlock` | 各类块 | [S-8](#s-8-文本块与来源标记)～[S-16](#s-16-结果里不发起调用) |
| `CallId` | 一次工具调用的标识 | [S-14](#s-14-callid) |
| `ExecutionOutcome`、`PlaceholderReason` | 收场与占位原因 | [S-17](#s-17-六种收场)、[S-18](#s-18-占位原因与它落在哪一格) |
| `DerivedRendering`、`CapabilityId` | 派生表示与它的产出者 | [S-19](#s-19-派生表示与-transcript)、[S-20](#s-20-派生表示的产出者与能力标识) |
| `AttachmentRef` | 存储里一份字节的引用；只给了引用的附件落成哪类块 | [S-21](#s-21-attachmentref)、[S-34](#s-34-只给了引用的附件落成哪一类块) |
| `InlineBytes` | 内联在值里的一份字节的 base64 串 | [S-10](#s-10-语音块与图块) |

### S-1 七类块

**内容块恰七类，按 `kind` 判别：`text`、`thinking`、`voice`、`image`、`file`、`tool_call`、`tool_result`。**
`tool_call` 再按 `complete` 分两个形状（[S-12](#s-12-完整的工具调用)、[S-13](#s-13-半截的工具调用)），所以共八个形状，**每个合法的块恰合其中一个**。

- **视频不另立块。**一段视频装在文件块里，它的模态看媒体类型（[S-11](#s-11-文件块)）。
  `kind: "video"` 不是合法取值——块是按「这是什么东西、怎么到」分的，而一段视频与别的附件一样开个口、整个交出来。
- **`kind` 集合闭合**（[S-25](#s-25-判别式与枚举闭合)）：未知取值是表示层拒绝 `kind_unknown`，**不映射到「最接近」的一类，不当作文本兜底**。
- 一个块在哪里出现不改变它是哪一类：消息的块序列、工具结果块的 `blocks`、派生表示的 `blocks` 里都是同一套定义，
  各处**另有**位置限制——[S-16](#s-16-结果里不发起调用)、[S-19](#s-19-派生表示与-transcript)。

### S-2 块底座

**每一块都带 `id` 与 `visibility`，两者必填；另有两样可选属性 `renderings` 与 `transcript`，只有语音块、图块、文件块可以带。**

| 成员 | 含义 | 条款 |
|---|---|---|
| `id` | 块在一条消息里的标识 | [S-3](#s-3-blockid) |
| `visibility` | 两个标注 | [S-4](#s-4-两个标注) |
| `renderings` | 模态转换件挂上来的派生表示，非空数组 | [S-19](#s-19-派生表示与-transcript) |
| `transcript` | 模态转换件产出的纯文本兜底，非空 | [S-19](#s-19-派生表示与-transcript) |

**`renderings` 与 `transcript` 是原块的属性，不是另外的块。**只有[模态转换件](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-modality-converter--模态转换件--modality-converter)写它们，
而它的输入只有非文本模态的块与文件块——所以文本、思考、工具调用、工具结果四类块**带了即表示非法**（`malformed`）。
工具结果块里嵌着的图块照样可以带：属性挂在那张图上，不挂在工具结果块上。

### S-3 BlockId

**`BlockId` 在一条消息之内唯一；唯一范围是这条消息里出现的全部块——含工具结果块 `blocks` 里任意层的块，与派生表示 `blocks` 里的块。**
会话日志里靠 `(messageId, id)` 指认一个块；`messageId` 的形状与唯一范围归 `data.messages`。

- **相等是逐码点精确相等**，交换表示按 `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` 的
  [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文：非空、首尾不属于那个显式空白码点集合、**消费者不解析它**，
  不从它推断次序、嵌套层级或所属消息。Schema 按那条散文自写形状，不跨契约引用。词法形式本契约不承诺（[G-4](#八已知缺口)）。
- **为什么唯一范围要含嵌套**：[内容块在消息内可被单独指到](../../../../domain_objects/objects.md#ul-content-block--内容块)——压缩名单点的就是 `(messageId, blockId)`。
  嵌套层若各自为政，同一个 `(messageId, id)` 就可能指到两块，**压缩会让错的那一块对模型不可见，而没有任何地方报错**。
  让整棵树共用一个范围，这个指认在任何嵌套下都唯一。**哪些块可以被点名**（嵌套的、派生表示里的能不能单独点）归 `data.messages` 与 PF-010，本条只保证指认不含糊。
- **谁来分配**归 realization；分配的一方要看得见整条消息——派生表示里的块在落盘前补齐，
  **执行帧里的块由工具侧宿主的帧入口编**：工具作者与 MCP 桥经它交帧，它是工具侧唯一看得见整条消息的一处，
  也就是 `data.arrival-events/v1` S-8 所说「生产的一方」在工具侧的那一处（主线裁定 2026-09-23，两处措辞统一为「帧入口」；[第四节](#四装配给与协议给)）。
- 一条消息里 `id` 重复是表示非法（`malformed`）。**它只能在看得见整条消息的边界上查出来**，Schema 管不到；
  那个边界上的拒绝怎样落进消息层的失败集合，归 `data.messages`。

### S-4 两个标注

**`visibility` 是[块标注](../../../../ubiquitous_language/terms/record-and-context.md#ul-block-annotation--块标注--block-annotation)：`toHuman`——组装面向人的那一份时取不取它；`toModel`——组装面向 agent 的那一份时取不取它。
两位都必填，互不决定，四种组合都合法。**

| `toHuman` | `toModel` | 什么东西长这样 |
|---|---|---|
| `true` | `true` | 绝大多数——人说的话、模型的回答、工具的结果 |
| `true` | `false` | 工具执行中的过程 |
| `false` | `true` | 给模型的设定，以及别的「对人没有意义但模型要用」的东西 |
| `false` | `false` | 没长完的工具调用——留在日志里备查，两边的视图都不取（[S-13](#s-13-半截的工具调用) 把它写成了硬约束） |

- **缺一即拒。**`visibility` 缺席，或两位里缺任一位，是表示层拒绝 `visibility_missing`；
  **不补成 `true`、不补成 `false`、不从消息的类型推**。理由是 PF-010 的[成分默认拒绝](../../../../product/PF-010-context-management-and-assembly/design.md#62-没有明确标了给模型读的不进模型那一份)：
  没表过态不等于表了同意——补 `true` 会误给，补 `false` 会让一块本该给的东西静默消失，**两者都没人会报错**。
  一位存在但不是布尔值（含 `null`）是 `malformed`。
- **标注只说取不取，不说长什么样。**怎么呈现、要不要折叠，归组装那一侧。
- **由产生这个块的一方在落盘那一刻写下，此后不改**（[S-22](#s-22-落盘之后整块不变)）。
  「此刻还给不给模型看」是**算出来的**——`toModel` 为真，且没被排在它前面的任何[压缩记录](../../../../ubiquitous_language/terms/record-and-context.md#ul-compaction-record--压缩记录--compaction-record)点名；
  那一半的计算归 `data.messages` 与 PF-010，**本契约的块上没有一格存它**。

### S-5 嵌套的块按合取取用

**一个嵌在别的块里的块（工具结果块的 `blocks` 里、派生表示的 `blocks` 里），进某一侧的组装，当且仅当它的容器块进那一侧、并且它自己那一位为真。**

这是标注定义加上「容器」这层关系的直接后果：容器没被取，里面的东西无从被取；
容器被取了，里面某块自己标着不给，按[成分默认拒绝](../../../../product/PF-010-context-management-and-assembly/design.md#要求二成分必须是明确标了给模型读的)就不给——
**标注只会往「不给」那边收，不会被容器放宽**。

- 对派生表示，「容器块进那一侧」指**原块**进那一侧；进了之后取原件、取哪一份派生表示、还是取 transcript，归 PF-010。
  派生表示里的块可以只标给模型（`{ toHuman: false, toModel: true }`）：人那一侧看原件，模型收不下原件时读它。
- 压缩点名一个容器块时，它里面的块随之对模型不可见；**能不能单独点名里面的块**归 `data.messages` 与 PF-010（[S-3](#s-3-blockid)）。

### S-6 模态由媒体类型判定

**块的[模态](../../../../ubiquitous_language/terms/record-and-context.md#ul-modality--模态--modality)不存在块上，由块的类型与媒体类型按下式算出：**

```text
modality(block) ≝
  text · thinking · tool_call（两种形状）  → text
  voice                                    → audio            （其媒体类型的 type 必为 audio，S-10）
  image                                    → image            （其媒体类型的 type 必为 image，S-10）
  file                                     → modalityOf(attachment.mediaType)
  tool_result                              → 无——它是容器，blocks 里的块各有各的模态

modalityOf(mediaType) ≝   按 mediaType 在第一个 "/" 之前的那一段 t：
  t = "text"   → text
  t = "image"  → image
  t = "audio"  → audio
  t = "video"  → video
  其余         → 无——这个块只是一个引用，任何模型都读得了
```

- **判定是全函数**：`mediaType` 必填且只有一种规范形式（[S-7](#s-7-媒体类型的规范形式)），所以**不存在「判不出」**；
  「无模态」是一个判出来的结果，**不是第五个取值**，在需要 `Modality` 的地方不得写成 `null`、`"none"` 或空串。
- **思考与工具调用是文本的用途，不是形态**，所以算作 `text`。
- **参数不参与判定**：`audio/pcm;rate=24000` 与 `audio/pcm` 同是 `audio`。
- 块上出现一个名为 `modality` 的成员是 `malformed`——**存一份就会与媒体类型对不上，而下游不知道该信哪一份**。
- 派生表示里的块各自按本式有模态；「哪几种模态只有原件、没有 transcript」（模态投影）归 PF-013，它以本式与 [S-19](#s-19-派生表示与-transcript) 为输入。

### S-7 媒体类型的规范形式

**`MediaType` 是媒体类型的规范写法：小写的 `type/subtype`，其后可带若干 `;name=value` 参数。**

- `type` 与 `subtype` 各取 [RFC 6838](https://www.rfc-editor.org/rfc/rfc6838#section-4.2) restricted-name 的字符集，**只许小写**；
- 参数写成紧挨着的 `;name=value`：`name` 小写、`value` 是一个 token（RFC 9110 的 tchar 字符集，大小写保留），**不带空白、不带引号串**；
- 参数原样携带，**本契约不解释它们**，它们也不影响模态（[S-6](#s-6-模态由媒体类型判定)）；
- 需要相等时按**整串逐字**比较。

**为什么只许一种写法**：媒体类型的 type 与 subtype 在 RFC 里大小写不敏感，交给各实现各自折叠，
`TEXT/plain` 就会在一处算文本、在另一处算「无模态」——**同一个块在两个实现里挡不挡模型，结论相反**。
所以规范化由**产生者**在写入之前做，接收方见到非规范写法按 `malformed` 拒绝、**不替它改写**（[S-27](#s-27-表示层拒绝不是判定也不修补)）。
带引号串与空白同理：它们让同一个值有多种写法。

### S-8 文本块与来源标记

**文本块：`text` 是给人和模型看的一段话，可以是空串。**

`origin` 是可选的**来源标记**，陈述这块文本从哪条路来。本版恰四种：

| `origin.kind` | 这块是什么 |
|---|---|
| `slash_command_args` | 人敲[斜杠命令](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)时附带的参数 |
| `skill_body` | [② 型斜杠命令](../../../../product/PF-002-assets-settings-and-permissions/design.md#slash-command)展开的那个 [skill](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-skill--技能--skill) 的正文，**逐字** |
| `slash_command_expansion` | ① 型（提示词型）斜杠命令展开模板得到的那段文字（`data.slash-command/v1` S-21 的展开物） |
| `slash_command_record` | 一次 ①／② 型斜杠命令的**留痕**：`text` 是人敲下的那段原文，**逐字**（`data.slash-command/v1` S-25）。它与同一条消息里来路为前三种、`command` 相同的那几块一起，装下「原命令与展开后的全文」 |

`command` 是那条斜杠命令的名字，`skill` 是那个 skill 的名字；**两个都可选，给不给、给哪个不随 `origin.kind` 限定**。

- **来路是一个属性，不是另一类块。**本版不为它另立第八类——斜杠命令的留痕也是一块带来源标记的文本块（主线裁定 2026-09-23，待产品负责人确认）。
- 留痕块与展开物的**标注**由写下它们的受理一方定，本契约只要求两位都在（[S-4](#s-4-两个标注)）。
- **它只陈述出处，不授予任何资格**：带着 `skill_body` 不代表那份 skill 的使用权限已判过（那一道判定归 PF-002 的「谁可以使用它」），
  也**不改变这块的标注**。
- **缺席不作任何断言**：没有 `origin` 的文本块不表示「一定是人亲手打的」。
- `origin.kind` 集合闭合；`command`、`skill` 给出时非空。它们的词法归命令名与能力标识名各自的家（`data.slash-command/v1` 的命令名、`data.asset-model/v1` S-2）；
  **本契约只约束到非空、不据那两处写判定**——那两份契约都引用本契约，反向引用会成环（[G-5](#八已知缺口) 已据此闭合）。

### S-9 思考块与不透明数据

**思考块：`text` 是模型的推理过程，与它给人看的话分开；可以是空串（上游只给了不透明数据的情形）。**

`opaque` 可选，是一个任意 JSON 值（含 `null`），承载**上游要求原样带回**的那份数据。三条：

1. **不透明**：它的内部形状归传输适配层；**只有传输适配层写它、读它**。
2. **不解释**：其余每一层——装配、日志、组装、呈现——**不读它、不据它分支、不改写它**。
3. **原样回传**：一经落盘，它随这个块原样保存；传输适配层需要时原样带回去。
   「原样」指**同一个 JSON 值**：数值在任何一跳都不得丢精度，缺席与 `null` 各自保留、不互相转换。

它给了 [D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) 留下的「供应商回放数据放在哪」一个位置：**放在那个思考块上**。
把它带给哪一家、换了模型带不带，**是它唯一的读者——传输适配层——的事**，本契约不定。

### S-10 语音块与图块

**语音块与图块各带必填的 `mediaType`，它的 type 必须分别是 `audio` 与 `image`；`data` 恰为两种可判别形状之一。**

| `data` 的形状 | 长什么样 | 约束 |
|---|---|---|
| **内联** | `{ "inline": <InlineBytes> }` | 标准字母表（RFC 4648 §4）、带填充、**非空**、不含换行与空白 |
| **引用** | 一个 [`AttachmentRef`](#s-21-attachmentref) | 它的 `mediaType` 的 type 同样必须是 `audio`／`image`，**且与块的 `mediaType` 逐字相同** |

- **模态不对是表示层拒绝 `modality_mismatch`**：语音块或图块上出现的任一个媒体类型（块自己的、引用里的）合乎规范形式、type 却不对。
  写法本身不规范（例如 `Image/PNG`）不判模态，只算 `malformed`——它还没到能判模态的那一步。
  **不从字节嗅探、不按扩展名改判、不把它改归文件块。**
- **两处媒体类型模态一致但不逐字相同**（例如块写 `image/png`、引用里写 `image/jpeg`）是 `malformed`：
  一个块只能有一个媒体类型，**两份说法下游不知道该信哪一份**。这一条 Schema 管不到，由接收边界的校验兑现。
- 两种形状**可判别**，所以「执行帧里的媒体块只许引用」这条 `data.arrival-events` 的规则能在形状上判；**那条规则本身不在这里**。
- **内联那一串的编码规则是一个共用定义 `InlineBytes`**（base64 串本身）：语音块与图块的 `inline` 取它；别的契约需要在值里内联一份字节（例如工具卸载的内联原始结果）时，**承载它的成员引用它，不另写一份编码规则**。
  它不带媒体类型——媒体类型由承载它的那一处给出。
- 语音块在本版就是一种普通的块（[PF-009 §5.9](../../../../product/PF-009-context-message-types/design.md#本版的语音是普通的输入与输出不是全双工)），不带播放进度。

### S-11 文件块

**文件块：`attachment` 是一个 [`AttachmentRef`](#s-21-attachmentref)，必填。它是引用，不是内容。**

- 块的模态看 `attachment.mediaType`（[S-6](#s-6-模态由媒体类型判定)）：视频就是视频模态，一份 PDF 就**没有模态**、只是一个引用。
- **视频没有自己的块类型，装在这里**；文件块不因装着视频就变成另一类块。
- 文件块可以带派生表示与 transcript（转换件按模态或媒体类型登记）。

### S-12 完整的工具调用

**`complete: true` 的工具调用块记下一次参数已经收齐的调用：`callId`、`tool` 必填；参数恰为下面两种之一。**

| 成员 | 含义 |
|---|---|
| `callId` | 这次调用的标识（[S-14](#s-14-callid)） |
| `tool` | 模型面那个工具条目的 name，非空；多命令工具的子命令在参数里，不在这里 |
| **解析成功**：`arguments` | **参数收齐之后解析一次得到的 JSON 值**，任意类型（含 `null`）；不带 `rawArguments`、不带 `unparseable` |
| **解析不了**：`rawArguments` ＋ `unparseable: true` | 收齐的那段原始参数串，原样；**两者同现**，不带 `arguments` |

- **只解析一次，收齐之后、动手之前**；那个解析点归 `capability.stream-assembly`（它在封口那一下解析）。
  拿到解析成功那一种的一方**直接用 `arguments`**，不从任何文本重新解析。
- **解析不了的那一种是一次已登记的调用**（主线裁定 2026-09-23，待产品负责人确认）：它收齐了，`callId` 进 [S-14](#s-14-callid) 的唯一范围；
  **它不被执行**——没有可用的参数，猜一个去执行就是放行；**由宿主紧接一条收场为 `failed` 的结果块回给模型**，让模型看得到自己那次调用读不懂、改了再发。
  **任何一方都不再解析它的 `rawArguments`**：那一次解析已经发生、已经失败（「只解析一次」），重解析只会让两个实现得出两种结论。
- **它不是[半截的调用](#s-13-半截的工具调用)**：半截的参数没收齐、两边都不给、不登记；它收齐了、登记了、标注照产生者写的（模型要看得到它，结果才对得上）。
- 形状上：只有 `rawArguments` 没有 `unparseable`、只有 `unparseable` 没有 `rawArguments`、`unparseable` 不是 `true`、`arguments` 与另两者同现——都是 `malformed`。
- 四种标注组合都合法。

### S-13 半截的工具调用

**`complete: false` 的工具调用块记下一次参数没收齐的调用：记下来，但两边都不给看。**

- `rawArguments`：收到的那段原始参数串，**可以是空串**。**任何一方都不解析它**——
  残缺的 JSON 解析出来的东西比解析失败更危险，它可能恰好合法而少了一半字段。
- `callId`、`tool`：收到的原值；**没到就缺席，不补**。
- **`visibility` 必须是 `{ toHuman: false, toModel: false }`**；任一位为真是表示层拒绝 `incomplete_call_visible`。
  给了模型，它会干等或者再发一次；给了人，人看到的是一次从未发生的调用。
- **它不是一次已登记的调用**：它上面的 `callId` 不进 [S-14](#s-14-callid) 的唯一范围，**任何工具结果块都不指向它**。
- 它**留在日志里**，与同一条消息里其余完整的块并存——一条完整的消息可以装着一个没长完的块。

### S-14 CallId

**`CallId` 是一次工具调用的标识：在一份[会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)之内，完整的工具调用块（[S-12](#s-12-完整的工具调用) 的两种都算）上的 `CallId` 两两不同。**

- **相等是逐码点精确相等**，交换表示按 `data.identity-values/v1` 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文；词法形式不承诺（[G-4](#八已知缺口)）。
- **不嵌在别的工具结果块里的工具结果块，它的 `callId` 指回那一个完整的工具调用块。**
  **嵌在别的工具结果块里的那些**，`callId` 记的是那次执行内部发生的一次调用——那次调用从没作为工具调用块出现在这份会话日志里，
  所以它**不进本条的唯一范围，也不指回任何工具调用块**；消费者**不得**拿它去和会话日志里的工具调用块配对。它在本版只作记录。
- **同一个 `CallId` 可以出现在不止一个工具结果块上**：一次转了后台的调用，先有一个占位，后来真实结果以另一条消息到达。
  它们之间的关系（谁是占位、谁是结果、各落在哪种消息里）归 `data.messages`。
- **唯一性由登记这次调用的一方保证**：模型给的 id 可能在一份会话日志里重复，登记的一方不得把一个会撞上的值原样登记。
  怎么做归 realization；分布式后的兑现见[第四节](#四装配给与协议给)。
- 半截调用块上的 `callId` 只是收到的原值，不进本条的唯一范围（[S-13](#s-13-半截的工具调用)）。

### S-15 工具结果块

**工具结果块把一次工具调用的收场带在自己身上。**PF-006 要求[六种收场都以正常的工具返回消息到达、语义写在消息里](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)——语义就写在这个块上。

| 成员 | 必填 | 含义 |
|---|---|---|
| `callId` | 是 | 指回那次调用（[S-14](#s-14-callid)） |
| `outcome` | 是 | 这次收场，六种之一（[S-17](#s-17-六种收场)） |
| `reason` | 视收场 | `{ code, text }`：占位的原因（[S-18](#s-18-占位原因与它落在哪一格)）；`text` 是写给读者的说明，非空 |
| `blocks` | 是 | 进上下文的内容，**它自己又是一串块**；可以是空数组；**次序有意义，原样保留** |
| `offloaded` | 否 | [被卸载的原始结果](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-offloaded-result--被卸载的原始结果--offloaded-result)在哪（[S-21](#s-21-attachmentref)）；此时 `blocks` 就是那条带摘要的占位 |

- **`outcome` 是收场的唯一依据**：读者**不得从 `blocks` 的文字推收场**。
  **`outcome` 缺席是 `malformed`，从不当作 `completed`**——把缺席读成完成，一次被中断的执行就会被 agent 当成跑完了。
- 工具结果块自己不带派生表示与 transcript；它里面的块各自可以带（[S-2](#s-2-块底座)）。
- 嵌套深度不限：`blocks` 里可以再有工具结果块，**但任意一层都不得有工具调用块**（[S-16](#s-16-结果里不发起调用)）。
  嵌套的工具结果块的 `callId` 不指回会话日志里的调用（[S-14](#s-14-callid)）。

### S-16 结果里不发起调用

**工具结果块的 `blocks` 里，任意嵌套层都不得出现工具调用块（两种形状都算）；出现即表示层拒绝 `call_in_result`。**

理由：**结果里不发起调用。**调用只由模型在它的回复里发起；一个嵌在结果里的工具调用块，
在任何一侧的组装里都会被读成「模型发起过的调用」——模型会等一个永远不会来的结果，人会看到一次没人发起过的调用。
工具想让 agent 接着调什么，写成文字或别的块告诉它，由 agent 自己在下一次回复里发起。

### S-17 六种收场

**`ExecutionOutcome` 恰六个取值，闭合**（[执行收场](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)）：

| token | 词条 | agent 该怎么办（取自词条，本契约不改写） |
|---|---|---|
| `completed` | 完成 Completed | 继续 |
| `failed` | 失败 Failed | 重试、换招，或报告 |
| `unavailable` | 不可用 Unavailable | 绕路，别重试 |
| `backgrounded` | 转后台 Moved to Background | 先干别的，跑完了会来通知 |
| `interrupted` | 被中断 Interrupted | 别自动重试 |
| `no_answer` | 等不到应答 No Reply | 按等不到处理，不是失败也不是被拒 |

- **四种「非完成」里只有一种是失败**；未知取值是 `malformed`，**不降级为 `failed`**。
- `backgrounded` 只会是**前台那一次调用**的收场；转后台之后那段执行自己的收场只在 `completed`、`failed`、`interrupted`、`no_answer` 里出。
  **一个块自己看不出它记的是哪一段**，这一条由写入它的一方兑现（落点归 `data.messages`）。

### S-18 占位原因与它落在哪一格

**`reason.code` 取 `PlaceholderReason` 的十二个值之一，每个值只能配它那一格收场。**
前八个对应 [PF-006 §6.7「占位消息一律要说清原因」](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因)那张表的行，落格照那一节的写法；
接着三个是 **主线裁定 2026-09-23（待产品负责人确认）** 补的三行——[§6.12](../../../../product/PF-006-tools-and-skills/design.md#它的宿主是谁决定了什么会带走它) 与[执行收场词条](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-outcome--执行收场--execution-outcome)列了它们的触发源；PF-006 rev 18 已把「发起时就在后台」「运行被取消」补进 §6.7 那张表，「被 agent 停掉」写在表下（落在收场提醒里，见该行）；取值名仍是主线的；
最后一个 `foreground_timeout` 对应 PF-006 rev 18 §6.7 那张表新加的「**前台超时**」一行（触发见 [§6.6「前台上限与并发上限」](../../../../product/PF-006-tools-and-skills/design.md#前台上限与并发上限)），**取值名由主线 2026-09-24 定**：

| `code` | 那张表的哪一行 | 收场 |
|---|---|---|
| `user_interrupted` | 用户手动中断（叫停的是这一次执行） | `interrupted` |
| `backgrounded_auto` | 转后台（自动：前台跑超过声明的时长） | `backgrounded` |
| `backgrounded_by_user` | 转后台（用户手动切） | `backgrounded` |
| `backgrounded_by_preemption` | 因插队转后台 | `backgrounded` |
| `interrupted_by_preemption` | 因插队被中断 | `interrupted` |
| `human_declined` | 人拒绝回复（插队时停在 `Ask()` 上，不可转后台，所以被中断） | `interrupted` |
| `session_archived` | 会话被归档 | `interrupted` |
| `abnormal_interruption` | 工具执行异常中断：据点停过机、恢复时追补；或 MCP 桥换代时这次调用还在途（`capability.mcp-bridge` 的连接随桥走） | `failed`——**不是 `interrupted`**：没有人叫停它 |
| `backgrounded_at_start` | **（补）**发起时就在后台 | `backgrounded` |
| `run_cancelled` | **（补）**这一次运行被取消而它还在前台（叫停的是运行，不是这一次执行——所以不借 `user_interrupted`） | `interrupted` |
| `terminated_by_agent` | **（补）**agent 经 `BkgJobs()` 掐掉了自己发起、已转后台的那段执行。**只落后台执行收场提醒的结果块，不落占位**（主线裁定 2026-09-24，以 PF-006 §6.7 为准：「被 agent 停掉」写在那段执行收场的提醒里）——agent 只能掐后台执行，那次调用的占位早在转后台时就写下了（原因是 `backgrounded_*` 之一） | `interrupted` |
| `foreground_timeout` | 前台超时：前台上限到点，而这个工具**不允许**转后台（允许的转后台，原因是 `backgrounded_auto`） | `interrupted` |

**`reason` 什么时候必带**：

| 收场 | `reason` |
|---|---|
| `backgrounded`、`interrupted` | **必带**——前台那次调用以这两种收场的块是占位，而[占位不说原因，agent 只能按失败去读它](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因)；后台那段执行以 `interrupted` 收场时，收场提醒里的结果块同样带原因（同一节「后台那一段的收场以提醒到达，原因同样要写清」） |
| `failed` | **可带，且只能是 `abnormal_interruption`**；普通的失败把原因写在 `blocks` 里 |
| `completed`、`unavailable`、`no_answer` | **不带** |

违反上面任何一格都是 `malformed`。**不给缺了原因的占位补一个原因，也不把一个配错格的原因改到对的格上**（[S-27](#s-27-表示层拒绝不是判定也不修补)）。

> **「前台上限到点、而这个工具不许转后台」（`capability.tool-execution-runtime` 的 S-44）有了自己的取值 `foreground_timeout`**（主线 2026-09-24 定名，原缺口 G-7 闭合）。
> 它**不借** `user_interrupted`：没有人叫停这一次执行，是声明的上限到了；agent 读到它，知道是「这个工具这样跑太久」，不是用户不让跑。

### S-19 派生表示与 transcript

**[派生表示](../../../../ubiquitous_language/terms/record-and-context.md#ul-derived-rendering--派生表示--derived-rendering)与 [transcript](../../../../ubiquitous_language/terms/record-and-context.md#ul-transcript--transcript--transcript) 是原块的属性，不是消息里另外的块。**

- **只有语音块、图块、文件块可以带**（[S-2](#s-2-块底座)）：它们是模态转换件仅有的输入。
- `renderings` 是**非空**数组，每一项是一份 `DerivedRendering`：`producedBy`（[S-20](#s-20-派生表示的产出者与能力标识)）与**非空**的 `blocks`。
- **派生表示里的块只能是文本块、图块或语音块**：不能是文件块（PF-013 转换件契约），也不能是思考、工具调用、工具结果块——
  它们不是模态，是用途或容器；这些块**自己不再带** `renderings` 或 `transcript`。任一条违反是 `malformed`。
- **派生表示里每一块的模态都不同于原块的模态**（按 [S-6](#s-6-模态由媒体类型判定) 算；原块没有模态时——四种之外的文件——不受此限）：
  转换件的输出是「[别的模态的块](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)」，一张图的派生表示里再放一张图，不是任何一次合法转换的产物。
  违反是 `malformed`；这一条跨成员比较，**Schema 管不到**，由接收边界兑现（与 `capability.modality-projection` 判一次转换是否合法的那一条是同一件事）。
- **`renderings` 与 `transcript` 同有同无**：转换件的[输出恒是「一个或多个别的模态的块，外加一段 transcript」，交不出 transcript 就是失败](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)，而失败的那条消息不落盘——
  所以只有其中一样的块不是任何一次合法转换的产物。
- **`transcript` 非空**：「有没有 transcript」必须是一个不含糊的事实——[它决定这个块还挡不挡模型](../../../../product/PF-013-model-profiles-and-invocation/design.md#511-有-transcript-的块不再把任何模型挡在外面)，空串会让它不挡任何模型却什么也没给。
- **没有 transcript 是合法状态**：那个模态或媒体类型上没有登记转换件，块照原样落盘。
- **在落盘之前写好，之后不变**（[S-22](#s-22-落盘之后整块不变)）。
- 派生表示里的块各带 `id`（与消息其余块共用一个唯一范围，[S-3](#s-3-blockid)）与 `visibility`（与原块按合取生效，[S-5](#s-5-嵌套的块按合取取用)）。
- **`renderings` 的次序原样保留，但本契约不给它们排优先级**：组装时取哪一份归 PF-010。

### S-20 派生表示的产出者与能力标识

**`producedBy` 是产出这份派生表示的那一件：本版恒为字面量 `system`。**

- `system`：由**系统装配层**登记的转换件产出。[转换件本版不是资产](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)，替换只发生在系统装配层，
  所以本版没有别的产出者（主线裁定 2026-09-23，待产品负责人确认）。**写成别的任何值——包括一个能力标识——都是 `malformed`**：
  不给产生不了的值留位，留着一支「资产产出」只会让读者以为有这条路。
- 转换件是否升为资产是 PF-013 记下的显式缺口；升了，这一成员加一支能力标识，**出新版本**。

**`CapabilityId` 是[能力标识](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-capability-identifier--能力标识--capability-identifier)的表示：`{ category, name }`。**

- `category` 恰八个取值，闭合：`skill`、`tool`、`mcp`、`connector`、`loop_extension`、`slash_command`、`plugin`、`agent_definition`——
  对应[资产的八类](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-asset--资产--asset)。
- `name` 非空；**相等按两个分量逐码点比较**：类别不同、名字相同的两个不相等。
- **本定义是能力标识形状与相等的唯一定义**，别的契约一律 `$ref` 它，不另写一份。
  `name` 的词法（不含空白与 `:`、`omne-official` 保留前缀）归 `data.asset-model/v1` S-2，它在本定义之上收紧 `name`；
  本契约只约束到非空，**不反向引用那份契约**（它引用本契约，反向引用会成环；[G-5](#八已知缺口)）。

### S-21 AttachmentRef

**`AttachmentRef` 指向某个存储里的一份字节：`{ storage, key, mediaType, bytes?, name? }`。它是引用，不是内容。**

| 成员 | 必填 | 含义 |
|---|---|---|
| `storage` | 是 | 是哪一个存储 |
| `key` | 是 | 那份字节在该存储里的键 |
| `mediaType` | 是 | 那份字节的媒体类型（[S-7](#s-7-媒体类型的规范形式)） |
| `bytes` | 否 | 那份字节的长度，≥ 0，**只作说明** |
| `name` | 否 | 给人看的名字，非空，**不是身份** |

- **相等依据恰是 `(storage, key)`**：两个引用相等当且仅当 `storage` 与 `key` 都逐码点相等；`mediaType`、`bytes`、`name` 不参与。
- `storage` 与 `key` 按 `data.identity-values/v1` 的 [S-31](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文表示。
- 一个只给了引用的附件落成哪一类块，见 [S-34](#s-34-只给了引用的附件落成哪一类块)。
- **它们是地址，不是身份**（`omne-harness-lite-design-2026-09-15 · data.identity-values · v1` 的 [S-34](../../identity-values/v1/contract.md#s-34-语义身份与实现地址分开)）：
  存储之外的任何一方**不得解析它们**，不得从键里读出租户、会话或作者，也不得因为两个键前缀相同就认定它们同属一处。
- **拿到一个引用不等于有权读它**（[S-23](#s-23-块不携带租户身份)）。
- **存储本身全系统尚未定义**：`storage` 取哪些值、引用能否跨节点解引用、解引用时由谁判定能不能读——都等 [G-1](#八已知缺口)。本条只定引用的形状与相等。

### S-22 落盘之后整块不变

**一个块一经落盘，它的全部成员都不再改变**——`visibility`、`renderings`、`transcript`、`opaque`、`reason`、`blocks` 里的每一块，都包括在内。

这是[会话日志只增不改](../../../../product/PF-012-agent-loop-and-run/design.md#52-会话日志是唯一的真相来源)在块这一层的样子；
PF-010 [明说块上那两位落了就不动](../../../../product/PF-010-context-management-and-assembly/design.md#那两个标注仍然是这件事的前提)，PF-013 明说派生表示与 transcript [落盘之前写好，之后不再变](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件)。

- 压缩**不翻**块上的位，它另带一份名单（`data.messages`）；
- 转换件**不回头补**已落盘的块：落盘时没有 transcript 的块永远没有（[模态投影因此单调](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态投影)）；
- 卸载**不在记录里替换**：日志里从头到尾只有那条占位。

### S-34 只给了引用的附件落成哪一类块

**把一个只给了 `AttachmentRef`（外来的附件：连接件送进来的信封、交付面上传的文件）落成块的一方，按引用的媒体类型的 type 那一段取块类，没有选择：**

| `attachment.mediaType` 的 type | 落成 | 形状 |
|---|---|---|
| `image` | 图块 | `mediaType` 与 `data`（引用形状）都取这个引用的媒体类型——两处逐字相同（[S-10](#s-10-语音块与图块)） |
| `audio` | 语音块 | 同上 |
| 其余（含 `video`、`text` 与四种之外的一切） | 文件块 | `attachment` 就是这个引用（[S-11](#s-11-文件块)） |

- **为什么没有选择**：图、语音两种按 [S-10](#s-10-语音块与图块)、[S-11](#s-11-文件块) 两种块类都装得下，两个受理实现就可能各选一种——
  同一个附件在两个实现里是两类块，模态投影与组装的输入随之不同。**主线裁定 2026-09-23（待产品负责人确认）**：按媒体类型定死。
- 引用**原样**进块，不改 `storage`、`key`、`mediaType`，不嗅探字节、不按扩展名改判（[S-27](#s-27-表示层拒绝不是判定也不修补)）。
- 本条只管「手里只有一个引用、没有别的意图」的那一方。**工具的产出不在此列**：工具交回的就是块，块类由工具作者定。
- 块的 `id` 与 `visibility` 仍由落块的一方写（[S-3](#s-3-blockid)、[S-4](#s-4-两个标注)），本条不替它定。
- 违反（例如把一个 `image/png` 的外来附件落成文件块）是落块那一方的违约；它形状上合法，Schema 管不到，证据形式是那一方的规范场景。

### S-23 块不携带租户身份

**块上没有租户身份，也没有会话、运行或作者。**一个块归谁，由承载它的那条日志记录给出——消息是记录的载荷，
记录带会话、运行、尝试与租户；那一层归 `data.messages` 与会话日志的契约，本契约不设计记录壳。

由此对消费者有两条：

- **不得从块的内容推归属**——不读 `AttachmentRef` 的键、不读 `origin` 里的名字、不读文本（`data.identity-values/v1#S-34`：地址不是身份）。
- **一个块被复制进另一个会话，块里的 `AttachmentRef` 不随之带来读那份字节的资格。**
  解引用时能不能读，由存储的 owner 按**调用方**的租户身份现判；那个 owner 与判定在哪，等 [G-1](#八已知缺口)。
  在它闭合之前，**消费者不得把「持有一个引用」当作「可以读」**。

## 四、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的保证**——单机由装配（同一进程、同一份追加式日志）顺带给出的那些；
> 右列写分布式后**必须由协议重新兑现什么**，以及**做不到会怎样**。
> 不在表里的条款在任何部署形态下一律成立，**不在表里不等于不适用**。
> **这张表是契约的一部分，不是流程笔记**：装配给的那些，演化到分布式时不会自动成立。

| 保证 | 单机由谁给 | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **块标识在一条消息内唯一，含嵌套**（[S-3](#s-3-blockid)） | 一条消息的块由同一进程里的一处编号（模型侧是生产的一方，工具侧是宿主的帧入口）；派生表示的块在同一处落盘前补齐 | 同一条消息的块在不同节点产出时（远端的工具运行时发帧、另一节点上的转换件挂派生表示），**编号须由协议协调或分域**，不能各编各的 | 两块同一个 `(messageId, id)`：压缩点名指到错的那块，**模型读到本该静默的内容或丢掉本该可读的内容，没有任何报错** |
| **`CallId` 在会话日志内唯一**（[S-14](#s-14-callid)） | 会话的唯一一处登记方 | 同一会话的登记**跨节点串行化**，或按节点分域且分域规则是协议的一部分 | 结果指回错的调用：agent 拿到另一次调用的结果并据此行动 |
| **落盘之后整块不变**（[S-22](#s-22-落盘之后整块不变)） | 单一写入者、只追加的日志 | 副本与每一跳的重新序列化**保持同一个 JSON 值**；没有一跳可以改写标注、补派生表示或改 `outcome` | 日志不能重放：同一时刻的视图在两个节点上算出两份 |
| **`opaque` 原样回传**（[S-9](#s-9-思考块与不透明数据)） | 进程内的同一个值 | 每一跳**不丢数值精度**、不重排、不「修正」它；中间层不得因为认不出而丢弃 | 上游拒收回放，或推理连续性**静默**丢失——请求照常成功 |
| **两个标注随块完整到达**（[S-4](#s-4-两个标注)） | 进程内的两个布尔值 | 线上格式**显式承载 `false`**；不得用「缺省即假」的编码把它省掉，也不得在任何一跳补默认值 | 省掉 `false` ⇒ 接收方判 `visibility_missing`，含过程块、半截调用的每条消息都被拒；**更糟的是某一跳补了 `true`**：半截调用与工具过程被喂给模型 |
| **内联字节原样**（[S-10](#s-10-语音块与图块)） | 同一份 base64 串 | 不重新压缩、不改编码、不因大小改成引用而不改形状 | 模型读到的不是用户发的那张图；或一个块在传输中换了形状，帧规则判不准 |
| **引用可解引用、且解引用受租户判定**（[S-21](#s-21-attachmentref)、[S-23](#s-23-块不携带租户身份)） | 本机存储 | `storage` 在每个节点上**指同一个存储**；解引用在存储 owner 那里**按调用方租户身份现判** | 悬空引用；或拿着复制来的引用读到另一个租户的字节——[G-1](#八已知缺口) |
| **表示层校验在每个接收边界重做**（[S-26](#s-26-表示层拒绝值)） | 落盘前一次校验 | **每个接收边界各自重验**，不信任上游「已校验过」 | 一个远端产出的非法块进了日志，而日志只增不改，它**永远留在那里** |

## 五、表示与边界校验

### S-24 规范表示

- **规范表示**：[`content-blocks.schema.json`](content-blocks.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/content-blocks/v1/content-blocks.schema.json`
- **定义项（21 项）**：`ContentBlock`、`BlockBase`、`TextBlock`、`ThinkingBlock`、`VoiceBlock`、`ImageBlock`、`FileBlock`、
  `ToolCallBlock`、`IncompleteToolCallBlock`、`ToolResultBlock`、`Visibility`、`DerivedRendering`、`AttachmentRef`、`InlineBytes`、
  `MediaType`、`Modality`、`ExecutionOutcome`、`PlaceholderReason`、`BlockId`、`CallId`、`CapabilityId`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**——`CapabilityId`、`CallId`、`BlockId`、`Modality`、`MediaType`、`AttachmentRef`、`InlineBytes`、`ExecutionOutcome`、`PlaceholderReason` **在全批契约里只有这一个家**。**根模式不约束任何文档**：本文件是共享定义的登记处，不是某个消息的形状。
- **成员名一律 camelCase**，枚举值一律 snake_case 字符串，块的判别成员叫 `kind`；`origin.kind` 是嵌在来源标记里的另一个判别成员，与块的 `kind` 不相干。
- `BlockId`、`CallId` 与 `AttachmentRef.storage`／`key` 按 `data.identity-values/v1` S-31 的**散文**在本文件写出形状（非空、首尾不属于那个显式空白码点集合、以绝对结尾断言收尾），**不跨契约 `$ref`** 那份已冻结契约的 `OpaqueIdentifier`（它自述不单独被引用；主线裁定 2026-09-23）。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-25 判别式与枚举闭合

`kind`、`complete`、`Modality`、`ExecutionOutcome`、`PlaceholderReason`、`origin.kind`、`CapabilityId.category`、`DerivedRendering.producedBy`（本版只有 `system`）
各是一个**闭合集合**，没有「其他」。

遇到未知取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。
每个未知值都可能是一种更宽的东西——一个未知的 `kind` 被当成文本，一个未知的 `outcome` 被当成完成——**静默降级就是放行**。

### S-26 表示层拒绝值

**一个值不合本契约的形状时，拒绝值恰为下面六个之一，集合闭合：**

| 拒绝值 | 什么时候 | 条款 |
|---|---|---|
| `kind_unknown` | 某个块的 `kind` 出现了，但不是七个取值之一（大小写不同也算不是） | [S-1](#s-1-七类块)、[S-25](#s-25-判别式与枚举闭合) |
| `visibility_missing` | 某个块没有 `visibility` 成员；或它是一个对象，却缺 `toHuman`、`toModel` 任一位 | [S-4](#s-4-两个标注) |
| `incomplete_call_visible` | 某个半截的工具调用块（`kind: "tool_call"` 且 `complete: false`），`visibility` 有一位为 `true` | [S-13](#s-13-半截的工具调用) |
| `call_in_result` | 某个工具结果块的 `blocks` 里（任意一层）有 `kind` 为 `tool_call` 的块 | [S-16](#s-16-结果里不发起调用) |
| `modality_mismatch` | 某个语音块或图块上出现的一个**合乎 [S-7](#s-7-媒体类型的规范形式) 规范形式**的媒体类型，type 不是它该有的 `audio`／`image`（非规范写法不判模态，只算 `malformed`） | [S-10](#s-10-语音块与图块) |
| `malformed` | 其余一切不合形状：缺必填成员（含 `kind` 缺席、`outcome` 缺席）、多出成员、类型不对、未知的其他枚举值、非规范的媒体类型、引用形状里两处媒体类型不逐字相同、占位原因缺了或配错了格、派生表示含不许的块、派生表示里的块与原块同一模态、`producedBy` 不是 `system`、派生表示与 transcript 只有其一、解析不了的调用缺 `rawArguments` 或 `unparseable` 之一或与 `arguments` 同现、一条消息里 `id` 重复。**判据只有一条**：不合 Schema，或违反 [S-3](#s-3-blockid)／[S-10](#s-10-语音块与图块)／[S-19](#s-19-派生表示与-transcript) 那三条 Schema 管不到的跨成员约束；上面只是举例 | 各条 |

**一份输入里有多处违例时，拒绝值取其中优先级最高的那个**，次序固定：

```text
kind_unknown  >  visibility_missing  >  incomplete_call_visible  >  call_in_result  >  modality_mismatch  >  malformed
```

这个次序让两个实现对同一份输入给出**同一个**拒绝值，与遍历次序无关；
越靠前越说明这份值在根上不可读——认不出是哪一类、判不了给谁看，就谈不上别的。
**`malformed` 是剩余项，不是「其他」**：它有确定的判据——不满足本契约的形状——只是不再细分。

拒绝值怎样落进各个操作自己的失败集合（消息层、到达事件层、运行时），归那些契约；**它们引用本条的名字，不另起一套同义值**。

### S-27 表示层拒绝不是判定，也不修补

- **表示非法的输入在进入任何判定之前被拒绝。**这次拒绝**不表示**「这个工具失败了」「这条消息不存在」，
  也**不得被记成一次收场或一次判定结果**——一个被拒的工具结果块不是一次 `failed`。
- **不修补、不降级、不尽力而为**：不补标注、不补原因、不把半截调用的标注改成 `false`、不把大写的媒体类型改成小写、
  不丢掉坏的那一块留下其余的、不把未知的 `kind` 当文本。**修补等于替产生者做了一个它没做的决定。**
- **表示合法不表示任何资格**：Schema 校验通过只说明形状合规，不说明这块该给谁看之外的任何事，也不说明一个引用可读（[S-23](#s-23-块不携带租户身份)）。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-1](#s-1-七类块)、[S-25](#s-25-判别式与枚举闭合) 七类、八形状、闭合 | **管得到**：`oneOf` 八个形状，未知 `kind` 无一匹配 | 拒绝值的**名字**由 [S-26](#s-26-表示层拒绝值) 定，Schema 只说通过与否 |
| [S-2](#s-2-块底座) 四类块不带派生属性 | **管得到** | — |
| [S-3](#s-3-blockid) `id` 的形状 | 管形状（按 identity-values S-31 散文写出的 pattern） | **消息内唯一，含嵌套**——Schema 管不到，归看得见整条消息的接收边界 |
| [S-4](#s-4-两个标注) 两位必填 | **管得到** | 「落盘后不改」「此刻模型可读」归 [S-22](#s-22-落盘之后整块不变)、`data.messages` 与 PF-010 |
| [S-5](#s-5-嵌套的块按合取取用) 合取取用 | **管不到**——它是组装时的取用规则 | PF-010 的组装实现与本契约的规范场景 |
| [S-6](#s-6-模态由媒体类型判定)、[S-7](#s-7-媒体类型的规范形式) | 管媒体类型的规范形式；**块上不许有 `modality` 成员** | 判定式本身是计算，由消费者按 S-6 实现 |
| [S-9](#s-9-思考块与不透明数据) `opaque` | 只管「可以是任意 JSON 值」 | 「不解释、原样回传」全是行为约束，归各层实现与[第四节](#四装配给与协议给) |
| [S-10](#s-10-语音块与图块) | **管得到**：两处媒体类型的 type、两种 `data` 形状互斥、base64 形状 | **两处媒体类型逐字相同**——跨成员比较，管不到 |
| [S-12](#s-12-完整的工具调用)、[S-13](#s-13-半截的工具调用) | **管得到**：`complete` 判别、半截的标注必为两个 `false`、完整的恰为「`arguments`」与「`rawArguments` ＋ `unparseable: true`」两种之一 | 「只解析一次」「不解析 `rawArguments`」「解析不了的不执行、紧接一条 `failed` 结果」是行为，归 `capability.stream-assembly` 与宿主 |
| [S-14](#s-14-callid) | 管形状 | 会话日志内唯一——归登记一方 |
| [S-15](#s-15-工具结果块)～[S-18](#s-18-占位原因与它落在哪一格) | **管得到**：`outcome` 必填且闭合、`reason` 按收场必带／可带／不带、`code` 落格、任意层无工具调用块 | 「不从文字推收场」是读者的行为；「转后台只是前台那一次的收场」归写入方 |
| [S-19](#s-19-派生表示与-transcript)、[S-20](#s-20-派生表示的产出者与能力标识) | **管得到**：只三类块可带、非空、派生块只三类且不再嵌套派生、派生表示与 transcript 同有同无、`producedBy` 恒为 `system` | **派生块与原块模态不同**——跨成员比较，管不到，归接收边界；「落盘前写好」归转换件与写入方 |
| [S-21](#s-21-attachmentref) | 管形状 | 相等按 `(storage, key)`、「地址不是身份」、可解引用，都管不到 |
| [S-34](#s-34-只给了引用的附件落成哪一类块) | **管不到**——两类块在形状上都合法 | 落块那一方的规范场景 |
| [S-22](#s-22-落盘之后整块不变)、[S-23](#s-23-块不携带租户身份) | **管不到** | 日志的写路径、存储 owner 的判定 |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**一个内容块 ⇒ 按 [S-26](#s-26-表示层拒绝值) 取拒绝值、按 [S-27](#s-27-表示层拒绝不是判定也不修补) 收场。
**Schema 通过也可能仍然非法**——上表「管不到」那一列里属于形状的三条（`id` 重复、两处媒体类型不逐字相同、派生块与原块同一模态）由接收边界的校验兑现。

## 六、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 每个块恰属七类之一、恰合八个形状之一；`kind` 闭合 | 不变量 | [PF-009 §4](../../../../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本) | Schema ＋ 每个接收边界（[S-1](#s-1-七类块)、[S-25](#s-25-判别式与枚举闭合)） | 日志里出现一个谁都说不清是哪类的块，或一段视频成了第八类 |
| P-2 | 两个标注必填、互不决定，落盘后不变 | 不变量 | [PF-009 §4](../../../../product/PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗) · [PF-010 §5.7](../../../../product/PF-010-context-management-and-assembly/design.md#那两个标注仍然是这件事的前提) | Schema（必填）＋ 日志写路径（不变）（[S-4](#s-4-两个标注)、[S-22](#s-22-落盘之后整块不变)） | 同一份日志在两个时刻组装出不同的视图 |
| P-3 | 标注缺席不被补成任何值 | 安全 | [PF-010 §6.2](../../../../product/PF-010-context-management-and-assembly/design.md#62-没有明确标了给模型读的不进模型那一份) | 接收边界（[S-4](#s-4-两个标注)、[S-27](#s-27-表示层拒绝不是判定也不修补)） | 一个没表过态的块进了模型那一份 |
| P-4 | 半截的工具调用两边都不给 | 安全 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#半截的工具调用记下来但不给模型看) | Schema（条件约束）（[S-13](#s-13-半截的工具调用)） | 模型干等一个没发出去的调用，或再发一次 |
| P-5 | 结果里不发起调用 | 安全 | **无产品出处**：主线裁定，理由写在 [S-16](#s-16-结果里不发起调用) | Schema（任意层）（[S-16](#s-16-结果里不发起调用)） | 组装里出现一次没人发起过的调用 |
| P-6 | 块的模态由类型与媒体类型唯一判定，块上不存模态 | 不变量 | [PF-013 §4 模态](../../../../product/PF-013-model-profiles-and-invocation/design.md#模态) | Schema（规范形式、无 `modality` 成员）＋ 判定式（[S-6](#s-6-模态由媒体类型判定)、[S-7](#s-7-媒体类型的规范形式)） | 同一个块在两个实现里挡不挡同一个模型结论相反 |
| P-7 | `(messageId, BlockId)` 指认唯一，含嵌套 | 不变量 | [domain_objects 内容块](../../../../domain_objects/objects.md#ul-content-block--内容块) · D-035 | 分配编号的一方 ＋ 看得见整条消息的接收边界（[S-3](#s-3-blockid)） | 压缩点名让错的块静默 |
| P-8 | 收场以块上的 `outcome` 为准，缺席不当完成 | 安全 | [PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种) | Schema（必填、闭合）＋ 读者不从文字推（[S-15](#s-15-工具结果块)、[S-17](#s-17-六种收场)） | agent 把一次被中断的执行当成跑完了 |
| P-9 | 占位必带原因，原因落在对的收场 | 安全 | [PF-006 §6.7](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因) | Schema（条件约束）（[S-18](#s-18-占位原因与它落在哪一格)） | agent 把「用户叫停」读成失败而重试；把「异常中断」读成被中断而不敢再调 |
| P-10 | 派生表示与 transcript 是原块属性，不含文件块、不与原块同模态，二者同有同无，落盘前写好之后不变 | 不变量 | [PF-013 §4 转换件](../../../../product/PF-013-model-profiles-and-invocation/design.md#转换件) | Schema（形状）＋ 转换件与写入方（时点）（[S-19](#s-19-派生表示与-transcript)、[S-22](#s-22-落盘之后整块不变)） | 模态投影不再单调；一个块「有没有 transcript」在两个时刻答案不同 |
| P-11 | `opaque` 不透明、不解释、原样回传 | 不变量 | [D-038 Q2](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) · D-035 | 各层实现 ＋ [第四节](#四装配给与协议给)（[S-9](#s-9-思考块与不透明数据)） | 上游拒收回放或推理连续性静默丢失 |
| P-12 | 嵌套的块按合取取用 | 安全 | 规格层推导（[S-5](#s-5-嵌套的块按合取取用) 正文）· [PF-010 要求二](../../../../product/PF-010-context-management-and-assembly/design.md#要求二成分必须是明确标了给模型读的) | PF-010 的组装实现（[S-5](#s-5-嵌套的块按合取取用)） | 工具结果里一块标着不给模型的内容进了模型那一份 |
| P-13 | 表示非法即拒，不修补、不降级；拒绝值唯一 | 安全 | SYS-SPEC | 每个接收边界（[S-26](#s-26-表示层拒绝值)、[S-27](#s-27-表示层拒绝不是判定也不修补)） | 两个实现对同一份坏输入报不同的拒绝值；或坏块被「修好」后进了日志 |
| P-14 | 持有一个引用不等于可以读 | 安全 | [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 存储 owner 的现判（[S-21](#s-21-attachmentref)、[S-23](#s-23-块不携带租户身份)；落点等 [G-1](#八已知缺口)） | 复制进另一租户会话的块，让那边读到了这边的字节 |
| P-15 | 参数收齐却解析不了的调用不被执行、原文不被重新解析，且有一条 `failed` 结果回给模型 | 安全 | 主线裁定 2026-09-23（待产品负责人确认） | Schema（两种形状互斥）＋ `capability.stream-assembly`（解析点唯一）＋ 宿主（紧接结果）（[S-12](#s-12-完整的工具调用)） | 一次读不懂的调用被猜了参数去执行；或模型干等一个永远不来的结果 |
| P-16 | 同一个外来附件在任何实现里落成同一类块 | 不变量 | 主线裁定 2026-09-23（待产品负责人确认） | 落块的一方（[S-34](#s-34-只给了引用的附件落成哪一类块)） | 同一张图在一个实现里是图块、在另一个里是文件块，模态投影与组装的输入不同 |

**进展性质：本契约不拥有任何进展性质。**块不会「最终成为」别的块；一切与到达、封口、转换时点有关的推进归到达语法、流装配与转换件。

**不建形式工件。**本契约没有状态转移；它的结构约束——闭合判别、条件约束、任意层无工具调用、派生块的限制——
**Schema 本身就能判**，在这里建 Alloy 模型只会得到一份与 Schema 同义的平行工件。
Schema 管不到的三条（`id` 唯一、两处媒体类型逐字相同、合取取用）是一次遍历就能检查的谓词，证据形式是接收边界的校验与规范场景，
登记在[验证入口](../verification.md)。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。
每条给一个**正例**与一个**反例**，实例在 [`examples.md`](examples.md)。

#### S-28 标注缺一即拒

把一个只写了 `toHuman` 的文本块交给接收边界。**必须观察到**：拒绝值 `visibility_missing`；日志里没有这个块；
**没有任何一侧的组装拿到它**。正例：两位都写了的同一个块被接受。
**反例的判据是「拒绝」，不是「被当作不给」**——一个把缺席读成 `false` 然后照常落盘的实现，看起来安全，却让产生者的错永远不被发现。

#### S-29 半截调用两边都不给

构造一次参数没收齐就断了的回复：收到的块是 `{ kind: "tool_call", complete: false, visibility: { toHuman: false, toModel: false }, rawArguments: "{\"pa" }`。
**必须观察到**：它被接受并落进日志；组装给人与给模型的两份里**都没有它**；**`rawArguments` 从未被解析**。
反例：同一个块把 `toHuman` 写成 `true`——拒绝值 `incomplete_call_visible`，**不被改成 `false` 后接受**。

#### S-30 结果里不发起调用

正例：一个工具结果块的 `blocks` 里有文本块与图块，被接受。
反例：`blocks` 里嵌一个工具结果块，它的 `blocks` 里再有一个完整的工具调用块——拒绝值 `call_in_result`；**深一层也拒**。

#### S-31 语音与图的模态要对

正例：`mediaType: "audio/wav"` 的语音块、`mediaType: "image/png"` 且引用里也写 `image/png` 的图块，都被接受。
反例一：`mediaType: "video/mp4"` 的图块——`modality_mismatch`，**不被改归文件块**。
反例二：块写 `image/png`、引用里写 `image/jpeg`——Schema 通过，**接收边界仍须拒绝**，拒绝值 `malformed`。
两个反例必须同跑：只跑第一个，一个只信 Schema 的实现也会全过。

#### S-32 占位原因落在对的收场

正例：`outcome: "backgrounded"`、`reason.code: "backgrounded_by_preemption"`；`outcome: "failed"`、`reason.code: "abnormal_interruption"`；不带 `reason` 的 `completed`。
反例：不带 `reason` 的 `interrupted`、`reason.code: "user_interrupted"` 的 `failed`、带 `reason` 的 `completed`——三者都是 `malformed`，**且都不被补、不被改格**。

#### S-33 派生表示不含文件块

正例：一个图块带一份 `producedBy: "system"` 的派生表示（一块文本）与一段 transcript。
反例一：派生表示里有一个文件块——`malformed`。反例二：有派生表示、没有 transcript（或反过来）——`malformed`。
反例三：一个文本块带了 transcript——`malformed`。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约。

#### CS-1 消息层给压缩点名

`data.messages` 在**为一条压缩记录写名单**时，依赖 [S-3](#s-3-blockid)、[S-5](#s-5-嵌套的块按合取取用)、[S-22](#s-22-落盘之后整块不变)，得到：
每个 `(messageId, blockId)` 在任何嵌套下都指到恰一块；点名一个工具结果块，里面的块随之对模型不可见；
块上的标注一位都不动。**能不能单独点名嵌套块，由它自己定**，本契约只保证指得准。

#### CS-2 流装配交出封口的块

`capability.stream-assembly` 在**一次回复断在半路、工具调用参数没收齐**时，依赖 [S-12](#s-12-完整的工具调用)、[S-13](#s-13-半截的工具调用)、[S-26](#s-26-表示层拒绝值)，得到：
交出一个 `complete: false`、标注为两个 `false`、带原始参数串的块；**不解析它**；它的 `callId` 不登记。
收齐了的调用解析一次：成功交出 `complete: true` 与 `arguments`；**失败交出 `complete: true`、带原文 `rawArguments` 与 `unparseable: true` 的块**，它的 `callId` 登记，不执行，由宿主接一条 `failed` 的结果回给模型。

#### CS-3 上下文组装取块

PF-010 的组装在**给有效模型组装一次请求**时，依赖 [S-4](#s-4-两个标注)、[S-5](#s-5-嵌套的块按合取取用)、[S-6](#s-6-模态由媒体类型判定)、[S-19](#s-19-派生表示与-transcript)，得到：
只取 `toModel` 为真（且未被点名）的块，嵌套的块再按合取筛一遍；
一个模型收不下的图块，取它派生表示里模型收得下的那几块，都取不到就用 transcript；
没有 transcript 又收不下的块**不会出现在这里**——PF-013 已在算合法目标时把那个模型挡掉了。**取哪一份派生表示**由它自己定。

#### CS-4 工具运行时写收场

工具运行时在**用户插队、一个允许转后台的工具正在前台跑**时，依赖 [S-15](#s-15-工具结果块)、[S-17](#s-17-六种收场)、[S-18](#s-18-占位原因与它落在哪一格)，得到：
占位写成 `outcome: "backgrounded"`、`reason.code: "backgrounded_by_preemption"`、`blocks` 是占位说明；
那段执行在后台跑完，真实结果另以一个同 `callId` 的工具结果块到达（落在哪种消息归 `data.messages`）。
**用户取消这次运行、而另一个工具还在前台**时，它写 `outcome: "interrupted"`、`reason.code: "run_cancelled"`（[S-18](#s-18-占位原因与它落在哪一格) 补的那一行）。
**前台上限到点、而工具不许转后台**时，它写 `outcome: "interrupted"`、`reason.code: "foreground_timeout"`（[S-18](#s-18-占位原因与它落在哪一格) 最后一行；原停在 G-7，已闭合）。

#### CS-5 模型请求运行时带回思考

模型请求运行时在**下一次请求要带回上一轮的思考**时，依赖 [S-9](#s-9-思考块与不透明数据)、[S-22](#s-22-落盘之后整块不变)，得到：
日志里那个思考块的 `opaque` 与上游当初给的是同一个 JSON 值，中间没有任何一层读过或改过它；带不带、怎么带，由传输适配层自己定。

#### CS-6 算模态投影

PF-013 在**算一个会话的模态投影**时，依赖 [S-6](#s-6-模态由媒体类型判定)、[S-19](#s-19-派生表示与-transcript)、[S-22](#s-22-落盘之后整块不变)，得到：
每个块（含工具结果里嵌着的）的模态都判得出来、不存在「判不出」；「有没有 transcript」在落盘那一刻就定死、此后不变——
所以投影只增不减。**文件块里一份 PDF 没有模态，不进投影。**

## 七、缺席怎么收

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席各自是什么意思：

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| `visibility`，或其中一位 | **拒绝**（`visibility_missing`），不补任何值 | [S-4](#s-4-两个标注) |
| `kind` | **拒绝**（`malformed`）——判别不出是哪一类 | [S-1](#s-1-七类块) |
| `outcome` | **拒绝**（`malformed`），**从不当作 `completed`** | [S-15](#s-15-工具结果块) |
| 占位的 `reason` | **拒绝**（`malformed`） | [S-18](#s-18-占位原因与它落在哪一格) |
| `mediaType`、`attachment`、`data` | **拒绝**（`malformed`） | [S-10](#s-10-语音块与图块)、[S-11](#s-11-文件块) |
| 完整调用的 `callId`／`tool` | **拒绝**（`malformed`） | [S-12](#s-12-完整的工具调用) |
| 完整调用的 `arguments` | 带着 `rawArguments` 与 `unparseable: true` 时**合法**——这是解析不了的那一种；否则**拒绝**（`malformed`） | [S-12](#s-12-完整的工具调用) |
| 半截调用的 `callId`／`tool` | **合法**：还没到。不补 | [S-13](#s-13-半截的工具调用) |
| `transcript` 与 `renderings` 都缺 | **合法**：那个键上没登记转换件。块照原样挡住收不下它的模型 | [S-19](#s-19-派生表示与-transcript) |
| 两样只缺其一 | **拒绝**（`malformed`）——不是任何一次合法转换的产物 | [S-19](#s-19-派生表示与-transcript) |
| `opaque` | **合法**，且与 `opaque: null` 是两件事，各自原样保留 | [S-9](#s-9-思考块与不透明数据) |
| `origin` | **合法**，不作任何断言 | [S-8](#s-8-文本块与来源标记) |
| 引用指向的那份字节读不到 | **不是本契约的收场**：形状合法、引用照旧；读不到怎么收归存储 owner（[G-1](#八已知缺口)），**不得据此改写或删除这个块** | [S-21](#s-21-attachmentref)、[S-22](#s-22-落盘之后整块不变) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 八、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **存储未定义**（[待裁：存储](../../../../domain_objects/pending.md#存储)）：`AttachmentRef.storage` 取哪些值、引用跨节点能否解引用、**解引用时由谁按调用方的租户身份判定能不能读**、字节留多久 | 任何要解引用文件块、语音／图的引用形状、`offloaded` 的消费者；[S-23](#s-23-块不携带租户身份) 的隔离落点；[第四节](#四装配给与协议给)「引用可解引用」一行 | **PF-006 的 owner** |
| ~~G-2~~ | **已闭合（2026-09-23 对齐波，主线裁定，待产品负责人确认）**：「这一次运行被取消而它还在前台」取 `run_cancelled`；同批补 `backgrounded_at_start`、`terminated_by_agent`（[S-18](#s-18-占位原因与它落在哪一格)）。产品侧补 PF-006 §6.7 那三行归产品修订批 | — | — |
| ~~G-3~~ | **已闭合（2026-09-23 对齐波，主线裁定，待产品负责人确认）**：参数收齐却解析不了的调用落成 `complete: true`、带 `rawArguments` 与 `unparseable: true` 的块，不执行，由宿主接一条 `failed` 结果回给模型（[S-12](#s-12-完整的工具调用)）。产品侧补 PF-009／PF-006 一句归产品修订批 | — | — |
| **G-4** | **`BlockId`、`CallId` 的词法形式**：字符集、长度上界、生成方式 | Schema 只到 `data.identity-values/v1#S-31` 那一层；任何需要排序、分片或字面量拼接的实现 | **realization** |
| ~~G-5~~ | **已闭合（指路）**：`CapabilityId.name` 的词法归 `data.asset-model/v1` S-2，`origin.command` 的词法归 `data.slash-command/v1` 的命令名；**本契约只约束到非空、不据它们写判定**——那两份契约都引用本契约，反向引用会成环 | — | — |
| ~~G-6~~ | **已闭合**：[S-8](#s-8-文本块与来源标记) 的 `origin`、[S-9](#s-9-思考块与不透明数据) 的 `opaque` 落在 [D-038](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔) Q1、Q2。**遗留一处对不上**：D-038 Q1 的「含义」列写 `origin` 取「模型 / 用户 / 工具 / 系统」，本契约取的是四个斜杠命令来路——已报主线 | — | — |
| ~~G-7~~ | **已闭合（主线 2026-09-24）**：PF-006 rev 18 §6.7 加了「前台超时」一行；取值名 `foreground_timeout`，落 `interrupted`（[S-18](#s-18-占位原因与它落在哪一格)） | — | — |
| **G-8** | **主线裁定没有落成决定记录**：[设计依据](#设计依据)最后一行那几项（占位原因三值、`unparseable`、两个新来路、`producedBy` 恒为 `system`、附件落块、帧入口、桥换代）只在任务区账本里 | 本契约接受时这些依据的可追溯性 | **主线**：随产品负责人确认落一份决定（D-038 明言不含这些） |

## 九、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **消息**：有哪几种、各自带什么、`messageId` 的形状、哪种消息能装哪几类块、工具结果块落在哪种消息里——归 `data.messages`。
- **到达**：块怎样开、填、封口，追加与整体替换，节流与砍，执行帧里媒体只许引用——归 `data.arrival-events` 与 `capability.stream-assembly`。
- **压缩**：名单的形状、能点名哪些块、「此刻模型可读」的计算——归 `data.messages` 与 PF-010。
- **组装**：取原件、取哪一份派生表示还是取 transcript；两侧怎么呈现——归 PF-010 与呈现。
- **模态投影与合法目标**——归 PF-013。
- **转换件**：什么时候转、按什么键登记、转换失败怎么收——归 PF-013 与 PF-012；本契约只定它产出的东西长什么样。
- **卸载**：什么时候卸、占位里写什么——归 PF-006 与 PF-012；本契约只给 `offloaded` 一个位置。
- **存储本身与解引用的授权**（[G-1](#八已知缺口)）。
- **租户、会话、运行、作者的归属**——在承载块的记录上（[S-23](#s-23-块不携带租户身份)）。
- **占位原因写给 agent 的文字**——`reason.text` 由写它的一方写。
- **体积上限**：内联字节、文本、`blocks` 的长度上限本版不设；若将来要设，它是一个具名的政策参数，由消费者的契约定。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema 与实例文件存在不表示形状已被校验过。

## 十、版本差异与规范工件

**本版是首版**，没有被采用的旧版本，因此没有语义或表示差异可记，也没有消费者迁移；
`registry/lineage.json` 不因本契约增加条目。

**本版的规范工件**：本文件、[`content-blocks.schema.json`](content-blocks.schema.json)、[`examples.md`](examples.md)。

**不建 `formal/`**：理由在[性质一节](#性质)末尾——没有状态转移，结构约束 Schema 自己判得了。
**这不是把义务省掉**：本契约触发的义务是 Schema 正反实例校验、接收边界的校验与规范场景，逐条登记在[验证入口](../verification.md)。

**发布后**：本目录下的规范正文、Schema 与实例不可原地覆盖；修改发布新版本。
[已知缺口](#八已知缺口)任一项被裁决后，凡改变本契约语义或表示的（如 G-4 收紧词法），都出 **v2**，
**推荐版本不自动升级消费者**。接受状态、冻结记录与执行结果都在本版本目录之外维护。
