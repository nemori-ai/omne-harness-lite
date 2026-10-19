# Agent 公开入口与定义

当前根入口导出 `judgeAgentDefinition`、`judgeLoopExtensions` 及定义和扩展声明类型。推进、纯求值、执行与实例接口的设计已接受，尚未实现。

实际导出与公开校验由 [src/index.ts](../../src/index.ts) 及其导出模块拥有。下列声明是已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受、尚未实现的唯一设计定义，不是现有包的使用承诺。后继实现接管精确定义时，本页改为源码导航，不保留第二套手写签名。

行为、调用资格、参数与依赖分类归 [SPEC 的运行契约章节](../../SPEC.md#主干运行契约)。消费路径见 [context](../context.md)，对象关系见 [object-model](../object-model.md)。

## 身份、原位置与纯求值

[行为与约束](../../SPEC.md#身份原位置与纯求值)。

本页代码以 `M.*` 引用的名称（ModelCallId、ModelOperationId、AssembledModelInput、FixedModelRequest、ResultCapacity、ResultPage、ModelRuntime、ProfileResolution、Parameter、Supplier、Termination、ModelFault、DispatchRecord、RetryResolution）来自 [Model 契约的设计页](../../../../model/model-contract/docs/public-api.md)。`@omne-harness/model-contract` 的源码入口目前是模板，没有导出这些名称，在导出之前不能当作已落地的依赖。`T.*` 引用的名称由 `@omne-harness/tool-contract` 的源码入口导出。消息中的工具部件使用 `@omne-harness/message` 导出的 `ToolPart`。`Action.original` 把 `ToolPart` 收窄到 `kind: 'tool_call'`：动作只来自工具调用部件，不来自工具结果部件。

```ts
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Message, ToolPart } from '@omne-harness/message'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallAccount } from '@omne-harness/call-account'
import type { AgentDefinition } from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'

declare const agentIdentity: unique symbol
export type AgentIdentity<K extends string> = string & { readonly [agentIdentity]: K }
export type AgentInstanceId = AgentIdentity<'AgentInstanceId'>
export type StepId = AgentIdentity<'AgentStepId'>
export type ActionId = AgentIdentity<'AgentActionId'>
export type PassageId = AgentIdentity<'AgentPassageId'>
export type CardRoundId = AgentIdentity<'AgentCardRoundId'>
export type ActionBatchId = AgentIdentity<'AgentActionBatchId'>
export type AgentExecutionId = AgentIdentity<'AgentExecutionId'>
export type ExecutionAttachmentId = AgentIdentity<'ExecutionAttachmentId'>
export type AgentRegistrationId = AgentIdentity<'AgentRegistrationId'>
export type AgentOperationId = AgentIdentity<'AgentOperationId'>
export type ExecutionRevision = AgentIdentity<'ExecutionRevision'>
export type InputId = AgentIdentity<'AgentInputId'>
export type InputBatchId = AgentIdentity<'AgentInputBatchId'>
export type ConsumptionId = AgentIdentity<'AgentConsumptionId'>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type Evidence = Readonly<{ owner: string; record: string; revision: string; digest: string }>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
export type ConsumerRef = Readonly<{ owner: string; work: string; position: string; purpose: string }>
export type Authority = Readonly<{
  execution: AgentExecutionId; executionAttachment: ExecutionAttachmentId; instance: AgentInstanceId
  generation: string; source: Evidence
}>
export type Continuation = Readonly<{
  position: string; definition: Adoption; schema: Adoption; value: JsonValue
}>
export type ProducedResult = Readonly<{
  producer: Readonly<{ kind: 'model'; call: M.ModelCallId }> | Readonly<{ kind: 'tool'; call: T.ToolCallId }>
  version: string; delivery: string | null; source: Evidence
}>
export type InputBatch = Readonly<{
  id: InputBatchId; watermark: Evidence; ordered: readonly InputId[]
}>
export type ProgressionDirective =
  | Readonly<{ kind: 'evaluate-completion'; basis: Evidence }>
  | Readonly<{ kind: 'continue'; basis: Evidence }>
export type Waiting =
  | Readonly<{ kind: 'producer'; pending: PendingCall }>
  | Readonly<{ kind: 'human'; passage: PassageId; cards: readonly Evidence[] }>
  | Readonly<{ kind: 'dependency'; owner: string; position: string }>
export type AgentConclusion =
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'fail' | 'cancelled'; cause: Evidence }>
export type FailureCandidate = Readonly<{ step: StepId | null; at: AgentInstant; source: Evidence }> & (
  | Readonly<{
      kind: 'cannot-fit'; reason: 'fixed' | 'after-compaction'; context: Evidence
      veto?: Evidence; rejection?: Evidence; plan?: CompactionProgress
    }>
  | Readonly<{
      kind: 'compaction-invalid'; plan: Evidence
      progress?: Readonly<{ expected: CompactionProgress; returned: CompactionProgress }>
      transition?: Evidence
    }>
  | Readonly<{ kind: 'request-rejected'; failure: Extract<Failure, { kind: 'invalid' }>; model: Evidence; selection: Evidence }>
  | Readonly<{ kind: 'no-reply'; call: M.ModelCallId; result: ProducedResult }>
  | Readonly<{ kind: 'message-rejected'; from: MessageSource; evidence: Evidence }>
  | Readonly<{ kind: 'extension-stop'; passage: PassageId; reason: string }>
  | Readonly<{ kind: 'guard'; level: 3; basis: Evidence }>
)
export type PreparedContextTransition = Readonly<{
  preparation: ActionId; message: Message; source: Evidence
  derivation: Evidence; commitment: Evidence
}>
export type Failure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'stale-advance' | 'not-ready' | 'terminal' | 'busy' | 'changed' | 'unsupported' }>
  | Readonly<{ kind: 'commit-unknown'; operation: AgentOperationId }>
  | Readonly<{ kind: 'conflict'; operation: AgentOperationId }>
export type Reply<A> = Promise<Outcome<A, Failure>>
export type ModelPurpose = 'main' | 'compaction' | 'extension'
export type PendingCall = Readonly<{
  action: ActionId; consumption: ConsumptionId; position: ConsumerRef
  fixed: Evidence
}> & (
  | Readonly<{ kind: 'model'; call: M.ModelCallId; admission: M.ModelOperationId; purpose: ModelPurpose }>
  | Readonly<{ kind: 'tool'; call: T.ToolCallId; admission: T.ToolOperationId; purpose: 'action' }>
)
export type ActionJudgment =
  | Readonly<{ kind: 'pending'; passage: PassageId }>
  | Readonly<{ kind: 'waiting'; passage: PassageId; cards: readonly Evidence[] }>
  | Readonly<{ kind: 'denied'; evidence: Evidence }>
  | Readonly<{ kind: 'allowed'; evidence: Evidence; request: T.FixedToolRequest }>
export type Action = Readonly<{
  id: ActionId; original: ToolPart & Readonly<{ kind: 'tool_call' }>; effectiveArguments: string
  judgment: ActionJudgment; call: PendingCall | null
}>
export type ActionBarrier =
  | Readonly<{
      kind: 'closed'; judging: readonly ActionId[]
      asked: readonly Readonly<{ action: ActionId; passage: PassageId; round: CardRoundId }>[]
    }>
  | Readonly<{ kind: 'open'; evidence: Evidence; approved: readonly [ActionId, ...ActionId[]] }>
  | Readonly<{ kind: 'all-denied'; evidence: Evidence }>
export type ActionSlot = Readonly<{
  action: ActionId
  each: readonly PassageId[] | null; candidate: Message | null; handoff: Evidence | null
}> & (
  | Readonly<{ kind: 'denied'; evidence: Evidence }>
  | Readonly<{ kind: 'dispatched' }>
  | Readonly<{ kind: 'result'; result: ProducedResult; terminal: T.ToolTerminal; custody: Evidence }>
  | Readonly<{ kind: 'background'; placeholder: ProducedResult; confirmation: Evidence }>
)
export type ActionBatch = Readonly<{
  id: ActionBatchId; source: ProducedResult; actions: readonly Action[]
  barrier: ActionBarrier; slots: readonly ActionSlot[]; batchPass: readonly PassageId[] | null
}>
export type ModelReplyAdmission = Readonly<{
  step: StepId; action: ActionId; call: M.ModelCallId; resultVersion: string
  decision: 'admitted' | 'rejected'; source: Evidence
}>
export type ReplyAdmissionProjection = Readonly<{
  through: Evidence; rule: Adoption; lastAdmission: Evidence | null
  consecutiveDenials: string; totalDenials: string
}>
export type ReplyAdmissionPage =
  | Readonly<{
      kind: 'page'; through: Evidence
      items: readonly Readonly<{ sequence: string; fact: ModelReplyAdmission }>[]
      next: string | null; complete: boolean
    }>
  | Readonly<{ kind: 'gap'; recovery: Evidence }>
export type GuardLevel = 0 | 1 | 2 | 3
export type GuardFact = Readonly<{
  level: GuardLevel; policy: Adoption; through: Evidence; basis: Evidence
  passage: PassageId; at: AgentInstant
}>
export type AgentCheckpoint = Readonly<{
  schema: Adoption; definition: Adoption; step: StepId; position: string
  calls: readonly PendingCall[]; passages: readonly Passage[]
  batch: ActionBatch | null; inputBatch: InputBatchId | null
  requestPreparation: Preparation | null; compaction: CompactionState | null
  adoptedContext: Evidence | null; guard: GuardFact | null
  completedPassages: readonly PassageId[]; priorConditions: Evidence | null
}>
export type RuntimeConditions = Readonly<{
  source: Evidence; configuration: Adoption; progression: ProgressionDirective
  model: Adoption; context: Evidence; bindings: readonly Adoption[]
}>
export type ProducerDecisionView =
  | Readonly<{ kind: 'unresolved'; pending: PendingCall; source: Evidence }>
  | Readonly<{ kind: 'model-active'; pending: Extract<PendingCall, { kind: 'model' }>; source: Evidence }>
  | Readonly<{ kind: 'model-settled'; pending: Extract<PendingCall, { kind: 'model' }>; result: ProducedResult; source: Evidence }>
  | Readonly<{
      kind: 'tool-active'; pending: Extract<PendingCall, { kind: 'tool' }>; source: Evidence
      waiting: 'none' | 'external' | 'human'; supportedControls: readonly ('interrupt' | 'background')[]
    }>
  | Readonly<{ kind: 'tool-result'; pending: Extract<PendingCall, { kind: 'tool' }>; result: ProducedResult; source: Evidence }>
  | Readonly<{
      kind: 'tool-background'; pending: Extract<PendingCall, { kind: 'tool' }>
      placeholder: ProducedResult; confirmation: Evidence; source: Evidence
    }>
export type AdvancementFact = Readonly<{
  kind: 'current' | 'stopping' | 'ended' | 'superseded'; source: Evidence
}>
export type LoopFacts = Readonly<{
  advancement: AdvancementFact; checkpoint: AgentCheckpoint
  conditions: RuntimeConditions; batch: InputBatch; inputs: readonly Message[]
  producers: readonly ProducerDecisionView[]; consumption: readonly ResultResponsibility[]
  replyAdmissions: ReplyAdmissionProjection
  controls: readonly ControlRecord[]
}>
export type Next =
  | Readonly<{ kind: 'reconcile'; calls: readonly PendingCall[] }>
  | Readonly<{ kind: 'take-inputs'; position: string }>
  | Readonly<{ kind: 'prepare-request'; step: StepId; previous: Preparation | null }>
  | Readonly<{ kind: 'compact-derive'; original: Extract<Preparation, { kind: 'needs-compaction' }>; progress: CompactionProgress; result: Readonly<{ produced: ProducedResult; consumed: Evidence }> | null }>
  | Readonly<{ kind: 'commit-transition'; value: PreparedContextTransition }>
  | Readonly<{ kind: 'resume-request'; original: Extract<Preparation, { kind: 'needs-compaction' }>; transition: Evidence }>
  | Readonly<{ kind: 'extension'; passage: PassageId }>
  | Readonly<{ kind: 'admit-model'; preparation: Extract<Preparation, { kind: 'ready' }> }>
  | Readonly<{ kind: 'admit-message'; source: MessageSource; candidate: Message }>
  | Readonly<{ kind: 'admit-tools'; batch: ActionBatch }>
  | Readonly<{ kind: 'consume'; consumption: ConsumptionId; result: ProducedResult }>
  | Readonly<{ kind: 'wait'; waiting: readonly Waiting[] }>
  | Readonly<{ kind: 'try-finish'; conclusion: AgentConclusion; failure: FailureCandidate | null }>
  | Readonly<{ kind: 'stop'; reason: 'cancelled' | 'terminal' | 'superseded' | 'suspended' }>
export interface AgentEvaluator {
  initial(input: Readonly<{ definition: Adoption; step: StepId }>): Outcome<AgentCheckpoint, Failure>
  next(input: LoopFacts): Outcome<Next, Failure>
  encode(value: AgentCheckpoint): Continuation
  decode(value: Continuation): Outcome<AgentCheckpoint, Failure>
}
```

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

本节引用 Model 契约设计页中已有的 `M.ProfileResolution` 与 `M.Parameter`、`M.AssembledModelInput`、`M.FixedModelRequest` 和 `M.ResultCapacity`。`@omne-harness/model-contract` 的源码入口目前是模板，这些名称在导出之前都不能当作已落地的依赖。`ModelPurpose`、`ModelRecipient`、`SelectedModel`、`ModelContextRead`、`CompactionProgress`、`CompactionAdvance`、`CompactionState` 与 `FinalRequest` 由本页定义为 Agent 自有的端口形状。它们不是 Model 或 Context 的导出。Context 一侧对应接缝的方向已接受，Context 契约的文字尚未写出，见算法页的接口增量与开放问题。

```ts
export type ModelRecipient = Readonly<{ route: string; profile: Adoption }>
export type SelectedModel = Readonly<{
  recipient: ModelRecipient
  resolution: Extract<M.ProfileResolution, { kind: 'resolved' }> & Readonly<{ selectable: true }>
  parameters: readonly M.Parameter[]
  tools: Evidence
  evidence: Evidence
}>
export interface ModelSelection<P> {
  select(input: Access<P> & Readonly<{
    advance: Authority; scope: Evidence; purpose: ModelPurpose
    position: ConsumerRef; history: Evidence
    conditions: RuntimeConditions; alterations: readonly Evidence[]
  }>): Reply<SelectedModel>
}
export type ContextContent = 'full' | 'incremental'
export type ModelContextRead = Readonly<{
  recipient: ModelRecipient; content: ContextContent
  source: Evidence; coverage: Evidence
}>
export interface ModelContextReader<P> {
  read(input: Access<P> & Readonly<{
    advance: Authority; position: ConsumerRef; recipient: ModelRecipient
    history: Evidence; adopted: Evidence | null; transition: Evidence | null
  }>): Reply<ModelContextRead>
}
export type CompactionProgress = Readonly<{ plan: Evidence; bound: string; completed: string }>
export type Preparation = Readonly<{
  id: ActionId; purpose: ModelPurpose
  position: ConsumerRef; source: Evidence; state: JsonValue; schema: Adoption
}> & (
  | Readonly<{
      kind: 'assembled'; input: M.AssembledModelInput; budget: Evidence
      recipient: ModelRecipient; coverage: Evidence
    }>
  | Readonly<{
      kind: 'ready'; request: M.FixedModelRequest; capacity: M.ResultCapacity; budget: Evidence
      recipient: ModelRecipient; coverage: Evidence
    }>
  | Readonly<{
      kind: 'needs-compaction'
      original: Readonly<{ input: Evidence; alterations: readonly Evidence[]; beforeModelCall: readonly PassageId[] | null }>
      progress: CompactionProgress
    }>
  | Readonly<{ kind: 'cannot-fit'; reason: 'fixed' | 'after-compaction'; diagnostic: string }>
)
export type CompactionAdvance =
  | Readonly<{ kind: 'continue'; progress: CompactionProgress; stepRequest: Extract<Preparation, { kind: 'ready' }> }>
  | Readonly<{ kind: 'transition'; progress: CompactionProgress; value: PreparedContextTransition }>
  | Readonly<{ kind: 'cannot-fit'; progress: CompactionProgress; reason: 'after-compaction'; diagnostic: string }>
export type CompactionState = Readonly<{
  action: ActionId; progress: CompactionProgress; initiated: string
  stepRequest: Extract<Preparation, { kind: 'ready' }> | null
  ended: 'committed' | 'failed' | null
}>
export type FinalRequest = Readonly<{
  preparation: ActionId; request: M.FixedModelRequest; capacity: M.ResultCapacity
  recipient: ModelRecipient; coverage: Evidence; alterations: readonly Evidence[]
}>
export interface RequestPreparation<P> {
  prepare(input: Access<P> & Readonly<{
    advance: Authority; action: ActionId; purpose: Exclude<ModelPurpose, 'compaction'>
    position: ConsumerRef; history: Evidence; inputs: InputBatch
    conditions: RuntimeConditions; selection: SelectedModel; context: ModelContextRead
    previous: Preparation | null; alterations: readonly Evidence[]
    beforeModelCall: readonly PassageId[] | null
  }>): Reply<Preparation>
  derive(input: Access<P> & Readonly<{
    advance: Authority; original: Extract<Preparation, { kind: 'needs-compaction' }>
    progress: CompactionProgress; action: ActionId; selection: SelectedModel
    result: Readonly<{ produced: ProducedResult; consumed: Evidence }> | null
  }>): Reply<CompactionAdvance>
  resume(input: Access<P> & Readonly<{
    advance: Authority; original: Extract<Preparation, { kind: 'needs-compaction' }>
    transition: Evidence; selection: SelectedModel; context: ModelContextRead
  }>): Reply<Preparation>
}
export interface CurrentConditions<P> {
  read(input: Access<P> & Readonly<{ advance: Authority; previous: Evidence | null }>): Reply<RuntimeConditions>
}
```

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

扩展作者接口的类型由[扩展作者协议](extensions.md)声明，本页不重复声明。本节代码引用其中一部分类型。各类型的声明位置如下：

| 类型 | 声明位置 |
| --- | --- |
| `Position`、`Dimension`、`Power`、`ErrorPolicy`、`UnavailabilityPolicy`、`ExtensionImplementationDeclaration`、`LoopExtensionDeclaration` | [声明](extensions.md#声明) |
| `ExtensionInput` | [输入](extensions.md#输入) |
| `ExtensionOutput`、`DecisionCardDraft`、`CardOption` | [输出](extensions.md#输出) |
| `ActionIdentity`、`Conclusion` | [Conclusion](extensions.md#conclusion) |
| `ExtensionInvocationMode`、`ExtensionReplayBinding`、`ExtensionInvocationResult`、`LoopExtensionImplementation` | [调用协议](extensions.md#调用协议) |

源码根入口已导出同名的 `Position`、`Power` 与 `LoopExtensionDeclaration`，它们是现有声明判断的形状：源码的 `Position` 含已移除的位置，源码的声明缺 `needs`、`implementation`、`onError` 与 `unavailability` 四个字段并按位置分支限制干预力，`Power` 的三档与设计相同。差异见[实施差异](../../verification/coverage.md#实施差异)。实施时以扩展作者协议的类型替换源码的同名类型。

```ts
export type CapturedRead = Readonly<{ schema: Adoption; value: JsonValue; source: Evidence }>
export type CardRequest = Readonly<{ identity: string; schema: Adoption; value: JsonValue }>
export type CardAnswer =
  | Readonly<{ kind: 'chosen'; option: string; value: JsonValue | null; evidence: Evidence }>
  | Readonly<{ kind: 'declined'; evidence: Evidence }>
export type CardReply =
  | CardAnswer
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'invalidated'; evidence: Evidence }>
export type PassageCard = Readonly<{
  identity: string; card: Evidence
  response: Exclude<CardReply, { kind: 'pending' }> | null; processed: Evidence | null
}>
export type PassageOperationProgress<R> =
  | Readonly<{ kind: 'requested' }>
  | Readonly<{ kind: 'resolved'; result: R }>
  | Readonly<{ kind: 'applied'; result: R; transition: Evidence }>
export type CardRoundProgress =
  | Readonly<{ kind: 'requested' }>
  | Readonly<{ kind: 'presented'; cards: readonly PassageCard[] }>
  | Readonly<{ kind: 'answered'; cards: readonly PassageCard[] }>
  | Readonly<{ kind: 'processed'; cards: readonly PassageCard[]; conclusion: Evidence }>
  | Readonly<{ kind: 'present-failed'; failure: Evidence }>
export type CardRound = Readonly<{
  round: CardRoundId
  ask: Conclusion & Readonly<{ output: Extract<ExtensionOutput, { kind: 'ask' }> }>
  requests: readonly CardRequest[]; progress: CardRoundProgress
}>
export type PassageOperation = Readonly<{
  action: ActionId; ordinal: number; input: Evidence
}> & (
  | Readonly<{
      kind: 'producer'; pending: Extract<PendingCall, { kind: 'model' }>
      progress: PassageOperationProgress<Readonly<{ result: ProducedResult; consumed: Evidence }>>
    }>
  | Readonly<{
      kind: 'read'; owner: string; protocol: Adoption; query: JsonValue
      progress: PassageOperationProgress<CapturedRead>
    }>
  | Readonly<{ kind: 'guard'; progress: PassageOperationProgress<GuardFact> }>
)
export type PassageProgress =
  | Readonly<{ kind: 'requested'; mode: ExtensionInvocationMode }>
  | Readonly<{ kind: 'asked'; rounds: readonly [CardRound, ...CardRound[]] }>
  | Readonly<{ kind: 'resolved'; rounds: readonly CardRound[]; conclusion: Conclusion }>
  | Readonly<{ kind: 'applied'; rounds: readonly CardRound[]; conclusion: Conclusion; transition: Evidence }>
export type Passage = Readonly<{
  id: PassageId; position: Position; dimension: Dimension | null
  purpose: 'main' | 'compaction' | null; action: ActionId | null; ordinal: number
  declaration: LoopExtensionDeclaration; implementation: Adoption
  input: Evidence; effective: Evidence
  operations: readonly PassageOperation[]; progress: PassageProgress
}>
export type Subject =
  | Readonly<{ execution: AgentExecutionId; conditions: Evidence }>
  | Readonly<{ preparation: Extract<Preparation, { kind: 'needs-compaction' }> }>
  | Readonly<{ transition: PreparedContextTransition }>
  | Readonly<{ purpose: 'main'; preparation: Extract<Preparation, { kind: 'assembled' }> }>
  | Readonly<{ purpose: 'compaction'; step: Extract<Preparation, { kind: 'ready' }>; progress: CompactionProgress }>
  | Readonly<{
      purpose: 'main' | 'compaction'; call: M.ModelCallId; result: ProducedResult
      reply: Message; termination: M.Termination; account: CallAccount | null
    }>
  | Readonly<{
      purpose: 'main' | 'compaction'; call: M.ModelCallId; request: M.FixedModelRequest
      fault: M.ModelFault; dispatches: readonly M.DispatchRecord[]; retry: M.RetryResolution | null
    }>
  | Readonly<{
      action: ActionId; original: Action['original']; effectiveArguments: string
      definition: T.ToolDefinition; batch: readonly ActionId[]
    }>
  | Readonly<{
      action: ActionId; candidate: Message
      outcome: Readonly<{ kind: 'denied'; evidence: Evidence }> | Readonly<{ kind: 'executed'; result: ProducedResult; terminal: T.ToolTerminal }>
    }>
  | Readonly<{
      batch: ActionBatchId
      outcomes: readonly Readonly<{ action: ActionId; outcome: 'denied' | 'executed'; terminal: T.ToolTerminal | null }>[]
    }>
  | Readonly<{ proposed: AgentConclusion; basis: Evidence }>
  | Readonly<{ terminal: AgentConclusion; disposition: Evidence }>
export interface ExtensionImplementations<P> {
  resolve(input: Access<P> & Readonly<{ passage: Passage }>): Reply<LoopExtensionImplementation>
}
export interface DecisionCards<P> {
  present(input: Access<P> & Readonly<{
    advance: Authority; passage: PassageId; round: CardRoundId; original: Evidence
    requests: readonly CardRequest[]
  }>): Reply<readonly Evidence[]>
  lookup(input: Access<P> & Readonly<{
    passage: PassageId; round: CardRoundId; original: Evidence; requests: readonly string[]
  }>): Reply<
    Readonly<{ kind: 'presented'; cards: readonly Evidence[] }>
    | Readonly<{ kind: 'not-presented'; exclusion: Evidence }>
    | Readonly<{ kind: 'unknown' }>
  >
  read(input: Access<P> & Readonly<{ card: Evidence }>): Reply<CardReply>
  invalidate(input: Access<P> & Readonly<{
    operation: AgentOperationId; passage: PassageId; round: CardRoundId
    cards: readonly Evidence[]; reason: Evidence
  }>): Reply<readonly Readonly<{ card: Evidence; reply: Exclude<CardReply, { kind: 'pending' }> }>[]>
}
export type AdmissionDecision =
  | Readonly<{ kind: 'allow'; evidence: Evidence }>
  | Readonly<{ kind: 'deny'; reason: string; evidence: Evidence }>
  | Readonly<{ kind: 'need-decision'; card: DecisionCardDraft; evidence: Evidence }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ActionAdmission<P> {
  admit(input: Access<P> & Readonly<{
    advance: Authority; execution: AgentExecutionId; passage: PassageId
    action: ActionId; original: Action['original']; effectiveArguments: string
    definition: Adoption; permissions: CapturedRead | null
    decision: Readonly<{ card: Evidence; answer: CardAnswer }> | null
  }>): Reply<AdmissionDecision>
}
export type MessageSource =
  | Readonly<{ kind: 'external-input'; input: InputId }>
  | Readonly<{ kind: 'model-reply'; step: StepId; action: ActionId; call: M.ModelCallId; result: ProducedResult }>
  | Readonly<{ kind: 'tool-result'; action: ActionId; call: T.ToolCallId; result: ProducedResult }>
  | Readonly<{ kind: 'action-denied'; action: ActionId; evidence: Evidence }>
  | Readonly<{ kind: 'reminder'; passage: PassageId }>
  | Readonly<{ kind: 'context-transition'; transition: PreparedContextTransition }>
export type HandoffResult =
  | Readonly<{ kind: 'accepted'; admission: Evidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: Evidence }>
export interface MessageHandoff<P> {
  accept(input: Access<P> & Readonly<{
    execution: AgentExecutionId; operation: AgentOperationId; advance: Authority | null
    source: MessageSource; candidate: Message
  }>): Reply<HandoffResult>
}
export type Material<B extends ContentBlock> =
  | Readonly<{ kind: 'model'; result: ProducedResult; pages: readonly M.ResultPage[] }>
  | Readonly<{ kind: 'tool'; result: ProducedResult; pages: readonly T.ResultPage<B>[] }>
  | Readonly<{ kind: 'facts'; schema: Adoption; value: JsonValue }>
export interface AgentMaterials<P, B extends ContentBlock> {
  preserve(input: Access<P> & Readonly<{
    identity: string; consumer: ConsumerRef; value: Material<B>
  }>): Reply<Evidence>
  read(input: Access<P> & Readonly<{ source: Evidence }>): Reply<Material<B>>
}
export interface RegisteredReads<P> {
  read(input: Access<P> & Readonly<{
    action: ActionId; passage: PassageId; original: Evidence
    owner: string; protocol: Adoption; query: JsonValue
  }>): Reply<Readonly<{ kind: 'captured'; value: CapturedRead }> | Readonly<{ kind: 'unknown' }>>
  lookup(input: Access<P> & Readonly<{
    action: ActionId; passage: PassageId; original: Evidence
  }>): Reply<
    Readonly<{ kind: 'captured'; value: CapturedRead }>
    | Readonly<{ kind: 'excluded'; evidence: Evidence }>
    | Readonly<{ kind: 'unknown' }>
  >
}
```

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

[对象状态及协议](../object-model.md)。以下声明与前文属于同一模块。所有 ID、Evidence 和 Authority 均须在边界验证；结构相同不代表来自可信拥有者。

```ts
export type ExecutionState =
  | Readonly<{ kind: 'reconciling' | 'advancing' }>
  | Readonly<{ kind: 'waiting'; waits: readonly Waiting[] }>
  | Readonly<{ kind: 'settling'; intent: FinishIntent }>
  | Readonly<{ kind: 'suspended'; handoff: Evidence }>
  | Readonly<{ kind: 'ended'; conclusion: AgentConclusion; disposition: Evidence }>
export type ExecutionSnapshot = Readonly<{
  execution: AgentExecutionId; revision: ExecutionRevision; state: ExecutionState
  checkpoint: AgentCheckpoint; inputWatermark: Evidence; history: Evidence
  replyAdmissions: ReplyAdmissionProjection
  executionAttachment: Authority | null; unresolved: readonly AgentOperationId[]
  controls: readonly ControlRecord[]; results: readonly ResultResponsibility[]
  effects: readonly EffectIntent[]; terminalObservations: readonly TerminalObservation[]
  output: Readonly<{ emittedThrough: string | null; acknowledgedThrough: string | null }>
}>
export type AgentState =
  | Readonly<{ kind: 'idle'; instance: AgentInstanceId }>
  | Readonly<{ kind: 'occupied'; instance: AgentInstanceId; execution: AgentExecutionId; executionAttachment: ExecutionAttachmentId }>
  | Readonly<{ kind: 'draining'; instance: AgentInstanceId; unresolved: readonly AgentExecutionId[] }>
  | Readonly<{ kind: 'disposed'; instance: AgentInstanceId }>
export type AcceptedInput = Readonly<{
  id: InputId; content: Message; source: Evidence | null; priority: 'ordinary' | 'urgent'
}>
export type TerminalObservation = Readonly<{
  terminal: Evidence; passage: PassageId; implementation: Adoption
  observed: Evidence | null
}>
export type FinishIntent = Readonly<{
  conclusion: AgentConclusion; inputWatermark: Evidence
  obligations: Evidence; beforeTerminal: Evidence | null
  failure: FailureCandidate | null
}>
export type FinishResult =
  | Readonly<{ kind: 'ended'; receipt: CommandReceipt }>
  | Readonly<{ kind: 'changed'; revision: ExecutionRevision }>
  | Readonly<{
      kind: 'blocked'; reason: 'inputs' | 'controls' | 'operations' | 'passages' | 'custody'
      source: Evidence
    }>
export type FinishAuthorization =
  | Readonly<{ kind: 'advancement'; authority: Authority }>
  | Readonly<{ kind: 'cancel'; control: AgentOperationId; source: Evidence }>
export type ExecutionControl =
  | Readonly<{ kind: 'interrupt-model'; call: M.ModelCallId; reason: Evidence }>
  | Readonly<{ kind: 'interrupt-tool' | 'background-tool'; call: T.ToolCallId; reason: Evidence }>
  | Readonly<{ kind: 'cancel'; reason: Evidence }>
  | Readonly<{ kind: 'suspend'; reason: Evidence }>
export type ControlStage =
  | 'accepted' | 'intent-established' | 'qualification-revoked'
  | 'producer-confirmed' | 'physically-stopped' | 'duty-released'
export type ControlStageFact = Readonly<{ state: 'reached' | 'unresolved'; source: Evidence }>
export type ControlRecord = Readonly<{
  operation: AgentOperationId; command: ExecutionControl
  stages: Readonly<{ accepted: ControlStageFact }
    & Partial<Record<Exclude<ControlStage, 'accepted'>, ControlStageFact>>>
}>
export type ResultResponsibility = Readonly<{
  result: ProducedResult; consumption: ConsumptionId
  custody: Evidence | null; completion: Evidence | null
  release: Readonly<{ kind: 'pending' }> | Readonly<{ kind: 'confirmed'; receipt: Evidence }>
}>
export type ExecutionMutation<P> = Access<P> & Readonly<{
  execution: AgentExecutionId; operation: AgentOperationId
}>
export type CommandReceipt = Readonly<{
  operation: AgentOperationId; execution: AgentExecutionId
  revision: ExecutionRevision; evidence: Evidence; state: 'accepted' | 'applied' | 'unresolved'
}>
export type AgentEventBody =
  | Readonly<{ kind: 'input-taken'; batch: InputBatch }>
  | Readonly<{ kind: 'message'; message: Message; source: Evidence }>
  | Readonly<{ kind: 'producer'; result: ProducedResult; consumption: ConsumptionId }>
  | Readonly<{ kind: 'stream'; producer: ProducedResult['producer']; cursor: string; source: Evidence; schema: Adoption; value: JsonValue }>
  | Readonly<{ kind: 'waiting'; waits: readonly Waiting[] }>
  | Readonly<{ kind: 'control'; operation: AgentOperationId; stage: ControlStage; state: 'reached' | 'unresolved'; source: Evidence }>
  | Readonly<{ kind: 'ended'; conclusion: AgentConclusion; disposition: Evidence }>
export type AgentEvent = Readonly<{
  execution: AgentExecutionId; sequence: string; executionAttachment: ExecutionAttachmentId
  schema: Adoption; cause: Evidence; body: AgentEventBody
}>
export type EventPage =
  | Readonly<{ kind: 'page'; events: readonly AgentEvent[]; next: string; caughtUp: boolean }>
  | Readonly<{ kind: 'gap'; retainedFrom: string; recovery: Evidence }>
export interface AgentExecutionInput<P> {
  submit(input: ExecutionMutation<P> & Readonly<{ value: AcceptedInput }>): Reply<CommandReceipt>
}
export interface AgentExecutionControl<P> {
  control(input: ExecutionMutation<P> & Readonly<{ command: ExecutionControl }>): Reply<CommandReceipt>
}
export interface AgentExecutionEvents<P> {
  read(input: Access<P> & Readonly<{ execution: AgentExecutionId; after: string | null; limit: number }>): Reply<EventPage>
  events(input: Access<P> & Readonly<{ execution: AgentExecutionId; after: string | null; signal: AbortSignal }>): AsyncIterable<Outcome<EventPage, Failure>>
  acknowledge(input: ExecutionMutation<P> & Readonly<{ through: string; receipt: Evidence | null }>): Reply<CommandReceipt>
}
export interface AgentExecutionHandle<P> {
  readonly execution: AgentExecutionId
  readonly input: AgentExecutionInput<P>
  readonly control: AgentExecutionControl<P>
  readonly output: AgentExecutionEvents<P>
}
export interface AgentRuntime<P> {
  readonly instance: AgentInstanceId
  invoke(input: ExecutionMutation<P> & Readonly<{ initial: AcceptedInput; grant: Evidence | null }>): Reply<AgentExecutionHandle<P>>
  resume(input: ExecutionMutation<P> & Readonly<{ recovery: Evidence; grant: Evidence | null }>): Reply<AgentExecutionHandle<P>>
}
export type AgentObservation =
  | Readonly<{ kind: 'state'; value: AgentState }>
  | Readonly<{ kind: 'ended'; reason: 'closed' | 'denied' | 'retired' | 'unavailable' }>
export interface AgentHandle<P> {
  readonly instance: AgentInstanceId
  observe(input: Access<P> & Readonly<{ signal: AbortSignal }>): AsyncIterable<AgentObservation>
}
export interface AgentDirectory<P> {
  resolve(input: Access<P> & Readonly<{ instance: AgentInstanceId }>): Reply<AgentRuntime<P>>
  connect(input: Access<P> & Readonly<{ instance: AgentInstanceId }>): Reply<
    Readonly<{ kind: 'live'; handle: AgentHandle<P> }> | Readonly<{ kind: 'no-live-route' }>
  >
}
export interface AgentExecutionRecovery<P> {
  query(input: ExecutionMutation<P>): Reply<
    Readonly<{ kind: 'committed'; receipt: CommandReceipt }>
    | Readonly<{ kind: 'excluded'; evidence: Evidence }>
    | Readonly<{ kind: 'unknown' }>
  >
  load(input: Access<P> & Readonly<{ execution: AgentExecutionId }>): Reply<ExecutionSnapshot>
  reconcile(input: ExecutionMutation<P>): Reply<Readonly<{ remaining: readonly ConsumptionId[]; evidence: Evidence }>>
  detach(input: ExecutionMutation<P> & Readonly<{ authority: Authority; reason: Evidence }>): Reply<Evidence>
}
export interface AgentAdoptions<P> {
  resolve(input: Access<P> & Readonly<{ adoption: Adoption }>): Reply<Readonly<{
    definition: AgentDefinition; evaluator: AgentEvaluator; extensions: readonly LoopExtensionDeclaration[]
  }>>
  handover(input: Access<P> & Readonly<{
    from: Adoption; to: Adoption; snapshot: ExecutionSnapshot; original: Continuation
  }>): Reply<Readonly<{ continuation: Continuation; evidence: Evidence }>>
}
export type RegistrationState = 'published' | 'withdrawing' | 'withdrawn'
export type Registration = Readonly<{ registration: AgentRegistrationId; state: RegistrationState }>
export interface AgentRegistrationHandle<P> {
  readonly instance: AgentInstanceId
  report(input: Readonly<{ state: AgentState }>): void
  withdraw(input: Access<P> & Readonly<{ operation: AgentOperationId; reason: Evidence }>): Reply<Registration | null>
}
export interface AgentInstanceHost<P> {
  reserve(input: Access<P> & Readonly<{ operation: AgentOperationId; scope: Evidence; definition: Adoption }>): Reply<Readonly<{
    instance: AgentInstanceId; registration: AgentRegistrationHandle<P>
  }>>
  publish(input: Access<P> & Readonly<{ operation: AgentOperationId; instance: AgentInstanceId; scope: Evidence; state: AgentState }>): Reply<Registration>
  withdraw(input: Access<P> & Readonly<{ operation: AgentOperationId; instance: AgentInstanceId; registration: AgentRegistrationId }>): Reply<Registration>
  readonly directory: AgentDirectory<P>
}
export type QuiesceResult = Readonly<{
  kind: 'drained' | 'unresolved'; remaining: readonly AgentExecutionId[]; evidence: Evidence
}>
export interface AgentRuntimeControl<P> {
  quiesce(input: Access<P> & Readonly<{ operation: AgentOperationId; reason: Evidence }>): Reply<QuiesceResult>
}
export type AgentAccessOperation =
  | 'invoke' | 'resume' | 'submit' | 'control' | 'read' | 'events' | 'acknowledge'
  | 'takeover' | 'observe' | 'resolve' | 'connect' | 'reserve' | 'publish' | 'withdraw' | 'quiesce'
  | 'query' | 'load' | 'reconcile' | 'detach' | 'record-terminal-observation'
export type AgentAccessTarget =
  | Readonly<{ kind: 'scope'; scope: Evidence; definition: Adoption }>
  | Readonly<{ kind: 'instance'; instance: AgentInstanceId }>
  | Readonly<{ kind: 'execution'; instance: AgentInstanceId; execution: AgentExecutionId }>
export type AgentAccessDecision =
  | Readonly<{ kind: 'allowed'; evidence: Evidence }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface AgentAccessCheck<P> {
  check(input: Readonly<{
    access: Access<P>; operation: AgentAccessOperation; target: AgentAccessTarget
  }>): Promise<AgentAccessDecision>
}
export type AgentInstant = string
export interface AgentClock {
  waitUntil(instant: AgentInstant, signal: AbortSignal): Reply<'elapsed' | 'cancelled'>
}
```

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

invoke、resume、登记、撤除与停用的行为见 SPEC 的“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”。主体资格的核验见“[主体资格核验](../../SPEC.md#主体资格核验)”。事件序号、游标、缺口、背压、重连与确认的行为见“[事件流与读取](../../SPEC.md#事件流与读取)”。控制的种类、范围与六个阶段见“[取消、退出与结构变更](../../SPEC.md#取消退出与结构变更)”。本页只给类型形状，不重复这些行为。

## 执行记录与调用方交接端口

Journal 是 Agent 的持久端口，只提供执行记录、输入、checkpoint、事件和原操作结果的操作，不提供外部协调者的业务管理操作。端口按使用角色分为五组：开启与挂接、提交与记录、终结、终态后观察登记、读取。读取组只含读操作，不含任何写入。只承担一种角色的使用者只依赖对应的组，例如长期的终态后观察者只依赖读取与终态后观察登记两组，不取得终结或确认的能力。以下联合限制允许的交接，不能传任意脚本、数据库动作或业务方法名。这些操作的行为见 SPEC 的“[托管协调与运行实例](../../SPEC.md#托管协调与运行实例)”与“[提交参加者协议](../../SPEC.md#提交参加者协议)”。

```ts
export type CallerCommit =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'message'; message: Message; source: Evidence; admission: Evidence }>
  | Readonly<{ kind: 'context-transition'; value: PreparedContextTransition; admission: Evidence }>
  | Readonly<{ kind: 'custody'; result: ProducedResult; consumption: ConsumptionId; retained: Evidence }>
  | Readonly<{ kind: 'processed'; result: ProducedResult; consumption: ConsumptionId; completion: Evidence }>
export type EffectIntent = Readonly<{
  action: ActionId; pending: PendingCall; authority: Authority
}>
export type JournalCommit<P> = ExecutionMutation<P> & Readonly<{
  authority: Authority; expected: ExecutionRevision; checkpoint: AgentCheckpoint
  state: Exclude<ExecutionState, { kind: 'ended' }>; events: readonly Exclude<AgentEventBody, { kind: 'ended' }>[]
  effects: readonly EffectIntent[]; caller: CallerCommit
  replyAdmission: ModelReplyAdmission | null
}>
export interface AgentJournalAttachment<P> {
  open(input: ExecutionMutation<P> & Readonly<{
    instance: AgentInstanceId; grant: Evidence | null; initial: AcceptedInput; checkpoint: AgentCheckpoint
  }>): Reply<Readonly<{ receipt: CommandReceipt; authority: Authority }>>
  attach(input: ExecutionMutation<P> & Readonly<{
    instance: AgentInstanceId; grant: Evidence | null; recovery: Evidence
    takeover: Evidence | null
  }>): Reply<Readonly<{ receipt: CommandReceipt; authority: Authority }>>
  detach(input: Parameters<AgentExecutionRecovery<P>['detach']>[0]): Reply<Evidence>
}
export interface AgentJournalRecording<P> {
  commit(input: JournalCommit<P>): Reply<CommandReceipt>
  submit(input: Parameters<AgentExecutionInput<P>['submit']>[0]): Reply<CommandReceipt>
  control(input: Parameters<AgentExecutionControl<P>['control']>[0]): Reply<CommandReceipt>
  acknowledge(input: Parameters<AgentExecutionEvents<P>['acknowledge']>[0]): Reply<CommandReceipt>
  recordResult(input: ExecutionMutation<P> & Readonly<{
    result: ProducedResult; consumption: ConsumptionId
    transfer: Extract<CallerCommit, { kind: 'custody' | 'processed' }> | Readonly<{ kind: 'none' }>
    release: Readonly<{ kind: 'pending' }> | Readonly<{ kind: 'confirmed'; receipt: Evidence }>
  }>): Reply<CommandReceipt>
  recordControl(input: ExecutionMutation<P> & Readonly<{
    target: AgentOperationId; stage: Exclude<ControlStage, 'accepted'>
    state: 'reached' | 'unresolved'; source: Evidence
  }>): Reply<CommandReceipt>
}
export interface AgentJournalFinishing<P> {
  tryFinish(input: ExecutionMutation<P> & Readonly<{
    authorization: FinishAuthorization; expected: ExecutionRevision; intent: FinishIntent
  }>): Reply<FinishResult>
}
export interface AgentJournalObservation<P> {
  recordTerminalObservation(input: ExecutionMutation<P> & Readonly<{
    terminal: Evidence; passage: PassageId; implementation: Adoption; observed: Evidence
  }>): Reply<CommandReceipt>
}
export interface AgentJournalReading<P> {
  load(input: Access<P> & Readonly<{ execution: AgentExecutionId }>): Reply<ExecutionSnapshot>
  inputs(input: Access<P> & Readonly<{ execution: AgentExecutionId; watermark: Evidence }>): Reply<Readonly<{ batch: InputBatch; messages: readonly Message[] }>>
  readReplyAdmissions(input: Access<P> & Readonly<{
    execution: AgentExecutionId; through: Evidence; after: string | null; limit: number
  }>): Reply<ReplyAdmissionPage>
  query(input: ExecutionMutation<P>): ReturnType<AgentExecutionRecovery<P>['query']>
  readonly output: Pick<AgentExecutionEvents<P>, 'read' | 'events'>
}
export type JournalCapabilities = Readonly<{
  participants: ReadonlySet<Exclude<CallerCommit['kind'], 'none'>>
}>
export interface AgentJournal<P>
  extends AgentJournalAttachment<P>, AgentJournalRecording<P>, AgentJournalFinishing<P>,
    AgentJournalObservation<P>, AgentJournalReading<P> {
  readonly capabilities: JournalCapabilities
}
```

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
