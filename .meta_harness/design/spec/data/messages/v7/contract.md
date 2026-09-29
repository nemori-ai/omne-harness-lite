# data.messages v7

> **candidate，未接受、未冻结。**本版以前驱MS6为基础，新增创建输入/两个技术marker/拒绝创建同键关联，完整保留七种消息和未改变条款。精确差异见consumer-impact.md；本版不能以旧v5/v6接受记录提升状态。

> 规格正文。接受、采用、冻结与执行结果由版本外入口与 registry 记录，本文件不填进度、通过状态或哈希。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, data.messages, 7)`——
  `family = data`、`topic = messages`、规范路径 `spec/data/messages/v7/contract.md`。
  **文件位置不代替这个三元组身份。**
- **状态**：candidate，未接受、未冻结；前驱 data.messages/v6 接受状态以其原 registry 条目为准。
- **前驱版本的需求复核记录（历史）**：本轮 PF-013 rev 13 → rev 14 的输入上限增量落在 S-49。另按各 topic changelog 核对 PF-004 12 → 13、PF-006 19 → 20、PF-014 7 → 8、PF-015 11 → 13：增量是工作区来源、显式 reload、会话工作区引用与感知责任；本契约未定义工作区引用的内部结构（S-17/S-25 的值保持不透明，G-6 不闭合），也不拥有装载或受理操作，故不改变消息值规则。PF-012 仍为 rev 15，其栅栏与迟到账责任归运行时。源2历史复核文字保留原 rev；本轮变化见[验证入口](../verification.md#v6-变化的影响)。
- **当前设计依据与需求 rev**：PF-004 rev 20、PF-006 rev 23、PF-008 rev 7、PF-009 rev 9、PF-010 rev 7、PF-012 rev 21、PF-013 rev 16、PF-014 rev 11、PF-015 rev 20；仅消费 [source-alignment.md](source-alignment.md) 逐项列出的范围，历史接受与裁决保持其原 rev。
  **前驱历史复核**：2026-09-24 按各 topic 的 changelog 从起草时的 rev 逐版核到当前 rev：PF-009 rev 8 与 PF-010 rev 6 改了 `SystemMessage`（不落会话日志、每次组装现算、本版只含文本，[S-7](#s-7-systemmessage)、[S-6](#s-6-每种消息能装哪几类块)、[S-29](#s-29-合法名单的判定)、[S-32](#s-32-会话日志里的配对与唯一)）与工具帧的收尾（出错照常收尾，[S-13](#s-13-toolinternalmessage)、[S-14](#s-14-toolinternalmessage-怎么收的尾)）；PF-014 rev 6 的「被中断的回复不交出动作」进 [S-10](#s-10-assistantmessage-怎么收的尾)；其余不改本契约条款。逐 topic 的记录见[验证入口「变化的影响」](../verification.md#变化的影响)
- **精确语义依赖**：

  | 坐标 | 消费 clauses | 取它的什么 | Schema 里怎么用 |
  |---|---|---|---|
  | `omne-harness-lite-design-2026-09-15 · data.content-blocks · v3` | [`S-1`](../../content-blocks/v3/contract.md#s-1-七类块)、[`S-3`](../../content-blocks/v3/contract.md#s-3-blockid)、[`S-4`](../../content-blocks/v3/contract.md#s-4-两个标注)、[`S-5`](../../content-blocks/v3/contract.md#s-5-嵌套的块按合取取用)、[`S-8`](../../content-blocks/v3/contract.md#s-8-文本块与来路标记)、[`S-12`](../../content-blocks/v3/contract.md#s-12-完整的工具调用)、[`S-13`](../../content-blocks/v3/contract.md#s-13-半截的工具调用)、[`S-14`](../../content-blocks/v3/contract.md#s-14-callid)、[`S-15`](../../content-blocks/v3/contract.md#s-15-工具结果块)、[`S-16`](../../content-blocks/v3/contract.md#s-16-结果里不发起调用)、[`S-17`](../../content-blocks/v3/contract.md#s-17-六种收场)、[`S-18`](../../content-blocks/v3/contract.md#s-18-占位原因与它落在哪一格)、[`S-20`](../../content-blocks/v3/contract.md#s-20-派生表示的产出者与能力标识)、[`S-22`](../../content-blocks/v3/contract.md#s-22-落盘之后整块不变)、[`S-24`](../../content-blocks/v3/contract.md#s-24-规范表示)、[`S-26`](../../content-blocks/v3/contract.md#s-26-表示层拒绝值)、[`S-27`](../../content-blocks/v3/contract.md#s-27-表示层拒绝不是判定也不修补) | 块的全部定义、块的指认与嵌套、两个标注与合取取用、工具调用与结果、收场与占位原因、能力标识的 `name`（拓展件的名字）、落盘不变、拒绝值 | `$ref` 它的 `$defs/ContentBlock`、`ToolResultBlock`、`BlockId`、`CallId`、`ExecutionOutcome`、`CapabilityId/properties/name`（`LoopExtensionName`，[S-26](#s-26-拓展件追加的提醒)） |
  | `omne-harness-lite-design-2026-09-15 · data.offer-expiry · v1` | [`S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围) | 时刻的规范形式 | `$ref` 它的 `$defs/Instant`：`createdAt`、尝试开始的 `at`、到点的 `dueAt`、答复的 `at` |
  | `omne-harness-lite-design-2026-09-15 · data.identity-values · v1` | [`S-11`](../../identity-values/v1/contract.md#s-11-scopelayeridentity)、[`S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) | 作用域层身份；不透明标识的交换表示 | `$ref` 它的 `$defs/ScopeLayerIdentity`（「已出门」的 `credentialScope` 的租户那一支，[S-49](#s-49-模型请求运行时写的五种记录不是消息)）；`MessageId` 与其余不透明标识按 S-31 散文定形、**不 `$ref`**（[S-3](#s-3-messageid)） |
  | `omne-harness-lite-design-2026-09-15 · data.call-accounts · v3` | [`S-37`](../../call-accounts/v3/contract.md#s-37-三个归属标识的家runidattemptidmodelcallid) | `ModelCallId`、`AttemptId` 的家 | `$ref` 它的 `$defs/ModelCallId`（中断提醒的 `about`、五种运行时记录的 `call`）、`$defs/AttemptId`（尝试开始的 `attempt`） |
  | `omne-harness-lite-design-2026-09-15 · data.model-profile · v5` | [`S-2`](../../model-profile/v5/contract.md#s-2-routename)、[`S-5`](../../model-profile/v5/contract.md#s-5-providername-与允许的供应商)、[`S-13`](../../model-profile/v5/contract.md#s-13-modelprofileref)、[`S-15`](../../model-profile/v5/contract.md#s-15-modelrequestparameters-是一份词表)、[`S-19`](../../model-profile/v5/contract.md#s-19-extra)、[`S-20`](../../model-profile/v5/contract.md#s-20-项与项名)、[`S-27`](../../model-profile/v5/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本)、[`S-29`](../../model-profile/v5/contract.md#s-29-modeladaptationbinding)、[`S-30`](../../model-profile/v5/contract.md#s-30-配置值与写入者义务)、[`S-31`](../../model-profile/v5/contract.md#s-31-模型定义与档案对齐)、[`S-8`](../../model-profile/v5/contract.md#s-8-两个上限)、[`S-9`](../../model-profile/v5/contract.md#s-9-inputconstraints)、[`S-32`](../../model-profile/v5/contract.md#s-32-upstreaminputlimits)、[`S-33`](../../model-profile/v5/contract.md#s-33-供给上限与上游事实一致) | 路由名、供应商标识、档案的引用、请求参数词表、`extra` 出现时至少一项（「已出门」还原实际发出的那一组时 `extra` 去空即缺席，S-49）、项与项名（「已出门」上两份清单的项名）、档案快照 | `$ref` 它的 `$defs/RouteName`（模型切换落下的那条记录的 `routeName`：PF-013 rev 12 起设置与切换记路由名，落到哪一行由按层覆盖定）、`$defs/ProviderName`、`$defs/ModelProfileRef`、`$defs/ModelRequestParameters`、`$defs/ModelProfileSnapshot`、`$defs/ModelAdaptationBinding`（后五个都在「已出门」上，[S-49](#s-49-模型请求运行时写的五种记录不是消息)） |

  S-9 另实质消费 CB3 S-19 的派生表示结构，加入同一CB3依赖；S-3/S-4/S-5/S-20/S-22仍按原坐标解释标识、可见性、真实来源与写后不变。

  **`data.model-response` 是 `ResponseId` 的家，但不登为本契约的依赖**：它以 `$ref` 取本契约的 `AssistantMessage` 作回复，
  本契约再引用回去两份契约就互为依赖；`ResponseId` 在这里按 `data.identity-values/v1#S-31` 的散文自定义同一形状（[S-37](#s-37-规范表示)）。
  **同一理由，「已出门」上的 `selectedBy`、`credentialScope`、`parameterAdjustments`、`droppedParameters` 也按那份契约的 S-10、S-9、S-11 逐字自定义同一形状、不 `$ref`**（`SelectedBy`、`CredentialScope`、`ParameterAdjustment`；`droppedParameters` 就地定形）；两处逐字对齐的义务登在[验证入口](../verification.md#对齐义务)。
  这是两份 data 契约互引成环时的登记口径：一侧 `$ref` 并登依赖，另一侧逐字自定义、不登依赖、登对齐义务（主线裁定，见 [D-060 §七 M2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) 与 [§四](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记)「L4」那一行；口径写在 [registry](../../../../registry/README.md#covers)）。
  正文里出现的 `data.arrival-events`、`data.loop-extension`、`capability.stream-assembly`、`capability.model-request-runtime`、
  会话日志与记录条目壳、卡片契约、runtime context 契约，**都是消费者或未来的家**：只写坐标或所指，不登依赖。
- **条款编号**：`S-n`，**只在本契约本版本内有效**；外部引用须写全坐标，如 `data.messages/v7#S-28`。
  本文引另一份契约的条款一律带坐标，**裸号只指本契约**

本批增量的精确产品依据为 PF-013 rev16、PF-012 rev21、PF-015 rev20；其余继承条款保留原适用范围。规范共S-1～S-55，接受依据仍只指前驱版本，不提升本候选。新旧条款与消费者逐项见 [consumer-impact.md](consumer-impact.md)。


本轮交叉修订方向见 [technical-choices-r4](../../../../record/proposals/model-runtime-reference-lifecycle/technical-choices-r4.md)，仍为 candidate；当前产品来源逐项核对见 [source-alignment.md](source-alignment.md)。历史接受/裁决 rev 不因本轮改写。

## 本版运行格式边界

本版运行面只消费本版及其**精确依赖链**规定的当前格式。不为被替代的旧接口、旧格式或旧实现提供兼容入口、双轨执行、降级、回填、旧格式只读、认回或结算路径；历史规格与证据保留不构成这些运行承诺。不原地改写、清空或补造用户已有数据；遇到不兼容值沿本契约既有表示拒绝或操作失败边界明确失败，不静默转成当前值，也不新增失败枚举。

**当前代际已经受理的任务与产生的历史事实仍受原保证约束**：同一调用的不可变快照、已有提交与未知结果、恢复、认回、释放和结算责任不因本次演进而消失。这里删除的是旧格式过渡路径，不能据此遗弃当前在途责任、换身份重发、改写原记录或用当前目录覆盖原快照。仍被本版精确引用的 IV、CB、日志、资产及 hooks 等契约按各自版本消费，版本号较小本身不表示兼容过渡。


## 设计依据

| 依据 | 位置 | 本契约取它的什么 |
|---|---|---|
| 发出前留存精确的模型适配绑定，后续更新不改变既有调用的绑定 | [模型适配增量提案](../../../../record/proposals/model-request-adaptation/design.md#绑定与配置的精确取舍)；公共属性 [UL-model-adaptation-binding](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-adaptation-binding--模型适配绑定--model-adaptation-binding) | S-49 的完整留存与两处相等；S-37、S-39 的值层校验。提案与本版都未被本包接受 |
| 七种消息，按谁在说话分；说话的四个、消息七种；系统那三种时间朝向不同 | [PF-009 §4 七种消息](../../../../product/PF-009-context-message-types/design.md#七种消息按谁在说话分) · [说话的有四个](../../../../product/PF-009-context-message-types/design.md#说话的有四个消息却有七种) | S-1、S-7、S-15 |
| 一条对话记录，落在会话日志里；日志 ⊋ 消息 | [PF-009 §4 消息](../../../../product/PF-009-context-message-types/design.md#消息) | S-1、S-2、S-33 |
| 七种各自谁感知得到：表是常态，分歧以块上的标注为准 | [PF-009 §4 七种消息各自谁感知得到](../../../../product/PF-009-context-message-types/design.md#七种消息各自谁感知得到) · [三件容易搞错的事](../../../../product/PF-009-context-message-types/design.md#三件容易搞错的事) | S-5 |
| 出门的时候七种分三类：直接对应、必须译掉、不进请求 | [PF-009 §4 出门的时候七种分三类](../../../../product/PF-009-context-message-types/design.md#出门的时候七种分三类) | S-34、S-35、S-36 |
| 我们自己那两种每一家都要有落点，两种各自决定，不许落空也不许丢；工具过程不在此列 | [PF-009 §5.2](../../../../product/PF-009-context-message-types/design.md#52-我们自己那两种在各家落成什么) · [§6.2](../../../../product/PF-009-context-message-types/design.md#62-我们自己那两种每一家都要有落点不许落空也不许丢) | S-35、S-36 |
| 落到对面之后内容上要自带标识，标识由系统加；产生者交的是消息不是带标签的文本 | [PF-009 §5.3](../../../../product/PF-009-context-message-types/design.md#53-落到对面之后agent-还得分得出这不是人说的) · [§6.3](../../../../product/PF-009-context-message-types/design.md#63-提醒的标识由系统加产生提醒的那一处交的是消息) | S-15、S-35 |
| 消息的内容是一串块；块的类型是载体 | [PF-009 §4 消息的内容是一串块](../../../../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本) · [§6.6](../../../../product/PF-009-context-message-types/design.md#66-内容是块不在进日志时压成文本) | S-2、S-6 |
| 标注在块上不在消息上 | [PF-009 §4 每个块带两个标注](../../../../product/PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗) · [§6.11](../../../../product/PF-009-context-message-types/design.md#611-每个块都带给人看--给模型看两个标注) | S-5 |
| 提醒：外面进来的信息；来源表；来源是属性不是另一种消息；真实结果落哪种消息只看有没有占位 | [PF-009 §4 SystemReminderMessage](../../../../product/PF-009-context-message-types/design.md#systemremindermessage) · [§6.5](../../../../product/PF-009-context-message-types/design.md#65-来源是一个属性不是另一种消息) | S-12、S-15、S-18、S-19、S-22～S-26 |
| 提醒独立成一种、不是带标记的用户消息；一条消息是谁说的永远查得到、不靠解析内容 | [PF-009 §5.1](../../../../product/PF-009-context-message-types/design.md#51-systemremindermessage-凭什么独立而不是一条带标记的用户消息) · [§6.1](../../../../product/PF-009-context-message-types/design.md#61-一条消息是谁说的永远查得到且不靠解析内容) | S-1、S-15 |
| 说状态还是说事；说状态的写清从什么变成了什么；消息一律追加 | [PF-009 §5.4](../../../../product/PF-009-context-message-types/design.md#54-提醒说的是现在什么样还是刚才发生了什么) · [§6.4](../../../../product/PF-009-context-message-types/design.md#64-说状态的写清变化说事的写清发生消息一律追加) | S-16、S-17 |
| 分次到达的不是第八种；半条消息不是消息；组装出来的与一次性拿到的相同 | [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#55-一条消息是分次到达的) · [半条消息不是消息](../../../../product/PF-009-context-message-types/design.md#半条消息不是消息) · [§6.7](../../../../product/PF-009-context-message-types/design.md#67-分次到达的东西不进消息类型清单) · [§6.8](../../../../product/PF-009-context-message-types/design.md#68-组装的结果与一次性拿到的必须相同) | S-1、S-9 |
| 流断在半路的五行表；半截调用记下来不给看；用户看见了的日志里必须有 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [§6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) · [§6.10](../../../../product/PF-009-context-message-types/design.md#610-没收齐的工具调用参数不解析不执行) | S-10 |
| 中断这件事本身要让 agent 知道：只要中断就补提醒 | [PF-009 §5.6 中断这件事本身](../../../../product/PF-009-context-message-types/design.md#中断这件事本身要让-agent-知道) · [§6.13](../../../../product/PF-009-context-message-types/design.md#613-只要发生了中断就补一条提醒) | S-21 |
| 一份日志两种组装；日志完整、删减只在组装 | [PF-009 §5.7](../../../../product/PF-009-context-message-types/design.md#57-一份会话日志两种组装) · [§6.12](../../../../product/PF-009-context-message-types/design.md#612-日志完整删减只发生在组装那一步) | S-5、S-28 |
| 工具说过程：一次执行一条、块可以很多；帧就是它的到达增量；与工具消息是两条轨；不进模型 | [PF-009 §4 ToolInternalMessage](../../../../product/PF-009-context-message-types/design.md#toolinternalmessage) · [§5.8](../../../../product/PF-009-context-message-types/design.md#58-toolinternalmessage工具说它正在干什么) · [§6.14](../../../../product/PF-009-context-message-types/design.md#614-工具帧不进模型的上下文) | S-11、S-13、S-14、S-36 |
| 压缩记录单独成一种：它顶替了哪一段 | [PF-009 §4 CompactionMessage](../../../../product/PF-009-context-message-types/design.md#compactionmessage) · [凭什么单独成一种](../../../../product/PF-009-context-message-types/design.md#compactionmessage-凭什么单独成一种两条) | S-27 |
| 卸载后的占位是工具消息；系统发起的等待答复是提醒 | [PF-009 §9.1](../../../../product/PF-009-context-message-types/design.md#91-这四件事归-pf-010不是本-topic-的缺口) | S-11、S-22 |
| **七种里六种落会话日志；`SystemMessage` 不落，每次组装现算**（PF-009 rev 8 起） | [PF-009 §4 消息](../../../../product/PF-009-context-message-types/design.md#消息) · [§5.7](../../../../product/PF-009-context-message-types/design.md#57-一份会话日志两种组装) | S-1、S-7、S-29、S-32 |
| **系统提示词本版只含文本**（PF-010 rev 6 起） | [PF-010 §4 给模型那一侧](../../../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装) | S-6、S-7 |
| 执行怎么收场，工具说过程的那条都照常收尾：交付过块的有，一块没交付的没有（PF-009 rev 8 起覆盖失败与等不到应答） | [PF-009 §5.8 执行帧](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量) | S-13、S-14 |
| 被中断的回复不交出动作：收齐参数的调用也不执行，留在那条消息里 | [PF-014 §5.4](../../../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办) | S-10 |
| 一次调用绑定有效模型、档案快照与参数，各次发出用同一份；切换记的是路由名 | [PF-013 §6.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前) · [§5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) | S-49、S-50 |
| 日志只留最终那条；收尾之前是在途状态 | [PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程) · [在途状态](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) | S-1、S-13 |
| 几样东西各自落成哪一种消息 | [PF-010 §5.5](../../../../product/PF-010-context-management-and-assembly/design.md#55-几样东西各自落成哪一种消息) | S-11、S-22 |
| 块上两位落了就不动；此刻模型可读是算出来的；名单跟着摘要走让日志能重放 | [PF-010 §5.7 那两个标注仍然是这件事的前提](../../../../product/PF-010-context-management-and-assembly/design.md#那两个标注仍然是这件事的前提) · [名单跟着摘要走](../../../../product/PF-010-context-management-and-assembly/design.md#名单跟着摘要走是为了让日志能重放) · [§6.10](../../../../product/PF-010-context-management-and-assembly/design.md#610-压缩只能做两件事且落成同一条消息) · [§6.11](../../../../product/PF-010-context-management-and-assembly/design.md#611-压缩只管给模型看那一侧) | S-27、S-28 |
| 压缩不能做的三件事；输入区间上界是上一次模型请求；悬着的不许点名；边界要看哪些块还可读 | [PF-010 §5.8](../../../../product/PF-010-context-management-and-assembly/design.md#58-压缩不能做的有三件事) · [§6.12](../../../../product/PF-010-context-management-and-assembly/design.md#612-记录里的消息一条都不能擦除) · [§6.13](../../../../product/PF-010-context-management-and-assembly/design.md#613-上一次模型请求之后新来的消息不许压) · [§6.14](../../../../product/PF-010-context-management-and-assembly/design.md#614-悬着的东西不许被点名) · [§6.15](../../../../product/PF-010-context-management-and-assembly/design.md#615-组装边界要看哪些块还模型可读不是最后一条摘要在哪) | S-28、S-29、S-30 |
| 系统提示词只有一块、压缩碰不到它 | [PF-010 §4 给模型那一侧](../../../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装) · [系统提示词](../../../../ubiquitous_language/terms/record-and-context.md#ul-system-prompt--系统提示词--system-prompt) | S-7、S-29 |
| 压缩之后 meta runtime context 要重新给一份完整的 | [PF-010 §6.16](../../../../product/PF-010-context-management-and-assembly/design.md#616-压缩之后meta-runtime-context-要重新给一份完整的) | S-25 |
| 先对账再进方程：追补占位工具消息、追补后台异常中断的提醒 | [PF-012 §5.7 先对账](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) | S-11、S-19 |
| 每一次尝试开始的四件事：拉一次 runtime context、对不上就落一条状态提醒；追加一条尝试提醒 | [PF-012 §5.7 四件事](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事) | S-20、S-25 |
| 尝试提醒同时是尝试开始记录，带 Run、序号、时间、原因；序号显式写出 | [PF-012 §6.4](../../../../product/PF-012-agent-loop-and-run/design.md#64-每一次尝试开始agent-都要知道) · [§4 执行尝试](../../../../product/PF-012-agent-loop-and-run/design.md#执行尝试) | S-20 |
| 循环守卫 L1／L2 写干预消息，阶梯从日志里数 | [PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯) | S-23 |
| 外面进来的事落成哪一种消息；runtime context 变更只在 Run 未闭合时进来 | [PF-012 §5.11](../../../../product/PF-012-agent-loop-and-run/design.md#511-外面进来的事怎么到-agent-眼前) | S-12、S-19、S-25 |
| 悬着的东西各有一个占位，不许被压掉；「什么叫悬着」归 PF-012 | [PF-012 §6.11](../../../../product/PF-012-agent-loop-and-run/design.md#611-悬着的东西不许被压掉) | S-30 |
| 会话日志只增不改，压缩、卸载都是追加 | [PF-012 §4 会话日志](../../../../product/PF-012-agent-loop-and-run/design.md#会话日志) · [只增不改怎么和压缩卸载共存](../../../../product/PF-012-agent-loop-and-run/design.md#只增不改怎么和压缩卸载共存) | S-27、S-28 |
| 什么会进队列、各落成哪一种消息；什么不进 | [PF-014 §5.7](../../../../product/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空) | S-8、S-12、S-24 |
| 注入的上下文变了、没有运行在跑时什么都不做 | [PF-014 §6.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#610-注入的上下文变了没有运行在跑时什么都不做) | S-25 |
| 变更了看谁消费它；前值取日志里最后感知到的那一份 | [PF-015 §6.8](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#68-变更了要不要告诉-agent看谁消费它) | S-17、S-25 |
| 模型看见一块 runtime context 只有两种形态 | [PF-015 §6.9](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#69-模型看见一块-runtime-context只有两种形态) | S-17、S-25 |
| 六种收场；转后台是前台那一次调用的收场，后台那段执行另有收场、以提醒到达 | [PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种) · [转后台是前台那一次调用的收场](../../../../product/PF-006-tools-and-skills/design.md#转后台是前台那一次调用的收场后台执行另有自己的收场) | S-11、S-19 |
| 占位一律说清原因；后台异常中断追补一条提醒、收场是失败 | [PF-006 §6.7 占位消息一律要说清原因](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因) | S-11、S-19 |
| 工具执行停了就不重来 | [PF-006 §6.12](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来) | S-14、S-19 |
| 系统提示词的成分在实例存续期内恒定，成品是那一次请求的属性 | [PF-004 §5.4](../../../../product/PF-004-agent-definition-and-assembly/design.md#54-为什么系统提示词必须落在第三列) | S-7 |
| 决策卡片；等待态的两个维度；「不回答」是合法答复；记录里要分得出是哪一件拓展件出的卡 | [PF-008 §4 决策卡片](../../../../product/PF-008-human-in-the-loop/design.md#决策卡片) · [等待态的两个维度](../../../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度) · [§6.5](../../../../product/PF-008-human-in-the-loop/design.md#65-不回答是合法答复) · [§6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同) | S-22 |
| 数据契约自研；三层落 core | [D-035](../../../../record/decisions/message-and-stream-baseline/decision.md) | 全篇 |
| 消息有稳定的身份，不从会变的文本或时间点算出来 | [domain_objects 消息](../../../../domain_objects/objects.md#ul-message--消息) | S-3、S-4 |
| 规格形式；部署边界；租户隔离 | [SYS-SPEC](../../../../foundation/cross-system-constraints/requirements.md#sys-spec) · [SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy) · [SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 见下方引文 |
| 统一语言正式名 | [记录与上下文](../../../../ubiquitous_language/terms/record-and-context.md) · [执行与收场](../../../../ubiquitous_language/terms/execution-and-outcome.md) · [agent runtime 与 loop](../../../../ubiquitous_language/terms/agent-runtime-loop.md) | 全部英文名 |

> **没有产品行、或产品行不足以单独支撑的条款，逐条点名：**
>
> | 条款 | 依据来自哪 |
> |---|---|
> | [S-37](#s-37-规范表示)～[S-40](#s-40-表示层拒绝不是判定也不修补) | **SYS-SPEC**：规范表示、闭合枚举、表示层拒绝值与「表示层不等于判定」是规格形式的要求 |
> | [S-18](#s-18-来源闭合拓展件走兜底) 的「封闭联合 ＋ `extension` 兜底」 | **产品负责人 2026-09-23 的裁决**（[D-058 Q3](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔)） |
> | [S-12](#s-12-真实结果落哪种消息只看有没有占位) 的判据、[S-24](#s-24-别的会话捎话与到点了) 两种来源落成提醒 | **产品负责人 2026-09-23 的裁决**（[D-058 Q15](../../../../record/decisions/message-and-shape-rulings/decision.md#十九处分岔)） |
> | [S-19](#s-19-后台执行的两种收场提醒) 的「`source` 不带结果」、[S-20](#s-20-尝试开始) 的三个原因、[S-22](#s-22-系统发起的等待答复回来) 的读法 | **主线裁定**，见 [D-060 §一 S3-a、S3-b、S3-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s3messages报回的) |
> | [S-21](#s-21-中断之后必补一条) 的「工具执行被中断不另补」 | **主线裁定**，见 [D-060 §一 S13-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的) |
> | [S-24](#s-24-别的会话捎话与到点了) 的 `SessionRef` 归属 | **主线裁定**，见 [D-060 §一 S21-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s21connector报回的) |
> | [S-49](#s-49-模型请求运行时写的五种记录不是消息)～[S-50](#s-50-调用终结的三支) 五种运行时记录的家；`ResponseId` 在「已出门」时定下 | **主线裁定**，见 [D-060 §一 S16-d、S16-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) |
> | [S-31](#s-31-收齐却解析不了的调用) 的组合规则 | [PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)（收齐却解析不了的调用由工具执行一侧收下、以一条 `failed` 的结果回给模型）；块的形状见 [D-060 §一 S1-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s1content-blocks报回的) |
> | 各来源的结构化成员、[S-21](#s-21-中断之后必补一条) 的 `about`、[S-9](#s-9-assistantmessage一次回复只有一份) 的「一次回复只有一份权威内容」、[S-23](#s-23-循环守卫的干预) 的 `level_n` token、[S-26](#s-26-拓展件追加的提醒) 的名字空间、[S-39](#s-39-表示层拒绝值) 的 `block_id_duplicate`、[S-50](#s-50-调用终结的三支) 的 `released` 这个名字 | **规格层推导**：各条正文写明理由（同一件事一个名字、两份权威会分叉等）；这些命名主线已接受，见 [D-060 §六 N-5](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加) |
> | [S-10](#s-10-assistantmessage-怎么收的尾) 回复流的结局怎样对到 `ending`（含运行被取消的两支）、[S-21](#s-21-中断之后必补一条) 那两支的 `by`；[S-14](#s-14-toolinternalmessage-怎么收的尾) 宿主被撤下时的帧流；[S-39](#s-39-表示层拒绝值) 工具消息的结果块不带 `terminated_by_agent`；[S-49](#s-49-模型请求运行时写的五种记录不是消息) `extra` 去空之后整个缺席 | **主线裁定**，见 [D-060 §七 M1、M12、M23、M28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) |
> | [S-13](#s-13-toolinternalmessage)、[S-14](#s-14-toolinternalmessage-怎么收的尾) 的成立判据与对应表（只有有意停下才是 `interrupted`）；[S-7](#s-7-systemmessage)、[S-6](#s-6-每种消息能装哪几类块)、[S-29](#s-29-合法名单的判定)、[S-32](#s-32-会话日志里的配对与唯一) 随 PF-009 rev 8、PF-010 rev 6 的改写；[S-49](#s-49-模型请求运行时写的五种记录不是消息) 「已出门」时铸 `ResponseId` 并带上调用的绑定；[S-50](#s-50-调用终结的三支) `released` 可带 `cause` | **主线裁定**，见 [D-060 §五 K2、K3、K15、K20、K21](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)（K21 的成因名本契约取 `credential_unavailable`，见 S-50） |
> | [S-4](#s-4-createdat-不是次序)、[S-6](#s-6-每种消息能装哪几类块)、[S-10](#s-10-assistantmessage-怎么收的尾) 的两条组合约束、[S-13](#s-13-toolinternalmessage) 的「至少一块」、[S-17](#s-17-说状态的带前值与现值) 的「现值不为 null」、[S-27](#s-27-compactionmessage-与它的名单) 的「摘要与名单不能都空」、[S-28](#s-28-此刻模型可读是算出来的) 的嵌套部分、[S-29](#s-29-合法名单的判定) 的 ③ | **规格层推导**：[`data.content-blocks/v3`](../../content-blocks/v3/contract.md#九明确不承诺) 把「哪种消息能装哪几类块」「能不能单独点名嵌套块」交给本契约；推导各写在条款正文里 |
> | [S-33](#s-33-消息不携带租户身份) | **SYS-TENANT** |
> | [第五节](#五装配给与协议给) | **SYS-DEPLOY** |

## 一、目的与消费者

### 这份契约拥有什么

**消息的含义与形状**：七种消息各自是什么、带什么、谁感知得到、出门怎么办；
提醒的来源是一张怎样的闭合表、说状态的要带什么；压缩名单长什么样、什么样的名单合法；
「此刻哪些块模型可读」怎样从日志里算出来；一次工具执行的真实结果落哪一种消息；
以及一条消息不合形状时的**表示层拒绝值**。
**另拥有模型请求运行时写进会话日志的五种记录**（已出门、已开口、中断意图、调用终结，以及[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的那条记录，[S-49](#s-49-模型请求运行时写的五种记录不是消息)、[S-50](#s-50-调用终结的三支)）：
它们**不是消息**，与消息同处一份日志、同为记录条目的载荷（家放在这里、不另立契约——主线裁定，见 [D-060 §一 S16-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。

它是一份**数据契约**：没有操作、没有提交点、没有状态转移，**因此不需要插件**。
消息被会话日志、上下文组装、流装配、工具运行时、模型请求运行时、入站受理与恢复对账共享，写两遍必然分叉，
所以它先于这些能力的契约定型，其余契约**引用它的 `$defs` 名与成员名，不复述定义**。

**它不拥有**：块本身（`data.content-blocks` v3）；会话日志与承载消息的记录条目壳（loop 与会话那一程，[G-2](#九已知缺口)）；
组装与压缩这两个操作——什么时候压、压哪一段、摘要怎么写、组装取哪一份表示（PF-010 的能力）；
块怎样一段段到达、怎样封口（`data.arrival-events`、`capability.stream-assembly`）——**但帧流与回复流的结局怎样对到本契约的 `ending`，归本契约**：帧流那张对应表在 [S-14](#s-14-toolinternalmessage-怎么收的尾)，回复流在 [S-10](#s-10-assistantmessage-怎么收的尾)（主线裁定，见 [D-060 §五 K2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)、[§七 M1](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）；
各家 adapter 的落点表本身（模型请求运行时与传输适配，本契约只写[「必须译掉」的义务](#四出门的三条义务)）。逐条见[第十节](#十明确不承诺)。

### 消费者

| 消费者 | 消费什么 |
|---|---|
| 会话日志与记录条目壳（loop 与会话那一程，未起草） | 消息是条目的载荷：[S-2](#s-2-消息底座)、[S-3](#s-3-messageid)、[S-32](#s-32-会话日志里的配对与唯一)、[S-33](#s-33-消息不携带租户身份)；追加时的合法性判定 [S-29](#s-29-合法名单的判定) |
| PF-010 上下文组装与压缩（无契约） | [S-5](#s-5-给谁看在块上)、[S-27](#s-27-compactionmessage-与它的名单)～[S-30](#s-30-悬着的占位)：按块标注与名单取，按合法名单写 |
| `capability.stream-assembly` v3 | 收尾产出 `AssistantMessage` 与 `ToolInternalMessage`：[S-9](#s-9-assistantmessage一次回复只有一份)、[S-10](#s-10-assistantmessage-怎么收的尾)、[S-13](#s-13-toolinternalmessage)、[S-14](#s-14-toolinternalmessage-怎么收的尾)、[S-31](#s-31-收齐却解析不了的调用)；**两张结局对应表的消费者**——帧流结局 → `ToolInternalEnding`（S-14）、回复流结局 → `ending`（S-10），引用、不另写 |
| `data.arrival-events` v2 | **不消费本契约**：它的 `FinishReason` 是 S-10、S-14 两张对应表的输入，它只以坐标指到这两张表 |
| `data.model-response` v4 | `$ref` 本契约的 `AssistantMessage` 作回复；[S-9](#s-9-assistantmessage一次回复只有一份)：`response` 指回它；一次回复只有一份权威内容 |
| `data.loop-extension` v3 | 位置的 subject 里的消息取本契约的形状 |
| `data.connector` v2 | `SessionRef`（[S-24](#s-24-别的会话捎话与到点了)） |
| `capability.tool-execution-runtime` v2 | [S-11](#s-11-toolmessage)、[S-12](#s-12-真实结果落哪种消息只看有没有占位)、[S-13](#s-13-toolinternalmessage)、[S-19](#s-19-后台执行的两种收场提醒)：工具消息、占位、后台收场提醒、工具说过程；[S-14](#s-14-toolinternalmessage-怎么收的尾) 帧流结局的对应表（引用、不另写） |
| `capability.model-request-runtime` v2 与传输适配 | [第四节](#四出门的三条义务)的三条义务；[S-9](#s-9-assistantmessage一次回复只有一份)；[S-10](#s-10-assistantmessage-怎么收的尾) 回复流结局的对应（按它包消息，含运行被取消的两支）与 [S-21](#s-21-中断之后必补一条) 的 `by`；它写的五种记录（[S-49](#s-49-模型请求运行时写的五种记录不是消息)、[S-50](#s-50-调用终结的三支)） |
| PF-014 入站受理与队列（无契约） | [S-1](#s-1-七种消息)、[S-8](#s-8-usermessage)、[S-15](#s-15-systemremindermessage正文给模型读来源给系统认)、[S-24](#s-24-别的会话捎话与到点了)：进来的是哪一种消息 |
| PF-012 恢复对账与循环守卫（无契约） | [S-19](#s-19-后台执行的两种收场提醒)、[S-20](#s-20-尝试开始)、[S-23](#s-23-循环守卫的干预)、[S-32](#s-32-会话日志里的配对与唯一)：读 `source` 找「后台执行 X 结束了没」、数阶梯 |
| 卡片（PF-008，契约未建立） | [S-22](#s-22-系统发起的等待答复回来) |
| runtime context 的生产与拉取（PF-015，契约未建立） | [S-17](#s-17-说状态的带前值与现值)、[S-25](#s-25-runtime-context-的变更与全量) |

> 上表没有一行是本契约的依赖：方向一律是消费者 → 本契约，登记在各消费者自己的 catalog 条目里。

## 二、含义与使用范围

**适用范围**：一个部署之内，一份[会话日志](../../../../ubiquitous_language/terms/record-and-context.md#ul-session-log--会话日志--session-log)里的消息。
本版完整交付是单机，但每一条的**领域语义在跨进程之后必须原样成立**；
哪些结论在单机由装配给出、分布式后必须由协议重新兑现，列在[第五节](#五装配给与协议给)。

「本消息之前」「排在前面」一律指**会话日志里的先后**。那个先后由会话日志给出（它只增不改、按发生的顺序），
**本契约以它为前提，不定义它**（[G-2](#九已知缺口)）；消息自己身上没有任何成员表示次序（[S-4](#s-4-createdat-不是次序)）。

### 规格层 token 与词条的对应

交换表示用 token，对外文档用词条名，**两者不得互相替代**。

| 规格层 token | 词条 |
|---|---|
| `Message` | [消息 · Message](../../../../ubiquitous_language/terms/record-and-context.md#ul-message--消息--message) |
| `type`: `system` · `user` · `assistant` · `tool` · `tool_internal` · `system_reminder` · `compaction` | 消息词条的七种：`SystemMessage` · `UserMessage` · `AssistantMessage` · `ToolMessage` · `ToolInternalMessage` · `SystemReminderMessage` · `CompactionMessage` |
| `CompactionMessage` | [压缩记录 · Compaction Record](../../../../ubiquitous_language/terms/record-and-context.md#ul-compaction-record--压缩记录--compaction-record) |
| `silenced` | 压缩记录「自己带着的那份名单」 |
| `ToolInternalMessage` 的块从哪来 | [执行帧 · Execution Frame](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame) 封口之后的块 |
| 收尾之前拼到一半的那份 | [在途状态 · In-Flight Arrival](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)（**不是消息**） |
| `background_execution_*` | [后台执行 · Background Execution](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-background-execution--后台执行--background-execution) |
| 工具等待态的答复 | [工具等待态 · Tool Wait State](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-wait-state--工具等待态--tool-wait-state) |
| `system_wait_answered` 答复的那种等待 | [运行等待态 · Run Wait State](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)；卡片是[决策卡片 · Decision Card](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) |
| `attempt_started` 说的那次尝试 | [执行尝试 · Run Attempt](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt) |
| `extension`、`system_wait_answered.extension` 指的那一件 | [拓展件 · Loop Extension](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension) |
| `runtime_context_*` 说的那一块 | [运行时 context · Runtime Context](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context)；全量那一份给的是 [元 runtime context](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-meta-runtime-context--元-runtime-context--meta-runtime-context) |
| `SystemMessage` 的内容 | [系统提示词 · System Prompt](../../../../ubiquitous_language/terms/record-and-context.md#ul-system-prompt--系统提示词--system-prompt) |
| `what: run` 被中断之后落的那种结局 | [运行终态 · Run Terminal State](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-terminal-state--运行终态--run-terminal-state)（被取消） |
| 提醒的 `source`（`ReminderSource`） | [来源标记 · Source Tag](../../../../ubiquitous_language/terms/record-and-context.md#ul-source-tag--来源标记--source-tag)：「谁捎来的」，是属性不是另一类（[S-18](#s-18-来源闭合拓展件走兜底)） |
| 文本块上的 `origin`（只在用户消息里，[S-6](#s-6-每种消息能装哪几类块)） | [来路标记 · Origin Tag](../../../../ubiquitous_language/terms/record-and-context.md#ul-origin-tag--来路标记--origin-tag)——**不是来源标记** |
| 位置先占着的那条 `ToolMessage` | [占位消息 · Placeholder Message](../../../../ubiquitous_language/terms/record-and-context.md#ul-placeholder-message--占位消息--placeholder-message)（[S-11](#s-11-toolmessage)）；**卸载之后带摘要的那条不是它** |
| `ModelResponse`（`response` 指的那一份） | [模型响应体 · Model Response](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)，家在 `data.model-response` |
| `dispatch`（第几次发出） | [一次发出 · Upstream Send](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-upstream-send--一次发出--upstream-send) |
| 「已出门」上的 `profile` | [有效模型 · Effective Model](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-effective-model--有效模型--effective-model) |

**下列是规格层的名字或无词条的概念**，本契约与 Schema 里**不给它们「中文 · English」那种词条式标题**：
`MessageId`、`ResponseId`、`CardId`、`SessionRef`、`AgentRef`、`ScheduleRef`、`RuntimeContextBlockId`、`CardAnswer`、`SilencedBlockRef`、`LoopExtensionName`、`ModelInvocationRecord` 与它的五种；
**已出门、已开口、中断意图、调用终结**（四种运行时记录，无词条；第五种是模型切换这个动作落下的那条记录，词条不为它另立概念名）；
**悬着的占位**（无词条）；**「此刻模型可读」**（无词条，[S-28](#s-28-此刻模型可读是算出来的) 的派生谓词）；
**循环守卫**（无词条）；**传输适配 / adapter**（无词条）。

### 与相近概念的差异

- **消息 ≠ 会话日志。**日志里还有各种不是消息的事（每次工具执行的账、一次模型调用的响应体、取消请求……），它们**不会在组装时变成消息**。
  本契约管消息这一部分，外加模型请求运行时的五种记录（[S-49](#s-49-模型请求运行时写的五种记录不是消息)）；**尝试开始**是例外——它既是一条提醒，也是那条记录（[S-20](#s-20-尝试开始)）。
- **消息 ≠ 记录条目。**消息是条目的**载荷**；租户、会话、Run、尝试挂在条目上，不在消息上（[S-33](#s-33-消息不携带租户身份)）。
- **消息 ≠ 在途状态。**收尾之前拼到一半的那份由运行时持有、不进日志、**不是消息**；日志里只有收尾之后的那一条（[S-1](#s-1-七种消息)、[S-13](#s-13-toolinternalmessage)）。
- **消息的类型 ≠ 给谁看。**「给谁看」在块上；类型只回答「谁在说话、说的是哪一类话」（[S-5](#s-5-给谁看在块上)）。
- **提醒的 `nature` ≠ 块的填法。**「说状态／说事」这条判据在块的到达过程里落成「整体替换／追加片段」，那是 `data.arrival-events` 的事；
  在这里它只决定提醒必须写出什么（[S-16](#s-16-性质与来源定死对应)）。**消息之间没有取代。**
- **压缩名单 ≠ 块上的标注。**名单是后来追加的一条消息自己带着的，块上的两位从落盘那一刻起就不动（[S-27](#s-27-compactionmessage-与它的名单)）。
- **「此刻模型可读」≠「进了这次请求」。**可读是进请求的必要条件；窗口、模态、成对关系之后怎样取舍，归 PF-010 的组装（[S-28](#s-28-此刻模型可读是算出来的)）。

## 三、值、身份与结构关系

| 元素 | 精确含义 | 条款 |
|---|---|---|
| `Message`、`MessageBase` | 七种消息；共有的四个成员 | [S-1](#s-1-七种消息)、[S-2](#s-2-消息底座) |
| `MessageId`、`createdAt` | 消息的标识；它成为一条完整消息的时刻 | [S-3](#s-3-messageid)、[S-4](#s-4-createdat-不是次序) |
| 七种各自能装的块、各自谁感知得到 | 常态与硬约束 | [S-5](#s-5-给谁看在块上)、[S-6](#s-6-每种消息能装哪几类块) |
| `SystemMessage` … `ToolInternalMessage` | 前五种 | [S-7](#s-7-systemmessage)～[S-14](#s-14-toolinternalmessage-怎么收的尾) |
| `SystemReminderMessage`、`ReminderNature`、`ReminderSource` | 提醒、它说的是事还是状态、它的来源 | [S-15](#s-15-systemremindermessage正文给模型读来源给系统认)～[S-26](#s-26-拓展件追加的提醒) |
| `CompactionMessage`、`SilencedBlockRef` | 压缩记录与名单 | [S-27](#s-27-compactionmessage-与它的名单)～[S-30](#s-30-悬着的占位) |
| 日志层的配对与唯一 | 一次调用一条工具消息、一次回复一条助手消息…… | [S-32](#s-32-会话日志里的配对与唯一) |
| `ModelInvocationRecord` 与它的五种 | 模型请求运行时写进日志的记录，**不是消息** | [S-49](#s-49-模型请求运行时写的五种记录不是消息)、[S-50](#s-50-调用终结的三支) |

### S-1 七种消息

**消息恰七种，按 `type` 判别：`system`、`user`、`assistant`、`tool`、`tool_internal`、`system_reminder`、`compaction`。**
按「谁在说话、说的是哪一类话」分：系统在开头说设定、人说要做什么、模型回答、工具说结果、工具说过程、系统在中途说外面来了什么、系统回头概括前面那一段。

- **`type` 是「这条是谁说的」的唯一依据**：不读内容、不找标记（[PF-009 §6.1](../../../../product/PF-009-context-message-types/design.md#61-一条消息是谁说的永远查得到且不靠解析内容)）。
  内容里的任何标记都不能让一条消息变成另一种，**一条 `user` 消息的正文写着「系统提醒」仍是人说的话**。
- **分次到达的东西不是第八种。**一条正在长的块、拼到一半的那份，**不是一条消息**：不能被当成消息存进日志，也不能被当成消息喂给 agent；
  它要么长成一条完整的消息，要么按流断的规矩收场（[PF-009 §6.7](../../../../product/PF-009-context-message-types/design.md#67-分次到达的东西不进消息类型清单)）。
  **本契约里的每一条消息都是收尾之后的那一条。**
- **七种里六种落会话日志；`SystemMessage` 不落**，每次组装时现算（[PF-009 §4 消息](../../../../product/PF-009-context-message-types/design.md#消息)，rev 8 起；[S-7](#s-7-systemmessage)）。
  本契约说「日志里的消息」时，指的是其余六种。
- **`type` 集合闭合**（[S-38](#s-38-判别式与枚举闭合)）：未知取值是表示层拒绝 `type_unknown`，**不映射到「最接近」的一种，不当作用户消息兜底**；`type` 缺席是 `malformed`。

### S-2 消息底座

**每一条消息都带 `id`、`type`、`blocks`、`createdAt`，四个都必填；各种消息另有自己的成员，成员集合闭合。**

| 成员 | 含义 | 条款 |
|---|---|---|
| `id` | 消息在一份会话日志里的标识 | [S-3](#s-3-messageid) |
| `type` | 七种之一 | [S-1](#s-1-七种消息) |
| `blocks` | 一串[内容块](../../../../ubiquitous_language/terms/record-and-context.md#ul-content-block--内容块--content-block)，形状取自 [`data.content-blocks/v3#S-1`](../../content-blocks/v3/contract.md#s-1-七类块)；**次序有意义，原样保留**；可以是空数组，各种消息另有限制（[S-6](#s-6-每种消息能装哪几类块)） | [S-6](#s-6-每种消息能装哪几类块) |
| `createdAt` | 它成为一条完整消息的时刻 | [S-4](#s-4-createdat-不是次序) |

- **一块不合形状，整条消息被拒。**块层的拒绝值（[`data.content-blocks/v3#S-26`](../../content-blocks/v3/contract.md#s-26-表示层拒绝值)）原名落进本契约的拒绝集合（[S-39](#s-39-表示层拒绝值)）；
  **不丢掉坏的那一块留下其余的**（[`data.content-blocks/v3#S-27`](../../content-blocks/v3/contract.md#s-27-表示层拒绝不是判定也不修补)）——一条少了一块的消息说的已经不是产生者说的话。
- **一条消息里的块标识唯一，含任意嵌套层**（[`data.content-blocks/v3#S-3`](../../content-blocks/v3/contract.md#s-3-blockid)）。
  那一条把检查交给「看得见整条消息的边界」——**就是本契约的接收边界**：重复即 `block_id_duplicate`（[S-39](#s-39-表示层拒绝值)）。
  流上的生产者给错 `id` 时，那一条帧消息或回复在这里整条被拒；到达那一侧的交接见 `data.arrival-events` v2 与 `capability.stream-assembly` v3。
- 消息上**没有**「给谁看」、租户、会话、Run、作者、次序这几样成员（[S-5](#s-5-给谁看在块上)、[S-33](#s-33-消息不携带租户身份)、[S-4](#s-4-createdat-不是次序)）；带了即 `malformed`。

### S-3 MessageId

**`MessageId` 是一条消息的标识：在一份会话日志之内唯一，不回收、不复用。**

- **不透明**：交换表示按 [`data.identity-values/v1#S-31`](../../identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的散文——
  非空、首尾不属于那个显式空白码点集合、**逐码点精确相等**、**消费者不解析它**，不从中读出次序、时间、类型或归属。词法形式本契约不承诺（[G-1](#九已知缺口)）。
- **不从会变的东西算出来**：不从正文、不从时间点、不从在日志里的位置派生（[domain_objects 消息](../../../../domain_objects/objects.md#ul-message--消息)：身份另有来路）。
  理由：压缩名单与配对都靠它指认，一个从内容算出的标识会让两条内容相同的消息撞在一起。
- **`(messageId, blockId)` 指认一个块**，含任意嵌套层——这是 [`data.content-blocks/v3#S-3`](../../content-blocks/v3/contract.md#s-3-blockid) 留给本契约的那一半；压缩名单点的就是它（[S-27](#s-27-compactionmessage-与它的名单)）。
- **它由把消息写进日志的那一方在落盘之前铸出，唯一性也由那一方保证**：流装配交出的内容里没有它，包成消息时才给（`capability.stream-assembly` v3）。
  怎么分配归 realization，分布式后的兑现见[第五节](#五装配给与协议给)。

### S-4 createdAt 不是次序

**`createdAt` 是写入方记下的、这条消息成为一条完整消息的时刻**——分次到达的消息取它收尾的那一刻。按 [`data.offer-expiry/v1#S-22`](../../offer-expiry/v1/contract.md#s-22-schema-的范围) 的 `Instant` 表示。

- **它不是次序。**「本消息之前」一律按会话日志里的先后（[第二节](#二含义与使用范围)），**不按 `createdAt` 比较**：
  两条消息可以有相同的 `createdAt`，沿日志往后 `createdAt` 也可以变小（时钟回拨、跨节点）。
- **它不是身份**，不参与任何相等或指认（[S-3](#s-3-messageid)）。
- 它是给人看、给追溯用的一个事实；**任何判定（压缩名单的合法性、配对、此刻模型可读）都不读它**。

### S-5 给谁看在块上

**消息不带「给谁看」——那在每个块的[块标注](../../../../ubiquitous_language/terms/record-and-context.md#ul-block-annotation--块标注--block-annotation)上**（[`data.content-blocks/v3#S-4`](../../content-blocks/v3/contract.md#s-4-两个标注)）。
下表是七种消息**常态**下谁感知得到，**遇到分歧，以块上的标注为准**（[PF-009 §4](../../../../product/PF-009-context-message-types/design.md#七种消息各自谁感知得到)）：

| 消息 | agent 感知得到（在给 agent 的那一份里） | 用户感知得到（在给人的那一份里） | 常态下块的标注 |
|---|---|---|---|
| `system` | ✓ | ✗ | `{ toHuman: false, toModel: true }` |
| `user` · `assistant` · `tool` · `system_reminder` · `compaction` | ✓ | ✓ | 多数 `{ toHuman: true, toModel: true }` |
| `tool_internal` | ✗ | ✓ | `{ toHuman: true, toModel: false }`——**`toModel` 这一位是硬约束**（[S-13](#s-13-toolinternalmessage)） |

- **这张表只对 `tool_internal` 的模型那一侧是强制的**；其余是写块的一方照着做的常态，**不是接收边界的检查**。
  一条消息里各块可以各去各的——一条被中断的回复里，文本块两边都给，没长完的工具调用块两边都不给（[`data.content-blocks/v3#S-13`](../../content-blocks/v3/contract.md#s-13-半截的工具调用)）。
- **组装只读块上的标注（与压缩名单），不从消息的类型推给谁看。**「两边都看得见」不等于两边看到的一样——怎么呈现归呈现。

### S-6 每种消息能装哪几类块

**块的定义取自 `data.content-blocks` v3；哪种消息能在顶层装哪几类块，由下表定。违反任一格即 `malformed`**（`tool` 那一行另有具名拒绝值）。

| 块（顶层） | `system` | `user` | `assistant` | `tool` | `tool_internal` | `system_reminder` | `compaction` |
|---|---|---|---|---|---|---|---|
| 文本 | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| 语音 · 图 · 文件 | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| 思考 | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| 工具调用（两种形状） | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| 工具结果 | ✗ | ✗ | ✗ | **恰好一块**（[S-11](#s-11-toolmessage)） | ✗ | **只在后台执行的两种收场提醒里，恰好一块**（[S-19](#s-19-后台执行的两种收场提醒)） | ✗ |
| 带[来路标记](../../../../ubiquitous_language/terms/record-and-context.md#ul-origin-tag--来路标记--origin-tag) `origin` 的文本 | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

几处排除的依据：

- **系统提示词本版只含文本**（[PF-010 §4](../../../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装)，rev 6 起）：`system` 那一列只收文本块。
- **思考只在模型的回复里**：它是「模型的推理过程，与它给人看的话分开」（[PF-009 §4](../../../../product/PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)）；别人说的话里没有模型的推理。
- **工具调用只在模型的回复里**：调用只由模型在它的回复里发起——这正是 [`data.content-blocks/v3#S-16`](../../content-blocks/v3/contract.md#s-16-结果里不发起调用) 不许结果里出现调用的那条理由，放到消息这一层同样成立：
  出现在别处的调用块，会被读成「模型发起过的调用」。
- **工具结果只在两处**：它是一次调用的结果，**一次调用的结果只有两个去处**——还没有占位时的工具消息、已有占位时的后台收场提醒（[S-12](#s-12-真实结果落哪种消息只看有没有占位)）。
- **来路标记只在用户消息的顶层文本块上**：它的四个取值都出自人敲的斜杠命令（[`data.content-blocks/v3#S-8`](../../content-blocks/v3/contract.md#s-8-文本块与来路标记)），
  而那一条展开之后落成用户消息（[PF-014 §5.7](../../../../product/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空)）。

嵌套层（工具结果块的 `blocks`、派生表示的 `blocks`）照 `data.content-blocks` v3 自己的规则，本表不再加限制。

### S-7 SystemMessage

**系统在开头说的设定：你是谁、你有什么能用——它的内容是[系统提示词](../../../../ubiquitous_language/terms/record-and-context.md#ul-system-prompt--系统提示词--system-prompt)。**

- **成分在实例存续期内恒定**（[PF-004 §5.4](../../../../product/PF-004-agent-definition-and-assembly/design.md#54-为什么系统提示词必须落在第三列)）：
  一次运行中途发生的事、变了的状态，**不以一条新的 `SystemMessage` 出现**，以提醒出现——把偶发的事写进长期设定，就把一件事变成了设定（[PF-009 §4](../../../../product/PF-009-context-message-types/design.md#说话的有四个消息却有七种)）。
- **它不落会话日志，每次组装时现算**（[PF-009 §4 消息](../../../../product/PF-009-context-message-types/design.md#消息)、[§5.7](../../../../product/PF-009-context-message-types/design.md#57-一份会话日志两种组装)，rev 8 起）：给 agent 那一份开头的 `SystemMessage` 从装配成分算出，**不是从日志里筛出来的**；
  成分归 PF-004、组装归 PF-010。所以：
  - **会话日志里没有 `type: system` 的消息**（[S-32](#s-32-会话日志里的配对与唯一) ⑦）；追加这样一条是日志不一致，由追加的一方拒绝。
  - **压缩名单点不到它**：名单只能点日志里在前的消息（[S-29](#s-29-合法名单的判定) ②），它不在日志里——[系统提示词是给模型那一侧的第一块，只有第二块压得动](../../../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装)，这一条由此成立，不另设判定。
- **本版只含文本**（[PF-010 §4](../../../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装)，rev 6 起）：它的块只能是文本块（[S-6](#s-6-每种消息能装哪几类块)），不经过落盘前的转换件。
- **本条定的是它的形状**：组装出来的那一份里、交给传输适配的请求里，`SystemMessage` 都是这一种（[S-34](#s-34-四种直接对应)）。它**没有**日志里的身份：`id` 由组装出它的那一方给，[S-3](#s-3-messageid) 的「在会话日志之内唯一、由写日志的一方铸出」对它不适用，也没有谁拿它去指认日志里的东西。
  **`createdAt` 同样由组装出它的那一方给**，记的是这一份被算出的时刻（[S-4](#s-4-createdat-不是次序) 的「写入方记下」在这里读作「组装方记下」）；它不落日志，没有谁拿它与日志里的消息比先后（S-4 本来就不许按它排序）。

### S-8 UserMessage

**人说的话。**以下几样都落成这一种（[PF-014 §5.7](../../../../product/PF-014-inbound-intake-and-queueing/design.md#57-穷举一什么会让队列从空变成非空)）：
用户说的一句话；绑定目标是提示词或 skill 的斜杠命令**展开之后**的那一条（带来路标记的文本块，[`data.content-blocks/v3#S-8`](../../content-blocks/v3/contract.md#s-8-文本块与来路标记)）；经连接件送达的一条外部消息。

- **系统的话不落成这一种**，哪怕它在某一家那里最后会被译成一条用户消息——那是出门时的事（[S-35](#s-35-我们自己那两种必须在发出前译掉)），**日志里它仍是提醒**（[PF-009 §5.1](../../../../product/PF-009-context-message-types/design.md#51-systemremindermessage-凭什么独立而不是一条带标记的用户消息)）。
- **卡片的答复不落成这一种**：答复只在卡片上做，消息永远是消息（[PF-008 §4](../../../../product/PF-008-human-in-the-loop/design.md#决策卡片)）；
  系统发起的等待因答复解除时，由系统追加一条提醒转述它（[S-22](#s-22-系统发起的等待答复回来)）——说话的是系统，不是答卡片的人。

### S-9 AssistantMessage：一次回复只有一份

**模型的回复：一次模型调用成为消息的那一份。**

- **`response` 必填**：产出它的那份模型响应的 `ResponseId`。`ResponseId` 的家是 `data.model-response/v4#S-6`；
  本契约按 `data.identity-values/v1#S-31` 的散文写出同一形状、**不 `$ref`**——理由见 [S-37](#s-37-规范表示)。
- **一次回复至多首次发布一条权威会话消息。**响应体的 reply 保留原模型产出证据；persisted 消息的 MessageId、response、原块序列、消息其他成员及原块全部成员（含已有派生属性）与该证据相同。仅允许在原本无 renderings/transcript 的合格 audio/image/file 块上，按 CB3 S-19/S-20/S-22 在首次落盘前新增合法成对派生属性。新增 renderings.blocks 内合规派生块可以有新 id，遵守全消息唯一及父子可见性；这不许可增删或调序原块。不能剥掉已有派生再比较；落盘后不可补写。实际转换来源及写入资格由写方验证，自报 producedBy=system 不足以证明来源。没有新增派生时两值完全相等。原响应证据不是第二条消息，正式组装只取唯一 persisted 消息。
- **一份 `ResponseId` 在一份会话日志里至多对应一条 `AssistantMessage`**（[S-32](#s-32-会话日志里的配对与唯一)）；
  出错断的那次发出**没有**这条消息（[S-10](#s-10-assistantmessage-怎么收的尾)）。
- **分十次到达再拼起来与一次性拿到，得到的是同一条消息**（[PF-009 §6.8](../../../../product/PF-009-context-message-types/design.md#68-组装的结果与一次性拿到的必须相同)）：
  这是 `capability.stream-assembly` 的义务，本契约给它一个判得出「相同」的对象——**同一个 JSON 值**。
- 可追溯的实际组成（这次请求装的是什么）不在这条消息上，从 `response` 找。

### S-10 AssistantMessage 怎么收的尾

**`ending` 必填，恰三个取值，闭合**——它是 [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) 五行表里**能落成一条消息的那三行**：

| `ending` | 那张表的哪一行 | 块 |
|---|---|---|
| `complete` | 正常收尾 | 不许有没长完的工具调用 |
| `interrupted_by_user` | 用户叫停，已经有内容到了他眼前 | 已交付的那部分，**至少一块**；可以有没长完的工具调用 |
| `truncated_at_limit` | 写到上限截断的 | 至少一块；**连同没长完的工具调用** |

另两行**不成为消息**，`ending` 也就没有它们的取值：

- **用户叫停，什么都还没出来**——那次模型调用留一笔账，**不伪造一条空的**。
- **出错断的**（不论已交付多少）——那次调用是一次故障、没有交出一份回复；**已交付的那部分记在那次模型调用的账里**（PF-009 rev 8 的说法；落在那一次发出的[模型响应体](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-response--模型响应体--model-response)上，`data.model-response`），**不冒充一条消息**（[PF-009 §6.9](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有)）。

**回复流的结局怎样对到本条——这张对应只在这里**（主线裁定，见 [D-060 §七 M1、M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；输入是 `data.arrival-events/v2#S-16` 的 `FinishReason`；`capability.stream-assembly` 与 `capability.model-request-runtime` 按它包消息，不各写一份）：

| 那一侧发生了什么 | 回复流的 `finish.reason` | 落成什么 |
|---|---|---|
| 正常收尾 | `end` | `ending: complete` |
| 写到上限截断 | `max_tokens` | `ending: truncated_at_limit` |
| **用户**叫停：直接叫停这次调用、插队顺带，或**用户取消了这次运行** | `interrupted` | 已有内容到了用户眼前 ⇒ `ending: interrupted_by_user`；什么都还没出来 ⇒ 不成为消息 |
| 出错断的 | `lost` | 不成为消息；已交付的那部分在那一次发出的响应体上（故障） |
| **系统**发起的运行取消——会话归档、宿主停止——以及宿主被撤下（有序撤除、替换）：在途的流被放弃 | `lost`（消费一侧的放弃动作补上的那一个） | **不成为消息**，不论已交付多少；已交付的那部分在那一次发出的响应体上——那里记的收场是被中断、发起方 `run_cancelled`，**不是故障**（`data.model-response`） |
| 流还没开始就失败（连不上、上游直接回错误）；或停机、持有在途状态的一方也没了 | 没有 `finish` | 不成为消息：前者照出错断的收；后者这条消息写不出来，那一次发出由恢复对账补写响应体 |

- **运行被取消不新增取值，按谁发起的分两路**：用户发起的与用户叫停同一行（`interrupted_by_user`，[S-21](#s-21-中断之后必补一条) `by: user`）；系统发起的经放弃落 `lost`、不成为消息（S-21 `by: system`）。
  **`interrupted_by_user` 于是只出自用户发起的停下**——读到它的人找得到那个叫停的人；系统收走的半截回复若也落成它，就是冒称用户。

两条组合约束（**规格层推导**）：

- **`complete` 时不许有没长完的工具调用**（[`data.content-blocks/v3#S-13`](../../content-blocks/v3/contract.md#s-13-半截的工具调用)）：一次正常收尾的回复，它的每个调用都收齐了；两者同时出现，读者不知道该信哪一个。
- **不是 `complete` 时至少一块**：什么都没到的那一种按上面不成为消息。

- **`ending` 缺席是 `malformed`，从不当作 `complete`**——把缺席读成正常收尾，一条被叫停的回复就会被当成说完了。
- **这次模型调用以上面那张对应表里除正常收尾之外的哪一行收尾，都另外补一条中断提醒**（[S-21](#s-21-中断之后必补一条)）——写到上限截断的也补。补是按一次调用算的：出错断之后又再发了一次的，断掉的那一次发出不另补。那条提醒不是本消息的一部分。
- 读者**只读 `ending` 判断怎么收的尾**，不从最后一块长什么样去推。
- **被中断的回复不交出动作**（[PF-014 §5.4](../../../../product/PF-014-inbound-intake-and-queueing/design.md#54-插队停在哪就怎么办)，rev 6 起）：`ending: interrupted_by_user` 的回复里，参数已经收齐的完整调用块**也不被执行**，留在这条消息里；
  它们于是没有工具消息——这与 [S-32](#s-32-会话日志里的配对与唯一) ② 的「至多一条」相容，不是日志不一致。执不执行归 loop 与工具运行时，本契约只写明日志上的这个样子是合法的。

### S-11 ToolMessage

**工具说结果：一次调用恰一条，`blocks` 恰好一个[工具结果块](../../content-blocks/v3/contract.md#s-15-工具结果块)，它的 `callId` 与本消息的 `callId` 相同。**

- 违反其中任何一样——顶层块不是恰好一块、那一块的 `kind` 不是 `tool_result`、两个 `callId` 都在却不同——是表示层拒绝 `tool_message_block_count`。
  **它按块的 `kind` 数，不按块合不合形状数**：一块 `kind: tool_result` 却缺了 `outcome` 的，块数是对的，拒绝值照块层的规则取（`malformed`）。
- **收场与原因都写在那个块上**（[`data.content-blocks/v3#S-15`](../../content-blocks/v3/contract.md#s-15-工具结果块)～[`S-18`](../../content-blocks/v3/contract.md#s-18-占位原因与它落在哪一格)），消息上不另带一份。
  工具消息记的**永远是前台那一次调用的收场**，六种都可能（[`data.content-blocks/v3#S-17`](../../content-blocks/v3/contract.md#s-17-六种收场)）。
- **占位也是这一种**：

  | 占位 | 块上写什么 | 依据 |
  |---|---|---|
  | 转后台（自动、用户手动、因插队、发起时就在后台） | `outcome: backgrounded`，原因取 [`data.content-blocks/v3#S-18`](../../content-blocks/v3/contract.md#s-18-占位原因与它落在哪一格) 里配这一格的那几个 | [PF-012 §5.11](../../../../product/PF-012-agent-loop-and-run/design.md#511-外面进来的事怎么到-agent-眼前) |
  | 被中断（用户、插队、人拒绝回复、会话归档、运行被取消、前台超时） | `outcome: interrupted`，原因同上取配这一格的 | [PF-006 §6.7](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因) |
  | 恢复对账追补：那次执行没了；或工具执行运行时有序撤下时当场写下（`capability.tool-execution-runtime` v2 S-48，[D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） | `outcome: failed`、`reason.code: abnormal_interruption` | [PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程) |

  上面这几条都是[占位消息](../../../../ubiquitous_language/terms/record-and-context.md#ul-placeholder-message--占位消息--placeholder-message)。**这张表只是常见的占位**；原因取值与它落哪一格只归 `data.content-blocks`（它的 [S-18](../../content-blocks/v3/contract.md#s-18-占位原因与它落在哪一格)），本契约不另列。
  「前台上限到点、而这个工具不许转后台」那一种被中断，原因取值是 `foreground_timeout`（同一条 S-18）。
  `terminated_by_agent` **不是占位原因**：它是[后台那段执行收场的提醒上写的原因](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因)，只落那种提醒的结果块（[S-19](#s-19-后台执行的两种收场提醒)；块上的取值域见同一条 S-18）。
  **工具消息的结果块带 `reason.code: terminated_by_agent` 即表示层拒绝 `malformed`**（[S-39](#s-39-表示层拒绝值)；Schema `ToolMessage` 直接排除这个值；主线裁定，见 [D-060 §七 M23](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）：只看这一条消息就判得出，接收边界不收它，不留给写入方自觉。
- **[结果卸载](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-result-offloading--结果卸载--result-offloading)之后带摘要的那条也是一条 `ToolMessage`，但它不是占位消息**：它装着真实结果的摘要与取全文的办法，**它就是那次调用的结果**——块上是那次调用真实的收场，`offloaded` 指向原始结果（[PF-010 §5.5](../../../../product/PF-010-context-management-and-assembly/design.md#55-几样东西各自落成哪一种消息)）。产品正文也管它叫「占位」，本契约按词条不这样叫。
- **工具等待态的答复不另落消息**：答复是那次执行的输入，它拿到之后接着跑，结果仍落这一种（[PF-010 §5.5](../../../../product/PF-010-context-management-and-assembly/design.md#55-几样东西各自落成哪一种消息)）。
  agent 取回全文是它自己发起的一次新调用：一条新的 `AssistantMessage` 加一条新的 `ToolMessage`。
- **一次调用在一份会话日志里至多一条工具消息，且它指回排在前面的一个完整工具调用块**（[S-32](#s-32-会话日志里的配对与唯一)）。

### S-12 真实结果落哪种消息，只看有没有占位

**一次工具执行的真实结果：那次调用在日志里还没有工具消息的，填成工具消息（[S-11](#s-11-toolmessage)）；已经有占位的，以一条 `source.kind = background_execution_finished` 的提醒到达（[S-19](#s-19-后台执行的两种收场提醒)）。**

- **这是一条判据，不是按工具类型分的表**（[PF-009 §4](../../../../product/PF-009-context-message-types/design.md#systemremindermessage)）。
  它对等待态的工具同样成立：本版要等应答的工具只能阻塞在前台，所以结果走工具消息；将来若允许它转后台，照这条判据自动落成提醒，不另立规则。
- **由此，一次调用的真实结果在日志里恰出现一处**：工具消息里，或那条收场提醒里——
  **同一个 `CallId` 可以落在两个工具结果块上**（占位一块、真实结果一块），这正是 [`data.content-blocks/v3#S-14`](../../content-blocks/v3/contract.md#s-14-callid) 留给本契约定的关系。
- 之后还会有真实结果回来的占位**只有转后台这一种**；被中断、异常中断的占位之后那次执行已经结束，没有真实结果要落。

### S-13 ToolInternalMessage

**工具说过程：一次工具执行至多一条，块是它发的[执行帧](../../../../ubiquitous_language/terms/execution-and-outcome.md#ul-execution-frame--执行帧--execution-frame)封口之后的那些块，块可以很多。**

- **顶层每一块的 `visibility.toModel` 都必须为 `false`**，否则是表示层拒绝 `tool_internal_block_visible_to_model`。
  **这不是「默认不进、可以配置」，是不进**（[PF-009 §6.14](../../../../product/PF-009-context-message-types/design.md#614-工具帧不进模型的上下文)）；
  嵌套层的块不另查——容器不进模型那一侧，里面的块无从被取（[`data.content-blocks/v3#S-5`](../../content-blocks/v3/contract.md#s-5-嵌套的块按合取取用)）。
- **至少一块；这条消息成立的判据只有一条：帧流收尾时交出的 `blocks` 非空**（`capability.stream-assembly` v3 的 `closeOut` 或 `abandon` 交出的那一份）。
  绝大多数工具不发帧，**没收到就是没有**——一次没发出任何块的执行没有这条消息，不落一条空的（[PF-009 §5.8](../../../../product/PF-009-context-message-types/design.md#大部分工具不发这个而那是正常形态)）；
  **反过来，交出的块非空就有这条消息，不论 `ending` 取哪一个、不论那次执行怎么收场**——[执行怎么收场，这条消息都照常收尾](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量)（PF-009 rev 8：被中断、失败、等不到应答都一样）。
- **日志里只留收尾之后的那一条**；一个整体替换的块留的是最后那一次填进去的内容；执行中途被中断，已经交付的块照样留（[PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#92-流式不留到达的过程)）。
  **收尾之前拼到一半的那份是[在途状态](../../../../ubiquitous_language/terms/record-and-context.md#ul-in-flight-arrival--在途状态--in-flight-arrival)**：运行时持有，不进日志，不是消息。
- **那次执行的收场不在这里**——在工具消息或后台收场提醒里。这条消息的 `ending` 只说帧流怎么收的尾（[S-14](#s-14-toolinternalmessage-怎么收的尾)）。
- **它与工具消息是两条轨**：一条说过程，一条说结论；两者各自指回同一个 `callId`，不互相顶替。

### S-14 ToolInternalMessage 怎么收的尾

**`ending` 必填，恰三个取值，闭合：**

| `ending` | 帧流怎么收的尾 |
|---|---|
| `complete` | 产生者正常收尾 |
| `interrupted` | 那次执行被有意停下，帧流随之收尾 |
| `lost` | 产生者失去了连续性（[停了就不重来](../../../../product/PF-006-tools-and-skills/design.md#612-工具执行的运行时可以被单独控制而它停了就不重来)），帧流没有等到它的收尾；**已封口的块照样留** |

- **它不是执行收场**：`interrupted` 不等于那次执行的收场是被中断，`lost` 也不是一种收场。收场只读工具消息与收场提醒上的 `outcome`。

**帧流的结局怎样对到 `ending`——这张对应表只在这里**（主线裁定，见 [D-060 §五 K2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)；`data.arrival-events` v2 的 `FinishReason`，[`#S-16`](../../arrival-events/v2/contract.md#s-16-收尾)；`capability.stream-assembly` 与 `capability.tool-execution-runtime` 引用本表，不各写一份）：

| 执行那一侧发生了什么 | 帧流的 `finish.reason` | `ending` |
|---|---|---|
| 执行交回了：收场 `completed`，或执行者自己交回的 `failed` | `end` | `complete` |
| 那次执行被**有意停下**——收场为 `interrupted` 的全部情形：用户叫停、插队、人拒绝回复、会话归档、运行被取消、前台上限到点，以及 agent 掐掉已转后台的那段执行（原因 `terminated_by_agent`，那段的收场以提醒到达，[S-19](#s-19-后台执行的两种收场提醒)） | `interrupted` | `interrupted` |
| **执行者没有回答**：等待到了它自己声明的到点（收场 `no_answer`） | `lost` | `lost` |
| **执行者换了代**：经 MCP 桥的动作随桥换代或卸载而没了下文（收场 `failed`，原因 `abnormal_interruption`） | `lost` | `lost` |
| 帧流自己断了、或消费一侧放弃等待（**不影响**那次执行的收场，[PF-009 §6.17](../../../../product/PF-009-context-message-types/design.md#617-发帧发不出去不影响这次工具执行)） | `lost` | `lost` |
| **工具执行运行时有序撤下**（撤除、替换）：它先对每一份还开着的装配状态放弃（`abandon`），再当场写下那次执行的收场 `failed`、原因 `abnormal_interruption`（`capability.tool-execution-runtime` v2 S-48；主线裁定，见 [D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)；与桥换代同类） | `lost` | `lost` |
| 写到上限截断 | `max_tokens`——对帧流**不合法**（`data.arrival-events/v2#S-16`），不会走到这一步 | — |
| **停机**：持有在途状态的一方也没了 | 没有 `finish` | **这条消息写不出来**（见下） |

- **`interrupted` 只给「有意停下」**（主线裁定，见 [D-060 §五 K2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：它说的是有人或宿主**决定**让这次执行停下，帧流随之收尾。
  等待到点是执行者**没有回答**、桥换代是执行者**没了**——都不是谁决定停下，而是生产的一方失去了连续性，所以落 `lost`；
  把它们写成 `interrupted`，读的人会去找一个并不存在的叫停者。
- 收场与本表不是一一对应：同一个收场 `failed` 按执行者是自己交回、还是换了代或运行时有序撤下，落 `complete` 或 `lost`。**判断看执行那一侧发生了什么，不看 `outcome` 这个字。**
- **持有在途状态的一方也没了**时，这条消息写不出来——那正是「运行时失去连续性它就没了」，收场另行追补，不靠它恢复（[PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息)）。

### S-15 SystemReminderMessage：正文给模型读，来源给系统认

**系统在中途说的话：一次运行中，外面有信息进来了**（[PF-009 §4](../../../../product/PF-009-context-message-types/design.md#systemremindermessage)）。除底座外带两个必填成员：`nature`（[S-16](#s-16-性质与来源定死对应)）与 `source`（[S-18](#s-18-来源闭合拓展件走兜底)）。

- **`blocks` 是给模型读的话**（人也看得到）；**agent 主要靠正文读懂这是什么事**，不必靠类型去认。
- **`source` 是给系统认的结构化来源**：恢复对账、呈现、压缩、循环阶梯都读它；它也可以被呈现给 agent（[PF-009 §6.5](../../../../product/PF-009-context-message-types/design.md#65-来源是一个属性不是另一种消息)）。
  **系统不解析正文去找来源里的事实**——「后台执行 X 结束了没」只看 `source`，不读字。
- **它由系统产生，不由人产生**；哪怕正文转述的是另一个 agent 说的话，说这句话的仍是系统。
  **产生它的那一处交出来的是一条消息，不是一段带标签的文本**（[PF-009 §6.3](../../../../product/PF-009-context-message-types/design.md#63-提醒的标识由系统加产生提醒的那一处交的是消息)）：正文里不需要、也不应当自带「这是系统提醒」的标记——那个标识在出门时由系统加（[S-35](#s-35-我们自己那两种必须在发出前译掉)）。
- **一律追加**：消息之间没有取代，组装时也不按「同一处只取最新」再筛一道（[PF-009 §6.4](../../../../product/PF-009-context-message-types/design.md#64-说状态的写清变化说事的写清发生消息一律追加)）。

### S-16 性质与来源定死对应

**`nature` 恰两个取值：`event`——刚才发生了什么；`state`——现在什么样**（[PF-009 §5.4](../../../../product/PF-009-context-message-types/design.md#54-提醒说的是现在什么样还是刚才发生了什么)）。**它与 `source.kind` 的对应是定死的：**

| `source.kind` | `nature` |
|---|---|
| `background_execution_finished` · `background_execution_interrupted` · `attempt_started` · `interrupted` · `system_wait_answered` · `loop_guard` · `peer_session_note` · `scheduled_trigger` | `event` |
| `runtime_context_changed` · `runtime_context_snapshot` | `state` |
| `extension` | 由那一件拓展件声明，两个取值都合法 |

- **对不上即表示层拒绝 `reminder_nature_mismatch`**，不按其中一方改另一方。
- **它决定这条提醒必须写出什么**（说状态的要交代从什么变成了什么，[S-17](#s-17-说状态的带前值与现值)），**不决定它在日志里的命运**——那个命运只有一个：追加。

### S-17 说状态的带前值与现值

**一条说状态变化的提醒，必须同时写出前值与现值**（[PF-009 §6.4](../../../../product/PF-009-context-message-types/design.md#64-说状态的写清变化说事的写清发生消息一律追加)）。在来源里落成：

- **`runtime_context_changed` 的 `previous` 与 `current` 都必填。**缺 `previous` 是表示层拒绝 `reminder_state_without_previous`，**不补成 `null`**——补了，「前值不详」就被写成了「从未感知过」。
- **`previous` 是这个会话在日志里最后感知到的那一份**（[PF-015 §6.8](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#68-变更了要不要告诉-agent看谁消费它)、[PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)），按 [S-25](#s-25-runtime-context-的变更与全量) 的「最后感知到的值」算；**日志里从未感知过这一块，写 `null`**。
- **`current` 不为 `null`**（规格层推导）：这样 `previous: null` 只有「从未感知过」一个意思，不会与「上一次感知到的值恰是 `null`」混在一起。
  这要求 runtime context 的每一块被感知时都不是 `null`——那一块的值归 runtime context 的契约（[G-6](#九已知缺口)）。
- **正文同样要用话说清从什么变成了什么**——agent 读的是正文；这一半 Schema 管不到，是产生者的义务。
- **全量那一份（`runtime_context_snapshot`）不是一次变化，不带前值**：它是 [PF-015 §6.9](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#69-模型看见一块-runtime-context只有两种形态) 的「完整的那一份」，只给这一刻的值。
  本契约把 PF-009 §6.4 的「前值与现值」读成**对变化通知的要求**；这一读法待确认（[G-11](#九已知缺口)）。
- **`extension` 那一支说状态时，前值不在结构里**：`payload` 对本契约不透明，本契约只能把「写清从什么变成了什么」的义务写给产生它的那一件拓展件（[G-11](#九已知缺口)）。

### S-18 来源闭合，拓展件走兜底

**`source` 是一个按 `kind` 判别的封闭联合，恰十一种：十种系统自己的来源，外加一种 `extension` 兜底。**

| `kind` | 必带成员 | 条款 |
|---|---|---|
| `background_execution_finished` | `callId`、`outcome` | [S-19](#s-19-后台执行的两种收场提醒) |
| `background_execution_interrupted` | `callId` | [S-19](#s-19-后台执行的两种收场提醒) |
| `attempt_started` | `attempt`、`reason`、`at` | [S-20](#s-20-尝试开始) |
| `interrupted` | `what`、`by`、`hadContent`；可选 `about` | [S-21](#s-21-中断之后必补一条) |
| `system_wait_answered` | `cardId`、`extension`、`answers` | [S-22](#s-22-系统发起的等待答复回来) |
| `loop_guard` | `level`、`finding` | [S-23](#s-23-循环守卫的干预) |
| `peer_session_note` | `fromSession`；可选 `fromAgent` | [S-24](#s-24-别的会话捎话与到点了) |
| `scheduled_trigger` | `schedule`、`dueAt` | [S-24](#s-24-别的会话捎话与到点了) |
| `runtime_context_changed` | `block`、`previous`、`current` | [S-25](#s-25-runtime-context-的变更与全量) |
| `runtime_context_snapshot` | `blocks`、`reason` | [S-25](#s-25-runtime-context-的变更与全量) |
| `extension` | `extension`；可选 `payload` | [S-26](#s-26-拓展件追加的提醒) |

- **系统自己的来源不许绕过这张表私加**：加一种来源 = 改本契约的版本。**表里有 `kind` 的来源一律用它自己的 `kind`，不走 `extension`**。
- **拓展件追加的提醒走 `extension`，并带上它是哪一件。**
- 每一种的成员集合闭合；未知的 `kind` 是 `malformed`，**不当作 `extension`**——把一个认不出的来源当成拓展件的，就是在替它补一个它没说过的身份。
- **来源是一个属性，不是另一种消息**（[PF-009 §6.5](../../../../product/PF-009-context-message-types/design.md#65-来源是一个属性不是另一种消息)）：十一种来源都是同一种消息。

### S-19 后台执行的两种收场提醒

**转了后台的那段执行，跑到头时它的收场以提醒到达**（[PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#转后台是前台那一次调用的收场后台执行另有自己的收场)）。两种来源，都说事：

| `kind` | 什么时候 | `blocks` 里那恰好一个工具结果块 |
|---|---|---|
| `background_execution_finished` | 那段执行跑到头，真实结果回来 | `callId` 与 `source.callId` 相同；`outcome` 与 `source.outcome` 相同，**只在 `completed`、`failed`、`interrupted`、`no_answer` 四种里出**；块的其余照 [`data.content-blocks/v3#S-15`](../../content-blocks/v3/contract.md#s-15-工具结果块)～[`S-18`](../../content-blocks/v3/contract.md#s-18-占位原因与它落在哪一格) |
| `background_execution_interrupted` | **恢复对账时由系统代落**：占位在，工具执行运行时里找不到它，日志里也没有它结束时回来的那条提醒（[PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#先对账再进方程)）；**工具执行运行时有序撤下时当场代落的是同一种**（`capability.tool-execution-runtime` v2 S-48，[D-060 §七 M12](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)） | `callId` 与 `source.callId` 相同；`outcome: failed`、`reason.code: abnormal_interruption`——**收场是失败，写给 agent 的原因是异常中断，不是被中断**（[PF-006 §6.7](../../../../product/PF-006-tools-and-skills/design.md#占位消息一律要说清原因)） |

- **结果就是 `blocks` 里那一个工具结果块**（规格层推导）：模型读的是 `blocks`，结果要让它读得到，就得在那里；
  它照样有标注、照样能被压缩点名，与工具消息里的那一块同形。**`source` 不另带一份结果**——两份结果会分叉，而没有人知道该信哪一份。
  主线采纳这一推导，见 [D-060 §一 S3-b](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s3messages报回的)。
- **`source.outcome` 与块上的 `outcome` 必须相同**：块上那一份是收场的依据（[`data.content-blocks/v3#S-15`](../../content-blocks/v3/contract.md#s-15-工具结果块)），
  `source` 上那一份是让系统不读块就认得出「这段执行怎么结束的」。两者不同，或 `callId` 不同，是 `malformed`。
- **四种之外的收场不会出现在这里**：不可用只出自替换件、转后台是单向的一步（[`data.content-blocks/v3#S-17`](../../content-blocks/v3/contract.md#s-17-六种收场)）。那一条「一个块自己看不出它记的是哪一段」**在这里由消息的种类兑现**：后台那段的收场只在这两种提醒里。
- **在日志里**：它排在同一个 `callId`、`outcome: backgrounded` 的那条工具消息之后；**一段后台执行只结束一次**——两种来源合计，一个 `callId` 至多一条（[S-32](#s-32-会话日志里的配对与唯一)）。
- **恢复对账要找的就是这两种**：「后台执行 X 结束了没」＝ 日志里有没有 `source.kind` 是这两种之一、`source.callId = X` 的提醒。

### S-20 尝试开始

**每一次[执行尝试](../../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-run-attempt--执行尝试--run-attempt)开始，追加一条 `source.kind = attempt_started` 的提醒；它同时就是日志里的「尝试开始」记录**（[PF-012 §6.4](../../../../product/PF-012-agent-loop-and-run/design.md#64-每一次尝试开始agent-都要知道)）。说事的。

| 成员 | 含义 |
|---|---|
| `attempt` | 尝试序号（`data.call-accounts/v3#S-37` 的 `AttemptId`），≥ 1。**显式写出，不靠数前面有几条**——栅栏要拿它做比较（[PF-012 §4 执行尝试](../../../../product/PF-012-agent-loop-and-run/design.md#执行尝试)） |
| `at` | 这次尝试起的时刻 |
| `reason` | 为什么起 |

- **哪个 Run 由承载它的记录条目给出**，不在消息里（[S-33](#s-33-消息不携带租户身份)、[G-2](#九已知缺口)）：PF-012 要的四样——Run、序号、时间、原因——由这条消息与它的条目**合起来**兑现。
  同一个 Run 里序号怎样递增、栅栏怎样比较，归 loop 那一程的契约。
- **`reason` 恰三个取值，闭合**，对应 [PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事) 列的三个原因（主线裁定，见 [D-060 §一 S3-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s3messages报回的)）：

  | `reason` | 原因 |
  |---|---|
  | `first` | 这个 Run 的第一次尝试 |
  | `resumed_after_interruption` | 从一次中断接上来 |
  | `resumed_after_wait` | 等到的东西回来了 |
- 它对用户可见——外部效果重复了，人追溯得到是哪一次尝试造成的。

### S-21 中断之后必补一条

**一次模型调用或整个运行被中断，就追加一条 `source.kind = interrupted` 的提醒，哪怕什么内容都没留下**（[PF-009 §6.13](../../../../product/PF-009-context-message-types/design.md#613-只要发生了中断就补一条提醒)）。说事的。

**工具执行被中断不另补这一条，占位承载它**（主线裁定，见 [D-060 §一 S13-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s13tool-execution-runtime报回的)）：那次调用的位置上已经有一条 `outcome: interrupted` 的工具消息、原因写在块上（[S-11](#s-11-toolmessage)），
agent 读到的就是它；再补一条提醒是同一件事说两遍。已转后台的那段执行被中断，按 [S-19](#s-19-后台执行的两种收场提醒) 以收场提醒到达。

| 成员 | 含义 |
|---|---|
| `what` | 被中断的那一层：`model_call` · `run` |
| `by` | `user`——用户发起的：用户叫停、插队顺带、用户取消了这次运行；`system`——不是用户发起的：出错断、写到上限、系统侧停止（会话归档、宿主停止或被撤下） |
| `hadContent` | 中断之前有没有内容已经到了用户眼前 |
| `about` | 可选，只配 `what: model_call`：`{ kind: "model", call, dispatch }`——一次模型调用（`call` 是 `data.call-accounts/v3#S-37` 的 `ModelCallId`）的第几次发出，`dispatch` ≥ 1 |

- **成员名 `call` 与五种运行时记录的 `call` 同义**（[S-49](#s-49-模型请求运行时写的五种记录不是消息)）。**本契约里 `callId` 只指工具调用的 `CallId`**（[S-11](#s-11-toolmessage)、[S-13](#s-13-toolinternalmessage)、[S-19](#s-19-后台执行的两种收场提醒)）——按 `callId` 配对工具调用的消费者不会把一次模型调用当成工具调用。
- **`about` 与 `what` 要对得上**（规格层推导）：`about` 只配 `model_call`，`run` 不带 `about`。对不上是 `malformed`。
  **`about` 可以不带**：一次中断可能同时停下了好几次执行，那时这条提醒说的是「这一层被中断了」。
- **与 [S-10](#s-10-assistantmessage-怎么收的尾) 的对应**：一次模型调用以 S-10 那张回复流对应表里除正常收尾之外的哪一行收尾，都补一条。`hadContent` 为真、`by: user` 的那一种，日志里另有一条 `ending: interrupted_by_user` 的回复；
  `by: system` 的出错断、以及系统发起的运行取消（会话归档、宿主停止或被撤下），已交付的部分在那次模型调用的账里，**没有**那条回复——agent 靠这条提醒知道刚才断了。
- **agent 下一轮读到一段没头没尾的东西，靠的就是这一条**：不补，它会自己编一个解释，然后重说一遍、重调一次。

### S-22 系统发起的等待答复回来

**挂在一个 Run 上的等待（[运行等待态](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-run-wait-state--运行等待态--run-wait-state)）因答复而解除时，系统追加一条 `source.kind = system_wait_answered` 的提醒**——
没有哪次工具执行在等它，它是外面进来的一条信息（[PF-010 §5.5](../../../../product/PF-010-context-management-and-assembly/design.md#55-几样东西各自落成哪一种消息)）。说事的。

**答复本身落在卡片上，不是消息；这条提醒是解除等待时系统追加的那一条**（主线裁定，见 [D-060 §一 S3-c](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s3messages报回的)）——
[PF-014 的「卡片答复不是消息」](../../../../product/PF-014-inbound-intake-and-queueing/design.md#入站到达)与 PF-010 的「等待答复回来落提醒」于是同时成立：前者说答复落在哪，后者说 agent 怎样知道。

| 成员 | 含义 |
|---|---|
| `cardId` | 那张[决策卡片](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-decision-card--决策卡片--decision-card) |
| `extension` | **发起这次等待的那一件拓展件**的名字（`LoopExtensionName`，[S-26](#s-26-拓展件追加的提醒)）——系统自带的放行判断、循环守卫也各是一件；记录里要分得出是哪一件出的卡（[PF-008 §6.8](../../../../product/PF-008-human-in-the-loop/design.md#68-三种来源的卡片同一个形状选项与记录不同)） |
| `answers` | 这张卡片上的答复，至少一项；每项 `{ optionId, at }` |

- **工具等待态的答复不走这里**：那是那次执行的输入，它拿到之后接着跑，结果落工具消息（[S-11](#s-11-toolmessage)）。**判据是 [PF-008 的两个维度](../../../../product/PF-008-human-in-the-loop/design.md#等待态的两个维度)**，不是另加的一条规则。
- **`CardId` 与 `CardAnswer` 在本契约只是不透明的最小形状**：卡片与答复的正式形状归卡片的契约（PF-008，未起草）。
  **「不回答」是合法答复**（[PF-008 §6.5](../../../../product/PF-008-human-in-the-loop/design.md#65-不回答是合法答复)）、人可以自由作答——这两样在 `{ optionId, at }` 里怎样表示，本版**没有答案**（[G-5](#九已知缺口)）。

### S-23 循环守卫的干预

**循环守卫（无词条）在第一级或第二级往日志里写的那条干预消息，落成一条 `source.kind = loop_guard` 的提醒**（[PF-012 §5.9](../../../../product/PF-012-agent-loop-and-run/design.md#59-循环守卫四级阶梯)）。说事的。

- `level` 恰两个取值 `level_1`、`level_2`——阶梯四级的 token 统一是 `level_1`…`level_4`（规格层的名字：PF-012 §5.9 的「第一级」到「第四级」），只有前两级落成这种消息；`finding` 是它看出了什么，非空。**正文是写给 agent 的干预话**，`finding` 是给系统与排查的人认的那一句。
- **阶梯走到第几级是从日志里数出来的**——数的是 `source.level`，**不读正文**；所以一次崩溃之后阶梯自动复现崩溃前的循环史。
- **第零级只记一笔、第三级落终态失败、第四级出一张卡片**，都不是这一种消息；第四级那张卡片答完，按 [S-22](#s-22-系统发起的等待答复回来) 到达。

### S-24 别的会话捎话与到点了

**两种外面来的事，能力都还没有 topic（[PF-014 §9.1](../../../../product/PF-014-inbound-intake-and-queueing/design.md#91-有几类来源的能力还没开题)），但消息形态已定：都落成提醒**，都说事。

| `kind` | 什么时候 | 成员 |
|---|---|---|
| `peer_session_note` | 另一个会话里的 agent 发来一条消息，**含自己派出去的[子 agent](../../../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-subagent--子-agent--subagent) 回来报告** | `fromSession`；可选 `fromAgent` |
| `scheduled_trigger` | 一个日程到点了 | `schedule`、`dueAt`（它本该到点的时刻） |

- **`SessionRef` 的家在本契约**：全树指认一个会话只用这一个名字，别的契约 `$ref` 它、不另立 `SessionId`（主线裁定，见 [D-060 §一 S21-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s21connector报回的)；loop 那一程若立会话契约再迁）；它只到不透明形状，会话本身的契约未起草。
  **`AgentRef`、`ScheduleRef` 只是不透明的指认**，家在那些还没开题的能力里（[G-7](#九已知缺口)）。**拿到一个 `SessionRef` 不等于有权访问那个会话。**
- 说这句话的仍是系统——是系统在告诉这个 agent「外面有人捎了话来」。

### S-25 runtime context 的变更与全量

**模型要感知的 [runtime context](../../../../ubiquitous_language/terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context) 以两种形态进日志，都落成说状态的提醒**（[PF-015 §6.9](../../../../product/PF-015-session-lifecycle-and-ownership/design.md#69-模型看见一块-runtime-context只有两种形态)）：

| `kind` | 什么时候 | 成员 |
|---|---|---|
| `runtime_context_changed` | 消费者里有模型的某一块被它的生产方改了，**且 Run 未闭合**（[PF-014 §6.10](../../../../product/PF-014-inbound-intake-and-queueing/design.md#610-注入的上下文变了没有运行在跑时什么都不做)）；或一次尝试起来时拉到的与日志里最后感知到的不同（[PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)） | `block`、`previous`、`current`（[S-17](#s-17-说状态的带前值与现值)） |
| `runtime_context_snapshot` | 会话刚开始（`reason: session_start`）；上下文被压缩之后（`reason: after_compaction`，[PF-010 §6.16](../../../../product/PF-010-context-management-and-assembly/design.md#616-压缩之后meta-runtime-context-要重新给一份完整的)） | `blocks`（以块的指认为键、这一刻的值为值，至少一项，值不为 `null`）、`reason` |

**「最后感知到的值」是从日志算出来的**（规格层推导，给 `previous` 一个唯一的算法）：

```text
lastPerceived(block, L) ≝
  在日志前缀 L 里，最后一条满足下列之一的提醒所给出的值：
    source.kind = runtime_context_changed  且 source.block = block   → source.current
    source.kind = runtime_context_snapshot 且 block ∈ source.blocks → source.blocks[block]
  没有这样的提醒 → null
```

- **按日志算，不按模型那一份算**：一条提醒被压缩点名之后仍是「这个会话感知过的」——因果链记的是这个会话感知到的变化，不是模型此刻还读得到什么。
- **空闲期间推来的变更一律丢弃、不成为消息**；下一次拉到的就是当前值，前值取 `lastPerceived`——变过三十次，会话只感知到一次。
- **只在两者不同时才落一条变更**（[PF-012 §5.7](../../../../product/PF-012-agent-loop-and-run/design.md#每一次尝试开始都要做四件事)）。**本契约不在表示层比较两个 JSON 值**——那种比较跨实现不可移植；它是产生者的义务。
- 哪些块够得上「meta」、每一块的值长什么样、`RuntimeContextBlockId` 的家，归 runtime context 的契约（[G-6](#九已知缺口)）。

### S-26 拓展件追加的提醒

**拓展件追加的其他提醒落成 `source.kind = extension`：`extension` 是那一件的名字（`LoopExtensionName`），`payload` 可选、是它自带的任意 JSON 值。**

- **说事还是说状态由那一件声明**，两个取值都合法；说状态时，写清从什么变成了什么是那一件的义务（[S-17](#s-17-说状态的带前值与现值)）。
- `payload` 对本契约与其余各层**不透明**；缺席与 `null` 是两件事，各自原样保留。
- **拓展件名字的名字空间 = 类别为 `loop_extension` 的[能力标识](../../content-blocks/v3/contract.md#s-20-派生表示的产出者与能力标识)的 `name`**（规格层推导：一件拓展件已经有一个能力标识，再给它另起一个名字空间，同一件东西就有两个名字）：
  这里只存 `name`，类别由来源的判别已经说明。名字的词法归能力标识名的家，本契约只约束到非空。这一条对 `system_wait_answered.extension` 同样成立。

### S-27 CompactionMessage 与它的名单

**[压缩记录](../../../../ubiquitous_language/terms/record-and-context.md#ul-compaction-record--压缩记录--compaction-record)：`blocks` 是摘要；`silenced` 是这次让哪些块从此对模型不可读的名单——一份覆盖可见性的记录。**

- **`silenced` 必填**，每一项 `{ messageId, blockId }` 点一个块（含任意嵌套层，[`data.content-blocks/v3#S-3`](../../content-blocks/v3/contract.md#s-3-blockid)）；可以是空数组，**缺席不当作空**；同一项不重复。
- **名单只覆盖 `toModel` 一侧、只往「不可读」翻**：它不碰「给人看」那一位——被压掉的内容用户照样看得见（[PF-010 §6.11](../../../../product/PF-010-context-management-and-assembly/design.md#611-压缩只管给模型看那一侧)）；
  它不能让一个标着不给模型的块变得可读。
- **不回头改块上的标注**：块上两位由产生块的一方在落盘那一刻写下，之后不动（[`data.content-blocks/v3#S-22`](../../content-blocks/v3/contract.md#s-22-落盘之后整块不变)）；
  名单是后来追加的一条消息自己带着的。**日志一个字不改，任何历史时刻的视图都还原得出来**（[PF-010 §5.7](../../../../product/PF-010-context-management-and-assembly/design.md#名单跟着摘要走是为了让日志能重放)）。
- **点一个容器块，它里面的块随之对模型不可读**；也可以只点里面的某一块（规格层推导：`data.content-blocks` v3 把「能不能单独点名嵌套块」交给本契约——
  那一条让整棵块树共用一个标识范围，正是为了让这种点名不含糊）。
- **摘要与名单不能都是空的**（规格层推导）：一条既不概括、也不点名的压缩记录宣称发生过一次压缩而什么都没变——它只能是写错了，**早报错比留下一条误导人的记录好**。违反是 `malformed`。
- 摘要块的标注由做这次压缩的一方写，常态两边都给（[S-5](#s-5-给谁看在块上)）：用户看得到「这里压缩过了」，否则会奇怪 agent 怎么忘了前面的细节。
- 名单的合法性见 [S-29](#s-29-合法名单的判定)；一条压缩记录本身也能被后来的压缩点名——已有的摘要可以被再次收走。

### S-28 此刻模型可读是算出来的

**「此刻模型可读」（无词条）不存在任何地方，每次从日志现算：**

```text
path(b)             ≝ b 自己，加上从它往外、直到它所在消息顶层的每一个容器块
readable(b, L)      ≝ b 所在的消息在日志前缀 L 里
                      ∧ path(b) 里每一块的 visibility.toModel 都为 true
                      ∧ L 里没有任何一条压缩记录的名单点了 path(b) 里的任何一块
```

「此刻」就是取 `L` 为到这一刻为止的整个日志。这是 [PF-010 §5.7](../../../../product/PF-010-context-management-and-assembly/design.md#那两个标注仍然是这件事的前提) 那句话——
「块上那一位标着给模型读，且没有任何排在它前面的压缩记录点过它的名」——加上 [`data.content-blocks/v3#S-5`](../../content-blocks/v3/contract.md#s-5-嵌套的块按合取取用) 的合取取用：
**标注与名单都只会往「不可读」那边收，不会被容器放宽。**

- **单调不回退**：一个块在某个前缀里不可读，在它之后的任何更长的前缀里都不可读。块上的标注不变（[`data.content-blocks/v3#S-22`](../../content-blocks/v3/contract.md#s-22-落盘之后整块不变)），名单只会越积越多（只增不改），所以没有「恢复可读」这回事。
- **只有压缩记录让一个标着给模型的块变得不可读**；别的消息、别的任何动作都不改变它。
- **组装边界不是一条截断线**：被点过名的块可以前前后后散布，没被点过的仍然可读，**它们可能落在最后一条压缩记录之前**——不许实现成「从最后一条压缩记录往后取」（[PF-010 §6.15](../../../../product/PF-010-context-management-and-assembly/design.md#615-组装边界要看哪些块还模型可读不是最后一条摘要在哪)）。
- **可读是进请求的必要条件，不是充分条件**：窗口、模态、没长完的调用、成对关系之后还要怎样取舍，归 PF-010 的组装。
- **没长完的工具调用、工具说过程的块，以及任何标着不给模型的块**，按定义永远不可读——不需要谁去点名。
- 规范场景：[`examples.md` 第 11 节](examples.md#11-规范场景五条消息此刻哪些块模型可读)的五条消息，逐块手算。

### S-29 合法名单的判定

**一条压缩记录 `c` 追加在日志前缀 `P` 之后（`P` 是 `c` 之前的全部日志）。它的名单合法，当且仅当每一项都满足：**

| # | 条件 | 违反时 | 能在哪里判 |
|---|---|---|---|
| ① | 不点 `c` 自己的块 | 表示层拒绝 `compaction_self_reference` | 只看这一条消息 |
| ② | `messageId` 是 `P` 里的一条消息 | 表示层拒绝 `compaction_forward_reference` | 要看得见 `P` |
| ③ | `blockId` 是那条消息里的一个块（任意嵌套层） | **名单不合法**：点了不存在的块 | 要看得见 `P` |
| ④ | **删去，编号保留**（2026-09-24）：原为「那条消息不是 `SystemMessage`」。`SystemMessage` 不落会话日志（[S-7](#s-7-systemmessage)），② 已把它排除，不再单列 | — | — |
| ⑤ | 那个块不是、也不在一个**在 `P` 处悬着的占位**里（[S-30](#s-30-悬着的占位)） | **名单不合法**：点了悬着的占位 | 要看得见 `P`，且卡片那一半要问卡片的 owner |
| ⑥ | 那条消息在 `c` 之前的**最近一次模型请求**组装时已经在日志里；`c` 之前从没有过模型请求时，名单必须为空 | **名单不合法**：压了模型还没看过的东西 | 要看得见 `P`，且要知道那次请求落在日志哪一处（[G-2](#九已知缺口)） |

- **① ② 是表示层拒绝**：一条点了自己、或点了一条不在它之前的消息的名单，在任何日志里都不可能合法——追加的那一刻，「之后的消息」还不存在，所以 ② 在追加点上也就包括了「点了一条根本不存在的消息」。
- **③⑤⑥ 是判定，不是表示层拒绝**：形状完全合规，只是与这份日志不相容。它们在压缩那一侧的操作失败集合里叫什么，归 PF-010 的能力契约（无契约）；
  **本契约只要求：不合法的名单不进日志**，也**不被「修好」之后进日志**——删掉不合法的那几项留下其余，等于替做压缩的一方做了一个它没做的决定。
- **⑥ 与 ⑤ 是压缩那一侧的义务**（[PF-010 §6.13](../../../../product/PF-010-context-management-and-assembly/design.md#613-上一次模型请求之后新来的消息不许压)、[§6.14](../../../../product/PF-010-context-management-and-assembly/design.md#614-悬着的东西不许被点名)），本契约把它们写成「合法名单的判定」，好让每个接收边界判得出同一个结论。
- **系统提示词不被点名，不再靠一条判定**：它不在日志里，② 就够了（[S-7](#s-7-systemmessage)）；[压缩碰不到它](../../../../product/PF-010-context-management-and-assembly/design.md#给模型那一侧两块分别组装)由此成立。
- **点一个此刻已经不可读的块是合法的**，是空操作；名单不要求每一项都「有效果」。
- **判定发生在把压缩记录接进日志的每一个边界**：追加、复制、导入。已经在日志里的名单按原样生效——日志只增不改，**不存在事后作废一条名单的动作**。

### S-30 悬着的占位

**在日志前缀 `P` 处悬着的占位（无词条），恰是下面两类块：**

1. **转后台还没回来的执行的占位**：`P` 里一条工具消息，它的工具结果块 `outcome: backgrounded`，而 `P` 里**没有**同一个 `callId` 的后台收场提醒（[S-19](#s-19-后台执行的两种收场提醒) 两种之一）——**那条工具消息里的每一块**，含嵌套层。
2. **没答完的卡片的占位**：「什么叫悬着」归 PF-012（[§6.11](../../../../product/PF-012-agent-loop-and-run/design.md#611-悬着的东西不许被压掉)），卡片什么时候算答完归卡片的契约——
   **没答完的卡片在消息里有没有占位、占位是哪一块，本版没有答案**（[G-5](#九已知缺口)）。

- **第 1 类只看日志就判得出**：它只依赖工具消息与收场提醒，而后者是说事的、一律追加的——**「结束了」一旦出现在前缀里，就一直在**。
- **「悬着」按 `P` 判，不按整份日志判**：一段执行后来结束了，不改变它在那条压缩记录追加时是悬着的；那条压缩记录不能点它。
  它结束之后，后来的压缩可以点它（这时它已经不悬着）。
- **为什么连嵌套层也不许点**：占位的块一旦对模型不可读，agent 就不知道自己还有东西在外面跑，而日志那一层它还悬着——**两边静默对不上**（[PF-010 §5.8](../../../../product/PF-010-context-management-and-assembly/design.md#悬着的东西被点了名两边就静默对不上)）。
  占位里写着原因的那几块同样是「还在外面跑」的一部分。

### S-31 收齐却解析不了的调用

**参数收齐了却解析不了的工具调用，在消息层落成这样一个组合**（[PF-006 §5.5](../../../../product/PF-006-tools-and-skills/design.md#55-一次工具执行的收场有六种)：由工具执行一侧收下、以一条收场为 `failed` 的结果回给模型；块的形状见 [D-060 §一 S1-e](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s1content-blocks报回的)）：

1. 那个调用块**留在 `AssistantMessage` 里，带着收到的原文**，不带解析结果；其中也包括 `data.content-blocks/v3#S-12` 接纳的非法模型名字，`tool` 原样保留，未尝试解析参数；
2. **它不被执行**；
3. 日志里另有**恰好一条**同一个 `callId` 的 `ToolMessage`，工具结果块 `outcome: failed`，把解析不了的具体原因写在 `blocks` 里回给模型；非法工具名那一支写明名字非法、参数未解析。

- 那个调用块的形状归 [`data.content-blocks/v3#S-12`](../../content-blocks/v3/contract.md#s-12-完整的工具调用)：`complete: true`，带 `rawArguments`（收到的原文）与 `unparseable: true`、不带 `arguments`。
  它收齐了，所以按 [S-32](#s-32-会话日志里的配对与唯一) 算作「完整工具调用块」，第 3 步那条工具消息指回它。
- 这条消息的 `ending` 照常：回复本身收尾了就是 `complete`——那个调用块不是没长完的调用。

### S-32 会话日志里的配对与唯一

**下列性质在一份会话日志里成立。它们都跨消息，Schema 一条也管不到；由把消息写进日志的那一方在追加时守住，证据形式是日志序列的检查与规范场景。**

| # | 性质 | 条款 |
|---|---|---|
| ① | `MessageId` 两两不同 | [S-3](#s-3-messageid) |
| ② | 每条 `ToolMessage` 的 `callId` 指回排在它前面某条 `AssistantMessage` 顶层的一个**完整**工具调用块（[`data.content-blocks/v3#S-12`](../../content-blocks/v3/contract.md#s-12-完整的工具调用)；半截的不算，[`S-13`](../../content-blocks/v3/contract.md#s-13-半截的工具调用)）；一个 `callId` 至多一条 `ToolMessage` | [S-11](#s-11-toolmessage) |
| ③ | 每条 `ToolInternalMessage` 的 `callId` 同样指回排在前面的一个完整工具调用块；一个 `callId` 至多一条 | [S-13](#s-13-toolinternalmessage) |
| ④ | 后台收场提醒（两种合计）排在同一 `callId`、`outcome: backgrounded` 的工具消息之后；一个 `callId` 至多一条 | [S-19](#s-19-后台执行的两种收场提醒) |
| ⑤ | 一个 `ResponseId` 至多一条 `AssistantMessage` | [S-9](#s-9-assistantmessage一次回复只有一份) |
| ⑥ | 每条压缩记录的名单对它之前的前缀合法 | [S-29](#s-29-合法名单的判定) |
| ⑦ | 日志里没有 `SystemMessage`（`type: system`）：它每次组装现算，不落日志 | [S-7](#s-7-systemmessage) |

- **只说「至多」，不说「恰好」**：一次调用在某一刻可以还没有工具消息（它还在跑）；它最终有没有、何时有，归工具运行时与 PF-012 的对账，不是一条数据性质。
- **违反任何一条，是日志不一致，不是某一条消息的形状问题**：追加的一方拒绝那次追加；已经在日志里的，只能由日志的 owner 处置（[G-2](#九已知缺口)），
  **消费者不得「挑一条信」**——两条工具消息指回同一个调用时，没有哪一条天然是对的。

### S-33 消息不携带租户身份

**消息上没有租户身份，也没有会话、Run、尝试或作者。**一条消息归谁，由承载它的那条[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)给出——
消息是条目的载荷，条目带会话、Run、尝试与租户；**条目壳归 loop 与会话那一程**，本契约不设计它（[G-2](#九已知缺口)）。

由此对消费者：

- **不得从消息的内容推归属**——不读正文、不读 `source` 里的 `SessionRef`／`AgentRef`、不读 `MessageId`。
- **`source` 里指认别的会话、别的 agent 的那些值，只是指认**：拿到它们不等于有权访问那一边，访问照常由那一边的 owner 按调用方的租户身份现判（[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant)）。
- 流内的次序与块索引**不能独自承担**租户、会话、尝试的绑定——那一层归条目壳与协议（[第五节](#五装配给与协议给)）。

### S-49 模型请求运行时写的五种记录：不是消息

**`capability.model-request-runtime` 往会话日志里写五种记录；它们的形状归本契约**（与 `attempt_started` 同在会话日志这一族，不另立契约——主线裁定，见 [D-060 §一 S16-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的)）。
**它们不是消息**：不在七种之内、不进组装、不供任何视图呈现，**只供对账读**；与消息一样是[记录条目](../../../../ubiquitous_language/terms/record-and-context.md#ul-record-entry--记录条目--record-entry)的载荷、只增不改。
按 `kind` 判别，闭合（`ModelInvocationRecord`）；前四种名称无词条，第五种是[模型切换](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-model-switch--模型切换--model-switch)落下的那条记录（词条不为这条记录另立概念名）：

| `kind` | 记录 | 成员 | 何时写（那份能力的义务） |
|---|---|---|---|
| `model_call_dispatched` | 已出门 | `call`（`ModelCallId`）、`dispatch`（第几次发出，≥ 1）、`provider`（`data.model-profile/v5#S-5` 的 `ProviderName`）、`response`（这次发出的 `ResponseId`）；**这次调用的绑定**：`profile`（有效模型，`data.model-profile/v5#S-13` 的 `ModelProfileRef`）、`profileSnapshot`（打开调用那一刻的档案快照，`#S-27` 的 `ModelProfileSnapshot`）、`adaptation`（`data.model-profile/v5#S-29` 的 `ModelAdaptationBinding`，必填，包含完整配置值）、`parameters`（合并之后的请求参数，`#S-15` 的 `ModelRequestParameters`）、`selectedBy`（有效模型怎么来的）、`credentialScope`（这一次发出用的凭据在哪一格）；**传输适配为这一次发出定下的处置**：`parameterAdjustments?`（改了值再发出的那些项）、`droppedParameters?`（没发出去的那些项的名字） | 这一次请求离开本进程之前 |
| `model_call_opened` | 已开口 | `call`、`dispatch`、`firstTokenAt`（观察到首 token 的时刻） | 首个内容交给任何观察者之前 |
| `model_call_interrupt_intent` | 中断意图 | `call`、`initiator`：`user` · `run_cancelled` | 发出中止信号之前 |
| `model_call_ended` | 调用终结 | `call`、`ending` 三支（[S-50](#s-50-调用终结的三支)） | 调用不经响应体进入终态时 |
| `model_selection_changed` | 模型切换落下的那条记录 | `routeName`（`data.model-profile/v5#S-2` 的 `RouteName`：切到的是一个名字，不是某一行，PF-013 rev 12）、`at` | 切换生效之前 |

- **会话、Run、尝试、租户都在承载它的条目上**，不在记录里——与消息同一条规矩（[S-33](#s-33-消息不携带租户身份)）。
  「已出门落在哪一次尝试」「那次模型切换是谁发起的」都从条目读；切换只由交付面的切换命令写，发命令的租户身份就是会话持有的那一个。
- **`ResponseId` 在「已出门」那一刻定下**：由模型请求运行时在写这条记录时铸，此后这次发出的任何结算都用它（`data.model-response/v4#S-6`；主线裁定，见 [D-060 §五 K15](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）。
- **「已出门」带着这次调用的绑定**（主线裁定，见 [D-060 §五 K20](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：[一次调用的各次发出用同一份档案快照与参数](../../../../product/PF-013-model-profiles-and-invocation/design.md#67-生效点收到那条事实之后下一次模型请求之前)，
  而停机之后续接这次调用时，唯一留在日志里、又先于任何结算写下的就是「已出门」——响应体此时可能还不存在。绑定只放在响应体上，续接就只能从内存里找它，而内存已经没了。
  - `profile`、`profileSnapshot`、`adaptation`、`parameters`、`selectedBy` 在**一次调用的各次发出上逐字相同**（那份能力绑定一次、此后不改）；其中适配绑定的相同按 `data.model-profile/v5#S-29` 的完整 JSON 值相等判断，不以序列化后的对象成员次序区分。`credentialScope` 按那一次发出取到的凭据写，同一调用的两次发出可以不同。
  - **适配绑定显式留存两处，必须相等**：`adaptation` 与 `profileSnapshot.adaptation` 均为必填，同取 `data.model-profile/v5#S-29` 的公共定义；完整绑定相等沿该条比较全部修订与配置值，不只比较版本字符串。`adaptation.definition.modelId` 还必须与 `profile.routeName` 逐码点相等。这两个比较都是单条记录的表示层纯校验；不相等即 `malformed`，不修补任何一处，也不读取当前档案或注册状态决定哪一处优先。
  - **全部绑定信息留在先于请求出门的耐久记录里**：独立的 `adaptation` 明示发出采用的绑定，快照中的 `adaptation` 保留档案原值，两者不是两个可独立更新的来源。恢复可仅凭该记录辨认采用的实现、窄定义及配置；诊断丢失、当前档案已更新或旧版本不再注册，均不改变该记录。对账不能以当前或最新版本替代原绑定；是否允许再次发出与不可用时的收场由模型请求运行时承担。
  - `adaptation.configuration.values` 也受 [S-37](#s-37-规范表示) 的严格 JSON、重复成员拒绝和数无损约束；秘密与凭据不得进入记录，配置值的写入者义务引用 `data.model-profile/v5#S-30`，不新增凭据或会话身份成员。
  - **输入上限与上游事实完整留存**：`profileSnapshot` 精确采用 `data.model-profile/v5#S-27`，原样保留 `data.model-profile/v5#S-8`、`#S-9` 的全部项目 cap、同契约 `#S-32` 的所有适用上游事实与 `updatedAt`，包括显式的 unknown/unbounded/limited 分支和可选 cap 的缺席；不裁剪为本次刚好用到的指标。写入者在打开调用时从同一次完整读取复制并保持 `data.model-profile/v5#S-33` 的跨字段关系；各次发出、恢复与对应响应使用同一份快照，不从当前目录回填或刷新。接收方重验 MP5 快照形状；跨字段关系与完整复制仍由快照写入者承担，沿 MP5 S-27，不新增快照拒绝值。快照合规不等于实际输入已通过计量；每次发送的最终表示验证、不可计量的明确失败与旧调用新发送阻断归运行时。
  - `parameters` 是**合并之后、交给传输适配之前**的那一组（`data.model-response/v4#S-11` 说的「要求的那一组」）；传输适配改值或丢项之后实际发出的那一组记在响应体的 `route.parameters` 上，两者不是同一个值。
  - **改了哪些值、丢了哪些项，也记在这一条上**（主线裁定，见 [D-060 §六 L4](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#六修复波-1b-的主线裁定与接受的命名2026-09-25追加)）：传输适配对每一项的处置（按原值发出、改了值再发出、没发出）**在请求离开本进程之前就已定下**，
    所以写「已出门」时它们已知；停机之后替这一次发出补写响应体的一方，**从这一条读出实际发出的那一组**，不必等一份也许永远不来的响应体。
    - `parameterAdjustments`：每项 `{ name, requested, sent }`，`name` 在 `parameters` 里、`requested` **等于** `parameters` 里那一项的值、`sent` 是实际发出的值且与 `requested` 不同；`droppedParameters`：要求了却没发出的那些项的名字，每个都在 `parameters` 里。项名按 `data.model-profile/v5#S-20`（`extra` 项以它的键为名），一个项名至多出现在两份清单之一里，且在那一份里至多一次。
    - **缺席即断言**：`parameterAdjustments` 缺席即一项值也没改，`droppedParameters` 缺席即一项也没丢；**空数组不是合法写法**——与响应体那两个成员的读法相同。
    - **实际发出的那一组 = `parameters` 把 `parameterAdjustments` 列的那几项换成 `sent`、去掉 `droppedParameters` 列的那几项**；
      **去掉之后 `extra` 一个键都不剩时，整个 `extra` 成员缺席**——`extra` 出现时至少一项（`data.model-profile/v5#S-19`），空的 `extra` 不是合法写法（主线裁定，见 [D-060 §七 M28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)）。
      算出的那一组**是一份合法的 `ModelRequestParameters`**：每个 `sent` 都在那一项的取值域内（`extra` 项的值是任意 JSON，不受此限）——与 `data.model-response/v4#S-11` 第 5 条同一个要求，表示不出来的值传输适配不得发出，只能改成表示得出的值或不发、记进 `droppedParameters`。
      同一次发出若有响应体，它的 `route.parameters`、`route.parameterAdjustments`、`route.droppedParameters` 与这里算出的、写下的**逐项相同**（`data.model-response/v4#S-11`）。
    - 这两项**按这一次发出写**：同一次调用的两次发出，`parameters` 逐字相同，这两项可以不同（换了一家，处置就可能不同）。
  - **`selectedBy`、`credentialScope`、`parameterAdjustments` 的每一项（`ParameterAdjustment`）与 `droppedParameters` 的形状与 `data.model-response/v4` 的 S-10、S-9、S-11 逐字相同**，本契约自定义、不 `$ref`（理由见头部：那份契约 `$ref` 本契约，反向引用会让依赖成环）；同一次发出，两处写的值必须相同。
  - 凭据本身、凭据的引用都**不在**这里：`credentialScope` 只说是哪一格。
- **中断意图没有 `runtime_lost`**：失联时没有谁来得及写意图，那种收场由恢复对账直接落在响应体上。
- **表示层**：一条记录不合形状（含未知的 `kind`）即 `malformed`；[S-40](#s-40-表示层拒绝不是判定也不修补) 同样适用。
- **这几种记录能回答什么、何时写、谁写**，是 `capability.model-request-runtime` 的条款；本契约定共享值、单条记录合法性与「不是消息」，不拥有日志追加或恢复操作。

### S-50 调用终结的三支

**`model_call_ended` 按 `ending` 恰三支，闭合：**

| `ending` | 什么时候 | 终态 | 另带 |
|---|---|---|---|
| `undispatched` | 出门前检查不过，**一次也没发出** | 上交 | `cause`（必带）：`withdrawn` · `scope_disallowed` · `modality_mismatch` · `credential_unavailable` |
| `released` | 此前至少发出过一次，这次调用不再发出、loop 放手：最近一次发出以故障收场之后放手；或续接、再发时凭据取不到 | 上交 | `cause`（可带）：只有 `credential_unavailable` |
| `interrupted` | 在两次发出之间被中断 | 被中断 | `initiator`：`user` · `run_cancelled` |

- **经响应体进入终态的调用没有这条记录**：它的终态读响应体（`data.model-response`）。
- **`undispatched` 只指「一次也没发出」**：此前已经发出过的调用，不论之后因为什么不再发，都不写 `undispatched`——读的人要能只凭 `ending` 知道这次调用有没有响应体。
- **`released` 是规格层给的名字**：那份能力的「loop 放手」操作没有给这条结局起名，本契约为它立一个取值，免得用 `cause` 缺席来表示它（缺席不是一个值）。
- **`released` 的 `cause`**（主线裁定，见 [D-060 §五 K21](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#五s25-第一轮修复波的主线裁定k1k502026-09-24-夜追加)）：**缺席** = 最近一次发出以故障收场、loop 决定不再发——那次故障的成因在那份响应体上，这里不再写一份；
  **`credential_unavailable`** = 续接或再发之前凭据取不到，这一次没有出门，因而没有响应体可以记成因，只能记在这里。
  K21 原文把这个成因写作 `credential_missing`；**本契约取 `credential_unavailable`**：它说的与出门前那一支、`data.loop-extension` v3 `FailureCause` 里的 `credential_unavailable` 是同一件事（凭据取不到），同一件事只有一个名字——`credential_missing` 不是任何已有取值（这一取代登记在 [D-060 §四](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#四被推翻或被覆盖的项追加登记)「K21 的成因名」那一行）。
  其余三个出门前成因不会出现在这一支：档案快照与有效模型在打开调用时绑定、此后不改（`capability.model-request-runtime` 绑定的那一份），续接与再发不重核它们；**凭据是每次发出现取的**，唯一会在已发出过之后才不过的是它。
- **`cause` 的四个取值与 `data.loop-extension` v3 的 `FailureCause` 里出门前那四个逐字相同**：同一件事同一个名字。
  本契约不 `$ref` 那一份——那份契约以 `$ref` 取本契约的消息，反向引用会让两份契约互为依赖；两处的对齐义务登记在[验证入口](../verification.md#对齐义务)。
- **同一个字面值、两个互不相干的值域**：`cause` 里的 `modality_mismatch` 是**一次调用为什么没出门**（档案收不下这次投影的模态）；[S-39](#s-39-表示层拒绝值) 表示层拒绝值里的 `modality_mismatch` 是**一个语音块或图块上的媒体类型不是它该有的那一类**（取自 `data.content-blocks/v3#S-26`）。
  两者出现在不同的位置（一个是记录的成员值，一个是接收边界的拒绝结果），**不可按字符串互相推**。

## 四、出门的三条义务

[PF-009 §4](../../../../product/PF-009-context-message-types/design.md#出门的时候七种分三类)：出门的时候七种分三类。**本节是三条对「把消息译成某一家请求的那一方」（传输适配，无词条）的义务**；
每一家落成什么是那一方的映射表，**本契约不列各家**。

### S-34 四种直接对应

**`SystemMessage`、`UserMessage`、`AssistantMessage`、`ToolMessage` 直接对应到那一家的同名角色。**

- **工具调用与工具消息的配对随 `callId` 带过去**：那一家的「工具结果」只对应本契约的 `ToolMessage`。
- 块到那一家的哪种内容、收不下的模态取哪一份表示，归 PF-013 与组装；本条只定消息这一层的对应。

### S-35 我们自己那两种必须在发出前译掉

**`SystemReminderMessage` 与 `CompactionMessage` 在任何一家的接口里都不存在，所以必须在发出去之前被译掉**（[PF-009 §6.2](../../../../product/PF-009-context-message-types/design.md#62-我们自己那两种每一家都要有落点不许落空也不许丢)）：

- **每一家都必须为这两种各给出一个落点**，而且落成那一家**真的支持**的类型；两种各自决定，不必落到同一处。
- **不许落空，也不许丢**：不许落成发不出去的东西，也不许因为某一家没有合适的就把它丢掉——丢了，agent 在那一家上就永远看不见系统在说什么，**同一个 agent 换一家模型，行为就变了**。
- **译成那一家的普通角色时，内容上带一个由系统加的标识**，让 agent 分得出这不是人说的（[PF-009 §5.3](../../../../product/PF-009-context-message-types/design.md#53-落到对面之后agent-还得分得出这不是人说的)）；
  这个标识**由翻译的一方按类型加**，不来自产生消息的一方写进 `blocks` 的任何文字。
- **提醒里的工具结果块不是那次调用的第二个回答**（[S-19](#s-19-后台执行的两种收场提醒)）：那次调用已经由占位答过了。
  翻译的一方**不得把它译成对那次调用的又一个「工具结果」**——在要求一问一答的那一家，那会被拒收，或被当成一次从未发生的重复回答。

### S-36 ToolInternalMessage 不进请求

**`ToolInternalMessage` 不进任何一次模型请求**——它不给模型看，自然也没有落点问题；它**压根到不了翻译的那一方**。

- 这一条不依赖组装有没有按标注筛：**类型本身就把它挡在请求之外**，与 [S-13](#s-13-toolinternalmessage) 的硬约束两道都成立。

## 五、装配给与协议给

[SYS-DEPLOY](../../../../foundation/cross-system-constraints/requirements.md#sys-deploy)：第一版是单机，但语义不变地可扩展为分布式。

> **本表只列跨部署形态会变的保证**——单机由装配（同一进程、同一份追加式日志、同一处翻译）顺带给出的那些；
> 右列写分布式后**必须由协议重新兑现什么**，以及**做不到会怎样**。
> 不在表里的条款在任何部署形态下一律成立，**不在表里不等于不适用**。
> **这张表是契约的一部分，不是流程笔记**：装配给的那些，演化到分布式时不会自动成立。

| 保证 | 单机由谁给 | 分布式必须由协议兑现什么 | 做不到会怎样 |
|---|---|---|---|
| **`MessageId` 在会话日志内唯一**（[S-3](#s-3-messageid)） | 会话唯一的那一个日志写入方 | 同一会话的消息在不同节点产出时，**标识由协议协调或按节点分域**，分域规则是协议的一部分 | 两条消息同一个标识：压缩名单指到错的那条，**模型读到本该不可读的内容，或丢掉本该可读的，没有任何报错** |
| **「本消息之前」有唯一答案**（[第二节](#二含义与使用范围)、[S-29](#s-29-合法名单的判定)） | 一份只追加的日志，一个写入者 | 一个会话的日志在全体副本上**有同一个全序**（每个会话一个定序者，或等价的协议） | 同一条压缩记录在两个节点上一个合法一个不合法；同一个块在两个节点上一个可读一个不可读——**同一时刻的视图算出两份** |
| **名单合法性在追加的那一刻判**（[S-29](#s-29-合法名单的判定) ⑤⑥） | 追加方看得见追加点之前的整个前缀 | 判定与追加**在同一个定序点上线性化**：判的时候看到的前缀，就是它被接在后面的那个前缀 | 判的时候后台收场提醒还没到、接上去的时候已经在前面了（或反过来）——**悬着的占位被点名，agent 忘了自己还有东西在外面跑** |
| **配对与唯一**（[S-32](#s-32-会话日志里的配对与唯一)） | 同一进程里查一次再写 | 追加**按 `(callId, 消息种类)`、`ResponseId` 幂等**——至少一次的投递会把同一个结果落两遍 | 一次调用两条工具消息：模型看到两个回答，或那一家因一问两答拒收整个请求 |
| **出门的三条义务**（[S-34](#s-34-四种直接对应)～[S-36](#s-36-toolinternalmessage-不进请求)） | 进程内的一处翻译 | 远端的翻译方照同样三条兑现；**没有任何一跳可以「认不出就丢掉」** | 换一个部署形态，同一个 agent 在同一家模型上的行为变了 |
| **表示层校验在每个接收边界重做**（[S-39](#s-39-表示层拒绝值)） | 落盘前一次校验 | **每个接收边界各自重验**，不信任上游「已校验过」 | 一条非法消息进了日志，而日志只增不改，它**永远留在那里** |
| **完整限制快照留存**（S-49） | 日志写入者将打开调用时的完整快照留在已出门记录；恢复读同一份值 | 每跳保留 MP5 的全部 cap、上游事实及原版本，接收边界重验形状，不以当前目录重建 | 丢失当时上限或把未知误作无限；该记录不得作为 v6 记录接受，新发送由运行时拒绝 |
| **严格读、数无损**（[S-37](#s-37-规范表示)；M36） | 同一进程里一处无损的读写 | 每一跳（日志副本、跨节点传输、回放）的读写都是 RFC 8259 严格、数无损；重复成员名在每一跳都被拒 | 大整数或金额在某一跳被舍入，回放出来的日志与写下的不是同一份；或同一段文本在两个节点上读出两条不同的消息 |
| **租户、会话、尝试的绑定在条目上**（[S-33](#s-33-消息不携带租户身份)） | 同一进程里条目与载荷一起写 | 条目壳与载荷**一起过边界**，不单独传消息再在对端补归属 | 一条消息在对端被挂到另一个会话或另一个租户名下 |

## 六、表示与边界校验

### S-37 规范表示

- **规范表示**：[`messages.schema.json`](messages.schema.json)，JSON Schema **Draft 2020-12**。
  `$id` = `https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/messages/v7/messages.schema.json`
- **定义项（43 项）**：`Message`、`MessageBase`、`SystemMessage`、`UserMessage`、`AssistantMessage`、`ToolMessage`、`ToolInternalMessage`、`SystemReminderMessage`、`CompactionMessage`；
  `AssistantEnding`、`ToolInternalEnding`、`ReminderNature`；`ReminderSource` 与它的十一种来源（`BackgroundExecutionFinishedSource`、`BackgroundExecutionInterruptedSource`、`AttemptStartedSource`、`InterruptedSource`、`SystemWaitAnsweredSource`、`LoopGuardSource`、`PeerSessionNoteSource`、`ScheduledTriggerSource`、`RuntimeContextChangedSource`、`RuntimeContextSnapshotSource`、`ExtensionSource`）；
  `SilencedBlockRef`、`CardAnswer`、`LoopExtensionName`；`ModelInvocationRecord` 与它的五种（`ModelCallDispatchedRecord`、`ModelCallOpenedRecord`、`ModelCallInterruptIntentRecord`、`ModelCallEndedRecord`、`ModelSelectionChangedRecord`）与「已出门」上的 `SelectedBy`、`CredentialScope`、`ParameterAdjustment`；
  不透明标识 `MessageId`、`ResponseId`、`CardId`、`SessionRef`、`AgentRef`、`ScheduleRef`、`RuntimeContextBlockId`。
  消费者 `$ref` 这些定义，**不复制一份同义类型**。**根模式不约束任何文档**：本文件是共享定义的登记处。
- **成员名一律 camelCase**，枚举值一律 snake_case 字符串；消息的判别成员叫 `type`，来源与运行时记录的叫 `kind`，`about` 里嵌着的另一个 `kind` 与它们不相干。
- **读写消息（与运行时记录）的 JSON 文本，口径同 [`data.content-blocks/v3#S-24`](../../content-blocks/v3/contract.md#s-24-规范表示)**（主线裁定，见 [D-060 §八 M36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：按 **RFC 8259 严格**读；**任何一层对象里有重复的成员名即 `malformed`**（[S-39](#s-39-表示层拒绝值)），不在 Schema 求值之前挑一个——一条消息的 `type` 或 `visibility` 被读成两种，就是两份不同的日志；
  **数无损**：消息与记录里的任何一个 JSON 数读进来、存下（会话日志）、再读出来是同一个十进制数，超出 ±2^53 的整数与金额保留原文、不折成二进制浮点，落盘与回读都走无损读写。**只说一次**：块内的那一半就是 `data.content-blocks` S-24 那一条，这里把同一口径扩到块外的成员与整条消息的文本，不另起一套。
- 块、块标识、调用标识、执行收场、能力标识的 `name` 经 `$ref` 取 `data.content-blocks/v3`；时刻经 `$ref` 取 `data.offer-expiry/v1` 的 `Instant`；
  `ModelCallId`、`AttemptId` 经 `$ref` 取 `data.call-accounts/v3`；`RouteName`、`ProviderName`、`ModelProfileRef`、`ModelRequestParameters`、`ModelProfileSnapshot`、`ModelAdaptationBinding` 经 `$ref` 取 `data.model-profile/v5`（S-2、S-5、S-13、S-15、S-27、S-29）；
  `CredentialScope` 的租户那一支经 `$ref` 取 `data.identity-values/v1` 的 `ScopeLayerIdentity`（S-11）。
  不透明标识按 `data.identity-values/v1#S-31` 的散文各自写出 pattern，**不跨契约 `$ref` 它的 `OpaqueIdentifier`**。
  **`ResponseId` 的家是 `data.model-response/v4#S-6`，本契约按同一散文自定义、不 `$ref`**：那份契约以 `$ref` 取本契约的 `AssistantMessage` 作回复，
  反向 `$ref` 会让两份契约互为依赖（与 `data.call-accounts/v3#S-16` 同法）。两处形状逐字相同；S-31 改集合时两处一起出新版本。
  **`SelectedBy`、`CredentialScope`、`ParameterAdjustment`（连同「已出门」上 `droppedParameters` 的就地形状）同一理由自定义**，形状与 `data.model-response/v4` 的 S-10、S-9、S-11 逐字相同；那边改形状，本契约同轮改（[验证入口「对齐义务」](../verification.md#对齐义务)）。
- **正反实例**：[`examples.md`](examples.md)。它是本版的规范工件，不是说明材料。

### S-38 判别式与枚举闭合

`type`、`source.kind`、`nature`、`AssistantEnding`、`ToolInternalEnding`、`attempt_started.reason`、`interrupted.what`／`by`、`about.kind`、
`runtime_context_snapshot.reason`、`loop_guard.level`、运行时记录的 `kind`、`model_call_ended.ending`／`cause`、两处 `initiator`、「已出门」的 `selectedBy` 与 `credentialScope.layer`，以及经 `$ref` 取来的块与档案的判别与枚举，各是一个**闭合集合**，没有「其他」。

遇到未知取值**一律作表示非法拒绝**：**不得**映射到「最接近」的已知值、**不得**当作缺省、**不得**忽略该成员继续。
一个未知的 `type` 被当成用户消息，系统的话就成了人的话；一个未知的来源被当成 `extension`，就替它补了一个它没说过的身份——**静默降级就是放行**。

### S-39 表示层拒绝值

**一条消息不合本契约的形状时，拒绝值恰为下面十四个之一，集合闭合。**其中六个是 [`data.content-blocks/v3#S-26`](../../content-blocks/v3/contract.md#s-26-表示层拒绝值) 的，**原名、原义**落进来（块在消息里任何一层违例都用它们），不另起同义值：

| 拒绝值 | 什么时候 | 条款 |
|---|---|---|
| `type_unknown` | `type` 出现了，但不是七个取值之一（大小写不同也算不是） | [S-1](#s-1-七种消息)、[S-38](#s-38-判别式与枚举闭合) |
| `kind_unknown` · `visibility_missing` · `incomplete_call_visible` · `call_in_result` · `modality_mismatch` | 消息里某一块（任意层）按 `data.content-blocks/v3#S-26` 取到这个值 | [S-2](#s-2-消息底座) |
| `block_id_duplicate` | 一条消息里（含任意嵌套层）两个块的 `id` 相同（[`data.content-blocks/v3#S-3`](../../content-blocks/v3/contract.md#s-3-blockid) 交给本契约的接收边界查） | [S-2](#s-2-消息底座) |
| `tool_message_block_count` | `type: tool`，而顶层块不是恰好一块、或那一块的 `kind` 不是 `tool_result`、或那一块与消息的 `callId` 都在却不同（按 `kind` 数，不按块合不合形状数） | [S-11](#s-11-toolmessage) |
| `tool_internal_block_visible_to_model` | `type: tool_internal`，顶层某一块 `visibility.toModel` 为 `true` | [S-13](#s-13-toolinternalmessage) |
| `reminder_nature_mismatch` | `type: system_reminder`，`source.kind` 是十一种之一、`nature` 是两种之一，但两者不是定死的那一对 | [S-16](#s-16-性质与来源定死对应) |
| `reminder_state_without_previous` | `source.kind: runtime_context_changed`，没有 `previous` 成员 | [S-17](#s-17-说状态的带前值与现值) |
| `compaction_self_reference` | `type: compaction`，名单里某一项的 `messageId` 是这条消息自己的 `id` | [S-29](#s-29-合法名单的判定) ① |
| `malformed` | 其余一切不合形状：缺必填成员（含 `type`、`ending`、`silenced` 缺席）、多出成员、类型不对、未知的其他枚举值（含未知的 `source.kind`）、违反 [S-6](#s-6-每种消息能装哪几类块) 的任一格、违反 [S-10](#s-10-assistantmessage-怎么收的尾) 的两条组合约束、`ToolMessage` 的结果块 `reason.code` 是 `terminated_by_agent`（[S-11](#s-11-toolmessage)）、`ToolInternalMessage` 没有块、后台收场提醒里工具结果块的数目或 `callId`／`outcome` 与 `source` 对不上、`about` 与 `what` 对不上、名单重复或摘要与名单都空、读 JSON 文本时某一层对象里有重复的成员名（[S-37](#s-37-规范表示)，M36；块里的那一层按 `data.content-blocks` 同样是 `malformed`）。**判据只有一条**：不合 Schema，或违反本表之外那几条 Schema 管不到的单条消息或运行时记录内的跨成员约束（包括 S-49 的两处适配绑定不相等、模型 ID 与 `profile.routeName` 不相等）；上面只是举例 | 各条 |
| `compaction_forward_reference` | `type: compaction`，名单里某一项的 `messageId` 不是这条消息之前的日志里的一条消息 | [S-29](#s-29-合法名单的判定) ② |

**判定分两段，次序固定：**

```text
第一段（只看这一条消息）：
  type_unknown > kind_unknown > visibility_missing > incomplete_call_visible > call_in_result > modality_mismatch
    > block_id_duplicate > tool_message_block_count > tool_internal_block_visible_to_model
    > reminder_nature_mismatch > reminder_state_without_previous > compaction_self_reference > malformed

第二段（第一段通过之后，要看得见这条消息之前的日志）：
  compaction_forward_reference
```

- **一份输入有多处违例时，取第一段里优先级最高的那个**；第一段有违例就不进第二段。
  这让一个只看得见消息本身的边界、与一个看得见整份日志的边界，**对同一份坏输入给出同一个拒绝值**。
- 越靠前越说明这份值在根上不可读：认不出是谁在说话、认不出某一块是什么，就谈不上别的。**`malformed` 是剩余项，不是「其他」**。
- **第二段之后还有 [S-29](#s-29-合法名单的判定) ③～⑥ 与 [S-32](#s-32-会话日志里的配对与唯一) 的判定**——它们不是表示层拒绝，不在这张表里。
- 拒绝值怎样落进各个操作自己的失败集合（日志追加、流装配、工具运行时、入站受理），归那些契约；**它们引用本条的名字，不另起一套同义值**。

### S-40 表示层拒绝不是判定，也不修补

- **表示非法的输入在进入任何判定之前被拒绝。**这次拒绝**不表示**「这件事没发生」「这个工具失败了」「这次压缩失败了」，
  也**不得被记成一次收场、一次中断或一次判定结果**（与 [`data.identity-values/v1`](../../identity-values/v1/contract.md#s-33-表示层校验与判定分开) 的做法相同）。
- **不修补、不降级、不尽力而为**：不补 `ending`、不补 `previous`、不按 `source.kind` 改 `nature`、不删掉名单里不合法的那几项、
  不把一条多了一块的工具消息截成一块、不把一条有块标着给模型的工具过程消息改成不给。**修补等于替产生者做了一个它没做的决定。**
- **表示合法不表示任何资格**：Schema 校验通过只说明形状合规——不说明名单与日志相容（[S-29](#s-29-合法名单的判定)）、不说明配对成立（[S-32](#s-32-会话日志里的配对与唯一)）、不说明 `source` 里指认的会话可以访问（[S-33](#s-33-消息不携带租户身份)）。

### Schema 管得到什么

| 条款 | Schema 管得到吗 | 管不到的那部分归谁 |
|---|---|---|
| [S-1](#s-1-七种消息)、[S-38](#s-38-判别式与枚举闭合) 七种、闭合 | **管得到**：`oneOf` 七种，未知 `type` 无一匹配 | 拒绝值的**名字**由 [S-39](#s-39-表示层拒绝值) 定 |
| [S-2](#s-2-消息底座) 底座与成员闭合 | **管得到** | 块标识在消息内唯一——接收边界（`block_id_duplicate`） |
| [S-3](#s-3-messageid)、[S-4](#s-4-createdat-不是次序) | 管形状 | 日志内唯一、不按 `createdAt` 排序——写入方与消费者 |
| [S-5](#s-5-给谁看在块上) | 只管 `tool_internal` 那一位 | 其余是常态，不是检查 |
| [S-6](#s-6-每种消息能装哪几类块) | **管得到**：每一格 | — |
| [S-9](#s-9-assistantmessage一次回复只有一份)、[S-10](#s-10-assistantmessage-怎么收的尾) | 管 `response`／`ending` 必填、两条组合约束 | 一份回复只一份权威内容、一个 `ResponseId` 至多一条——写入方与条目壳 |
| [S-11](#s-11-toolmessage) | 管块数与块的类；那一块的 `reason.code` 不是 `terminated_by_agent` | **两个 `callId` 相同**——跨成员比较，管不到 |
| [S-13](#s-13-toolinternalmessage)、[S-14](#s-14-toolinternalmessage-怎么收的尾) | **管得到**：顶层 `toModel: false`、至少一块、`ending` 闭合 | 只留收尾之后那一条——写入方 |
| [S-16](#s-16-性质与来源定死对应) | **管得到**：`if`／`then` 逐种定死 | — |
| [S-17](#s-17-说状态的带前值与现值) | 管 `previous` 必填、`current` 不为 `null` | 前值真的是「最后感知到的那一份」、正文说清了变化——产生者 |
| [S-18](#s-18-来源闭合拓展件走兜底)～[S-26](#s-26-拓展件追加的提醒) 各来源 | **管得到**：成员闭合、取值域、`about` 与 `what` 的配合、后台收场提醒里恰好一个工具结果块及其收场范围 | 工具结果块的 `callId`／`outcome` 与 `source` 相同——跨成员比较，管不到 |
| [S-27](#s-27-compactionmessage-与它的名单) | 管 `silenced` 必填、不重复、与摘要不能都空 | — |
| [S-28](#s-28-此刻模型可读是算出来的)～[S-30](#s-30-悬着的占位) | **管不到**：自指、前向、合法性、可读性都要看日志 | 接收边界、写入方与组装；结构检查见 [`formal/`](formal/README.md) |
| [S-32](#s-32-会话日志里的配对与唯一) | **管不到** | 写入方 |
| [S-49](#s-49-模型请求运行时写的五种记录不是消息)、[S-50](#s-50-调用终结的三支) | **管得到**：五种闭合、成员闭合、已出门必带 `adaptation` 且档案快照也必带该字段、调用终结三支各带什么（含 `released` 的 `cause` 只取 `credential_unavailable`） | **单条记录接收边界**：两处绑定完全相等及 `adaptation.definition.modelId = profile.routeName`，失败 `malformed`；Schema 不支持跨字段相等。何时写、谁写——`capability.model-request-runtime`；「已出门」的绑定在一次调用的各次发出上逐字相同、与同一次发出的响应体 `route` 写的值相同——跨记录，写入方 |
| [S-34](#s-34-四种直接对应)～[S-36](#s-36-toolinternalmessage-不进请求) | **管不到**：都是翻译一方的行为 | 模型请求运行时与传输适配 |
| [S-37](#s-37-规范表示) 读写 JSON 文本的口径（M36） | **管不到**：重复成员名与数的精度在 Schema 求值之前就定了 | 读消息文本的接收边界（会话日志的读写、跨节点传输）：严格、无损地读，重复键报 `malformed` |

**非法输入的含义**：Schema 校验失败 ⇒ 该输入**不是**一条消息 ⇒ 按 [S-39](#s-39-表示层拒绝值) 取拒绝值、按 [S-40](#s-40-表示层拒绝不是判定也不修补) 收场。
**Schema 通过也可能仍然非法**——上表「管不到」那一列里属于单条消息的几条（`callId` 相等、`outcome` 相等、自指、块标识唯一）由接收边界兑现。

## 七、性质与场景

### 性质

| # | 性质 | 类 | 来源 | 谁在何处保护 | 违反时可观察到什么 |
|---|---|---|---|---|---|
| P-1 | 一条消息是谁说的由 `type` 唯一确定，七种闭合 | 不变量 | [PF-009 §6.1](../../../../product/PF-009-context-message-types/design.md#61-一条消息是谁说的永远查得到且不靠解析内容) | Schema ＋ 接收边界（[S-1](#s-1-七种消息)） | agent 把系统插的话当成人的话去回应；「用户到底说了什么」要靠猜 |
| P-2 | 日志里只有收尾之后的消息，没有半条消息 | 安全 | [PF-009 §6.7](../../../../product/PF-009-context-message-types/design.md#67-分次到达的东西不进消息类型清单) | 写入方（[S-1](#s-1-七种消息)、[S-13](#s-13-toolinternalmessage)） | 读到它的人分不出「还没说完」与「说到一半被掐了」 |
| P-3 | 工具说过程的块永远不进模型那一份 | 安全 | [PF-009 §6.14](../../../../product/PF-009-context-message-types/design.md#614-工具帧不进模型的上下文) | Schema（顶层 `toModel: false`）＋ 类型不进请求（[S-13](#s-13-toolinternalmessage)、[S-36](#s-36-toolinternalmessage-不进请求)） | 一个话多的工具把整份上下文吃光 |
| P-4 | 一次调用至多一条工具消息；真实结果只落一处，落哪处只看有没有占位 | 不变量 | [PF-009 §4](../../../../product/PF-009-context-message-types/design.md#systemremindermessage) · [§5.8](../../../../product/PF-009-context-message-types/design.md#工具帧跟-toolmessage-是两条轨) | Schema（块数）＋ 写入方（[S-11](#s-11-toolmessage)、[S-12](#s-12-真实结果落哪种消息只看有没有占位)、[S-32](#s-32-会话日志里的配对与唯一)） | 模型看到两个回答；或后台结果回来却没有地方落 |
| P-5 | 提醒的性质与来源对得上；说状态的变化带前值与现值 | 不变量 | [PF-009 §5.4](../../../../product/PF-009-context-message-types/design.md#54-提醒说的是现在什么样还是刚才发生了什么) · [§6.4](../../../../product/PF-009-context-message-types/design.md#64-说状态的写清变化说事的写清发生消息一律追加) | Schema（[S-16](#s-16-性质与来源定死对应)、[S-17](#s-17-说状态的带前值与现值)） | 变过三次，读的人只看到三份各说各话的当前值 |
| P-6 | 系统认来源只读 `source`，不解析正文 | 安全 | [PF-009 §5.1](../../../../product/PF-009-context-message-types/design.md#51-systemremindermessage-凭什么独立而不是一条带标记的用户消息) · [§6.3](../../../../product/PF-009-context-message-types/design.md#63-提醒的标识由系统加产生提醒的那一处交的是消息) | 各消费者的实现（[S-15](#s-15-systemremindermessage正文给模型读来源给系统认)） | 一个工具的返回里写一句「后台执行 X 已结束」，对账就当它结束了 |
| P-7 | 只要中断就补一条提醒 | 进展（前提：写中断提醒的一方在中断之后仍有连续性；它也没了时，由下一次尝试的对账接手） | [PF-009 §6.13](../../../../product/PF-009-context-message-types/design.md#613-只要发生了中断就补一条提醒) | 流装配与 loop（[S-21](#s-21-中断之后必补一条)） | agent 自己编一个解释，然后重说一遍、重调一次 |
| P-8 | 我们自己那两种出门前必被译掉，不落空、不丢 | 安全 | [PF-009 §6.2](../../../../product/PF-009-context-message-types/design.md#62-我们自己那两种每一家都要有落点不许落空也不许丢) | 传输适配（[S-35](#s-35-我们自己那两种必须在发出前译掉)） | 同一个 agent 换一家模型行为就变了，没人查得出为什么 |
| P-9 | 「此刻模型可读」只由块上的标注与在前的名单算出；单调不回退 | 不变量 | [PF-010 §5.7](../../../../product/PF-010-context-management-and-assembly/design.md#那两个标注仍然是这件事的前提) | 定义（[S-28](#s-28-此刻模型可读是算出来的)）＋ 块不变与日志只增（[`data.content-blocks/v3#S-22`](../../content-blocks/v3/contract.md#s-22-落盘之后整块不变)） | 「第 5 轮时模型看到了什么」答不出来；一个被压掉的块又回来了 |
| P-10 | 名单只点前缀里存在的、不悬着的、模型已看过的块（系统提示词不在日志里，点不到） | 安全 | [PF-010 §5.8](../../../../product/PF-010-context-management-and-assembly/design.md#58-压缩不能做的有三件事) · [§6.13](../../../../product/PF-010-context-management-and-assembly/design.md#613-上一次模型请求之后新来的消息不许压) · [§6.14](../../../../product/PF-010-context-management-and-assembly/design.md#614-悬着的东西不许被点名) | 追加的边界（[S-29](#s-29-合法名单的判定)、[S-30](#s-30-悬着的占位)） | agent 不知道自己还有东西在外面跑；模型永远只看到概括、看不到刚来的原文 |
| P-11 | 一次回复只有一份权威内容 | 不变量 | 规格层推导（[S-9](#s-9-assistantmessage一次回复只有一份)：两份会各自演化，排查时不知道信哪一份） | 写入方与条目壳（[S-9](#s-9-assistantmessage一次回复只有一份)） | 响应体里那一份与日志里那条不一样，排查时不知道该信哪一份 |
| P-12 | 表示非法即拒，不修补、不降级；拒绝值唯一 | 安全 | SYS-SPEC | 每个接收边界（[S-39](#s-39-表示层拒绝值)、[S-40](#s-40-表示层拒绝不是判定也不修补)） | 两个实现对同一份坏输入报不同的拒绝值；或坏消息被「修好」后进了日志 |
| P-13 | 模型请求运行时的五种记录不是消息：不进组装、不供视图呈现 | 安全 | 主线裁定，见 [D-060 §一 S16-d](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s16model-profile-directory--model-request-runtime报回的) | 组装与呈现只取七种消息（[S-49](#s-49-模型请求运行时写的五种记录不是消息)） | 模型的上下文里出现「已出门」一类的对账记录；或用户界面把它们当成对话显示 |

**本契约只有一条进展性质（P-7），且它的兑现者不是本契约**：本契约给出它的形状与「必补」这件事，由谁在何时补归流装配与 loop。

**选用了一份 Alloy 结构模型**：[`formal/Readable.als`](formal/README.md)——[S-28](#s-28-此刻模型可读是算出来的) 的派生规则、[S-29](#s-29-合法名单的判定) 的合法名单、[S-30](#s-30-悬着的占位) 第 1 类是跨消息的结构性质，
「点名只能向前」「悬着的占位不可点」「可读性单调不回退」在一份日志的所有前缀上是否同时成立，靠逐条读条款看不出来。**它覆盖到哪、各凭什么，逐条如下，不超出这些**：

| 条款 | 在模型里是什么 | 证据的强度 |
|---|---|---|
| [S-29](#s-29-合法名单的判定) ① ② | **写成事实**，断言它们的推论 A1（一块一出生就可读） | A1 有变异核对：放宽 ① 或 ② 都找到反例。① ② 本身不是被检查的对象 |
| [S-29](#s-29-合法名单的判定) ⑤ ＋ [S-30](#s-30-悬着的占位) 第 1 类 | 断言 A2，「悬着」在断言里独立写一遍 | A2 有两个变异核对 |
| [S-28](#s-28-此刻模型可读是算出来的) 嵌套按合取 | 断言 A4 | 有变异核对 |
| [S-28](#s-28-此刻模型可读是算出来的) 单调不回退 | 断言 A3 | **最弱**：没有变异核对；它的前提「块不变」被建模方式吸收（模型里的块没有可变成员）——**按构造，不作证据**，前提的证据归写路径的静态检查（验证入口 SC-4：不存在回头改块上 `toModel` 的写路径） |
| [S-29](#s-29-合法名单的判定) ③ 点了不存在的块 | 被建模方式吸收：模型里的名单只能取存在的块 | **按构造，不作证据**；证据是规范场景 [S-46](#s-46-名单的合法性) |
| [S-29](#s-29-合法名单的判定) ⑥ 输入区间的上界 | 未建模：「上一次模型请求落在日志哪一处」不在消息里（[G-2](#九已知缺口)） | 无；证据是规范场景 [S-46](#s-46-名单的合法性) |
| [S-32](#s-32-会话日志里的配对与唯一) ② ④ | 写成事实，作为 A2 的环境 | 不被检查；证据是日志序列检查（V-4） |
| [S-32](#s-32-会话日志里的配对与唯一) ⑦ 日志里没有 `SystemMessage` | 模型里没有这种消息 | **按构造，不作证据**；证据是日志序列检查（V-4） |

映射、前提与未建模的部分在 [`formal/README.md`](formal/README.md)；**执行结果在版本外**（[验证入口](../verification.md)）。不建 TLA+：本契约没有状态转移，日志的追加次序是它的前提，不是它的行为。

### 规范场景

场景是本契约触发的证据形式；执行状态与结果在[验证入口](../verification.md)，不写进本版本目录。实例在 [`examples.md`](examples.md)。

#### S-41 七种之外即拒

把一条 `type: "developer"` 的消息交给接收边界。**必须观察到**：拒绝值 `type_unknown`；日志里没有它；**它没有被当成用户消息或提醒接受**。
正例：同样内容的 `type: "system_reminder"` 带齐 `nature` 与 `source` 被接受。

#### S-42 工具消息恰一块

正例：一条工具消息、一个工具结果块、两个 `callId` 相同。
反例一：两个工具结果块——`tool_message_block_count`，**不被截成一块后接受**。反例二：一个块、`callId` 不同——Schema 通过，**接收边界仍须拒绝**，拒绝值 `tool_message_block_count`。
两个反例必须同跑：只跑第一个，一个只信 Schema 的实现也会全过。

#### S-43 工具帧不给模型

正例：一条工具说过程的消息，三块都标 `{ toHuman: true, toModel: false }`，被接受，**给模型的那一份里没有它的任何一块**。
反例：其中一块标 `toModel: true`——`tool_internal_block_visible_to_model`，**不被改成 `false` 后接受**。

#### S-44 提醒的性质与来源

正例：`runtime_context_changed`、`nature: "state"`、`previous: null`、`current` 是一个对象——被接受，`null` 读作「从未感知过」。
反例一：同一条把 `nature` 写成 `event`——`reminder_nature_mismatch`，**不按来源改性质**。反例二：去掉 `previous`——`reminder_state_without_previous`，**不补成 `null`**。

#### S-45 真实结果落哪种消息

构造两次调用：`call_a` 前台跑完；`call_b` 前台跑到一半转后台，后来跑完。**必须观察到**：
`call_a` 只有一条工具消息，里面是真实结果；`call_b` 有一条 `outcome: backgrounded` 的工具消息，**之后**有一条 `background_execution_finished` 提醒，结果是它 `blocks` 里那一块；
`call_b` **没有**第二条工具消息。再让 `call_b` 的后台执行随据点停机没了：对账追补 `background_execution_interrupted`，**不追补第二条工具消息**。

#### S-46 名单的合法性

在一份日志上逐项构造：名单点自己（`compaction_self_reference`）、点一条之后才出现的消息（`compaction_forward_reference`）、点一个不存在的块、
点一个在追加点悬着的占位、点上一次模型请求之后才来的消息——**后三种形状全都合规，接收边界仍须拒绝那次追加**，且**不删掉那一项之后接受**。
另把一条形状合法的 `SystemMessage` 交给日志的追加——**必须被拒**（[S-32](#s-32-会话日志里的配对与唯一) ⑦），日志里没有它。
正例：同一个占位在它的后台收场提醒之后被点名——合法。实例在 [`examples.md` 第 10 节](examples.md#10-schema-挡不住但同样非法的)。

#### S-47 此刻模型可读

[`examples.md` 第 11 节](examples.md#11-规范场景五条消息此刻哪些块模型可读)的五条消息：**组装给模型的那一份，只能从手算出的可读集合里取**；
在第 4 条之后与第 5 条之后各组装一次，被点名的两块在第二次**消失**、且在之后任何一次都不再回来；**块上的标注一位都没变**。

#### S-48 中断必补

对模型那一层的五种流断各跑一次，再加运行被取消的两支（都在模型已经开口之后）。**必须观察到**：每一次日志里都有一条 `interrupted` 提醒；只有「用户叫停、已有内容」与「写到上限」两种另有一条回复，`ending` 分别是 `interrupted_by_user`、`truncated_at_limit`；
「用户叫停、什么都没出来」**没有**一条空回复；出错断的两种**没有**回复，已交付的部分在那次模型调用的账里。
**运行被取消**：用户取消的那一支与「用户叫停、已有内容」相同（回复 `interrupted_by_user`，提醒 `by: user`）；系统取消的那一支（会话归档或宿主停止）**没有**回复，提醒 `by: system`、`hadContent: true`，已交付的部分在那一次发出的响应体上、收场被中断、发起方 `run_cancelled`。
**绝不能观察到**：系统取消的那一支落成一条 `interrupted_by_user` 的回复。

### 消费者核对场景

> 格式：**消费者 X 在情形 Y 下依赖本契约的 S-n，得到 Z。**任一条走不通，缺口在本契约。

#### CS-1 恢复对账找后台执行

PF-012 的对账在**一次尝试起来、日志里有 `call_b` 的转后台占位**时，依赖 [S-19](#s-19-后台执行的两种收场提醒)、[S-30](#s-30-悬着的占位)、[S-32](#s-32-会话日志里的配对与唯一)，得到：
只读 `source` 就判得出「`call_b` 结束了没」；没结束且工具执行运行时里找不到它时，追补一条 `background_execution_interrupted`，里面一个 `failed`／`abnormal_interruption` 的工具结果块；此后那个占位不再悬着。

#### CS-2 压缩写名单

PF-010 的压缩在**要让前面一张大图对模型不可读**时，依赖 [S-27](#s-27-compactionmessage-与它的名单)、[S-29](#s-29-合法名单的判定)、[S-30](#s-30-悬着的占位)，得到：
名单里写 `{ messageId, blockId }`；它在追加前就判得出这一项是否合法——除了「没答完的卡片的占位是哪一块」那一半，**停在 [G-5](#九已知缺口)**；
「上一次模型请求落在日志哪一处」**停在 [G-2](#九已知缺口)**。停在缺口不算走不通，如实记为「本版到此为止」。

#### CS-3 上下文组装取块

PF-010 的组装在**给有效模型组装一次请求**时，依赖 [S-5](#s-5-给谁看在块上)、[S-28](#s-28-此刻模型可读是算出来的)、[S-36](#s-36-toolinternalmessage-不进请求)，得到：
一个不需要任何存下来的「当前可读集合」的算法；工具说过程的消息整条不取；**系统提示词不从日志取**——它每次现算、只含文本，压缩碰不到它（[S-7](#s-7-systemmessage)）；日志里若出现一条 `SystemMessage`，那是日志不一致（[S-32](#s-32-会话日志里的配对与唯一) ⑦），由日志的 owner 处置（[G-2](#九已知缺口)），不是组装的一个输入。**名单点了一个调用块而没点它的结果（或反过来）之后怎样保持成对，由它自己定**（[第十节](#十明确不承诺)）。

#### CS-4 流装配收尾

`capability.stream-assembly` 在**用户叫停一次已经吐出半句话、还开着一个工具调用参数的回复**时，依赖 [S-9](#s-9-assistantmessage一次回复只有一份)、[S-10](#s-10-assistantmessage-怎么收的尾)、[S-21](#s-21-中断之后必补一条)，得到：
交出一条 `ending: interrupted_by_user` 的回复，里面一个文本块、一个 `complete: false` 的调用块；另补一条 `interrupted`、`by: user`、`hadContent: true` 的提醒。
参数收齐了却解析不了的那一种，调用块带原文与 `unparseable: true`、`complete: true`（[S-31](#s-31-收齐却解析不了的调用)）。

#### CS-5 翻译一条后台结果

传输适配在**把一条带工具结果块的 `background_execution_finished` 提醒发给一家要求一问一答的模型**时，依赖 [S-19](#s-19-后台执行的两种收场提醒)、[S-35](#s-35-我们自己那两种必须在发出前译掉)，得到：
那条提醒必须译成那一家真的支持的类型、带系统加的标识；里面的工具结果**不译成对 `call_b` 的第二个工具结果**。落成哪一种、结果内容怎样呈现，由它自己的映射表定。

#### CS-6 尝试开始

loop 在**一个 Run 的第一次尝试起来**时，依赖 [S-20](#s-20-尝试开始)，得到：交出 `attempt: 1`、`reason: first`、`at`；
从一次中断接上来的那一次是 `resumed_after_interruption`，等到的东西回来之后的那一次是 `resumed_after_wait`；Run 由条目给出（[G-2](#九已知缺口)）。

#### CS-7 入站受理一条子 agent 的回报

PF-014 的受理在**自己派出去的子 agent 回来报告**时，依赖 [S-15](#s-15-systemremindermessage正文给模型读来源给系统认)、[S-24](#s-24-别的会话捎话与到点了)，得到：
一条 `peer_session_note` 提醒，`fromSession` 是子会话；**不落成用户消息**。`SessionRef` 的形状只到不透明（[G-7](#九已知缺口)）。

## 八、缺席怎么收

**本契约没有操作，因此没有提交点、没有幂等边界、没有事件。**下面写的是值层面的缺席各自是什么意思：

| 缺席的是什么 | 意思 | 条款 |
|---|---|---|
| `type` | **拒绝**（`malformed`）——判别不出是谁在说话 | [S-1](#s-1-七种消息) |
| `id`、`blocks`、`createdAt` | **拒绝**（`malformed`） | [S-2](#s-2-消息底座) |
| `AssistantMessage.ending` | **拒绝**（`malformed`），**从不当作 `complete`** | [S-10](#s-10-assistantmessage-怎么收的尾) |
| `AssistantMessage.response` | **拒绝**（`malformed`） | [S-9](#s-9-assistantmessage一次回复只有一份) |
| `ToolMessage`／`ToolInternalMessage` 的 `callId` | **拒绝**（`malformed`） | [S-11](#s-11-toolmessage)、[S-13](#s-13-toolinternalmessage) |
| 提醒的 `nature` 或 `source` | **拒绝**（`malformed`），**不从正文推** | [S-15](#s-15-systemremindermessage正文给模型读来源给系统认) |
| `runtime_context_changed.previous` | **拒绝**（`reminder_state_without_previous`），**不补成 `null`** | [S-17](#s-17-说状态的带前值与现值) |
| `runtime_context_changed.previous` 为 `null` | **合法**：这个会话从未感知过这一块 | [S-17](#s-17-说状态的带前值与现值) |
| `CompactionMessage.silenced` | **拒绝**（`malformed`），**不当作空名单** | [S-27](#s-27-compactionmessage-与它的名单) |
| `silenced` 为空数组 | **合法**：这次只概括、不点名（摘要不能也是空的） | [S-27](#s-27-compactionmessage-与它的名单) |
| `interrupted.about` | **合法**：说的是那一层被中断了，不指认某一次 | [S-21](#s-21-中断之后必补一条) |
| `model_call_dispatched.adaptation` 或 `profileSnapshot.adaptation` | **拒绝**（`malformed`），不从另一处、当前档案或最新注册版本补值 | [S-49](#s-49-模型请求运行时写的五种记录不是消息) |
| `profileSnapshot` 缺少 MP5 要求的输入 cap 或适用上游事实 | **拒绝**（`malformed`），缺席不等于 unknown 或 unbounded，不读当前目录补齐，也不转交旧格式读面 | [S-49](#s-49-模型请求运行时写的五种记录不是消息) |
| `model_call_ended.cause`，`ending: undispatched` | **拒绝**（`malformed`）：没出门总有一个成因 | [S-50](#s-50-调用终结的三支) |
| `model_call_ended.cause`，`ending: released` | **合法**：最近一次发出以故障收场、loop 放手，成因在那份响应体上；**不是**「凭据取不到」——那一种必带 `credential_unavailable` | [S-50](#s-50-调用终结的三支) |
| `model_call_ended.cause`，`ending: interrupted` | **必须缺席**；带了是 `malformed` | [S-50](#s-50-调用终结的三支) |
| `peer_session_note.fromAgent` | **合法**：不作任何断言 | [S-24](#s-24-别的会话捎话与到点了) |
| `extension.payload` | **合法**，且与 `payload: null` 是两件事，各自原样保留 | [S-26](#s-26-拓展件追加的提醒) |
| 一次调用还没有工具消息 | **合法**：它还在跑；不是「失败」也不是「没有结果」 | [S-32](#s-32-会话日志里的配对与唯一) |
| 一次执行没有工具说过程的消息 | **合法**：它没发帧，那是正常形态 | [S-13](#s-13-toolinternalmessage) |
| 「此刻可读集合」在哪里存着 | **哪里都没有**：每次现算；找不到它不是缺数据 | [S-28](#s-28-此刻模型可读是算出来的) |

**本契约不定义任何恢复动作，也不承诺任何外部效果可逆。**

## 九、已知缺口

**缺口不填默认值。**下列各项等待具名 owner 裁决；消费者读到这里应当知道**哪里在等裁决**，而不是照着一个猜测实施。

| # | 缺口 | 阻断谁 | 谁来裁 |
|---|---|---|---|
| **G-1** | **`MessageId` 与其余不透明标识的词法形式**：字符集、长度上界、生成方式 | Schema 只到 `data.identity-values/v1#S-31` 那一层；任何需要排序、分片或字面量拼接的实现 | **realization** |
| **G-2** | **会话日志与记录条目壳**：条目带哪些成员（租户、会话、Run、尝试）；一次回复与它的模型响应落成一条条目还是两条；日志的全序由谁给；**上一次模型请求落在日志哪一处**（[S-29](#s-29-合法名单的判定) ⑥ 要它）；日志不一致时由谁处置（[S-32](#s-32-会话日志里的配对与唯一)） | [S-9](#s-9-assistantmessage一次回复只有一份)、[S-20](#s-20-尝试开始)、[S-29](#s-29-合法名单的判定) ⑥、[S-32](#s-32-会话日志里的配对与唯一)、[S-33](#s-33-消息不携带租户身份) 的落点 | **主线**（loop 与会话那一程） |
| **G-5** | **卡片**：`CardId`、`CardAnswer` 的正式形状；「不回答」与自由作答怎样表示；卡片什么时候算答完；**没答完的卡片在消息里有没有占位、是哪一块** | [S-22](#s-22-系统发起的等待答复回来)、[S-30](#s-30-悬着的占位) 第 2 类、[S-29](#s-29-合法名单的判定) ⑤ 的卡片那一半 | **PF-008 的 owner**（卡片契约未起草） |
| **G-6** | **runtime context**：`RuntimeContextBlockId` 的家；每一块的值长什么样；**被感知时是否可能为 `null`**（本契约假设不会，[S-17](#s-17-说状态的带前值与现值)） | [S-17](#s-17-说状态的带前值与现值)、[S-25](#s-25-runtime-context-的变更与全量) | **PF-015 的 owner**（runtime context 契约未起草） |
| **G-7** | **`AgentRef`、`ScheduleRef` 的家**：「别的会话捎话」「定时到点」两类能力尚无 topic。`SessionRef` 的家已定在本契约（对齐波） | [S-24](#s-24-别的会话捎话与到点了) | **PF-014 的 owner**（[§9.1](../../../../product/PF-014-inbound-intake-and-queueing/design.md#91-有几类来源的能力还没开题)） |
| **G-11** | **「说状态的带前值」的两处读法**：全量那一份不带前值（本契约把 PF-009 §6.4 读成对变化通知的要求）；`extension` 那一支说状态时前值不在结构里 | [S-17](#s-17-说状态的带前值与现值)、[S-25](#s-25-runtime-context-的变更与全量)、[S-26](#s-26-拓展件追加的提醒) | **PF-009 的 owner**（确认读法）；`extension` 那一支要不要结构化的前值与现值，**主线** |

**已关闭的缺口**（整批对齐 2026-09-23 与第一轮评审修复 2026-09-24，编号不复用）：

| # | 原来缺什么 | 怎么关的 | 落在哪 |
|---|---|---|---|
| **G-3** | `ResponseId` 的家与本契约的占位定义 | 家是 `data.model-response/v4#S-6`；本契约按 S-31 散文自定义同一形状、**不 `$ref`**——那份契约 `$ref` 本契约的 `AssistantMessage`，反向会成环；这一登记口径见 [D-060 §七 M2](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加) 与 registry 的「互引成环的登记口径」 | [S-9](#s-9-assistantmessage一次回复只有一份)、[S-37](#s-37-规范表示) |
| **G-4** | `ModelCallId` 的占位定义 | `$ref` `data.call-accounts/v3#S-37` | [S-21](#s-21-中断之后必补一条)、[S-49](#s-49-模型请求运行时写的五种记录不是消息) |
| **G-8** | 尝试开始只有一个原因取值 | 三值 `first` · `resumed_after_interruption` · `resumed_after_wait`（主线裁定，见 [D-060 §一 S3-a](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#s3messages报回的)） | [S-20](#s-20-尝试开始) |
| **G-10** | 拓展件名字的名字空间 | = 类别为 `loop_extension` 的能力标识的 `name`（规格层推导：同一件东西只有一个名字，见 [S-26](#s-26-拓展件追加的提醒)） | [S-26](#s-26-拓展件追加的提醒)、[S-22](#s-22-系统发起的等待答复回来) |
| **G-12** | 收齐却解析不了的调用块形状 | `data.content-blocks/v3#S-12` 补了：`complete: true` ＋ `rawArguments` ＋ `unparseable: true` | [S-31](#s-31-收齐却解析不了的调用) |
| **G-13** | 几项裁决无处可链 | 产品负责人的 Q3、Q15 链到 D-058；主线裁定链到 [D-060 §一](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#一2026-09-23-夜自驱期间的自决账本-二原文) 的 S3、S13、S16、S21 各节；D-060 里没有原文的几项改写成规格层推导、各写理由（2026-09-24 第一轮评审修复） | [设计依据](#设计依据) |
| **G-9** | `SystemMessage` 在会话日志里怎样出现 | [PF-009 rev 8](../../../../product/PF-009-context-message-types/design.md#消息)：**不落日志，每次组装现算**；PF-010 rev 6：本版只含文本（2026-09-24 第一轮评审修复） | [S-7](#s-7-systemmessage)、[S-6](#s-6-每种消息能装哪几类块)、[S-29](#s-29-合法名单的判定) ④（删去）、[S-32](#s-32-会话日志里的配对与唯一) ⑦ |

## 十、明确不承诺

**以下都不在本契约内，消费者不得从本契约推出它们：**

- **块**：七类块、两个标注、收场与占位原因——归 `data.content-blocks` v3；本契约只定消息能装哪几类块（[S-6](#s-6-每种消息能装哪几类块)）。
- **到达**：块怎样开、填、封口，追加与整体替换，节流与砍——归 `data.arrival-events` 与 `capability.stream-assembly`。**帧流与回复流的结局怎样对到 `ending` 不在此列**：那两张对应表归本契约（[S-14](#s-14-toolinternalmessage-怎么收的尾)、[S-10](#s-10-assistantmessage-怎么收的尾)）。
- **会话日志与条目壳**：日志的存储、全序、条目带什么、追加的权限与失败——归 loop 与会话那一程（[G-2](#九已知缺口)）。
- **压缩的操作**：什么时候压、压哪一段、摘要怎么写、名单怎么选、压缩之后补哪几份全量——归 PF-010；本契约只定名单的形状、合法性与它的效果。
- **组装**：取哪一份表示、窗口怎么截、**名单拆开了一对调用与结果之后怎样保持成对**——归 PF-010 与传输适配。
- **各家的落点表**：提醒与压缩记录在每一家落成哪一种、标识长什么样——归传输适配；本契约只定三条义务（[第四节](#四出门的三条义务)）。
- **一次执行被中断或异常中断之后，真实结果仍然回来了**怎么办——那时它已经没有合法的落点（[S-12](#s-12-真实结果落哪种消息只看有没有占位)）；怎样处置归工具运行时。
- **提醒什么时候产生**：外面的事什么时候落进日志、中断提醒由谁在何时补、尝试开始由谁写——归 PF-012 与各运行时。
- **租户、会话、运行、作者的归属**——在承载消息的条目上（[S-33](#s-33-消息不携带租户身份)）。
- **正文怎么写**：提醒写给 agent 的话、摘要的内容、干预话的措辞——由写它的一方写。
- **体积上限**：一条消息的块数、名单的长度本版不设；若将来要设，它是一个具名的政策参数，由消费者的契约定。
- **不承诺任何已执行的验证。**证据义务与状态在[验证入口](../verification.md)；Schema、实例与模型文件存在不表示已被校验过。

## 十一、版本差异与规范工件

**本版由已接受并冻结的 MS6 演进为 MS7 候选**。S-49 的 `profileSnapshot` 采用 `data.model-profile/v5#S-27`，完整保留项目输入 cap 与所有适用上游事实；档案共用定义与 Schema 引用精确升到 v5，正式名仍由 MP5 拥有。S-1～S-50 编号、七种消息、工具与未解析调用的原文、表示层十四值、S-50 收场以及历史语义均保持。

旧不兼容已出门记录不是本版值，不补 cap、不把缺键转为 unknown/unbounded、不查当前目录重建快照；按 S-39 的既有表示层拒绝 `malformed`，不提供旧版本读/结算入口。本版当前代际记录、锚点和固定快照仍原样保留，运行时继续承担当前在途任务与未知结果的恢复及结算责任。

本契约仍没有操作，因此操作九项不适用；没有新状态机或并发性质。`Readable.als` 保留 v4 原字节，只覆盖既有可读性结构；新增留存性质由 MP5 Schema、写入者完整复制、持久往返及恢复场景承担，形式触发决定见 [formal](formal/README.md)。

**本版的规范工件**：本文件、[`messages.schema.json`](messages.schema.json)、[`examples.md`](examples.md)、
[`input-limit-examples.json`](input-limit-examples.json)、[`formal/Readable.als`](formal/Readable.als) 与它的入口 [`formal/README.md`](formal/README.md)。

**发布后**：本目录下的规范正文、Schema、实例与模型不可原地覆盖；修改发布新版本。
[已知缺口](#九已知缺口)任一项在**冻结之后**被裁决，凡改变本契约语义或表示的（G-5 换上卡片的正式形状、G-6 定下 runtime context 的值、G-11 给 `extension` 加结构），都发布下一版本；
**冻结之前**在本候选里原地改，每次改在[验证入口「变化的影响」](../verification.md#变化的影响)记一笔。**推荐版本不自动升级消费者**。接受状态、冻结记录与执行结果都在本版本目录之外维护。

## 报给主线

- 本版无新增产品政策、术语或失败值；MP5 的限制属性沿其正式定义引用。
- 运行时、响应及当前格式读写方的精确采用和完整往返证据由主线协调；本包不登记为接受。
- 既有 G-1/G-2/G-5/G-6/G-7/G-11 保留原 owner，不因快照增量宣称闭合。


## 十二、创建与完整结果的技术记录

### S-51 CallKey 与 CreationKey

本版candidate依据PF-013 rev16、PF-012 rev21、PF-015 rev20。CallKey（无独立词条）是既有一次模型调用身份的值投影：session取S-24 SessionRef、callId取CA3 S-37 ModelCallId，二者必填、成员闭合，不含权限/进程地址/方法。CreationKey（无独立词条）是不透明显式操作关联，形状沿IV1 S-31，作用域为创建tenant+Session；同键认回原CallKey，业务是否相等和冲突由调用能力裁决。不能用CreationKey替代读取键，不能用CallKey替代创建请求判重。

### S-52 ModelCallPayloadRef

本owner唯一拥有的技术表示（无独立词条），必含kind、locator、version、digest；kind闭合为created或reply_ready。locator/version是不透明值，digest是小写64位十六进制SHA-256，覆盖实际存储的**原不可变UTF-8 JSON字节**，不对重新编码/数值舍入后的文本计算；没有额外canonicalization默认规则。locator+version一经发布不得重新绑定内容，digest同时核字节；换locator/version不构成修改原事实的许可。

它不是普通AttachmentRef，不从普通附件存在推出不可变/可取得/存续保证。解析遵守S-37严格JSON、重复键拒绝、十进制数字无损。kind=created取本版S-53；kind=reply_ready取MR10 S-39/S-46 PendingModelResponse（唯一owner，不在本Schema复制或反向$ref，以免MR→MS已引用AssistantMessage的环）。该引用不能存进Message/AssistantMessage当内容。

形状合法不证明摘要、版本、权限、内容存在或保留期。发布/读取边界核原字节摘要、kind、payload形状、CallKey及原壳归属相等；坏表示/错摘要/错关联按malformed，实际来源不可读取由能力unavailable，不补空内容。内容存续覆盖所有有效marker及其引用内容，发布与回收的责任归写方，不以本数据Schema假定跨store事务。

### S-53 ModelCallCreatedPayload

kind=created表示创建输入角色，不声明通过准入。status闭合accepted/rejected，两支都有ref、creationKey、origin与input：origin带tenant/session、run/attempt同在同缺；input保存原显式target、覆盖参数（若有）、messages、tools名称、原basis、targetChangedBy（若有）及非值输入的精确sourceVersions。sourceVersions只存原report/context/装配输入的不可变可取得版本依据，不存凭据或运行对象，不允许仅可变路径/档案名。若输入来源不是JSON值须有可精确还原的表示；不能表达/取回时拒绝发布，不填初值。

accepted还必带adopted：实际profile/profileSnapshot（MP6 S-27）、adaptation（MP6 S-29）、合并参数、selectedBy、实际messages、解析后的ModelToolEntry工具声明、contextSources。快照与绑定相等，目标与basis/selectedBy及原采用依据相符；输入/提示词/工具/context必须完整可还原，不能保存一串无法证明指向固定内容的名字。动态凭据只现取，不入payload或输入比较。字段相等与来源真实性是接收边界义务，Schema不证明。

rejected只带原输入/原归属及四个既有出门前cause之一，禁止adopted；不伪造缺失profile/adaptation。格式错误或无当前资格等未具合法创建前提的失败不产生该payload、callId或记录。原身份与数值不因重试创建或恢复改变。

### S-54 新 marker 与拒绝创建的关联

ModelInvocationRecord在原五种上增加两种，仍不属于七种Message，均不进模型上下文或当对话呈现：

| 记录 | 闭合字段与关系 | 稳定读取/判重 |
|---|---|---|
| model_call_created | call、creationKey、payload(kind=created且取回status=accepted)、createdAt；原来源在SL3条目壳，须与payload.origin/ref相等 | CallKey读取；创建tenant+Session+creationKey判重，另核CallKey唯一 |
| model_call_reply_ready | call、dispatch、response、payload(kind=reply_ready)、readyAt；response为原dispatch铸下的ResponseId，取回Pending.id/call/dispatch与原壳相等 | CallKey读取；记录种类域+ResponseId判重，与final键不同但同一账身份 |

ModelCallEndedRecord 的 undispatched 保持零发送本义，分两种互斥来源：初次 openCall 检查即拒绝时，creationKey 与 payload 必须成对存在，payload.kind=created 且取回 status=rejected，cause 与 payload.cause 相等；同一原批建立 creationKey→CallKey 与 handed_up，不得另有 accepted created。已经发布 accepted created、首次 dispatch 因当前凭据/规划门拒绝时，两个成员均缺席，沿原 callId 终结，保留原 accepted 创建身份与采用事实，不新造 rejected 输入。Schema 强制两成员同在同缺，是否属于对应来源、先前 accepted created 及零已出门由跨记录校验强制。released/interrupted 禁止两成员。两个新marker和拒绝创建都先确认引用内容可取得再提交；记录时刻是各自事实的时刻，不借它冒充网络sentAt。

原Session/tenant/run/attempt由壳保留，不能换为查询者位置。来源、保留责任、原批与回执未知由RT11承担；MS不引入新的操作/权限。纯值校验输入显式定义，成功合法、失败沿S-39原十四值/既有优先级：新kind未知为malformed、缺字段/错payload kind为malformed；不新增模型调用成因。校验无副作用，缺身份拒绝、不读环境补齐。

### S-55 保证、对齐与缺口

| 保证 | 单机兑现者 | 跨进程责任 | 做不到会怎样 |
|---|---|---|---|
| 原字节/不可变版本/摘要与数无损 | 模型内容存储及读写边界 | 同字节域、严格JSON、版本保留协议 | 拒绝坏内容或unavailable，不能静默补值 |
| marker与原payload/归属一致 | 日志写方与接收方 | 绑定原壳和kind，逐边重验 | malformed，不发布或消费 |
| 引用存续与回收互斥 | 同内容保留记录的发布/回收方 | 可核保留责任与发布关闭证明 | 保留未明责任，不先删后修 |

原dispatched的MP5快照形状不变，新created采用当前RT的MP6；两者结构相同但保留各自精确语义来源，不暗改旧发出记录。MR10继续唯一拥有Pending、ResponseId、SelectedBy/CredentialScope/ParameterAdjustment；本Schema原防循环逐字形状保持，对齐义务在verification。CA3只升级费用选择语义，标识形状不变。

G-14（模型内容存储/日志/运行时owner）：真实内容保留/取回、marker原批判重、拒绝创建同键认回与跨记录校验未开始；Schema通过不关闭它。报给主线：技术表示无独立词条，accepted/rejected及creationConflict由主线技术裁定，未选择新产品政策；本版未接受。
