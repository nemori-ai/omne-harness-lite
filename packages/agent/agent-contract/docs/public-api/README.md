# Agent 公开入口与定义

根入口 `@omne-harness/agent-contract` 导出全部契约类型、五个常量（`ATTRIBUTE_ITEMS`、`POSITIONS`、`POWERS`、`POSITION_OUTPUTS`、`AGENT_IDENTITY_MAX_LENGTH`）、三个判定函数（`judgeAgentDefinition`、`judgeLoopExtensions`、`judgeExtensionOutput`）、资产正文端口 `agentBodyContract`、十四个品牌身份的解码函数和四个结构判定。包根不导出推进、纯求值、托管协调、Journal 或实例的实现。这些接口在包里只有类型，由[后继的通用实现与提供者](../../../agent/README.md)实现。

公开类型的唯一定义在 [src/index.ts](../../src/index.ts) 及其导出模块。本页是源码导航，不保留手写类型声明。这些类型的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。类型存在不表示任何提供者或运行实现已经兑现它们。

行为、调用资格、参数与依赖分类归 [SPEC 的运行契约章节](../../SPEC.md#主干运行契约)。消费路径见 [context](../context.md)，对象关系见 [object-model](../object-model.md)。

## 身份、原位置与纯求值

[行为与约束](../../SPEC.md#身份原位置与纯求值)。

源码中以 `M.*` 引用的名称（ModelCallId、ModelOperationId、AssembledModelInput、FixedModelRequest、ResultCapacity、ResultPage、ModelRuntime、ProfileResolution、Parameter、Supplier、Termination、ModelFault、DispatchRecord、RetryResolution）来自 [Model 契约](../../../../model/model-contract/docs/public-api.md)，由 `@omne-harness/model-contract` 的根入口导出。`T.*` 引用的名称由 `@omne-harness/tool-contract` 的根入口导出。消息中的工具部件使用 `@omne-harness/message` 导出的 `ToolPart`。`Action.original` 把 `ToolPart` 收窄到 `kind: 'tool_call'`：动作只来自工具调用部件，不来自工具结果部件。

- [identity.ts](../../src/identity.ts)：十四个品牌身份（`AgentInstanceId`、`StepId`、`ActionId`、`PassageId`、`CardRoundId`、`ActionBatchId`、`AgentExecutionId`、`ExecutionAttachmentId`、`AgentRegistrationId`、`AgentOperationId`、`ExecutionRevision`、`InputId`、`InputBatchId`、`ConsumptionId`）、`Adoption`、`Evidence`、`Access`、`ConsumerRef`、`Authority`、`Continuation` 与 `AgentInstant`，常量 `AGENT_IDENTITY_MAX_LENGTH`，十四个 `decode*` 解码函数，结构判定 `judgeAdoption`、`judgeEvidence`、`judgeAccess` 与 `judgeAuthority`，以及它们的失败类型 `IdentityFailure` 与 `StructureFailure`。规则见 [SPEC 的身份解码与结构判定](../../SPEC.md#身份解码与结构判定)，这些规则是本交付自行设计的选择，待在 PR 中接受。
- [evaluation.ts](../../src/evaluation.ts)：纯求值的值与端口。有 `ProducedResult`、`InputBatch`、`ProgressionDirective`、`Waiting`、`AgentConclusion`、`FailureCandidate`、`PreparedContextTransition`、`Failure` 与 `Reply`，原调用的 `ModelPurpose`、`PendingCall`、`ActionJudgment`、`Action`、`ActionBarrier`、`ActionSlot`、`ActionBatch`，回复准入的 `ModelReplyAdmission`、`ReplyAdmissionProjection`、`ReplyAdmissionPage`，守卫的 `GuardLevel` 与 `GuardFact`，`AgentCheckpoint`、`RuntimeConditions`、`ProducerDecisionView`、`AdvancementFact`、`LoopFacts`、`Next` 与 `AgentEvaluator`。
- [execution.ts](../../src/execution.ts)：`LoopFacts` 引用的执行记录类型 `ExecutionControl`、`ControlStage`、`ControlStageFact`、`ControlRecord` 与 `ResultResponsibility`，与“托管协调与运行实例”一节的类型同在这个文件。

ProgressionDirective 是 Loop 下一步所需的具体推进要求，不是权限或协作模式的复制。CurrentConditions 的受信适配器把合法协作设置投影为该值并保存依据，Agent 不解释 never/auto_permission/bypass-permissions。RuntimeConditions 只是这项投影及其采用依据，不含守卫阶梯：守卫由 Agent 自持的守卫事实承载，见下文 `AgentCheckpoint.guard`。evaluate-completion 仅允许核完成条件，不等于批准完成；continue 不产生任意新效果许可。环境采用由相应请求/动作固定协议携带，Agent 不维护环境选择或权限策略状态机。

效果协调层读取 Model/Tool 公开状态，核原 call/version/消费关联后生成 ProducerDecisionView。model-active 包括原调用内部仍在重试；只有原 Model 确认整调用真实收场才为 model-settled。tool-background 必须有真实转换确认和耐久占位。tool-result 可含 Tool 原契约的失联或晚到版本，不一概解释为物理停止。supportedControls 是公开能力快照，实际控制仍需当前核权。

查询失败返回 Failure，确定不了原状态保留 unresolved，二者均不能投影为空或已结束。ResultResponsibility 决定哪些结果已保管、已处理或待释放；result-ready 类事实不自动授权解除交付责任。Evaluator 只读这些有判别事实，不拿 ExecutionSnapshot 全记录、运行句柄、推进围栏或外域 JSON 状态做决策。Checkpoint 的版本化私有状态和透明流材料可以保存 schema/JSON；解码由原拥有者完成。

`initial` 返回新逻辑执行的初始 checkpoint：`position` 是执行开始之后位置的节点 E3，`passages` 为空，`guard` 为 null。Loop 读到这个 `position` 且该位置尚无扩展调用时经过该位置，所以首次经过被崩溃打断后由恢复者接续同一次经过，不算第二次经过，见 Loop 算法页的[恢复入口与回归点](../../../agent/docs/architecture/loop-algorithm.md#恢复入口与回归点)。

AdvancementFact 是执行挂接状态、执行状态和控制记录的只读投影，不是独立状态。它与这三者的对应关系见[对象模型](../object-model.md#状态与转移)。

AgentCheckpoint 的 `compaction` 记录 `step` 所标识的那一次请求准备进入的压缩计划及其进度，新 step 开始时清空。`adoptedContext` 记录最近一次最终请求采用的 Runtime Context 覆盖，新 execution 开始时为空。`encode` 与 `decode` 覆盖这两个字段：`compaction` 的进度、`stepRequest`、`initiated` 与 `ended` 逐项编码，`adoptedContext` 按 Evidence 编码，解码时核对它们属于 checkpoint 的 `step` 与本 execution，不属于时返回 invalid。行为见 SPEC 的“[请求准备与压缩](../../SPEC.md#请求准备与压缩)”和“[Runtime Context 的消费](../../SPEC.md#runtime-context-的消费)”。`RuntimeConditions.model` 是设置侧当前选择的采用依据，不是实际收件模型。

`AgentCheckpoint.guard` 是 Agent 自持的守卫事实，即循环守卫阶梯的最新判断。`initial` 返回的 checkpoint 中它为 null，表示尚无判断，L0 的观测始终保留。它只由调模型之后位置上的循环判断这一受信系统扩展计算：该扩展经执行历史读取能力读本执行已可靠保存的原始工作事实（模型调用与回复、回复准入结论、动作批与结果、它自己以往卡片轮次的结果、费用、step），不读压缩后的视图，再经守卫判断记录能力把判断记入其 Passage 的 `guard` 操作，效果采纳时 Agent 把它写入本字段。`GuardFact` 的 `level` 是 L0 至 L3 的阶梯级别，L4 不记为守卫事实，它是该扩展的 `ask` 输出，`policy` 是该扩展检测算法与阈值的精确采用，`through` 是判断读到的事实范围，`basis` 是判断依据的记录，`passage` 是形成判断的扩展调用，`at` 是判断时刻。本字段随 checkpoint 持久：压缩、崩溃、换执行挂接与 runtime 换代都不清零，新 step 不清零，runtime 顺序复用不沿用上一执行的值。循环判断不可用时本字段保持上一次的值，Agent 不伪造判断。`encode` 与 `decode` 逐项编码本字段，解码时核对 `passage` 属于本 execution。I8 读本字段决定 L3 的失败候选，L4 的人工等待是该扩展调用的卡片等待，L1、L2 的干预消息由该扩展以 `inject` 给出。承载形状只对受信系统扩展开放，作者协议的输出与位置输出表不变，见扩展作者协议的[输入](extensions.md#输入)。行为见 SPEC 的“[循环守卫](../../SPEC.md#循环守卫)”。

Next 的种类对应 [Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md)的节点：`reconcile` 为 E2 与 R0，`take-inputs` 为 I0，`prepare-request` 为 I1 与 P1，`compact-derive` 为 C1 的 derive 调用，`admit-model` 为 M0 与 M6（主请求与压缩步骤），`commit-transition` 为 C3，`resume-request` 为 C4 之后的 I1，`extension` 为 X0 至 X5，`admit-message` 为 Q1、Q2、Q4、Q5，`admit-tools` 为 A2，`consume` 为 T1 与 M3，`wait` 为 W0，`try-finish` 为 F1 至 F3。`stop` 按原因对应节点：cancelled 为 F0，terminal 为 F4，superseded 为被取代时的 E9，suspended 为有效暂停或实例停用时的 E9。

`FailureCandidate` 是失败候选附带的内容。`AgentConclusion` 的 `fail` 分支只带 `cause` 依据，依据指向的记录就是这个值，随 F1 节点的提交写入 `FinishIntent.failure`。判别字段是 `kind`，各变体如下。

- `cannot-fit` 带原因与 Context 的原结果。`context` 原样承载 Context 交出的结果：`Preparation`、`CompactionAdvance`，或否决前的 needs-compaction。Agent 不伪造 `Preparation`。压缩之前位置或压缩用途的调模型之前位置否决时带 `veto`。压缩转换消息被消息准入拒收时带 `rejection`，即拒收依据。已进入计划时带 `plan`。
- `compaction-invalid` 带计划身份。derive 返回的进度与计划不符时带 `progress`，即期望值与返回值。压缩转换的共同提交判定转换非法时带 `transition`，即判定依据。
- `request-rejected` 带 Model 请求准备的确定拒绝：`failure` 是 `prepare` 或 `resume` 返回的 invalid（field 为 request），`model` 是 Model 的原结果，`selection` 是选择依据。
- `no-reply` 带没有有效回复的原调用。
- `message-rejected` 的 `from` 为被拒收消息的来源，`evidence` 为拒收依据。它只用于工具结果或被拒绝动作的拒绝消息被拒收，并由 H0 提出失败候选的情形。压缩转换消息被拒收归 `cannot-fit`。
- `extension-stop` 带输出 `stop` 且 `terminal` 为 `failed` 的扩展调用。
- `guard` 带守卫 L3 的依据。`basis` 等于形成该候选时 `AgentCheckpoint.guard` 的 `basis`，候选由 I8 按该守卫事实提出。

`source` 是该记录自身的依据。失败候选只保留原因、历史、设置与已有结果，规则见 SPEC 的“[无法装下](../../SPEC.md#无法装下)”第 5 条。

ModelReplyAdmission 是完整主模型回复在消息准入的最终事实，随原 execution 保存。原 call/resultVersion 唯一确定一项事实，step/action 与 source 必须匹配原主调用与最终准入结论。source 是消息准入提供者对该回复返回的接纳回执或拒收依据，见下文 `MessageHandoff`。消息准入不经过扩展，所以这项事实不记录扩展调用。相同事实重复提交不重复计数，异结论或异归属冲突。Journal.commit 同提交该事实、接续及输出，不能由普通事件观察单独增加次数。

ActionBatch 的 `barrier` 是整批判断屏障的状态。closed 的 `judging` 列出链正在运行、尚未到达最终结论的动作，`asked` 列出正在等人的卡片轮次及其动作。一个动作同一时刻只出现在两者之一：链进入已询问时从 `judging` 移入 `asked`，以 `replay` 继续时移回 `judging`；该轮 present 确定失败时从 `asked` 移出，该动作的判断为 denied。open 带屏障依据与按原顺序列出的获准动作。all-denied 表示本批动作在判断阶段全部被拒绝。`slots` 按原动作顺序排列，每个槽位记录该动作的结果承接进度：denied、dispatched、result 或 background。屏障打开或记为 all-denied 时，判断为 denied 的动作建立 denied 槽位。获准动作交 Tool 之后，按 Tool 是否受理建立 dispatched 或 denied 槽位。所以全拒时每个动作也有槽位，单结果经过与消息准入的进度随 checkpoint 保存。`each` 是该槽位单结果经过中的扩展调用，后台槽位不经过单结果范围，`each` 为 null。`candidate` 是交消息准入的候选消息：结果槽位是工具结果消息，拒绝槽位是拒绝消息，后台槽位由占位形成。`handoff` 是消息准入的回执。`batchPass` 是整批经过中的扩展调用，尚未经过时为 null。后台最终结果到达时，原槽位保持 background，结果以原 PendingCall 的 consumption 到达并由 Loop 以 consume 消费。行为见 SPEC 的“[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)”与“[工具执行与结果承接](../../SPEC.md#工具执行与结果承接)”。

ReplyAdmissionProjection 由权威事实按提交顺序派生，through 固定执行事实范围，rule 固定计数规则。rejected 增加连续及累计否决数，admitted 将连续数归零，累计数保留。计数为非负十进制整数编码。内部重试、模型失败、压缩、扩展调用、新输入和执行挂接更换不产生主回复准入事实。初始零值须以该执行无既有准入事实为依据；恢复时不得从零起算而丢掉历史。admitted 按上述规则使连续数归零，不改变累计数。循环守卫的阶梯由循环判断这一受信系统扩展按其策略从原始事实计算，不直接等同于该计数。

readReplyAdmissions 按原 through 返回有序事实页，after/next 只在同执行、同范围有效。complete 表示读完该固定范围；gap 不等于空历史。load 的投影必须覆盖其原子快照的事实范围，未补齐投影时返回 unavailable，不能交给 Evaluator 一份过期但看似完整的输入。详细恢复与保留规则归[机制](../../../agent/docs/architecture/mechanisms.md#事实投影与长期读取)。

## 请求、扩展和材料接缝

[行为与约束](../../SPEC.md#请求扩展和材料接缝)。

### 请求准备、模型选择与压缩

[行为与约束](../../SPEC.md#请求中的职责划分)。

本节引用 `@omne-harness/model-contract` 导出的 `M.ProfileResolution` 与 `M.Parameter`、`M.AssembledModelInput`、`M.FixedModelRequest` 和 `M.ResultCapacity`。`ModelPurpose`、`ModelRecipient`、`SelectedModel`、`ModelContextRead`、`CompactionProgress`、`CompactionAdvance`、`CompactionState` 与 `FinalRequest` 由本包定义为 Agent 自有的端口形状。它们不是 Model 或 Context 的导出。Context 一侧对应接缝的方向已接受，Context 契约的文字尚未写出，见算法页的接口增量与开放问题。

- [request.ts](../../src/request.ts)：`ModelRecipient`、`SelectedModel` 与端口 `ModelSelection`，`ContextContent`、`ModelContextRead` 与端口 `ModelContextReader`，`CompactionProgress`、`Preparation`、`CompactionAdvance`、`CompactionState`、`FinalRequest` 与端口 `RequestPreparation`，以及端口 `CurrentConditions`。`ModelPurpose` 在 [evaluation.ts](../../src/evaluation.ts)。

`SelectedModel.recipient` 是请求实际面向的模型，由路由名和档案的精确采用组成。`resolution` 只能是可选的胜出档案。`history` 与同一次准备交给 prepare 的历史依据相同。行为见 SPEC 的“[模型选择](../../SPEC.md#模型选择)”。

`position` 在 `PendingCall`、`ModelSelection.select`、`ModelContextReader.read`、`RequestPreparation.prepare` 与 `Preparation` 中是同一个值：这次调用或准备服务的原消费位置，带拥有者、工作、位置与用途四个子字段。它是 Agent 交给 Model 与 Tool 的 `consumer`，Agent 一侧按它的角色命名。`AgentMaterials.preserve` 的 `consumer` 是材料的消费方，不是消费位置，所以保留原名。

`ModelContextReader` 在装配时绑定到模型这一个消费者，没有选择其他消费者的参数。`position` 是这次读取服务的消费位置，不是读取的受众。`adopted` 取自 checkpoint 的 `adoptedContext`，`transition` 只在压缩提交之后的读取中给出。`ModelContextRead.content` 由 Context 决定，`coverage` 在最终请求记录时保存到 `adoptedContext`。行为见“[Runtime Context 的消费](../../SPEC.md#runtime-context-的消费)”。

`beforeModelCall` 为 null 表示调模型之前位置尚未经过，结果的装得下种类是 `assembled`。它是数组时表示该位置已经经过，数组列出该位置这一次经过中的扩展调用，没有适用扩展时为空数组，结果的装得下种类是 `ready`。`purpose` 为 `extension` 时总是传空数组：扩展用途的请求不经过该位置，装得下的结果直接是 `ready`。这类请求返回 `needs-compaction` 时不进入压缩计划，规则见[扩展作者协议](extensions.md#压缩用途与扩展用途的模型调用)。

`needs-compaction` 的 `original` 绑定触发压缩的那次 prepare 的完整输入：`input` 是全部输入的依据，`alterations` 与 `beforeModelCall` 原样记录。`resume` 从 `original` 与压缩转换依据重算，不另接收 `beforeModelCall`。它返回的装得下种类由 `original.beforeModelCall` 决定：null 得 `assembled`，数组得 `ready`。

`CompactionProgress` 的三项都由 Context 的计划给出，`bound` 与 `completed` 是非负十进制整数编码。压缩的每一步是 `purpose` 为 `compaction` 的 ready 准备，在 `CompactionAdvance.continue` 中是 `stepRequest`。`CompactionState` 保存在 checkpoint 的 `compaction`，它属于 checkpoint 的 `step` 所标识的那一次请求准备，新 step 开始时清空。`CompactionState.initiated` 是 Agent 自持的已发起步数，非负十进制整数编码，每发起一步加一并随 checkpoint 提交，崩溃后用它认回同一步。`stepRequest` 是尚未发起或在途的下一步请求。行为见“[请求准备与压缩](../../SPEC.md#请求准备与压缩)”和“[无法装下](../../SPEC.md#无法装下)”。

`FinalRequest` 是 Agent 对这次请求的采用记录，不是 Context 或 Model 的返回值。其中的 `request` 是 Model 请求准备返回的固定请求。行为见“[调模型之前的复核与最终请求](../../SPEC.md#调模型之前的复核与最终请求)”。逐操作的要素见“[请求接缝的逐操作要素](../../SPEC.md#请求接缝的逐操作要素)”。

PreparedContextTransition 是 Agent 消费 Request Context 的窄视图。commitment 由 Context 拥有者建立，不是调用方自证的字符串。行为见“[请求准备与压缩](../../SPEC.md#请求准备与压缩)”。

### 扩展、人工卡片与材料

[行为与约束](../../SPEC.md#扩展卡片与材料)。

扩展作者接口的类型由[扩展作者协议](extensions.md)规定，源码在 [extensions.ts](../../src/extensions.ts)，本页不重复。各类型的规则位置如下：

| 类型 | 声明位置 |
| --- | --- |
| `Position`、`Dimension`、`Power`、`ErrorPolicy`、`UnavailabilityPolicy`、`ExtensionImplementationDeclaration`、`LoopExtensionDeclaration` | [声明](extensions.md#声明) |
| `ExtensionInput` | [输入](extensions.md#输入) |
| `ExtensionOutput`、`DecisionCardDraft`、`CardOption` | [输出](extensions.md#输出) |
| `ActionIdentity`、`Conclusion` | [Conclusion](extensions.md#conclusion) |
| `ExtensionInvocationMode`、`ExtensionReplayBinding`、`ExtensionInvocationResult`、`LoopExtensionImplementation` | [调用协议](extensions.md#调用协议) |

位置集合是九处，`Power` 是 `observe`、`rewrite`、`veto` 三档。源码的声明含 `needs`、`implementation`、`onError` 与 `unavailability`，声明判断不按位置限制 `power`，实际输出权限由声明上限与位置输出表共同裁定，见[扩展作者协议](extensions.md#声明)。`Passage.declaration`、`ExtensionInput.position`、`DecisionCardDraft.about` 与 `ActionIdentity` 使用同一份九处位置。

- [extensions.ts](../../src/extensions.ts)：上表的作者接口类型，常量 `POSITIONS` 与 `POWERS`。
- [passages.ts](../../src/passages.ts)：扩展调用台账与人工卡片，有 `CapturedRead`、`CardRequest`、`CardAnswer`、`CardReply`、`PassageCard`、`PassageOperationProgress`、`CardRoundProgress`、`CardRound`、`PassageOperation`、`PassageProgress` 与 `Passage`。还有按位置的 `Subject`，端口 `ExtensionImplementations`、`DecisionCards`、`ActionAdmission`、`MessageHandoff`、`AgentMaterials` 与 `RegisteredReads`，以及 `AdmissionDecision`、`MessageSource`、`HandoffResult` 与 `Material`。
- [judge-output.ts](../../src/judge-output.ts)：按位置输出表判断作者返回值的 `judgeExtensionOutput`，位置输出表的机读形式 `POSITION_OUTPUTS`，以及类型 `ExtensionOutputJudgeInput`、`PositionOutputKey` 与 `PositionOutputs`。规则见[位置输出表](extensions.md#位置输出表)与 [SPEC 的声明判断](../../SPEC.md#声明判断)。

Passage 是一次扩展调用的台账，不是一次经过的台账。一次经过是 Loop 到达一个位置的一次，同一次经过里每个扩展各有一个 Passage。两个词的定义见[扩展作者协议](extensions.md)页首。

- `purpose` 区分调模型前后两个位置上的主请求与压缩步骤：这两个位置取 `main` 或 `compaction`，其他位置为 null。审计与恢复按它区分用途，不必打开输入依据。
- `input` 是作者收到的原输入的依据，`effective` 是前序扩展改写后的有效 `subject` 的依据。
- `operations` 按 ordinal 排序，只记录扩展经注入能力产生的 producer、read 与 guard 操作。每项操作的 `action` 在整个 execution 内唯一。
- 卡片不是能力操作。卡片只由 `ask` 输出产生，每轮卡片是一个 `CardRound`，保存在 `progress` 中。`round` 是该轮的稳定身份，`ask` 是产生该轮的非最终 Conclusion。
- `progress` 记录扩展调用的四个状态：requested、asked、resolved、applied。`CardRoundProgress` 记录一轮卡片的四个状态：requested、presented、answered、processed；present 确定失败时该轮为 present-failed，所属扩展调用以拒绝 Conclusion 进入 resolved，屏障把这一轮计为已处理。`DecisionCardDraft.proposedRewrite.option` 指向 `options` 中的一项，人选中该项时改写生效，规则见 SPEC 整批节。

状态的含义与迁移见[扩展调用的台账](extensions.md#扩展调用的台账)。作者看到的输入、输出、Conclusion、调用模式与结果的含义，以及位置输出表，见[扩展作者协议](extensions.md)。

Agent 对扩展调用的行为保证只写在 SPEC 的“[扩展、卡片与材料](../../SPEC.md#扩展卡片与材料)”：已有最终 Conclusion 的扩展调用不再调用，结果未知时以 `replay` 调用原精确采用，卡片的答复以 `replay` 交原扩展处理。

RegisteredReads 只承接已登记只读协议。read 在返回 captured 前耐久保管实际 schema/value/source；lookup 按原 action/passage/original 认回同一内容，并核当前读取资格。未知不能重新读取当前值冒充原值。excluded 必须排除原捕获及迟到写入；仅当原读取协议仍能按固定输入取得原值时才可重试，无法重建原输入则明确 unavailable，保留该扩展调用。read 所需资格不等于旧执行挂接的推进资格，取得事实也不授权后继效果。

CardRound 保存整轮有序请求。present/lookup 必须携原 round 和完整请求身份集合；同 round 异集合冲突，部分已创建时保持 unknown。返回卡片与请求逐项对应。answered 不等于 processed，processed 以原扩展的 `replay` 调用得到最终 Conclusion 为准，行为见 SPEC 同节。

DecisionCards 是 Agent 定义的卡片端口，由人在回路领域的适配器实现。人在回路领域的公开契约尚未定义，这个端口写的是 Agent 所需的保证。`read` 返回一张卡片的唯一有效答复，四类结果是：chosen（明确选择一个选项）、declined（明确拒答）、pending（尚无答复）、invalidated（卡片已作废）。declined 与 pending 都不是批准，也不等于人不同意。卡片来自作者扩展时，由原扩展决定后果；卡片来自官方准入时，由授权领域按 AU-05 判定。人有话说但没有给出准驳时，`read` 对 Agent 返回 pending，原话归人在回路领域。`CardAnswer` 是 chosen 与 declined 两类，回放绑定的 `response.answer` 与 `ActionAdmission.admit` 的 `decision.answer` 只携带它。`invalidate` 只作废尚无答复的卡片，已有答复的卡片在返回值中保留原答复。幂等身份是 passage 加 round 加完整请求身份集合，`invalidate` 另带操作身份。逐操作的要素见 SPEC 的“[卡片与准入端口的逐操作要素](../../SPEC.md#卡片与准入端口的逐操作要素)”。

ActionAdmission 是 Agent 定义的动作准入端口，由授权领域的适配器实现，对应授权的 [AU-04](../../../../identity/authorization/SPEC.md#au-04-当前准入与结果) 与 [AU-05](../../../../identity/authorization/SPEC.md#au-05-人工决定参数改写与重新核验)。输入是原动作、生效参数、工具定义的精确采用引用、Runtime Context 私有块中的权限输入，以及人对本动作卡片的答复（没有时为 null）。四类结果与 AU-04 的四类对应：allow 带准入证据，deny 带原因与依据，need-decision 带卡片草稿，unavailable 不放行。allow 的 `evidence` 是 ActionJudgment allowed 分支的 `evidence`，Tool 在发起前按它与当前权限再核。该端口由执行动作之前这条链末尾的受信系统扩展消费，作者不直接调用它。行为见 SPEC 的“[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)”。

MessageHandoff 是 Agent 定义的消息准入端口，由外部协调者或独立调用方的提供者实现。`accept` 按来源校验候选消息，返回接纳回执或拒收结果。来源有六种。外部输入的拒收后果由产品规定。模型完整回复、工具结果、被拒绝的动作、系统提醒与压缩转换消息只因校验失败或保存失败被拒收，提供者不在本端口做业务否决，拒收后果归 Agent 自己。`action-denied` 是判断阶段或 Tool 受理时被拒绝的动作，它没有 Tool 调用，也没有结果，`evidence` 是拒绝依据。外部输入由 Agent 在 invoke 或 submit 的受理之内调用，`advance` 为 null。其他来源带当前执行挂接。提供者在接纳之前完成必要的模态转换。accepted 的 `admission` 就是 CallerCommit message 分支与 ModelReplyAdmission 的 source 所用的依据。rejected 的 `reason` 受与 Failure 诊断相同的内容限制。幂等身份是操作身份加来源身份。行为见 SPEC 的“[消息准入](../../SPEC.md#消息准入)”。

ExtensionImplementations.resolve 只返回匹配原 `implementation` 精确采用的实现；名称相同不代表精确采用相同。进行中的 Passage 不迁移为新版语义。缺原实现或材料时返回不可用或保留具名 dependency wait，不自动重判。精确接续分支归[扩展接续](../../../agent/docs/architecture/mechanisms.md#扩展经过与精确采用接续)。AgentAdoptions.handover 的行为见 SPEC 的“[采用交接](../../SPEC.md#采用交接)”，操作要素见[定义专题](definition.md#采用解析与交接)。

## 托管协调与运行实例

[行为与约束](../../SPEC.md#托管协调与运行实例)。

[对象状态及协议](../object-model.md)。以下类型与前文属于同一模块。所有 ID、Evidence 和 Authority 均须在边界验证：身份用解码函数，`Adoption`、`Evidence`、`Access` 与 `Authority` 用结构判定。结构相同不代表来自可信拥有者。

- [execution.ts](../../src/execution.ts)：执行与实例的类型。有 `ExecutionState`、`ExecutionSnapshot`、`AgentState`、`AcceptedInput`、`TerminalObservation`、`FinishIntent`、`FinishResult`、`FinishAuthorization`，控制的 `ExecutionControl`、`ControlStage`、`ControlStageFact` 与 `ControlRecord`，`ResultResponsibility`、`ExecutionMutation`、`CommandReceipt`，事件的 `AgentEventBody`、`AgentEvent` 与 `EventPage`。
- 运行时端口也在 [execution.ts](../../src/execution.ts)：`AgentExecutionInput`、`AgentExecutionControl`、`AgentExecutionEvents`、`AgentExecutionHandle`、`AgentRuntime`、`AgentObservation`、`AgentHandle`、`AgentDirectory`、`AgentExecutionRecovery`、`AgentAdoptions`，登记的 `RegistrationState`、`Registration`、`AgentRegistrationHandle` 与 `AgentInstanceHost`，停用的 `QuiesceResult` 与 `AgentRuntimeControl`，资格核验的 `AgentAccessOperation`、`AgentAccessTarget`、`AgentAccessDecision` 与 `AgentAccessCheck`，以及 `AgentClock`。

- invoke 返回的 AgentExecutionHandle 是原 execution 的输入、控制和输出视图，不指向 runtime 后来承接的其他 execution。
- 推进资格依据 `grant` 为空表示独立调用，执行挂接由 Journal 提供者授予。外部协调者传入自己的推进资格依据。
- `AcceptedInput` 携带输入的完整内容 `content`。invoke 的 `initial` 与 submit 的 `value` 都使用它。`source` 是外部协调者一侧的受理依据，独立调用者传 null。
- acknowledge 的 `receipt` 是读取方自己的处理依据，可以为 null。Agent 不解释它的内容。
- `Registration` 的状态与登记身份由宿主返回。publish 的输入不含运行对象，其中的 `state` 只是登记时的初值。
- `AgentRegistrationHandle` 由宿主在 reserve 时为该实例提供，是 runtime 唯一需要的登记能力。`report` 只更新活体观察的状态投影，不改变登记，也不是耐久操作。`withdraw` 只作用于本实例当前的登记，本实例当前没有登记时返回 null。
- `AgentRuntimeControl` 是停用实例的控制面，由 runtime 的提供者交给宿主，不交给执行的调用方。
- `AgentAccessCheck` 是 Agent 核验主体当前资格的注入端口，由授权领域的适配器实现。`operation` 是被核验的公开操作，`target` 是该操作作用的范围、实例或 execution。`unavailable` 不放行，其 `diagnostic` 受与 Failure 诊断相同的内容限制。`takeover` 是接管仍在推进的 execution 所需的独立资格，不包含在 `resume` 之内。它与动作准入是两个端口：动作准入判断某个 Model 或 Tool 动作能否发起，本端口判断主体能否调用 Agent 的某个公开操作。
- `AgentInstant` 是 RFC 3339 的 UTC 时刻，例如 `2026-10-17T08:00:00Z`。
- `ExecutionMutation.operation` 由稳定要素确定派生，不是随机值，崩溃前后对同一帧与同一转移派生同一身份。派生规则与未知结果的查询见[机制页](../../../agent/docs/architecture/mechanisms.md#操作身份的确定派生)。
- `FinishIntent.beforeTerminal` 是落终态之前位置依据的唯一字段，`AgentConclusion` 不另带这项依据。它在候选固定时为 null，规则见 SPEC 的“[条件终结](../../SPEC.md#条件终结)”。
- `AgentExecutionRecovery` 是无活体 runtime 时按 execution 对账的入口，`reconcile` 的 `remaining` 是交付责任尚未解除的 consumption 列表。行为见 SPEC 的“[提交与保管](../../SPEC.md#提交与保管)”与“[交接与停用](../../SPEC.md#交接与停用)”，切点见[机制页](../../../agent/docs/architecture/mechanisms.md#恢复切点表)。
- `resume` 的 `recovery` 可以含宿主的失联判断与换代时 handover 的证明，它们供追溯与核验，不替代 takeover 的资格核验。行为见 SPEC 的“[恢复与接管](../../SPEC.md#恢复与接管)”。
- `ControlRecord.stages` 只含已记录的阶段事实，每项为 reached 或 unresolved。行为见 SPEC 的“[六个阶段](../../SPEC.md#六个阶段)”，迁移见[对象模型](../object-model.md#状态与转移)。
- `QuiesceResult` 的 `remaining` 是交接未知的 execution。行为见 SPEC 的“[交接与停用](../../SPEC.md#交接与停用)”，被接管的执行不计入，见“[恢复与接管](../../SPEC.md#恢复与接管)”。
- 终态的 `disposition` 是终态成立的处置依据：它指向被提交的 FinishIntent，含其中落终态之前位置的依据与终结授权。终态后观察者经它取得这些依据，规则见 SPEC 的“[条件终结](../../SPEC.md#条件终结)”。

invoke、resume、登记、撤除与停用的行为见 SPEC 的“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”。主体资格的核验见“[主体资格核验](../../SPEC.md#主体资格核验)”。事件序号、游标、缺口、背压、重连与确认的行为见“[事件流与读取](../../SPEC.md#事件流与读取)”。控制的种类、范围与六个阶段见“[取消、退出与结构变更](../../SPEC.md#取消退出与结构变更)”。本页只导航到类型所在的源码，不重复这些行为。

## 执行记录与调用方交接端口

Journal 是 Agent 的持久端口，只提供执行记录、输入、checkpoint、事件和原操作结果的操作，不提供外部协调者的业务管理操作。端口按使用角色分为五组：开启与挂接、提交与记录、终结、终态后观察登记、读取。读取组只含读操作，不含任何写入。只承担一种角色的使用者只依赖对应的组，例如长期的终态后观察者只依赖读取与终态后观察登记两组，不取得终结或确认的能力。以下联合限制允许的交接，不能传任意脚本、数据库动作或业务方法名。这些操作的行为见 SPEC 的“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”与“[提交参加者协议](../../SPEC.md#提交参加者协议)”。

- [journal.ts](../../src/journal.ts)：`CallerCommit`、`EffectIntent`、`JournalCommit`，按使用角色分的五组端口 `AgentJournalAttachment`、`AgentJournalRecording`、`AgentJournalFinishing`、`AgentJournalObservation` 与 `AgentJournalReading`，`JournalCapabilities`，以及它们的并集 `AgentJournal`。

open 与 attach 返回新授予的 Authority，runtime 用它向 Model、Tool、请求准备和 Journal 的后续操作证明自己的挂接资格。attach 的 `takeover` 是接管路径所需的主体资格依据，取自 AgentAccessCheck 对 takeover 的 allowed 结论，恢复路径传 null。宿主恢复入口与长期保管者直接使用的 Journal 操作，由宿主的适配器以同一端口核验主体，规则见 SPEC 的“[主体资格核验](../../SPEC.md#主体资格核验)”。open 与 submit 收到的 AcceptedInput 内容由提供者在受理时耐久保存，inputs 返回的 messages 来自这些保存的内容。CallerCommit 的非 none 种类，只能在 Journal 提供者声明了对应提交参加者时使用。tryFinish 的 `FinishAuthorization` 有两种：`advancement` 对应仍然有效的普通完成或失败，`cancel` 对应已保存且当前适用的取消控制。`TerminalObservation` 的 `observed` 为 null 表示待观察。`ResultResponsibility` 的 `release` 为 `pending` 表示责任尚未解除。

`capabilities.participants` 是 Journal 提供者声明它能兑现的共同提交种类。`none` 不需要参加者，不在集合内。集合在提供者构造时固定，运行期间不变。工厂创建时把配置 `jointCommits` 的每一种与它比对，缺一种返回 unsupported。行为见 SPEC 的“[提交参加者协议](../../SPEC.md#提交参加者协议)”。下表是这个声明的八个要素。

| 要素 | 内容 |
| --- | --- |
| 输入 | 无。声明是只读属性，不是操作 |
| 返回 | `ReadonlySet`，元素取自 message、context-transition、custody、processed |
| 错误 | 无。读取属性不返回错误。比对失败由工厂以 unsupported 报告 |
| 授权 | 不需要主体资格。声明说明提供者的能力，不授予任何操作的资格 |
| 幂等 | 构造后不变，重复读取得到同一个集合 |
| 并发 | 不可变值，可并发读取 |
| 事件 | 无 |
| 生命周期 | 随 Journal 提供者。提供者换代时，新提供者的声明用于其后创建的 runtime。已创建的 runtime 在运行时遇到未声明的提交种类，在保存任何状态之前返回 unsupported |

工厂用来比对的“装配会用到的种类”由[通用工厂](../../../agent/docs/public-api.md#工厂配置)的配置 `jointCommits` 给出。

commit、open、attach、load、recordResult、recordControl、tryFinish、recordTerminalObservation、detach 与 reconcile 的行为，包括条件提交、未知结果的查询、终结的排序、终态后观察、ended 之后的保留与释放，唯一行为源是 SPEC 的“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”。共同提交与提交参加者的四种响应见“[提交参加者协议](../../SPEC.md#提交参加者协议)”。本页不重复这些行为。

## 逐操作及输入分类

[行为与约束](../../SPEC.md#逐操作及输入分类)。

每个公开操作的输入、返回、错误、授权、幂等、并发、事件与生命周期，集中写在 SPEC 的逐操作要素表，本页的类型形状是其中输入与返回的来源。注入端口的要素写在各自的专题：请求准备、模型选择与 Runtime Context 读取见 SPEC 的“[请求接缝的逐操作要素](../../SPEC.md#请求接缝的逐操作要素)”，采用解析与交接见[定义专题](definition.md#采用解析与交接)。输入按四类分责：构造身份绑定、可序列化配置、单次操作参数和注入依赖。分类规则见[对象模型](../object-model.md#值参数与依赖)，工厂的配置项和依赖逐项分类见[通用工厂](../../../agent/docs/public-api.md)。

## 验证边界

[行为与约束](../../SPEC.md#验证边界)。

## 实现工厂

配置、依赖聚合及构造函数由 [通用实现](../../../agent/docs/public-api.md) 拥有。这里的提供者端口仍是可替换边界，不指定实现。
