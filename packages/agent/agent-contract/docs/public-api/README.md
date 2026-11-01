# Agent 公开入口与定义

根入口 `@omne-harness/agent-contract` 导出全部契约类型、五个常量（`ATTRIBUTE_ITEMS`、`POSITIONS`、`POWERS`、`POSITION_OUTPUTS`、`AGENT_IDENTITY_MAX_LENGTH`）、三个判定函数（`judgeAgentDefinition`、`judgeLoopExtensions`、`judgeExtensionOutput`）、资产正文端口 `agentBodyContract`、十四个品牌身份的解码函数、六个结构判定（其中 `judgeHandoffPrepare` 与 `judgeInputOrigin` 属于消息准入）与 `obligationCategoryOf`。包根不导出推进、纯求值、托管协调、Journal 或实例的实现。这些接口在包里只有类型，由[后继的通用实现与提供者](../../../agent/README.md)实现。

公开类型的唯一定义在 [src/index.ts](../../src/index.ts) 及其导出模块。本页是源码导航，不保留手写类型声明。这些类型的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。类型存在不表示任何提供者或运行实现已经兑现它们。

行为、调用资格、参数与依赖分类归 [SPEC 的运行契约章节](../../SPEC.md#主干运行契约)。消费路径见 [context](../context.md)，对象关系见 [object-model](../object-model.md)。

定义、判断结果与判断函数的源码如下。规则见 [SPEC 的声明判断](../../SPEC.md#声明判断)。

- [definition.ts](../../src/definition.ts)：`AgentDefinition`、`AssetReference`、`CapabilityRef`、`AttributeDeclaration` 与 `AttributeItem`，常量 `ATTRIBUTE_ITEMS`。定义不带版本，每个新 execution 采用当时的合法胜出者，见[定义专题](definition.md#版本采用与实际变化)。
- [judgment.ts](../../src/judgment.ts)：判断结果 `Judgment` 与 `BatchJudgment`，声明判断的拒绝原因 `RefusalReason`，扩展输出判断的拒收原因 `OutputRefusalReason`。
- [judge-definition.ts](../../src/judge-definition.ts)：`judgeAgentDefinition`。
- [judge-extensions.ts](../../src/judge-extensions.ts)：`judgeLoopExtensions`。
- [body-contract.ts](../../src/body-contract.ts)：资产正文契约 `agentBodyContract`。
- `judgeExtensionOutput` 与 `POSITION_OUTPUTS` 在下文“扩展、人工卡片与材料”的 judge-output.ts。

## 身份、原位置与纯求值

[行为与约束](../../SPEC.md#身份原位置与纯求值)。

源码中以 `M.*` 引用的名称（ModelCallId、ModelOperationId、AssembledModelInput、FixedModelRequest、ResultCapacity、ResultPage、ModelRuntime、ProfileResolution、Parameter、Supplier、Termination、ModelFault、DispatchRecord、RetryResolution）来自 [Model 契约](../../../../model/model-contract/docs/public-api.md)，由 `@omne-harness/model-contract` 的根入口导出。`T.*` 引用的名称由 `@omne-harness/tool-contract` 的根入口导出。消息中的工具部件使用 `@omne-harness/message` 导出的 `ToolPart`。`Action.original` 把 `ToolPart` 收窄到 `kind: 'tool_call'`：动作只来自工具调用部件，不来自工具结果部件。

- [identity.ts](../../src/identity.ts)：品牌身份的泛型 `AgentIdentity`，十六个品牌身份（`AgentInstanceId`、`StepId`、`ActionId`、`PassageId`、`CardRoundId`、`ActionBatchId`、`AgentExecutionId`、`ExecutionAttachmentId`、`AgentRegistrationId`、`AgentOperationId`、`ExecutionRevision`、`InputId`、`InputBatchId`、`ConsumptionId`、回复准入的序位 `ReplyAdmissionSequence` 与页游标 `ReplyAdmissionPageCursor`）、`Authority`、`Continuation`、`AgentInstant` 与品牌时刻文本 `UtcInstantText`，再导出的 `Adoption`、`DurableEvidence`、`ConsumerRef`（唯一定义在 [exchange-refs](../../../../common/exchange-refs/SPEC.md)）与 `Access`（唯一定义在 legal-identity），常量 `AGENT_IDENTITY_MAX_LENGTH`，十六个 `decode*` 解码函数（`decodeReplyAdmissionSequence` 只接受规范十进制非负整数），结构判定 `judgeAdoption`、`judgeEvidence`、`judgeAccess` 与 `judgeAuthority`，以及它们的失败类型 `IdentityFailure` 与 `StructureFailure`。规则见 [SPEC 的身份解码与结构判定](../../SPEC.md#身份解码与结构判定)。
- [evaluation.ts](../../src/evaluation.ts)：纯求值的值与端口。有 `ProducedResult`、`InputBatch`、`ProgressionDirective`、`Waiting`、`AgentConclusion`、`FailureCandidate`、`PreparedContextTransition`、`Failure` 与 `Reply`，原调用的 `ModelPurpose`、`PendingCall`、`ActionJudgment`、`Action`、`ActionBarrier`、`ActionSlot`、`ActionBatch`，回复准入的 `ModelReplyAdmission`、`ReplyAdmissionPrefix`、`ReplyAdmissionProjection`、`ReplyAdmissionFrom`、`ReplyAdmissionItem`、`ReplyAdmissionPageTail`、`ReplyAdmissionGapReason`、`ReplyAdmissionPage` 与 checkpoint 的读取位置 `ReplyAdmissionRead`，守卫的 `GuardLevel` 与 `GuardFact`，`AgentCheckpoint`、`RuntimeConditions`、`ProducerDecisionView`、`AdvancementFact`、`LoopFacts`、`Next` 与 `AgentEvaluator`。
- [execution.ts](../../src/execution.ts)：`LoopFacts` 引用的执行记录类型 `ExecutionControl`、`ControlStage`、`ControlStageFact`、`ControlRecord` 与 `ResultResponsibility`，与“托管协调与运行实例”一节的类型同在这个文件。

Model 登记在首次 admit 前保存 `PendingCall.model.reference` 与原固定输入。提交未知或回包丢失时按该引用对账，可信 not-accepted 才沿原身份再受理。当前资格与原 ACK result/evidence 保持。Tool 在 invoke 前保存无 reference、call 或 admission 的 intent 与完整原请求材料。accepted 或 commit-unknown 带引用时保存 associated；association-unknown 保留 intent，沿完整原请求和 consumer 重入；rejected 保留历史关联。Tool 关联与控制引用的行为归 [Agent SPEC](../../SPEC.md#tool-调用关联与控制引用)。见 [Model 引用契约](../../../../model/model-contract/SPEC.md#可保存调用引用)。

ProgressionDirective 是 Loop 下一步所需的具体推进要求，不是权限或协作模式的复制。CurrentConditions 的受信适配器把合法协作设置投影为该值并保存依据，Agent 不解释 never/auto_permission/bypass-permissions。RuntimeConditions 只是这项投影及其采用依据，不含守卫阶梯：守卫由 Agent 自持的守卫事实承载，见下文 `AgentCheckpoint.guard`。evaluate-completion 仅允许核完成条件，不等于批准完成；continue 不产生任意新效果许可。环境采用由相应请求/动作固定协议携带，Agent 不维护环境选择或权限策略状态机。

效果协调层读取 Model/Tool 公开状态，核原 call/version/消费关联后生成 ProducerDecisionView。model-active 包括原调用内部仍在重试；只有原 Model 确认整调用真实收场才为 model-settled。tool-background 必须有真实转换确认和耐久占位。tool-result 可含 Tool 原契约的失联或晚到版本，不一概解释为物理停止。supportedControls 是公开能力快照，实际控制仍需当前核权。

查询失败返回 Failure，确定不了原状态保留 unresolved，二者均不能投影为空或已结束。ResultResponsibility 决定哪些结果已保管、已处理或待释放；result-ready 类事实不自动授权解除交付责任。Evaluator 只读这些有判别事实，不拿 ExecutionSnapshot 全记录、运行句柄、推进围栏或外域 JSON 状态做决策。Checkpoint 的版本化私有状态和透明流材料可以保存 schema/JSON；解码由原拥有者完成。

`initial` 返回新逻辑执行的初始 checkpoint：`position` 是执行开始之后位置的节点 E3，`passages` 为空，`guard` 为 null。Loop 读到这个 `position` 且该位置尚无扩展调用时经过该位置，所以首次经过被崩溃打断后由恢复者接续同一次经过，不算第二次经过，见 Loop 算法页的[恢复入口与回归点](../../../agent/docs/architecture/loop-algorithm.md#恢复入口与回归点)。

AdvancementFact 是执行挂接状态、执行状态和控制记录的只读投影，不是独立状态。它与这三者的对应关系见[对象模型](../object-model.md#状态与转移)。

AgentCheckpoint 的 `compaction` 记录 `step` 所标识的那一次请求准备进入的压缩计划及其进度，新 step 开始时清空。`adoptedContext` 记录最近一次最终请求采用的 Runtime Context 覆盖，新 execution 开始时为空。`encode` 与 `decode` 覆盖这两个字段：`compaction` 的进度、`stepRequest`、`initiated` 与 `ended` 逐项编码，`adoptedContext` 按 DurableEvidence 编码，解码时核对它们属于 checkpoint 的 `step` 与本 execution，不属于时返回 invalid。行为见 SPEC 的“[请求准备与压缩](../../SPEC.md#请求准备与压缩)”和“[Runtime Context 的消费](../../SPEC.md#runtime-context-的消费)”。`RuntimeConditions.model` 是设置侧当前选择的采用依据，不是实际收件模型。

`AgentCheckpoint.guard` 是 Agent 自持的守卫事实，即循环守卫阶梯的最新判断。`initial` 返回的 checkpoint 中它为 null，表示尚无判断，L0 的观测始终保留。它只由调模型之后位置上的循环判断这一受信系统扩展计算：该扩展经执行历史读取能力读本执行已可靠保存的原始工作事实（模型调用与回复、回复准入结论、动作批与结果、它自己以往卡片轮次的结果、费用、step），不读压缩后的视图，再经守卫判断记录能力把判断记入其 Passage 的 `guard` 操作，效果采纳时 Agent 把它写入本字段。`GuardFact` 的 `level` 是 L0 至 L3 的阶梯级别，L4 不记为守卫事实，它是该扩展的 `ask` 输出，`policy` 是该扩展检测算法与阈值的精确采用，`through` 是判断读到的事实范围，`basis` 是判断依据的记录，`passage` 是形成判断的扩展调用，`at` 是判断时刻。本字段随 checkpoint 持久：压缩、崩溃、换执行挂接与 runtime 换代都不清零，新 step 不清零，runtime 顺序复用不沿用上一执行的值。循环判断不可用时本字段保持上一次的值，Agent 不伪造判断。`encode` 与 `decode` 逐项编码本字段，解码时核对 `passage` 属于本 execution。I8 读本字段决定 L3 的失败候选，L4 的人工等待是该扩展调用的卡片等待，L1、L2 的干预消息由该扩展以 `inject` 给出。承载形状只对受信系统扩展开放，作者协议的输出与位置输出表不变，见扩展作者协议的[输入](extensions.md#输入)。行为见 SPEC 的“[循环守卫](../../SPEC.md#循环守卫)”。

Next 的种类对应 [Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md)的节点：`reconcile` 为 E2 与 R0，`take-inputs` 为 I0，`prepare-request` 为 I1 与 P1，`compact-derive` 为 C1 的 derive 调用，`admit-model` 为 M0 与 M6（主请求与压缩步骤），`commit-transition` 为 C3，`resume-request` 为 C4 之后的 I1，`extension` 为 X0 至 X5，`admit-message` 为 Q1、Q2、Q4、Q5，`admit-tools` 为 A2，`consume` 为 T1 与 M3，`wait` 为 W0，`try-finish` 为 F1 至 F3。`stop` 按原因对应节点：cancelled 为 F0，terminal 为 F4，superseded 为被取代时的 E9，suspended 为有效暂停或实例停用时的 E9。

`FailureCandidate` 是失败候选附带的内容。`AgentConclusion` 的 `fail` 分支只带 `cause` 依据，依据指向的记录就是这个值。它是 F1 节点 commit 所写候选业务内容的一项，Journal 据此建立候选的 `failure`，`FinishIntent.failure` 是它的投影。判别字段是 `kind`，各变体如下。

- `cannot-fit` 带原因与 Context 的原结果。`context` 原样承载 Context 交出的结果：`Preparation`、`CompactionAdvance`，或否决前的 needs-compaction。Agent 不伪造 `Preparation`。压缩之前位置或压缩用途的调模型之前位置否决时带 `veto`。压缩转换消息被消息准入拒收时带 `rejection`，即拒收依据。已进入计划时带 `plan`。
- `compaction-invalid` 带计划身份。derive 返回的进度与计划不符时带 `progress`，即期望值与返回值。压缩转换的共同提交判定转换非法时带 `transition`，即判定依据。
- `request-rejected` 带 Model 请求准备的确定拒绝：`failure` 是 `prepare` 或 `resume` 返回的 invalid（field 为 request），`model` 是 Model 的原结果，`selection` 是选择依据。
- `no-reply` 带没有有效回复的原调用。
- `message-rejected` 的 `from` 为被拒收消息的来源，`evidence` 为拒收依据，两者指向 `ExecutionSnapshot.handoffs` 中同一个原 outcome。它只用于工具结果或被拒绝动作的拒绝消息被拒收，并由 H0 路由到 F1 提出失败候选的情形。压缩转换消息被拒收归 `cannot-fit`。
- `extension-stop` 带输出 `stop` 且 `terminal` 为 `failed` 的扩展调用。
- `guard` 带守卫 L3 的依据。`basis` 等于形成该候选时 `AgentCheckpoint.guard` 的 `basis`，候选由 I8 按该守卫事实提出。

`source` 是该记录自身的依据。失败候选只保留原因、历史、设置与已有结果，规则见 SPEC 的“[无法装下](../../SPEC.md#无法装下)”第 5 条。

ModelReplyAdmission 是完整主模型回复在消息准入的最终事实，随原 execution 保存。原 call/resultVersion 唯一确定一项事实，step/action 与 source 必须匹配原主调用与最终准入结论。source 是消息准入提供者对该回复固定的 prepared 依据或 rejected 依据，指向原 H，见下文 `MessageHandoff`。消息准入不经过扩展，所以这项事实不记录扩展调用。相同事实重复提交不重复计数，异结论或异归属冲突。Journal.commit 同提交该事实、接续及输出，不能由普通事件观察单独增加次数。

ActionBatch 的 `barrier` 是整批判断屏障的状态。closed 的 `judging` 列出链正在运行、尚未到达最终结论的动作，`asked` 列出正在等人的卡片轮次及其动作。一个动作同一时刻只出现在两者之一：链进入已询问时从 `judging` 移入 `asked`，以 `replay` 继续时移回 `judging`；该轮 present 确定失败时从 `asked` 移出，该动作的判断为 denied。open 带屏障依据与按原顺序列出的获准动作。all-denied 表示本批动作在判断阶段全部被拒绝。`slots` 按原动作顺序排列，每个槽位记录该动作的结果承接进度：denied、dispatched、result 或 background。屏障打开或记为 all-denied 时，判断为 denied 的动作建立 denied 槽位。获准动作的 invoke 返回 accepted 后保存 associated 并建立 dispatched 槽位。commit-unknown 保存 associated 后对账，association-unknown 保留 intent，rejected 仅在无保留的历史受理或未决尝试时建立 denied 槽位；否则保留原 pending、完整请求、consumer 与 effect intent，缺槽位保持未决，原 open 屏障不变，T3/T5 不判完成。所以全拒时每个动作也有槽位，单结果经过与消息准入的进度随 checkpoint 保存。`each` 是该槽位单结果经过中的扩展调用，后台槽位不经过单结果范围，`each` 为 null。`candidate` 是交消息准入的候选消息：结果槽位是工具结果消息，拒绝槽位是拒绝消息，后台槽位由占位形成。`handoff` 是该槽位准入原操作 H 的 `HandoffReference | null`，完整结果由 `ExecutionSnapshot.handoffs` 解析。`batchPass` 是整批经过中的扩展调用，尚未经过时为 null。后台最终结果到达时，原槽位保持 background，结果以原 PendingCall 的 consumption 到达并由 Loop 以 consume 消费。行为见 SPEC 的“[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)”与“[工具执行与结果承接](../../SPEC.md#工具执行与结果承接)”。

ReplyAdmissionProjection 由权威事实按提交顺序派生，through 固定执行事实范围，rule 固定计数规则。rejected 增加连续及累计否决数，admitted 将连续数归零，累计数保留。计数为非负十进制整数编码。内部重试、模型失败、压缩、扩展调用、新输入和执行挂接更换不产生主回复准入事实。初始零值须以该执行无既有准入事实为依据；恢复时不得从零起算而丢掉历史。admitted 按上述规则使连续数归零，不改变累计数。循环守卫的阶梯由循环判断这一受信系统扩展按其策略从原始事实计算，不直接等同于该计数。

ReplyAdmissionPrefix 是已核实前缀：`sequence` 是该执行准入事实的稠密序位，0 是执行起源；`basis` 是 Journal 可解析的前缀依据，绑定租户、执行、执行起源、序位与原发布。投影的 `prefix` 是该 through 内全部事实的终点。前缀不绑定 rule，也不授予读取资格。AgentCheckpoint 的 `replyAdmissionRead` 为 unverified 或带前缀的 verified，只保存读取者的进度，不保存范围、游标或计数，只随正常提交写入，提交时 Journal 按依据点查核对。

readReplyAdmissions 读固定范围 `(from, through]`：`from` 必填，为 origin 或已核实前缀；`after` 是不透明游标，只在同一租户、执行、执行起源、from 与 through 内有效。成功页带 `start`、`end`、每项带 `publication` 的 `items` 与 `tail`；`tail` 为 complete 当且仅当 `end` 等于目标前缀，不用 `next` 为 null 或缺省字段推断完成。页可以少于 `limit`，少返回时 `tail` 为 more。gap 带原因 retention、missing-fact、missing-basis 或 range-unavailable，不等于空历史。规则见 SPEC 的“[回复准入的已核实前缀](../../SPEC.md#回复准入的已核实前缀)”。load 的投影必须覆盖其原子快照的事实范围，未补齐投影时返回 unavailable，不能交给 Evaluator 一份过期但看似完整的输入。详细恢复与保留规则归[机制](../../../agent/docs/architecture/mechanisms.md#事实投影与长期读取)。

## 请求、扩展和材料接缝

[行为与约束](../../SPEC.md#请求扩展和材料接缝)。

### 请求准备、模型选择与压缩

[行为与约束](../../SPEC.md#请求中的职责划分)。

本节引用 `@omne-harness/model-contract` 导出的 `M.ProfileResolution` 与 `M.Parameter`、`M.AssembledModelInput`、`M.FixedModelRequest` 和 `M.ResultCapacity`。`ModelPurpose`、`ModelRecipient`、`SelectedModel`、`ModelContextRead`、`CompactionProgress`、`CompactionAdvance`、`CompactionState` 与 `FinalRequest` 由本包定义为 Agent 自有的端口形状。它们不是 Model 或 Context 的导出。Context 一侧对应接缝的方向已接受，Context 契约的文字尚未写出，见算法页的接口增量与开放问题。

- [request.ts](../../src/request.ts)：`ModelRecipient`、`SelectedModel` 与端口 `ModelSelection`，`ContextContent`、`ModelContextRead` 与端口 `ModelContextReader`，`CompactionProgress`、`Preparation`、`CompactionAdvance`、`CompactionState`、`FinalRequest` 与端口 `RequestPreparation`，以及端口 `CurrentConditions`。`ModelPurpose` 在 [evaluation.ts](../../src/evaluation.ts)。

`SelectedModel.recipient` 是请求实际面向的模型，由路由名和档案的精确采用组成。`resolution` 只能是可选的胜出档案。`history` 与同一次准备交给 prepare 的历史依据相同。行为见 SPEC 的“[模型选择](../../SPEC.md#模型选择)”。

`position` 在 `PendingCall`、`ModelSelection.select`、`ModelContextReader.read`、`RequestPreparation.prepare` 与 `Preparation` 中是同一个值：这次调用或准备服务的原消费位置，带拥有者、工作、位置与用途四个子字段。Tool 请求的 `consumer` 与它的 owner、work、position、purpose 逐字段相等。Model 仍按原 consumer 规则，Agent 一侧按位置角色命名。`AgentMaterials.preserve` 的 `consumer` 是材料的消费方，不是消费位置，所以保留原名。

`ModelContextReader` 在装配时绑定到模型这一个消费者，没有选择其他消费者的参数。`position` 是这次读取服务的消费位置，不是读取的受众。`adopted` 取自 checkpoint 的 `adoptedContext`，`transition` 只在压缩提交之后的读取中给出。`ModelContextRead.content` 由 Context 决定，`coverage` 在最终请求记录时保存到 `adoptedContext`。行为见“[Runtime Context 的消费](../../SPEC.md#runtime-context-的消费)”。

`beforeModelCall` 为 null 表示调模型之前位置尚未经过，结果的装得下种类是 `assembled`。它是数组时表示该位置已经经过，数组列出该位置这一次经过中的扩展调用，没有适用扩展时为空数组，结果的装得下种类是 `ready`。`purpose` 为 `extension` 时总是传空数组：扩展用途的请求不经过该位置，装得下的结果直接是 `ready`。这类请求返回 `needs-compaction` 时不进入压缩计划，规则见[扩展作者协议](extensions.md#压缩用途与扩展用途的模型调用)。

`needs-compaction` 的 `original` 绑定触发压缩的那次 prepare 的完整输入：`input` 是全部输入的依据，`alterations` 与 `beforeModelCall` 原样记录。`resume` 从 `original` 与压缩转换依据重算，不另接收 `beforeModelCall`。它返回的装得下种类由 `original.beforeModelCall` 决定：null 得 `assembled`，数组得 `ready`。

`CompactionProgress` 的三项都由 Context 的计划给出，`bound` 与 `completed` 是非负十进制整数编码。压缩的每一步是 `purpose` 为 `compaction` 的 ready 准备，在 `CompactionAdvance.continue` 中是 `stepRequest`。`CompactionState` 保存在 checkpoint 的 `compaction`，它属于 checkpoint 的 `step` 所标识的那一次请求准备，新 step 开始时清空。`CompactionState.initiated` 是 Agent 自持的已发起步数，非负十进制整数编码，每发起一步加一并随 checkpoint 提交，崩溃后用它认回同一步。`stepRequest` 是尚未发起或在途的下一步请求。行为见“[请求准备与压缩](../../SPEC.md#请求准备与压缩)”和“[无法装下](../../SPEC.md#无法装下)”。

`FinalRequest` 是 Agent 对这次请求的采用记录，不是 Context 或 Model 的返回值。其中的 `request` 是 Model 请求准备返回的固定请求。行为见“[调模型之前的复核与最终请求](../../SPEC.md#调模型之前的复核与最终请求)”。逐操作的要素见“[请求接缝的逐操作要素](../../SPEC.md#请求接缝的逐操作要素)”。

PreparedContextTransition 是 Agent 消费 Request Context 的窄视图。commitment 由 Context 拥有者建立，不是调用方自证的字符串。Agent 保留它的完整材料：原 candidate、plan 与完整 basis 材料、commitment 与真实的 history epoch，与原合法来源依据分开保存；Agent 把它与 H、Ja 精确传给压缩转换的共同提交，只在 Ja 认回 committed 后取得 committed 的转换依据再进入 resume。行为见“[请求准备与压缩](../../SPEC.md#请求准备与压缩)”。

### 扩展、人工卡片与材料

[行为与约束](../../SPEC.md#扩展卡片与材料)。

扩展作者接口的类型由[扩展作者协议](extensions.md)规定，源码在 [extensions.ts](../../src/extensions.ts)，本页不重复。各类型的规则位置如下：

| 类型 | 声明位置 |
| --- | --- |
| `Position`、`Dimension`、`Power`、`ErrorPolicy`、`UnavailabilityPolicy`、`NeedDeclaration`、`ExtensionImplementationDeclaration`、`LoopExtensionDeclaration` | [声明](extensions.md#声明) |
| `ExtensionInput` | [输入](extensions.md#输入) |
| `ExtensionOutput`、`DecisionCardDraft`、`CardOption` | [输出](extensions.md#输出) |
| `ActionIdentity`、`Conclusion` | [Conclusion](extensions.md#conclusion) |
| `ExtensionInvocationMode`、`ExtensionReplayBinding`、`ExtensionInvocationResult`（含非最终的 `invocationUnresolved` 分支 `InvocationUnresolved`）、`LoopExtensionImplementation` | [调用协议](extensions.md#调用协议) |

位置集合是九处，`Power` 是 `observe`、`rewrite`、`veto` 三档。源码的声明含 `needs`、`implementation`、`onError` 与 `unavailability`，声明判断不按位置限制 `power`，实际输出权限由声明上限与位置输出表共同裁定，见[扩展作者协议](extensions.md#声明)。`Passage.declaration`、`ExtensionInput.position`、`DecisionCardDraft.about` 与 `ActionIdentity` 使用同一份九处位置。

- [extensions.ts](../../src/extensions.ts)：上表的作者接口类型，常量 `POSITIONS` 与 `POWERS`。
- [passages.ts](../../src/passages.ts)：扩展调用台账与人工卡片，有 `CapturedRead`、`NamedCapturedRead`、`CardRequest`、`CardAnswer`、`CardRemark`、`CardReply`、`PassageCard`、`PassageOperationProgress`、`CardRoundProgress`、`CardRound`、`PassageOperation`、`PassageProgress` 与 `Passage`。还有按位置的 `Subject`，端口 `ExtensionImplementations`、`DecisionCards`、`ActionAdmission`、`MessageHandoff`、`AgentMaterials` 与 `RegisteredReads`，以及 `AdmissionDecision`、`MessageSource`、`Material`，和消息准入的 `InputEntry`、`InvokeRuntimeContext`、`SubmitDelivery`、`InputOrigin`、`HandoffPosition`、`HandoffReference`、`PendingHandoff`、`InputHandoff`、`HandoffRequest`、`HandoffPrepare`、`HandoffDecision`、`HandoffOutcome`、`HandoffResolution`、`HandoffLookup`。
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

DecisionCards 是 Agent 定义的卡片端口，由人在回路领域的适配器实现。人在回路领域的公开契约尚未定义，这个端口写的是 Agent 所需的保证。`read` 返回一张卡片的唯一有效答复，五类结果是：chosen（明确选择一个选项）、declined（明确拒答）、remark（附言：人有话说，没有给出准驳，`text` 是非空的原话）、pending（尚无答复）、invalidated（卡片已作废）。Agent 不把 declined、remark 与 pending 读成批准，也不读成人不同意。chosen 与 declined 的后果：卡片来自作者扩展时，由原扩展决定；卡片来自官方准入时，由授权领域按 AU-05 判定。remark 的处置见 SPEC 的“[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)”第 11 条。`CardAnswer` 是 chosen 与 declined 两类，`CardRemark` 是 remark。回放绑定的 `response.answer` 与 `ActionAdmission.admit` 的 `decision.answer` 都携带 `CardAnswer | CardRemark`，即该卡片唯一有效的人的处理。`invalidate` 只作废尚无答复的卡片，已有答复的卡片在返回值中保留原答复。幂等身份是 passage 加 round 加完整请求身份集合，`invalidate` 另带操作身份。逐操作的要素见 SPEC 的“[卡片与准入端口的逐操作要素](../../SPEC.md#卡片与准入端口的逐操作要素)”。

ActionAdmission 是 Agent 定义的动作准入端口，由授权领域的适配器实现，对应授权的 [AU-04](../../../../identity/authorization/SPEC.md#au-04-当前准入与结果) 与 [AU-05](../../../../identity/authorization/SPEC.md#au-05-人工决定参数改写与重新核验)。输入是原动作、生效参数、工具定义的精确采用引用、按需要名的一组读取 `permissions`（`readonly NamedCapturedRead[]`，每项的 `need` 是官方准入声明的需要名，名字互不相同，空列表表示没有读取），以及人对本动作卡片的处理 `decision.answer`（携带 `CardAnswer | CardRemark`，没有答复时为 null）。四类结果与 AU-04 的四类对应：allow 带准入证据，deny 带原因与依据，need-decision 带卡片草稿，unavailable 不放行。allow 的 `evidence` 是 ActionJudgment allowed 分支的 `evidence`，Tool 在发起前按它与当前权限再核。该端口由执行动作之前这条链末尾的受信系统扩展消费，作者不直接调用它。行为见 SPEC 的“[整批判断屏障与动作准入](../../SPEC.md#整批判断屏障与动作准入)”。

MessageHandoff 是 Agent 定义的消息准入端口，由外部协调者或独立调用方的提供者实现。它有三个操作。`prepare` 按来源校验候选消息并耐久固定准入结果，返回 `HandoffOutcome`：完整原 request 与 origin、provider、qualification、record，以及 `decision` 为 prepared（确切的可提交消息与准入依据）或 rejected（reason 与 evidence）。prepared 表示准入结果已固定，消息尚未进入历史。`lookup` 只读原准入结果，返回 `HandoffResolution`：recorded、excluded 或 unknown。`exclude` 只用于内部请求的取消围栏，封闭尚未发出的准入。`HandoffPrepare` 按 kind 判别三个分支：execution 带 `PendingHandoff` 与当前 advance，invoke 带 `InputHandoff` 与本次的 `InvokeRuntimeContext`，submit 只带 `InputHandoff`。来源有六种。外部输入的拒收后果由产品规定。模型完整回复、工具结果、被拒绝的动作、系统提醒与压缩转换消息只因校验失败或保存失败被拒收，提供者不在本端口做业务否决，拒收后果归 Agent 自己。`action-denied` 是判断阶段或 Tool 受理时确定拒绝、且保留事实证明没有已受理或未决尝试的动作，它没有 Tool 调用，也没有结果，`evidence` 是拒绝依据。`HandoffReference` 区分 execution 分支（内部 H）与 input 分支（外部入口的 execution、原入口 O 与 InputId）；`PendingHandoff` 固定内部请求的 reference、predecessor、position、source、candidate、originalAdvance 与 predecessorHandoff；`InputEntry` 固定外部命令的完整内容，invoke 分支另含初始 checkpoint；`InputOrigin` 是首次准入的不可变出处，invoke 分支保留当时的运行绑定，submit 分支保留 executionBinding 与交入路由 `SubmitDelivery`（runtime-view 或 durable-view）。prepared 的 `admission` 就是 CallerCommit message 与 context-transition 分支、以及 ModelReplyAdmission 的 source 所用的依据。rejected 的 `reason` 受与 Failure 诊断相同的内容限制。prepare 的幂等身份是 H：同 Ki 或同 H 配同完整业务输入认回原 outcome。提供者在固定 prepared 之前完成必要的模态转换。四个操作身份 P、H、Ja、Rh 的分工、各来源的同提交边界、lookup 与 exclude 的规则见 SPEC 的“[消息准入](../../SPEC.md#消息准入)”，逐操作的要素见“[卡片与准入端口的逐操作要素](../../SPEC.md#卡片与准入端口的逐操作要素)”。

ExtensionImplementations.resolve 只返回匹配原 `implementation` 精确采用的实现；名称相同不代表精确采用相同。进行中的 Passage 不迁移为新版语义。缺原实现或材料时返回不可用或保留具名 dependency wait，不自动重判。精确接续分支归[扩展接续](../../../agent/docs/architecture/mechanisms.md#扩展经过与精确采用接续)。AgentAdoptions.handover 的行为见 SPEC 的“[采用交接](../../SPEC.md#采用交接)”，操作要素见[定义专题](definition.md#采用解析与交接)。

## 托管协调与运行实例

[行为与约束](../../SPEC.md#托管协调与运行实例)。

[对象状态及协议](../object-model.md)。以下类型与前文属于同一模块。ID、DurableEvidence 和 Authority 的边界验证要求见 SPEC 的“[身份、范围与归属](../../SPEC.md#身份范围与归属)”。

- [execution.ts](../../src/execution.ts)：执行与实例的类型。有 `ExecutionState`、`ExecutionSnapshot`、`AgentState`、`AcceptedInput`、`TerminalObservation`、`FinishIntent`、`FinishResult`、`FinishAuthorization`，控制的 `ExecutionControl`、`ControlStage`、`ControlStageFact` 与 `ControlRecord`，`ResultResponsibility`、`ExecutionMutation`、`CommandReceipt`，事件的 `AgentEventBody`、`AgentEvent` 与 `EventPage`。
- [finishing.ts](../../src/finishing.ts)：终结的类型。候选与路线的 `FinishCandidateContent`（F1 commit 的 `finish` 字段）、`FinishCandidate`、`FinishRoute`、`LegacyF2Entry` 与 `CandidateSupersession`；终结责任清单的 `FinishObligations`、`FinishObligation`、`ObligationDisposition`、`PendingReason`、`RecoveryContinuation`、`ResponsibilityCoverage` 与 `TerminalParticipantFacts`；受信取消判断的 `CancellationPolicyInstallation`、`CancellationJudgmentInput`、`CancellationDecision`（含 `CancellationBlock` 与 `CancellationUnknown`）、`CancellationPolicy` 与 `CancellationJudgmentRecord`；结算记录的 `MigrationRecord`、`LegacyInvocationReturn`、`ToolAssociationRecord`、`CardReconciliationRecord` 与快照投影 `ExecutionSettlement`；以及 commitSettlement 的 `SettlementRequest` 与 `SettlementResult`。
- [finishing.ts](../../src/finishing.ts) 还导出函数 `obligationCategoryOf`：由清单项的 `kind` 求出它的类别（inputs、controls、operations、passages 或 custody）。类别不是清单项公共头的成员，对应关系见 SPEC“[终结责任清单](../../SPEC.md#终结责任清单)”中 kind 与类别的表。
- 运行时端口也在 [execution.ts](../../src/execution.ts)：`AgentExecutionInput`、`AgentExecutionControl`、`AgentExecutionEvents`、`AgentExecutionHandle`、`AgentRuntime`、`AgentObservation`、`AgentHandle`、`AgentDirectory`、`AgentExecutionRecovery`、`AgentAdoptions`，登记的 `RegistrationState`、`Registration`、`AgentRegistrationHandle` 与 `AgentInstanceHost`，停用的 `QuiesceResult` 与 `AgentRuntimeControl`，资格核验的 `AgentAccessOperation`、`AgentAccessTarget`、`AgentAccessDecision` 与 `AgentAccessCheck`，以及 `AgentClock`。

- invoke 返回的 AgentExecutionHandle 是原 execution 的输入、控制和输出视图，不指向 runtime 后来承接的其他 execution。
- 推进资格依据 `grant` 为空表示独立调用，执行挂接由 Journal 提供者授予。外部协调者传入自己的推进资格依据。非空 `grant` 与非空 `source` 只能交给 coordinated 的 Journal 绑定，standalone 绑定在写前返回 unsupported，规则见 SPEC 的“[受理与单执行槽](../../SPEC.md#受理与单执行槽)”与“[输入内容与水位线](../../SPEC.md#输入内容与水位线)”。
- `AcceptedInput` 携带输入的完整内容 `content`。invoke 的 `initial` 与 submit 的 `value` 都使用它。`source` 是外部协调者一侧的受理依据，独立调用者传 null。
- acknowledge 的 `receipt` 是读取方自己的处理依据，可以为 null。Agent 不解释它的内容。
- `AgentEventBody` 的种类是 input-taken、message、producer、entry、waiting、control 与 ended，都是 Agent 自身的事件，没有透传生产者内容的种类。`entry` 投影一条接收面条目 `AgentJournalEntry`，与条目在同一次提交里成立，规则见 SPEC 的“[日志条目](../../SPEC.md#日志条目)”第 6 条。
- `Registration` 的状态与登记身份由宿主返回。publish 的输入不含运行对象，其中的 `state` 只是登记时的初值。
- `AgentRegistrationHandle` 由宿主在 reserve 时为该实例提供，是 runtime 唯一需要的登记能力。`report` 只更新活体观察的状态投影，不改变登记，也不是耐久操作。`withdraw` 只作用于本实例当前的登记，本实例当前没有登记时返回 null。
- `AgentRuntimeControl` 是停用实例的控制面，由 runtime 的提供者交给宿主，不交给执行的调用方。
- `AgentAccessCheck` 是 Agent 核验主体当前资格的注入端口，由授权领域的适配器实现。`operation` 是被核验的公开操作，`target` 是该操作作用的范围、实例、execution 或外部输入的原入口（input-entry：execution 加原入口操作 O）。execution 目标只含 execution，不含 instance；submit 等 execution 操作不以当前挂接是否存在作为资格前提。`unavailable` 不放行，其 `diagnostic` 受与 Failure 诊断相同的内容限制。`takeover` 是接管仍在推进的 execution 所需的独立资格，不包含在 `resume` 之内。它与动作准入是两个端口：动作准入判断某个 Model 或 Tool 动作能否发起，本端口判断主体能否调用 Agent 的某个公开操作。
- `AgentInstant` 是 RFC 3339 的 UTC 时刻，例如 `2026-10-17T08:00:00Z`，是普通字符串。`UtcInstantText` 是同一编码的品牌字符串，只由 `judgeExtensionOutput` 以 `@omne-harness/utc-instant` 的 `parseInstant` 校验后产生，用于 `retry` 计划的 `notBefore`，见[扩展作者协议](extensions.md#输出)。
- `AgentClock` 的 `now` 返回当前 UTC 时刻的 `Reply<AgentInstant>`，`waitUntil` 等待给定时刻或中止。读取失败、候选时刻与重试规则归 [时钟读取与等待](../../SPEC.md#时钟读取与等待)。
- `ExecutionMutation.operation` 由稳定要素确定派生，不是随机值，崩溃前后对同一帧与同一转移派生同一身份。派生规则与未知结果的查询见[机制页](../../../agent/docs/architecture/mechanisms.md#操作身份的确定派生)。
- `FinishIntent` 是 Journal 维护的当前候选投影，调用者不能写它的投影字段。F1 的 commit 只写候选的业务内容，即 origin、conclusion、failure、inputWatermark、checkpoint 与 conditions。Journal 据此建立候选与 author route，并维护本投影。`candidate`、`obligations` 与 `beforeTerminal` 由 Journal 填写。
  - `FinishIntent.candidate` 固定候选。普通候选是首次 F1 操作的 `AgentOperationId`。取消候选的身份等于建立它的 operation；迁移来的旧 cancelled 候选保留原 F1 身份。
  - `obligations` 在准备态为 null，由 `prepareFinish` 发行后填入，见 SPEC 的“[终结责任清单](../../SPEC.md#终结责任清单)”。
  - `FinishIntent.beforeTerminal` 是终态前判断依据的唯一字段，`AgentConclusion` 不另带这项依据。它在候选固定时为 null。author route 上，落终态之前位置的经过以普通 Passage 提交，该经过完成的那次提交成立时，Journal 把它设为这次提交的依据。cancellation route 上它指向当前判断记录。迁移后它可以变回 null，直到新的判断记录保存。
  - `tryFinish` 输入的 `intent` 只用于与当前投影做相等核对，不写入任何字段。两者不相等时返回 `FinishResult.changed`。
  - 规则见 SPEC 的“[条件终结](../../SPEC.md#条件终结)”与“[取消判断与路线](../../SPEC.md#取消判断与路线)”。
- `ExecutionSnapshot.finishObligations` 是已发行的终结责任清单，未发行时为 null；`ExecutionSnapshot.settlement` 是 commitSettlement 各变体记录的同修订投影，含当前候选 `FinishCandidate` 与 route `FinishRoute`、当前判断指针 `currentJudgment`（`AgentOperationId | null`）、替代链、迁移记录 `MigrationRecord`、判断记录 `CancellationJudgmentRecord`、未清责任引用、Tool 关联记录 `ToolAssociationRecord` 及迟到返回记录 `LegacyInvocationReturn`，见 SPEC 的“[commitSettlement 的变体](../../SPEC.md#commitsettlement-的变体)”与“[取消判断与路线](../../SPEC.md#取消判断与路线)”。取消判断的安装记录 `CancellationPolicyInstallation`、输入 `CancellationJudgmentInput`、结果 `CancellationDecision`（含 `CancellationBlock` 与 `CancellationUnknown`）与实现接口 `CancellationPolicy` 的形状由同一节固定，源码在 [finishing.ts](../../src/finishing.ts)。`ExecutionSnapshot.handoffs` 是 handoff 责任的同修订投影，范围见 SPEC 的“[真实历史的提交点](../../SPEC.md#真实历史的提交点)”。
- `AgentExecutionRecovery` 是无活体 runtime 时按 execution 对账的入口。`query` 返回 committed、rejected、excluded 或 unknown 四种结论：committed 带原 `CommandReceipt`，rejected 带原固定的 conflict、审计依据与 revision，只来自 recordControl；excluded 带排除依据。消费者对四种结论逐一分支，规则见 SPEC 的“[查询的四种结论与持久拒绝](../../SPEC.md#查询的四种结论与持久拒绝)”。`reconcile` 的 `remaining` 是交付责任尚未解除的 consumption 列表，不列出卡片等其他责任。行为见 SPEC 的“[提交与保管](../../SPEC.md#提交与保管)”与“[交接与停用](../../SPEC.md#交接与停用)”，切点见[机制页](../../../agent/docs/architecture/mechanisms.md#恢复切点表)。
- `CommandReceipt.revision` 是该操作所建立或认回的事实对应的修订，不是查询时的最新 revision。revision 的分配规则见 SPEC 的“[执行修订](../../SPEC.md#执行修订)”，认回的回执规则见“[原操作认回与恢复](../../SPEC.md#原操作认回与恢复)”。
- `resume` 的 `recovery` 可以含宿主的失联判断与换代时 handover 的证明，它们供追溯与核验，不替代 takeover 的资格核验。行为见 SPEC 的“[恢复与接管](../../SPEC.md#恢复与接管)”。
- `ControlRecord.stages` 只含已记录的阶段事实，每项为 reached 或 unresolved。受理事实与每个新适用阶段事实各投影一个 control 事件，与原操作结果在同一原子边界成立；合法 ended 之后只保存三种迟到的责任事实，不追加事件。行为见 SPEC 的“[六个阶段](../../SPEC.md#六个阶段)”，迁移见[对象模型](../object-model.md#状态与转移)。
- `QuiesceResult` 的 `remaining` 是交接未知的 execution。行为见 SPEC 的“[交接与停用](../../SPEC.md#交接与停用)”，被接管的执行不计入，见“[恢复与接管](../../SPEC.md#恢复与接管)”。
- 终态的 `disposition` 是终态成立的处置依据：它指向被提交的 FinishIntent，含其中的终态前判断依据（complete 与 failed 为落终态之前位置经过的依据，cancelled 为当前判断记录）与终结授权。终态后观察者经它取得这些依据，规则见 SPEC 的“[条件终结](../../SPEC.md#条件终结)”。

invoke、resume、登记、撤除与停用的行为见 SPEC 的“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”。主体资格的核验见“[主体资格核验](../../SPEC.md#主体资格核验)”。事件序号、游标、缺口、背压、重连与确认的行为见“[事件流与读取](../../SPEC.md#事件流与读取)”。控制的种类、范围与六个阶段见“[取消、退出与结构变更](../../SPEC.md#取消退出与结构变更)”。本页只导航到类型所在的源码，不重复这些行为。

## 执行记录与调用方交接端口

Journal 是 Agent 的持久端口，只提供执行记录、输入、checkpoint、事件和原操作结果的操作，不提供外部协调者的业务管理操作。端口按使用角色分为五组：开启与挂接、提交与记录、终结、终态后观察登记、读取。读取组只含读操作，不含任何写入。只承担一种角色的使用者只依赖对应的组，例如长期的终态后观察者只依赖读取与终态后观察登记两组，不取得终结或确认的能力。commitSettlement 的六个变体都在终结组：它们记录同一条终结链上的候选、判断、迁移与终结责任的保管事实，同属终结收束的角色。只做保管的长期使用者因此也依赖终结组；它取得的是类型上的能力，每次调用仍按变体核验 settle、migrate-cancellation 或 reconcile 资格，保管变体不使用取消授权。以下联合限制允许的交接，不能传任意脚本、数据库动作或业务方法名。这些操作的行为见 SPEC 的“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”与“[提交参加者协议](../../SPEC.md#提交参加者协议)”。

- [journal.ts](../../src/journal.ts)：`CallerCommit`、`EffectIntent`、`JournalCommit`（含 `handoff`：`HandoffChange` 的 prepare、resolve、retire 或 null）、`HandoffHistory`、`ExecutionHandoff`、`JournalSubmitLineage`（new-input 或 recognize-input）与 `OriginalInputAcceptance`，按使用角色分的五组端口 `AgentJournalAttachment`、`AgentJournalRecording`（含 recordHandoff）、`AgentJournalFinishing`（tryFinish、prepareFinish 与 commitSettlement）、`AgentJournalObservation` 与 `AgentJournalReading`，`JournalCapabilities`，以及它们的并集 `AgentJournal`。

open 与 attach 返回新授予的 Authority，runtime 用它向 Model、Tool、请求准备和 Journal 的后续操作证明自己的挂接资格。attach 的 `takeover` 是接管路径所需的主体资格依据，取自 AgentAccessCheck 对 takeover 的 allowed 结论，恢复路径传 null。宿主恢复入口与长期保管者直接使用的 Journal 操作，由宿主的适配器以同一端口核验主体，规则见 SPEC 的“[主体资格核验](../../SPEC.md#主体资格核验)”。open 与 submit 收到的 AcceptedInput 内容由提供者在受理时耐久保存，inputs 返回的 messages 来自这些保存的内容。`commit.caller` 的非 none 种类，只能在 Journal 提供者声明了对应提交参加者时使用。这项限制不约束 `recordResult.transfer`：transfer 只复用 CallerCommit 中 custody 与 processed 两个成员的形状，提供者按 SPEC 的“[提交与保管](../../SPEC.md#提交与保管)”在自己的共同提交边界建立保管或处理依据。tryFinish 的 `FinishAuthorization` 有两种：`advancement` 对应仍然有效的普通完成或失败，`cancel` 对应已保存且当前适用的取消控制。prepareFinish 带同一种终结授权、`expected` 与 `candidate`，返回命令回执与清单依据 `obligations`；commitSettlement 按 `kind` 判别六个封闭变体，没有 checkpoint、effects、events 或 CallerCommit 字段。两者的行为见 SPEC 的“[终结责任清单](../../SPEC.md#终结责任清单)”与“[commitSettlement 的变体](../../SPEC.md#commitsettlement-的变体)”。`TerminalObservation` 的 `observed` 为 null 表示待观察。`ResultResponsibility` 的 `release` 为 `pending` 表示责任尚未解除。

消息准入的记录经同一端口：`commit.handoff` 为 prepare 时保存完整 `PendingHandoff`（P），为 resolve 时把原 H 的 `HandoffOutcome` 与本次真实历史、来源接续同次提交（Ja），为 retire 时退役可信 excluded 的内部 H。`recordHandoff` 带 ExecutionMutation 与 lookup 返回的 recorded 或 excluded，把原结果或排除合入 execution（Rh），没有 checkpoint、effects、events、CallerCommit 或 expected 字段；后继另带 custody。`ExecutionHandoff` 是 `load.handoffs` 的元素，含 request、resolution、history（pending、committed、not-applicable 或 retained）与 retirement。`AgentCheckpoint.currentHandoff` 是当前来源位置的 `HandoffReference | null`，`ActionSlot.handoff` 同形。open 的受理输入是 `OriginalInputAcceptance` 的 invoke 分支加本次 `InvokeRuntimeContext`；submit 的输入另带 `JournalSubmitLineage`，new-input 只允许 submit 原入口，recognize-input 表达对既有 InputId 的新操作认回。行为见 SPEC 的“[消息准入](../../SPEC.md#消息准入)”“[输入内容与水位线](../../SPEC.md#输入内容与水位线)”与“[准入结果保管](../../SPEC.md#准入结果保管)”。

`capabilities.coordination` 是 Journal 绑定声明的协调模式，必填，取值为 standalone 或 coordinated。它描述当前注入的绑定，每个绑定在使用期内不可变。工厂比对、两种模式的义务与失败见 SPEC 的“[提交参加者协议](../../SPEC.md#提交参加者协议)”。

`capabilities.participants` 是 Journal 提供者声明它能兑现的 CallerCommit 共同提交种类。`none` 不需要参加者，不在集合内。集合在提供者构造时固定，运行期间不变。工厂创建时把配置 `jointCommits` 的每一种与它比对，缺一种返回 unsupported。空集合不表示没有输入与终态的协调能力，非空集合也不证明协调协议齐全：这两项由 `coordination` 表达。行为见 SPEC 的“[提交参加者协议](../../SPEC.md#提交参加者协议)”。下表是这两项声明的八个要素。

| 要素 | 内容 |
| --- | --- |
| 输入 | 无。声明是只读属性，不是操作 |
| 返回 | `coordination` 为 standalone 或 coordinated；`participants` 为 `ReadonlySet`，元素取自 message、context-transition、custody、processed |
| 错误 | 无。读取属性不返回错误。比对失败由工厂以 unsupported 报告 |
| 授权 | 不需要主体资格。声明说明绑定的能力，不授予任何操作的资格 |
| 幂等 | 构造后不变，重复读取得到同一个值 |
| 并发 | 不可变值，可并发读取 |
| 事件 | 无 |
| 生命周期 | 随 Journal 绑定。提供者换代时，新绑定的声明用于其后创建的 runtime。已创建的 runtime 在运行时遇到未声明的提交种类，在保存任何状态之前返回 unsupported；Journal 的每次直接调用在写入前核对绑定模式与所需支持 |

工厂用来比对的“装配会用到的种类”与协调模式由[通用工厂](../../../agent/docs/public-api.md#工厂配置)的配置 `jointCommits` 与 `coordination` 给出。

commit、open、attach、load、recordResult、recordControl、prepareFinish、tryFinish、commitSettlement、recordTerminalObservation、detach 与 reconcile 的行为，包括条件提交、修订分配、认回与未知结果的查询、终结的排序、终结责任清单、终态后观察、ended 之后的保留与释放，唯一行为源是 SPEC 的“[并发与提交](../../SPEC.md#并发与提交)”与“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”。共同提交与提交参加者的四种响应见“[提交参加者协议](../../SPEC.md#提交参加者协议)”。本页不重复这些行为。

## 生产者接收面

[行为与约束](../../SPEC.md#生产者接收面)。

- [receiving.ts](../../src/receiving.ts)：两类接收面条目 `StartFenceEntry` 与 `ReceivedEntry`，它们的开放联合 `AgentJournalEntry`，`received` 条目的交付 `ReceivedDelivery`（按交付键的 kind 分支，账目交付必带该修订的 `CallAccount`），记录输入 `JournalEntryRecord` 与记录端口 `AgentJournalEntries`，账目出站的交接元组 `AgentAccountHandoff`、结果 `AgentAccountOutcome` 与端口 `AgentAccountOutlet`。
- [receiving.ts](../../src/receiving.ts) 还导出独立的 `AgentReceivedCommits`。`ReceivedCommitInput` 携带条目草稿与完整材料。`ReceivedCommitValue` 保留原命令回执、完整条目与原 saved 依据。`ReceivedCommitResult` 区分 committed 与 excluded，`ReceivedCommitQuery` 另含 unknown。`AgentReceivedProvider` 描述同一提供者的 journal、entries、materials 与固定 received 能力。类型没有增加旧端口的必需成员。
- [execution.ts](../../src/execution.ts)：`ExecutionSnapshot.entries` 是可选字段，提供者支持接收面条目时按提交顺序列出全部已提交条目。

接收面类型直接引用原拥有者的定义，不另定回执类型：`ReceivedDelivery` 的键是 `M.ModelDeliveryKey` 与 `T.ToolDeliveryKey`，Model 的账目快照是 `M.ModelAccountSnapshot`，账目是 call-account 的 `CallAccount`，流引用是 stream-arrival 的 `StreamRef` 与 `StreamProducer`，围栏操作号是 Tool 根入口的 `T.ToolOperationId`。Tool 的 `StartGuard` 与 `ToolStartFence` 在 Tool 的 `./provider` 入口，本包不导入，`StartFenceEntry.guard` 只记 Agent 自己拥有的守卫字段。

`AgentAccessOperation` 增加 `receive-result`，供结果接收方在写 `received` 条目之前核验推送主体。这是给闭合联合加成员，属破坏性改动，规则见 SPEC 的“[结果接收](../../SPEC.md#结果接收)”。它另含 `settle` 与 `migrate-cancellation`，供 commitSettlement 的候选、判断与迁移变体核验主体，规则见 SPEC 的“[commitSettlement 的变体](../../SPEC.md#commitsettlement-的变体)”；还含 `read-message-handoff`、`record-message-handoff` 与 `exclude-message-handoff`，供 MessageHandoff.lookup、Journal.recordHandoff 与 MessageHandoff.exclude 核验主体，规则见 SPEC 的“[主体资格核验](../../SPEC.md#主体资格核验)”。

`./testing` 入口由 [testing.ts](../../src/testing.ts) 定义：`agentJournalEntriesConformance` 与 `agentAccountOutletConformance` 两个一致性套件，非耐久替身 `createMemoryAgentJournalEntries` 与 `createMemoryAgentAccountOutlet`，各自的夹具工厂，以及套件用的样例值；Journal 核心一致性套件 `agentJournalCoreConformance` 及其夹具形状 `AgentJournalCoreFixture`、`AgentJournalCoreOpened` 与 `AgentJournalCoreOpenOptions`；套件与替身共用的测试取消政策 `createTestCancellationPolicy`、安装记录 `testCancellationPolicyInstallation`、三个 `TEST_CANCELLATION_*` 采用与宿主记录形状 `TestHostRecord`（见 [testing-cancellation.ts](../../src/testing-cancellation.ts)）。套件返回用例列表，不依赖测试框架，用例以 `node:assert` 的 AssertionError 失败。替身声明 `durability: 'none'`，不证明耐久、跨进程行为或真实 runtime。

条目套件的测试件 `AgentJournalEntriesFixture` 必须提供 `events` 读口：按序号给出一个 execution 的全部事件，execution 不存在时给 `undefined`。`entry` 事件的投影用例（SC-AG-240 至 SC-AG-249）读它核对条目与事件同一次写入成立、序号、`schema`、ended 之后不分配、重放不重复分配与拒绝不分配。两个控制可选：`detach` 与 `failNextRecord`（返回 Promise，故障按 execution 布置，只由该 execution 下一次走到写入步骤的 `record` 消耗，`RecordFault` 有 `commit-unknown` 与 `unavailable` 两种）。测试件缺少某个控制时，需要它的用例带 `uncovered` 且 `run` 必定拒绝；运行方按未覆盖报告，不当作通过。`ConformanceCase` 因此是判别联合，运行方以 `'uncovered' in case` 区分。两个替身用同一条投影规则与同一个事件格式采用，提供者声明自己的。

### 接收共同提交的使用与验证

结果接收方先检查 `provider.received` 非空，再调用 `commit`。调用方提供不含材料证据的条目草稿和完整 `Material`。committed 后使用 `value.saved` 返回生产者保存回执。`value.receipt.evidence`、`value.entry.material` 和 `value.saved` 分别是命令、材料和保存依据，不互相替换。响应未知时按原 operation 调用 `query`。unknown 或查询失败不表示未提交。详细规则归 [接收共同提交](../../SPEC.md#接收共同提交)。

原 `agentJournalEntriesConformance(fixture)` 继续验证旧条目端口。验证共同提交时，第二参数必须显式给出 `{ received: 'required', joint }`。缺少 joint、必需方法或共享 entries 引用时，套件立即失败。新用例与旧用例由同一入口返回，不自动探测或跳过共同提交能力。

```ts
import {
  agentJournalEntriesConformance,
  memoryReceivedCommitFixture,
} from '@omne-harness/agent-contract/testing'

const fixture = memoryReceivedCommitFixture(access, otherAccess)
const cases = agentJournalEntriesConformance(fixture, {
  received: 'required',
  joint: fixture.joint,
})
for (const testCase of cases) await testCase.run()
```

[`ReceivedCommitFixture`](../../src/testing-received-fixture.ts) 定义提供者适配的测试边界。entries、received、materials、窄 Journal.query 与原 fixture.read 必须对应同一公开状态。`bind` 显式设置原冻结消费、材料保管归属与完整载荷，`qualify` 设置当前测试资格。这些设置不证明真实装配已能解析主体或消费绑定。pause、fault、exclude、retainSaved 和 loseMaterial 只控制测试中的交错、故障和既有事实，不进入生产端口。inspect 补充读取该 execution 的 revision、条目数和保管材料数。套件同时经原 read、materials.read 与 Journal.query 检查公开结果。

[`memoryReceivedCommitFixture`](../../src/testing-received-memory.ts) 提供 `durability: 'none'` 的最小共享状态参考设施。它没有伪造完整 AgentJournal。新 commit 与旧 record 共用 operation、delivery 和材料状态。delivery 的冻结消费归属在提供者内按租户共享，跨 execution 的矛盾绑定不能建立第二份接收。材料页按 Model、Tool 的公开形状和内容判定器校验，校验不证明生产者已经保存这些材料。暂停的准备不公开材料，发布段一次建立所有事实。原 saved 缺失时不伪造证据，材料缺失时不补写历史。旧的两个替身工厂仍保留各自原有范围。

[`共同提交用例`](../../src/testing-received-conformance.ts) 覆盖 Model result、Model account、Tool result、Tool account 的保管与原回执认回，以及共同可见、确定失败、同操作和跨操作重试、并发、响应未知、权威排除与迟到提交、租户与当前资格、冻结绑定、暂停时资格撤销、ended 后保管和旧入口共存。[接收面测试](../../tests/receiving.spec.ts) 用材料提前可见、重复修订、回执 operation 被改写及 required 配置缺失核对套件能否检出错误。[类型测试](../../tests/receiving.spec-d.ts) 保留旧形状并核对新导出。运行入口仍为 `pnpm --filter @omne-harness/agent-contract test` 与 `typecheck`，仓库运行时经测试名额包装器调用。

这些证据只覆盖参考设施的内存行为与公开类型。Session 的真实保存、跨进程认回和生产者完整交付链须由实际提供者与消费者验证。

## 逐操作及输入分类

[行为与约束](../../SPEC.md#逐操作及输入分类)。

每个公开操作的输入、返回、错误、授权、幂等、并发、事件与生命周期，集中写在 SPEC 的逐操作要素表，本页的类型形状是其中输入与返回的来源。注入端口的要素写在各自的专题：请求准备、模型选择与 Runtime Context 读取见 SPEC 的“[请求接缝的逐操作要素](../../SPEC.md#请求接缝的逐操作要素)”，采用解析与交接见[定义专题](definition.md#采用解析与交接)。输入按四类分责：构造身份绑定、可序列化配置、单次操作参数和注入依赖。分类规则见[对象模型](../object-model.md#值参数与依赖)，工厂的配置项和依赖逐项分类见[通用工厂](../../../agent/docs/public-api.md)。

## 验证边界

[行为与约束](../../SPEC.md#验证边界)。

## 实现工厂

配置、依赖聚合及构造函数由 [通用实现](../../../agent/docs/public-api.md) 拥有。这里的提供者端口仍是可替换边界，不指定实现。

## Tool 引用的公开消费边界

`PendingCall.tool` 按 association 区分 intent 与 associated，禁止旧 call、admission 字段。`tool-active`、`tool-result`、`tool-background` 的 pending 必须是 associated，unresolved 可以保留 intent。`ActionJudgment.allowed.request` 使用 `T.ToolInvokeRequest`。完整材料、consumer 四字段投影及恢复规则由 [SPEC](../../SPEC.md#tool-调用关联与控制引用)拥有。

`ExecutionControl` 保持原公开输入。Tool `ControlRecord` 保存受理时的 toolInvocation 和 nullable toolOperation，非 Tool 分支不含这两个字段。`AgentJournal.recordControl` 增加可选 toolOperation，以原记录的调用快照校验迟到引用。先核当前资格与附件租户，以 resolver 的规范身份比较引用，再认回原 recording operation 或因异输入冲突，之后才校验新 target、保留引用与 stage。原 recording operation 增加畸形或非 Tool 附件也先 conflict，外租户先 denied。新 operation 附引用是真实写入。精确 invalid 的 field/reason、denied 的 action 及保留引用损坏的 unavailable 归 SPEC 的引用边界失败表。阶段不变时不重复事件或覆盖原阶段回执，详见 [Recording operation 与阶段事实](../../SPEC.md#recording-operation-与阶段事实)。这些是已采用的契约目标，源码类型与测试消费者迁移不由本文档写回证明。
