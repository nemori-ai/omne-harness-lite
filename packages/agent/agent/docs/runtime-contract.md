# Agent 主干推进契约候选

本页是 [#342](https://github.com/nemori-ai/omne-harness-lite/issues/342) 的候选设计，尚未技术接受。已采用范围继续由 [SPEC](../SPEC.md) 标明。既有根入口只实现定义与扩展声明判断；下面的求值、协调和实例接口尚未生产实现。

Agent 将明确事实求成下一步，再通过领域公开操作协调工作。Session 拥有原工作、推进资格和终态；Model/Tool 拥有真实执行。Agent 的纯求值、可恢复经过和物理协程分别表达。对象与层次关系见[共同模型](../../../../docs/architecture/runtime/runtime-contract-model.md)。

## 身份、原位置与纯求值

下列代码块组成同一候选声明。Session、Model、Tool 导入指向本卡各成员 runtime-contract 中的候选声明，不表示当前包根已经导出。既有 AgentDefinition、LoopExtensionDeclaration 及 Position 直接复用已公开类型。落地时由各原拥有者公开，不能在 Agent 复制这些接口或用私有源码代替。

```ts
import type { Outcome } from '@omne-harness/kernel-basis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Message } from '@omne-harness/message'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { AgentDefinition, LoopExtensionDeclaration, Position } from '@omne-harness/agent'
import type * as S from '@omne-harness/session'
import type * as M from '@omne-harness/model'
import type * as T from '@omne-harness/tool'

declare const agentIdentity: unique symbol
export type AgentIdentity<K extends string> = string & { readonly [agentIdentity]: K }
export type AgentInstanceId = AgentIdentity<'AgentInstanceId'>
export type StepId = AgentIdentity<'AgentStepId'>
export type ActionId = AgentIdentity<'AgentActionId'>
export type PassageId = AgentIdentity<'AgentPassageId'>
export type ActionBatchId = AgentIdentity<'AgentActionBatchId'>
export type Adoption = S.Adoption
export type Evidence = S.DurableEvidence
export type Access<P> = S.Access<P>
export type Failure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'stale-advance' | 'not-ready' | 'terminal' }>
  | Readonly<{ kind: 'commit-unknown'; operation: S.SessionOperationId }>
  | Readonly<{ kind: 'conflict'; operation: S.SessionOperationId }>
export type Reply<A> = Promise<Outcome<A, Failure>>
export type PendingCall = Readonly<{
  action: ActionId; consumption: S.ConsumptionId; position: string
  fixed: Evidence; consumer: S.ConsumerRef
}> & (
  | Readonly<{ kind: 'model'; call: M.ModelCallId; admission: M.ModelOperationId; purpose: 'main' | 'compaction' | 'extension' }>
  | Readonly<{ kind: 'tool'; call: T.ToolCallId; admission: T.ToolOperationId; purpose: 'action' | 'extension' }>
)
export type ActionJudgment =
  | Readonly<{ kind: 'pending'; passage: PassageId }>
  | Readonly<{ kind: 'waiting'; passage: PassageId; cards: readonly Evidence[] }>
  | Readonly<{ kind: 'denied'; evidence: Evidence }>
  | Readonly<{ kind: 'allowed'; evidence: Evidence; request: T.FixedToolRequest }>
export type Action = Readonly<{
  id: ActionId; original: M.ToolSuggestion; effectiveArguments: string
  judgment: ActionJudgment; call: PendingCall | null
}>
export type ActionBatch = Readonly<{
  id: ActionBatchId; source: S.ProducedResult; actions: readonly Action[]
  barrier: Evidence | null
}>
export type AgentCheckpoint = Readonly<{
  schema: Adoption; definition: Adoption; step: StepId; position: string
  calls: readonly PendingCall[]; passages: readonly Passage[]
  batch: ActionBatch | null; inputBatch: S.BatchId | null
  requestPreparation: Preparation | null
  completedPassages: readonly PassageId[]; priorConditions: Evidence | null
}>
export type RuntimeConditions = Readonly<{
  source: Evidence; configuration: Adoption; modes: S.Modes
  model: Adoption; context: Evidence; bindings: readonly Adoption[]
  guard: Readonly<{ level: 0 | 1 | 2 | 3 | 4; basis: Evidence; intervention: Evidence | null }>
}>
export type LoopFacts = Readonly<{
  work: S.WorkSnapshot; advance: S.AdvanceRef; checkpoint: AgentCheckpoint
  conditions: RuntimeConditions; inputs: readonly Message[]
  producerFacts: readonly Readonly<{ pending: PendingCall; source: Evidence; state: JsonValue; schema: Adoption }>[]
}>
export type Next =
  | Readonly<{ kind: 'reconcile'; calls: readonly PendingCall[] }>
  | Readonly<{ kind: 'take-inputs'; position: string }>
  | Readonly<{ kind: 'prepare-request'; step: StepId; previous: Preparation | null }>
  | Readonly<{ kind: 'extension'; passage: PassageId }>
  | Readonly<{ kind: 'admit-model'; preparation: Preparation }>
  | Readonly<{ kind: 'admit-tools'; batch: ActionBatch }>
  | Readonly<{ kind: 'consume'; consumption: S.ConsumptionId; result: S.ProducedResult }>
  | Readonly<{ kind: 'wait'; waiting: readonly S.Waiting[] }>
  | Readonly<{ kind: 'propose-terminal'; conclusion: S.RunConclusion }>
  | Readonly<{ kind: 'stop'; reason: 'cancelled' | 'terminal' | 'superseded' }>
export interface AgentEvaluator {
  initial(input: Readonly<{ definition: Adoption; step: StepId }>): Outcome<AgentCheckpoint, Failure>
  next(input: LoopFacts): Outcome<Next, Failure>
  encode(value: AgentCheckpoint): S.Continuation
  decode(value: S.Continuation): Outcome<AgentCheckpoint, Failure>
}
```

StepId 区分一轮主要请求及其动作承接位置，ActionId 区分同一步内不同动作。拒收模型回复之后的新调用有新 action/call，保留原否决历史。PassageId 固定一次位置、扩展采用、动作和链序号。身份生成不授予资格，稳定身份先保管再用于外部操作；恢复不因新 attempt 重建它们。admission 保存每个生产者原受理操作，用于 inspect/lookup，不能只保存 call。

AgentCheckpoint 由 Agent 解释并通过 Session continuation 保存，不是另一份工作状态权威。producerFacts 的 schema 指向原拥有者公开状态编码，读取失败必须是 unavailable/unknown，不能用空集合。decode 必须核对精确采用、身份关系和完整性，不能把任意 JsonValue 当 AgentCheckpoint。编码只允许数据，不含运行对象。

next 是纯函数，不读时钟、当前注册或数据库，不发请求。相同完整输入与精确采用得到同一决定；缺必要事实返回具体失败。条件快照只是判断依据，影响推进的写入及实际发起仍在领域边界重新裁定。L0 始终保留观测；L1/L2 的干预消息、L3 的失败候选、L4 的原卡等待均由 guard.basis 认回，不以新 attempt 清零或自动生成默认阈值。

优先级依次为有效取消/终态/失效推进，原操作未知与原结果交接，已有扩展/压缩/人工等待，合法批次承接，当前请求准备，整批动作发起，最终完成候选。原调用在途时不能因新消息改走新请求入口。没有动作与空队列不直接产生终态；必须核未完等待、模式及终态前经过。Next 只是求值结果，调用方自行伪造某分支也不能绕过实际操作的守卫。

## 请求、扩展和材料接缝

这些是 Agent 消费外域的窄端口。Request Context、Runtime Context、HITL 与材料拥有者负责真实来源和行为，Adapter 在本边界兑现；此处不授予它们新的领域职责或通用执行权限。

```ts
export type Preparation = Readonly<{
  id: ActionId; purpose: 'main' | 'compaction' | 'extension'
  consumer: S.ConsumerRef; source: Evidence; state: JsonValue; schema: Adoption
}> & (
  | Readonly<{ kind: 'ready'; request: M.FixedModelRequest; capacity: M.ResultCapacity; budget: Evidence }>
  | Readonly<{ kind: 'needs-compaction'; original: Evidence; request: M.FixedModelRequest; capacity: M.ResultCapacity }>
  | Readonly<{ kind: 'cannot-fit'; reason: 'fixed' | 'after-compaction' | 'unknown-limit' | 'representation'; diagnostic: string }>
)
export interface RequestPreparation<P> {
  prepare(input: Access<P> & Readonly<{
    advance: S.AdvanceRef; action: ActionId; purpose: Preparation['purpose']
    consumer: S.ConsumerRef; history: Evidence; inputs: S.InputBatch
    conditions: RuntimeConditions; previous: Preparation | null; alterations: readonly Evidence[]
  }>): Reply<Preparation>
  derive(input: Access<P> & Readonly<{
    advance: S.AdvanceRef; original: Extract<Preparation, { kind: 'needs-compaction' }>
    result: S.ProducedResult; consumed: Evidence
    rewritten: Message | null; alterations: readonly Evidence[]
  }>): Reply<Extract<S.DerivedMessage, { kind: 'compaction' }>>
  resume(input: Access<P> & Readonly<{
    advance: S.AdvanceRef; original: Preparation; consumed: Evidence; compaction: Evidence
  }>): Reply<Preparation>
}
export interface CurrentConditions<P> {
  read(input: Access<P> & Readonly<{ advance: S.AdvanceRef; previous: Evidence | null }>): Reply<RuntimeConditions>
}
export type Passage = Readonly<{
  id: PassageId; position: Position; action: ActionId | null; ordinal: number
  declaration: LoopExtensionDeclaration; implementation: Adoption
  original: Evidence; effective: Evidence; schema: Adoption; state: JsonValue
  resolved: readonly Evidence[]; pending: PendingCall | null
  cards: readonly Readonly<{ card: Evidence; decision: Evidence | null; processed: Evidence | null }>[]
}>
export type ExtensionEffect =
  | Readonly<{ kind: 'model'; request: M.FixedModelRequest; capacity: M.ResultCapacity }>
  | Readonly<{ kind: 'tool'; request: T.FixedToolRequest }>
  | Readonly<{ kind: 'read'; owner: string; protocol: Adoption; query: JsonValue }>
export type ExtensionDecision =
  | Readonly<{ kind: 'observed' }>
  | Readonly<{ kind: 'rewrite'; value: Evidence }>
  | Readonly<{ kind: 'veto'; reason: string }>
  | Readonly<{ kind: 'stop'; target: S.Control; reason: string }>
export type ExtensionStep =
  | Readonly<{ kind: 'decided'; decision: ExtensionDecision; state: JsonValue }>
  | Readonly<{ kind: 'effect'; action: ActionId; value: ExtensionEffect; state: JsonValue }>
  | Readonly<{ kind: 'cards'; requests: readonly Readonly<{ identity: string; schema: Adoption; value: JsonValue }>[]; state: JsonValue }>
export interface ExtensionBinding {
  readonly implementation: Adoption
  evaluate(input: Readonly<{ passage: Passage; facts: readonly Evidence[] }>): Outcome<ExtensionStep, Failure>
}
export interface ExtensionBindings<P> {
  resolve(input: Access<P> & Readonly<{ passage: Passage }>): Reply<ExtensionBinding>
}
export interface HumanDecisions<P> {
  present(input: Access<P> & Readonly<{
    advance: S.AdvanceRef; passage: PassageId; original: Evidence
    requests: Extract<ExtensionStep, { kind: 'cards' }>['requests']
  }>): Reply<readonly Evidence[]>
  lookup(input: Access<P> & Readonly<{
    passage: PassageId; original: Evidence; requests: readonly string[]
  }>): Reply<
    Readonly<{ kind: 'presented'; cards: readonly Evidence[] }>
    | Readonly<{ kind: 'not-presented'; exclusion: Evidence }>
    | Readonly<{ kind: 'unknown' }>
  >
  read(input: Access<P> & Readonly<{ card: Evidence }>): Reply<Readonly<{
    kind: 'pending' | 'invalidated' | 'answered'; decision: Evidence | null
  }>>
}
export type Material<B extends ContentBlock> =
  | Readonly<{ kind: 'model'; result: S.ProducedResult; pages: readonly M.ResultPage[] }>
  | Readonly<{ kind: 'tool'; result: S.ProducedResult; pages: readonly T.ResultPage<B>[] }>
  | Readonly<{ kind: 'facts'; schema: Adoption; value: JsonValue }>
export interface AgentMaterials<P, B extends ContentBlock> {
  preserve(input: Access<P> & Readonly<{
    identity: string; consumer: S.ConsumerRef; value: Material<B>
  }>): Reply<Evidence>
  read(input: Access<P> & Readonly<{ source: Evidence }>): Reply<Material<B>>
}
export interface RegisteredReads<P> {
  read(input: Access<P> & Readonly<{
    action: ActionId; passage: PassageId; original: Evidence
    owner: string; protocol: Adoption; query: JsonValue
  }>): Reply<Readonly<{ schema: Adoption; value: JsonValue; source: Evidence }>>
}
```

RequestPreparation 是有明确阶段的计算协议。prepare 只计算，不能暗发压缩模型或修改历史。needs-compaction 给出原压缩位置及待发请求。Agent 经压缩前经过，按独立调用登记、受理和保管原结果，再用 derive 取得实际 CompactionMessage、原范围和具名 derivation。首次 rewritten 为 null、alterations 为空；derive 从 consumed 读取已保管原内容并核验 result 来源，按原 schema 得出摘要与精确排除名单，不再发模型或修改历史。其固定输入同值认回，未知来源报告不可用，不用当前新历史替代原范围。

实际候选产生后先运行压缩后经过，再经消息落盘前准入，由 Session.commitDerived 共同保存摘要、排除名单与接续位置。收到该提交的 source 后，resume 核验原 preparation、原消费和共同提交再重算完整 Context 与预算；提交未知先 queryOperation，不能用未提交 derivation 冒充已压缩。消息落盘后经过只处理已提交事实。压缩选择与排除仍归 Request Context；未读输入、未结等待和后台占位不得排除。cannot-fit 沿真实原因进入失败候选，不无限压缩、不换模型掩盖失败。

压缩后或消息前扩展合法改写候选时，协调者将最终 rewritten 消息和有序 alterations 交回 derive。Request Context 核验每次改写的原经过、能力上限、实际候选和原范围，重新生成与实际摘要及同一合法排除范围匹配的 derivation；旧证明不能配新摘要。此步骤只重验并保管派生依据，不重跑模型或已完成扩展。改写不能扩大原允许排除集合，不能删未读输入/未结等待/后台占位，改变消息角色或伪造来源也拒绝。新的候选版本以原 preparation 和完整改写输入认回，已经提交的旧压缩事实不被改写。Session 只接受最后一次成功 derive 的消息及对应证明，当前授权/范围冲突仍可拒绝提交。

history 是 Session 授权读取范围和精确权威进度的证据，由可信读取适配器取得。Request Context 按其实际公开读取协议解析必要范围，不遍历每一轮完整历史。inputs 指已经可靠承接的完整批。首次、压缩后全量 Context 与普通当前变化按 Context 原规则取得。模型前经过已完成后，alterations 使请求重新组装和预算；completedPassages 防止同一经过再次自触发。最终固定请求、档案、工具绑定、表示和实际外传范围在 Model 受理/发出点重新验证。

ExtensionBinding.evaluate 是纯计算，执行真实读取或调用时必须返回具名 effect。原经过状态先经 Session 保存，再发外部操作，结果按原 action 可靠保存并交回原经过。RegisteredReads 只路由已登记只读协议，不接受任意 URL、方法或脚本，不允许读取接口产生业务效果；非确定读取结果须先保存再影响后继。重复同 action/query 认回原已保存结果，异参数冲突。外部查询未知不得改用当前新值假装旧判断输入。

扩展返回须按声明位置、干预力、来源和当前资格二次检查。工作区仅 observe；after_terminal 只接受 observed，禁止 cards、effect、rewrite、veto 和 stop。before_persist_message 禁止 cards；after_action 无 veto。其他后置 rewrite 仅形成该位置允许的新事实，不能回改已展示原文或撤销已提交状态。stop 是需另行核权的控制请求，不是已取消回执。公共联合允许表达各位置的总集合，不意味着每个位置允许所有分支。

同动作链按 ordinal 串行，后件消费前件有效改写；不同动作可以并行。所有动作先到最终结论或合法等待，才呈现本轮卡片。每卡 answered 不等于 processed；原规则处理全部答复后继续出卡位置，后继可以形成下一轮。只有所有链完成并保存整批 barrier 才发获准部分，Tool 对 barrier、当前参数/绑定/权限重新核验。系统准入不可用则全拒且不代出卡；普通扩展按声明和合法干预力跳过或否决，并保存实际原因。

present 的 identity 在保存卡片需求前确定，HITL 按原卡请求去重，原经过/需求先保存后呈现。返回未知时，lookup 使用已保存的 passage、original 和完整请求身份集合查询原呈现，不要求未知的 card Evidence，也不要求旧 advance 仍有效；当前读取资格仍核验。presented 的 cards 按原请求顺序一一对应，不能遗漏未确认成员。批内只有部分创建时保持 unknown，拥有者持续完成原批或认回确定结果，不能重新问已创建卡。not-presented 需要排除原创建及延迟写入的证据；只有此前提和当前推进仍有效时才可继续同请求呈现。查询不可用保持失败，不能当 not-presented。

取得原卡后 read 的 answered 包含人明确“不回答”或拒绝等原决定，由原规则解释，不给默认批准或超时。Tool 内部 Ask 只交 Tool.acceptDecision，不接到 Agent 扩展 cards 中。终态后卡片失效和原责任核对由 Session/HITL 原协议收束。

AgentMaterials 只保管材料及可解释版本，不拥有工作推进。preserve 同 identity/consumer/内容认回，冲突拒绝。Model retained 路径先把所需全文或独立可恢复引用保管，再由 Session.preserveResult 绑定原版本/位置/责任，成功后才 ACK。孤立材料在绑定未知期间保留，不能超时删除可能已经被 Session 引用的内容；清理须得到原操作排除或全部消费责任终结的证据。read 每次核权，缺内容明确故障，不能把元数据摘要当正文。processed 路径只保存业务所需完成依据，不强制全文第二副本。

## 托管协调与运行实例

```ts
export type AgentState = Readonly<{
  instance: AgentInstanceId; run: S.RunId; advance: S.AdvanceRef; revision: S.SessionRevision
  activity: 'reconciling' | 'advancing' | 'waiting' | 'yielding' | 'retired'
  position: string; pending: readonly PendingCall[]
}>
export type AgentObservation =
  | Readonly<{ kind: 'state'; value: AgentState }>
  | Readonly<{ kind: 'ended'; reason: 'closed' | 'denied' | 'retired' | 'unavailable' }>
export interface AgentHandle<P> {
  readonly instance: AgentInstanceId
  observe(input: Access<P> & Readonly<{ signal: AbortSignal }>): AsyncIterable<AgentObservation>
}
export interface AgentDirectory<P> {
  connect(input: Access<P> & Readonly<{ run: S.RunId }>): Reply<
    Readonly<{ kind: 'live'; handle: AgentHandle<P> }> | Readonly<{ kind: 'no-live-route' }>
  >
}
export interface AgentRuntime<P> {
  activate(input: Access<P> & Readonly<{ advance: S.AdvanceRef }>): Reply<AgentState>
  reconcile(input: Access<P>): Reply<Readonly<{ revision: S.SessionRevision; remaining: readonly S.ConsumptionId[] }>>
  yield(input: Access<P> & Readonly<{ instance: AgentInstanceId; operation: S.SessionOperationId }>): Reply<Readonly<{
    kind: 'released' | 'already-stale'; revision: S.SessionRevision
  }>>
  readonly instances: AgentDirectory<P>
}
export interface AgentAdoptions<P> {
  resolve(input: Access<P> & Readonly<{ adoption: Adoption }>): Reply<Readonly<{
    definition: AgentDefinition; evaluator: AgentEvaluator; extensions: readonly LoopExtensionDeclaration[]
  }>>
  handover(input: Access<P> & Readonly<{
    from: Adoption; to: Adoption; original: S.Continuation
  }>): Reply<Readonly<{ continuation: S.Continuation; evidence: Evidence }>>
}
export interface AgentInstanceHost<P> {
  reserve(input: Access<P>): Reply<Readonly<{ instance: AgentInstanceId; reference: S.AgentInstanceRef }>>
  publish(input: Readonly<{ state: AgentState; handle: AgentHandle<P> }>): Reply<Readonly<{ registration: string }>>
  withdraw(input: Readonly<{ instance: AgentInstanceId; registration: string }>): Reply<Readonly<{ removed: boolean }>>
  readonly directory: AgentDirectory<P>
}
export interface AgentClock {
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export type AgentConfiguration = Readonly<{
  observerBufferBytes: number; reconciliationDelayMs: number; denialBackoffMs: number
}>
export type AgentDependencies<P, B extends ContentBlock> = Readonly<{
  sessions: S.SessionService<P>; models: M.ModelRuntime<P>; tools: T.ToolRuntime<P, B>
  adoptions: AgentAdoptions<P>; conditions: CurrentConditions<P>; requests: RequestPreparation<P>
  extensions: ExtensionBindings<P>; humans: HumanDecisions<P>
  materials: AgentMaterials<P, B>; reads: RegisteredReads<P>
  instances: AgentInstanceHost<P>; clock: AgentClock
}>
export interface AgentProvider<P> {
  readonly runtime: AgentRuntime<P>
  quiesce(): Reply<Readonly<{ released: number; unresolved: readonly S.SessionId[] }>>
}
export declare function createAgentRuntime<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>, configuration: AgentConfiguration,
): AgentProvider<P>
```

装配协调者先向实例宿主 reserve 取得唯一候选身份，再用已核验定义的 evaluator.initial/encode 和 Session.startRun 创建 Run/首次 advance，或经 claim/reload 取得接续资格，最后 activate。reserve 不授予工作权、不发布活体、不创建 Run；未绑定候选可以撤弃。activate 验证 Session 当前 advance、实例身份和精确采用后启动独立协程，同一有效 advance 重复唤醒认回同一实例，不创建第二协程。受理后尚未 activate 即崩溃时，恢复者核实旧实例未开始/已排除，再经 claim 接手，不能仅凭目录为空改写资格。

activate 是一次唤醒协调，不是整个 Loop 完成 Promise。它从 Session 的权威 continuation 对账，再运行纯 next 和对应公开操作；每次写入使用当前 expected 和原 operation。changed 后重读重算，commit-unknown 先认回。系统不得依赖通知必达维持推进，Session.pending 与权威状态扫描提供恢复入口；扫描的 tenant 由受信身份调度者明确给出。

reconcile 处理原调用事实、结果保管和确认，不授予新 advance。当前合格保管者可以在终态后运行它，不能由此执行新的原 Run 动作、扩展调用或模型请求。remaining 表示尚未完成的消费位置，不表示其全部结果均可读取。每个 ProducedResult 的 version/delivery 单独认回，Tool 晚到版本不覆盖原完成事实。

yield 先保存原 checkpoint 和等待、经 Session.release 撤当前 advance，再撤本实例目录。已被取消或换代时不写新的业务位置，认回已有状态后撤自己的贡献。提交未知时保持待核对责任并停止新效果，不先宣布 released。Agent 释放只结束自己的协程、观察和临时资源，Model/Tool 继续由其宿主控制。quiesce 对本宿主实例执行同一协议，失败返回 unresolved；普通 disposer 不能伪称已交接或取消成功。

observe 只给获准的状态投影，首项为 state 或 ended。signal 只结束观察。目录键是 tenant/session/run，值关联真实实例和贡献身份；旧 withdraw 只撤自己的 registration，不撤新实例。no-live-route 不证明 Run 结束或无人有资格。跨进程目录路由必须另行实现租户、代次、撤除及失联协议，进程内对象不能序列化成远端句柄。

adoptions.handover 验证同定义合法候选及原 checkpoint 能否解释。兼容时保持原调用、卡片、参数和经过语义，Session.reload 同提交采用变化与资格换代。不兼容时拒绝交接或保留原精确解释器供原经过收束，不能静默用新扩展结论覆盖旧判断。提供者无法保留必要版本时相应工作明确 unavailable；不默认作废所有卡片或等待全部生产者物理停完。已固定调用永不套新默认。

## 逐操作及输入分类

| 操作或接缝 | 参数与成功 | 失败、未知及换代责任 |
| --- | --- | --- |
| evaluator.initial/next/codec | 明确数据及精确采用，返回原位置或下一步 | 缺项/不支持明确拒绝，无效果、无隐式 DI |
| activate | 显式主体、tenant/session、Session advance；启动或认回同一实例 | 失效拒绝，初始化失败保留 Session 未完责任，不重建 Run |
| reconcile | 当前身份及原 Session，更新原事实/保管/确认 | 查询失败保留原身份，不能据此替代执行 |
| yield/quiesce | 原实例及操作身份，交还当前推进和耐久位置 | 未知先认回，disposer 不替代业务确认 |
| requests/conditions | 本次用途、历史范围、当前条件、固定采用和先前 preparation | 无权、缺源、不能装下分别报告，条件变化重算未固定候选 |
| extensions/humans/reads | 原经过、参数、采用、卡片/读取身份 | 无副作用重跑；当前资格复核；缺采用不偷换最新版本 |
| materials | 原内容、消费位置及稳定材料身份 | 内容/引用真实耐久，绑定未知期间不清理；读失败不回空 |
| sessions/models/tools | 工厂注入的必需行为能力 | 根接口可直接消费；具体装配保证在途交接，不把 DI 换对象等同业务换代 |
| adoptions/instances/clock | 工厂必需机制，分别拥有解释、实例和等待 | 时钟只调度退避，不决定逻辑终态；宿主不授推进权 |
| configuration | 可序列化正观察容量、非负间隔/退避 | 创建时验证，不新增连续否决次数上限或通用额度 |

当前主体、租户、目标、操作、advance 属于每次调用参数，不能藏在长期 singleton。固定 definition/extension/schema 属于可恢复采用，和当前授权分开。factory 依赖不进入日志；运行状态、队列和锁不成为数据契约。可选遥测不影响这些保证，不把它列为业务必需服务。

## 验证边界

完整调用链、正常与失败消费例见[runtime-examples](runtime-examples.md)。类型样例只证明所列公开形状可连接，纯状态模型只覆盖所建交错。实际 Storage、同提交授权、生产者动作围栏、断电保管、真实 HITL 和跨进程必须由后继提供者取证。MODEL-E01 的全部 Tool 最终块及嵌套投影来源限制继续存在，Agent 不以 JsonValue 补成已许可语法。
