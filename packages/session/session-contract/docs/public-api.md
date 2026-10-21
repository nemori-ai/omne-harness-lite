# Session 公开入口与候选定义

当前根入口为 `export {}`，尚无工作治理和日志操作的生产导出。

实际导出与公开校验由 [src/index.ts](../src/index.ts) 及其导出模块拥有。下列声明是尚未技术接受、尚未实现的唯一候选定义，不是现有包的使用承诺。后继实现接管精确定义时，本页改为源码导航，不保留第二套手写签名。

行为、调用资格、结果与认回归 [SPEC 的运行契约候选](../SPEC.md#运行契约候选)。消费路径见 [context](context.md)，对象关系见 [object-model](object-model/README.md)。本页只给形状，不重复行为。

## 值、当前工作与原位置

[行为与约束](../SPEC.md#值与结果项的约束)。

Session 不保存接续值。`RunState.active.execution` 是指向 Agent 权威记录的 `ExecutionRef`，推进命令不带接续参数。`AttemptId` 是 (Run, 序号) 的确定编码，从日志派生，不另存。`BatchId` 与 `ConsumptionId` 是 Agent 批次身份与消费身份在本成员的编码值。

```ts
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Message, CompactionMessage, CompactionContext } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'

declare const sessionIdentity: unique symbol
export type SessionIdentity<K extends string> = string & { readonly [sessionIdentity]: K }
export type SessionId = SessionIdentity<'SessionId'>
export type RunId = SessionIdentity<'RunId'>
/** Deterministic encoding of (run, ordinal). Derived from the log, never stored on its own. */
export type AttemptId = SessionIdentity<'AttemptId'>
export type InputId = SessionIdentity<'SessionInputId'>
/** Encoded Agent input-batch identity. */
export type BatchId = SessionIdentity<'SessionBatchId'>
export type SessionOperationId = SessionIdentity<'SessionOperationId'>
export type SessionRevision = SessionIdentity<'SessionRevision'>
/** Encoded Agent consumption identity. */
export type ConsumptionId = SessionIdentity<'SessionConsumptionId'>
/** Crosses the boundary encoded as the message package's RecordEntryRef. */
export type EntryId = SessionIdentity<'SessionEntryId'>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type DurableEvidence = Readonly<{ owner: string; record: string; revision: string; digest: string }>
export type ConsumerRef = Readonly<{ owner: string; work: string; position: string; purpose: string }>
export type AgentInstanceRef = Readonly<{ owner: 'agent'; id: string }>
export type SessionCallerClass = 'intake' | 'coordinator' | 'maintainer' | 'reader'
export type Access<P> = Readonly<{ principal: P; tenant: TenantId; session: SessionId }>
export type Mutation<P> = Access<P> & Readonly<{ operation: SessionOperationId }>
export type AdvanceRef = Readonly<{ run: RunId; attempt: AttemptId; instance: AgentInstanceRef }>
/** Registration key of one resident-tool contribution, minted by Tool. Only session-adapters parses it. */
export type ResidentKey = SessionIdentity<'ResidentKey'>
/** First-loaded definition of one resident tool, as Tool reported it. shape is opaque to this member. */
export type ResidentTool = Readonly<{
  capability: string; version: string; shape: JsonValue; admitted: DurableEvidence
}>
export type SessionFrozen = Readonly<{ cause: 'tool-shape-lost'; evidence: DurableEvidence; commit: DurableEvidence }>
/**
 * Points at the Agent's authoritative record. revision and evidence come from the latest Agent event
 * read or the latest participated commit; both are null before the first one. readThrough is the
 * last Agent event sequence read and saved; "0" before the first event.
 */
export type ExecutionRef = Readonly<{
  execution: string; revision: string | null; evidence: DurableEvidence | null; readThrough: string
}>
/** P-2 material handed over by the execution record provider when Session acts as a commit participant. */
export type Participation = Readonly<{
  execution: string; operation: string
  joint: 'message' | 'context-transition' | 'custody' | 'processed'
  written: string; handover: DurableEvidence
}>
export type ProducerRef =
  | Readonly<{ kind: 'model'; call: string }>
  | Readonly<{ kind: 'tool'; call: string }>
export type CallBinding = Readonly<{
  producer: ProducerRef; action: string; consumer: ConsumerRef
  request: DurableEvidence; initiatingAttempt: AttemptId | null
}>
export type ProducedResult = Readonly<{
  producer: ProducerRef; version: string; delivery: string | null; source: DurableEvidence
}>
export type ResultConsumption = Readonly<{
  result: ProducedResult
  custody: DurableEvidence | null; completion: DurableEvidence | null
  release: 'pending' | 'confirmed'
}>
export type Consumption = Readonly<{
  id: ConsumptionId; binding: CallBinding; results: readonly ResultConsumption[]
}>
/** One Agent input batch as the Agent's input-taken event reported it. Session never reselects it. */
export type InputBatch = Readonly<{
  id: BatchId; watermark: DurableEvidence; ordered: readonly InputId[]
}>
export type RunTerminal = Readonly<{
  run: RunId; outcome: 'completed' | 'failed' | 'cancelled'; evidence: DurableEvidence
}>
export type RunState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'active'; run: RunId; adoption: Adoption; first: InputId
      advance: AdvanceRef | null; ordinal: string; execution: ExecutionRef
    }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
export type Waiting =
  | Readonly<{ kind: 'producer'; binding: CallBinding; position: string }>
  | Readonly<{
      kind: 'extension-batch'; passage: string; position: string
      members: readonly Readonly<{ action: string; card: DurableEvidence; decision: DurableEvidence | null }>[]
    }>
  | Readonly<{ kind: 'dependency'; owner: string; position: string }>
export type ControlTarget =
  | Readonly<{ kind: 'run'; run: RunId }>
  | Readonly<{ kind: 'producer'; producer: ProducerRef }>
  | Readonly<{ kind: 'session' }>
/** state: committed = intent saved; propagating = some producer or start fence still unconfirmed; reconciled = all confirmed. */
export type ControlProgress = Readonly<{
  operation: SessionOperationId; target: ControlTarget; intent: ControlIntent
  state: 'committed' | 'propagating' | 'reconciled'; pending: readonly ProducerRef[]
  startFence: 'not-required' | 'pending' | 'effective'
}>
export type ControlIntent =
  | Readonly<{ kind: 'control'; value: Control }>
  | Readonly<{ kind: 'interrupt'; run: RunId; urgent: Extract<RoutedInput, { kind: 'ordinary' }>; decision: DurableEvidence }>
  | Readonly<{ kind: 'auto-archive'; idleEvidence: DurableEvidence }>
export type ScopeReleaseDisposition = 'released' | 'pending' | 'unsupported' | 'unavailable' | 'not-authorized'
export type RecoveryTask =
  | Readonly<{
      kind: 'initialization'; item: string; owner: string; protocol: Adoption
      input: JsonValue; originalOperation: SessionOperationId
      state: 'pending' | 'unknown' | 'failed'; diagnostic: string | null
    }>
  | Readonly<{
      kind: 'cascade'; child: SessionId; parentControl: SessionOperationId
      childOperation: SessionOperationId; intent: Extract<Control, { kind: 'archive' }>
      basis: DurableEvidence; state: 'pending' | 'unknown' | 'denied'
    }>
  | Readonly<{
      kind: 'routed-input'; originalOperation: SessionOperationId
      value: Exclude<RoutedInput, { kind: 'ordinary' }>; state: 'pending' | 'unknown'
    }>
  | Readonly<{
      kind: 'scope-release'; archive: SessionOperationId; scope: string
      state: 'pending' | 'unknown'; last: readonly ScopeReleaseDisposition[]
    }>
  | Readonly<{
      kind: 'start-fence'; operation: SessionOperationId; advance: AdvanceRef
      state: 'pending' | 'unknown'
    }>
export type WorkSnapshot = Readonly<{
  session: SessionId; tenant: TenantId; revision: SessionRevision; interpreter: Adoption; source: DurableEvidence
  lifecycle: 'initializing' | 'dormant' | 'active' | 'frozen' | 'archived'
  frozen: SessionFrozen | null; residents: readonly ResidentTool[]
  definition: Readonly<{ name: string; adopted: Adoption }>
  execution: Adoption; declarations: DurableEvidence
  revisions: Readonly<{ workspace: string; declarations: string }>
  run: RunState; pending: readonly InputId[]; handed: readonly InputId[]
  waiting: readonly Waiting[]; consumptions: readonly Consumption[]
  controls: readonly ControlProgress[]; unresolved: readonly SessionOperationId[]
  creation: SessionCreation; tasks: readonly RecoveryTask[]
  idle: Readonly<{ observation: IdleObservation; commit: DurableEvidence }> | null
}>
```

## 操作身份的派生

[OP-00](../SPEC.md#op-00)。两个纯函数从稳定要素派生身份，输入不含时间、随机数或连接。

```ts
export type SessionOperationElements =
  | Readonly<{ kind: 'startRun'; session: SessionId; first: InputId }>
  | Readonly<{ kind: 'participation'; execution: string; operation: string; joint: Participation['joint'] }>
  | Readonly<{ kind: 'claim'; run: RunId; instance: AgentInstanceRef; continuity: DurableEvidence }>
  | Readonly<{ kind: 'reload'; run: RunId; candidate: Adoption; handover: DurableEvidence }>
  | Readonly<{ kind: 'release'; advance: AdvanceRef; handover: DurableEvidence }>
  | Readonly<{ kind: 'bounded-close'; run: RunId; basis: BoundedClose }>
  | Readonly<{ kind: 'result'; consumption: ConsumptionId; version: string }>
  | Readonly<{ kind: 'external-call'; binding: CallBinding }>
  | Readonly<{ kind: 'context-reminder'; session: SessionId; source: DurableEvidence }>
  | Readonly<{ kind: 'idle'; session: SessionId; observation: DurableEvidence }>
  | Readonly<{ kind: 'auto-archive'; session: SessionId; idleEvidence: DurableEvidence }>
  | Readonly<{ kind: 'freeze'; session: SessionId; evidence: DurableEvidence }>
  | Readonly<{ kind: 'fact'; fact: ProducerFact }>
export type DriveOperationElements =
  | Readonly<{ kind: 'invoke'; execution: string; first: InputId; started: DurableEvidence }>
  | Readonly<{ kind: 'submit'; execution: string; input: InputId }>
  | Readonly<{ kind: 'resume'; execution: string; grant: DurableEvidence }>
  | Readonly<{ kind: 'detach'; execution: string; advance: AdvanceRef }>
  | Readonly<{ kind: 'control'; execution: string; control: SessionOperationId }>
  | Readonly<{ kind: 'recordResult'; execution: string; consumption: ConsumptionId; version: string; transfer: 'custody' | 'processed' | 'none' }>
export declare function deriveSessionOperation(elements: SessionOperationElements): SessionOperationId
export declare function deriveDriveOperation(elements: DriveOperationElements): string
```

## 输入、推进、结果及终态操作

[行为与约束](../SPEC.md#sessionwork)。命令与事件见[命令表](../SPEC.md#命令表)。

`accept` 的受理标识就是 `Mutation.operation`；普通输入的 `InputId` 是受理入口在首次发送前分配的输入身份，重试保持同值。`claim.continuity` 是指向 Agent 原记录的耐久证据，绑定读得的修订与来源，不是接续值。`reload` 只收交接证明 `handover`。`startRun` 不带批次：它只固定首条输入，其余待处理输入经出站端口逐条交入。

```ts
export type RoutedInput =
  | Readonly<{ kind: 'ordinary'; input: InputId; message: Message; origin: DurableEvidence }>
  | Readonly<{ kind: 'card-decision'; card: DurableEvidence; decision: DurableEvidence; destination: DurableEvidence }>
  | Readonly<{ kind: 'business'; owner: string; input: DurableEvidence; destination: DurableEvidence }>
export type SessionFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict'; operation: SessionOperationId }>
  | Readonly<{ kind: 'changed'; revision: SessionRevision }>
  | Readonly<{ kind: 'commit-unknown'; operation: SessionOperationId }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
  | Readonly<{ kind: 'stale-advance'; current: AdvanceRef | null }>
  | Readonly<{ kind: 'frozen'; verdict: FreezeVerdict | null }>
  | Readonly<{ kind: 'archived' | 'no-input' | 'run-active' | 'not-ready' | 'login-required' }>
export type Reply<T> = Promise<Outcome<T, SessionFailure>>
export type CommitReceipt = Readonly<{
  operation: SessionOperationId; revision: SessionRevision
  first: EntryId; last: EntryId; recovered: boolean; source: DurableEvidence
}>
export type OperationResolution =
  | Readonly<{ kind: 'committed'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'attempt-rejected'; original: 'unknown'; reason: string }>
  | Readonly<{ kind: 'not-committed'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown' }>
export type EntryClass = 'interactive' | 'dispatch'
export type StartedRun = Readonly<{
  receipt: CommitReceipt; advance: AdvanceRef; adopted: Adoption; first: InputId; execution: string
}>
/** The processed hand-over of one result version. The message, if any, arrives by the message hand-over. */
export type Completion = Readonly<{
  consumption: ConsumptionId; result: ProducedResult; completion: DurableEvidence
}>
export type ExternalCompletion = Readonly<{
  consumption: ConsumptionId; result: ProducedResult; position: string
  processing: DurableEvidence; message: Message | null
}>
export type AdmittedMessage = Readonly<{
  message: Message; source: DurableEvidence; admission: DurableEvidence
  consumption: ConsumptionId | null
}>
export type Control =
  | Readonly<{ kind: 'cancel-run'; run: RunId; urgency: 'graceful' | 'force' }>
  | Readonly<{ kind: 'stop-call'; producer: ProducerRef }>
  | Readonly<{ kind: 'background-tool'; producer: Extract<ProducerRef, { kind: 'tool' }> }>
  | Readonly<{ kind: 'archive' }>
  | Readonly<{ kind: 'unarchive' }>
/** Bounded close by Session. Always ends as failed. "No record yet" and "execution ended" are not grounds. */
export type BoundedClose =
  | Readonly<{ kind: 'uninterpretable'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'admission-rejected'; input: InputId; rejection: DurableEvidence }>
export type DerivedMessage =
  | Readonly<{ kind: 'compaction'; message: CompactionMessage }>
  | Readonly<{ kind: 'context-reminder'; message: Message; source: DurableEvidence }>
export interface SessionWork<P> {
  accept(input: Mutation<P> & Readonly<{ value: RoutedInput }>): Reply<CommitReceipt>
  readWork(input: Access<P>): Reply<WorkSnapshot>
  readInput(input: Access<P> & Readonly<{ input: InputId }>): Reply<Extract<RoutedInput, { kind: 'ordinary' }>>
  startRun(input: Mutation<P> & Readonly<{
    entry: EntryClass; candidate: Adoption; instance: AgentInstanceRef
  }>): Reply<StartedRun>
  claim(input: Mutation<P> & Readonly<{
    run: RunId; instance: AgentInstanceRef; continuity: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  reload(input: Mutation<P> & Readonly<{
    run: RunId; candidate: Adoption; instance: AgentInstanceRef
    expected: SessionRevision; handover: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  recordMessage(input: Mutation<P> & Readonly<{
    participation: Participation; value: AdmittedMessage
  }>): Reply<CommitReceipt>
  preserveResult(input: Mutation<P> & Readonly<{
    participation: Participation | null
    consumption: ConsumptionId; result: ProducedResult; custody: DurableEvidence
  }>): Reply<DurableEvidence>
  completeConsumption(input: Mutation<P> & Readonly<{
    participation: Participation; completion: Completion
  }>): Reply<DurableEvidence>
  completeExternalConsumption(input: Mutation<P> & Readonly<{
    expected: SessionRevision; qualification: DurableEvidence; completion: ExternalCompletion
  }>): Reply<DurableEvidence>
  bindExternalCall(input: Mutation<P> & Readonly<{
    expected: SessionRevision; qualification: DurableEvidence
    binding: CallBinding & Readonly<{ initiatingAttempt: null }>
  }>): Reply<Readonly<{ receipt: CommitReceipt; consumption: ConsumptionId }>>
  commitDerived(input:
    | (Mutation<P> & Readonly<{
        participation: Participation
        value: Extract<DerivedMessage, { kind: 'compaction' }>; judgment: DurableEvidence
      }>)
    | (Mutation<P> & Readonly<{
        expected: SessionRevision; value: Extract<DerivedMessage, { kind: 'context-reminder' }>
      }>)
  ): Reply<CommitReceipt>
  release(input: Mutation<P> & Readonly<{
    advance: AdvanceRef; expected: SessionRevision; handover: DurableEvidence
  }>): Reply<CommitReceipt>
  control(input: Mutation<P> & Readonly<{ intent: Control }>): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
  finishRun(input: Mutation<P> & Readonly<{
    run: RunId; expected: SessionRevision; bounded: BoundedClose
  }>): Reply<Readonly<{ receipt: CommitReceipt; terminal: RunTerminal }>>
  queryOperation(input: Access<P> & Readonly<{ operation: SessionOperationId }>): Reply<OperationResolution>
  loadRecovery(input: Access<P>): Reply<WorkSnapshot>
}
```

`DerivedMessage.compaction` 只带 message 包的压缩消息。消息自身的 `covers`、`retained` 与 `derivation` 是唯一的一份证据，形状与规则归 [message 包](../../../common/message/SPEC.md#形状)。`context-reminder.source` 指 Runtime Context 变化材料的证据。`AdmittedMessage.consumption` 在工具消息与后台占位消息上指向原消费位置，其他消息为 null。

## 同提交守卫与跨成员使用

[共同提交与共享事务域](../SPEC.md#共同提交与共享事务域)、[与 Agent 的参加与核对](../SPEC.md#与-agent-的参加与核对)。

条件终结的只读参加没有公开命令：Session 参加者在 Agent 的终结提交里运行 `judgeCompletion`，以参加、冲突或失败响应。

## 控制、恢复与保管边界

[推进映射、claim 与 reload](../SPEC.md#推进映射claim-与-reload)、[事件消费与交付责任解除](../SPEC.md#事件消费与交付责任解除)、[Run 两层状态机与不变量](../SPEC.md#run-两层状态机与不变量)。

## 创建、声明与历史

[行为与约束](../SPEC.md#sessionmanagement)、[SessionReconciliation](../SPEC.md#sessionreconciliation)、[SessionHistory](../SPEC.md#sessionhistory)。

`change` 的维度名为 `permission-mode`、`collaboration-mode`、`environment-mode`、`model`、`workspace`、`declaration`、`context-registration`、`context-step-commit`、`recovery-input`。Runtime Context 的需要、绑定与参数值以带 schema 的 JSON 进入本契约，翻译在 session-adapters。

`ProducerFact` 的 `agent-event` 变体是 Agent 事件流派生的事实，身份为执行与序号；缺口后从快照读到的结束状态以 `sequence` 为 null、`source` 为快照证据提交。`input-handover` 是出站 `invoke` 或 `submit` 的受理或拒收回执。

```ts
export type Modes = Readonly<{
  permission: 'never' | 'auto_permission' | 'bypass-permissions'
  environment: Adoption
  collaboration: 'co-work' | 'auto-drive'
}>
export type SessionCreation = Readonly<{
  definition: Readonly<{ name: string; candidate: Adoption }>
  execution: Adoption; requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  purpose: string; workspace: Adoption | null
  modes: Readonly<{ kind: 'explicit'; value: Modes }> | Readonly<{ kind: 'tenant-default'; source: Adoption }>
  initial: Extract<RoutedInput, { kind: 'ordinary' }> | null
  entryContract: Adoption
}>
export type InitializationResult = Readonly<{
  item: string; owner: string
  result: Readonly<{ kind: 'ready'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'failed'; diagnostic: string; recovery: DurableEvidence }>
}>
export type ContextMaterial = Readonly<{ schema: Adoption; value: JsonValue }>
export type DeclarationChange =
  | Readonly<{ kind: 'permission-mode'; value: Modes['permission']; authorization: DurableEvidence }>
  | Readonly<{ kind: 'collaboration-mode'; value: Modes['collaboration']; authorization: DurableEvidence }>
  | Readonly<{ kind: 'environment-mode'; value: Adoption; authorization: DurableEvidence; setting: DurableEvidence }>
  | Readonly<{ kind: 'workspace'; value: Adoption | null; basis: DurableEvidence }>
  | Readonly<{ kind: 'model'; name: string; basis: DurableEvidence }>
  | Readonly<{ kind: 'declaration'; item: string; value: JsonValue | null; basis: DurableEvidence }>
  | Readonly<{
      kind: 'context-registration'; registration: DurableEvidence
      need: ContextMaterial; binding: ContextMaterial; parameters: ContextMaterial
    }>
  | Readonly<{
      kind: 'context-step-commit'; basis: DurableEvidence
      updates: readonly Readonly<{ block: string; value: ContextMaterial }>[]
    }>
  | Readonly<{ kind: 'recovery-input'; item: string; value: DurableEvidence; basis: DurableEvidence }>
export type Relation =
  | Readonly<{ kind: 'main'; resident: boolean }>
  | Readonly<{ kind: 'child'; parent: SessionId; basis: DurableEvidence }>
  | Readonly<{ kind: 'handoff'; origin: SessionId; basis: DurableEvidence }>
export type ClockSample = Readonly<{ at: string; protocol: Adoption; source: DurableEvidence }>
export type IdleCoverage = Readonly<{
  own: DurableEvidence; relations: DurableEvidence
  children: readonly Readonly<{ session: SessionId; work: DurableEvidence }>[]
  calls: readonly Readonly<{ producer: ProducerRef; state: DurableEvidence }>[]
  completeScope: DurableEvidence
}>
export type IdleObservation =
  | Readonly<{
      kind: 'interval'; started: string; through: ClockSample; elapsedMs: string
      coverage: IdleCoverage; source: DurableEvidence
    }>
  | Readonly<{ kind: 'interrupted'; at: ClockSample; cause: DurableEvidence; source: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; at: ClockSample; scope: DurableEvidence; source: DurableEvidence }>
export type AutoArchivePolicy = Readonly<{ kind: 'disabled' }> | Readonly<{ kind: 'enabled'; idleMs: string }>
/** Tool's adoption-point verdict that a resident tool cannot keep its shape. */
export type FreezeVerdict = Readonly<{ cause: 'tool-shape-lost'; evidence: DurableEvidence }>
export interface SessionManagement<P> {
  inspectIdle(input: Access<P>): Reply<IdleObservation>
  recordIdle(input: Mutation<P> & Readonly<{
    expected: SessionRevision; observation: IdleObservation
  }>): Reply<CommitReceipt>
  create(input: Mutation<P> & Readonly<{ creation: SessionCreation }>): Reply<Readonly<{ receipt: CommitReceipt; state: WorkSnapshot }>>
  completeInitialization(input: Mutation<P> & Readonly<{ result: InitializationResult }>): Reply<CommitReceipt>
  change(input: Mutation<P> & Readonly<{ declaration: DeclarationChange }>): Reply<CommitReceipt>
  setRelation(input: Mutation<P> & Readonly<{ relation: Relation }>): Reply<CommitReceipt>
  configureAutoArchive(input: Mutation<P> & Readonly<{ policy: AutoArchivePolicy }>): Reply<CommitReceipt>
  considerAutoArchive(input: Mutation<P> & Readonly<{ idleEvidence: DurableEvidence }>): Reply<Readonly<{
    result: 'archived' | 'not-due' | 'exempt' | 'disabled'; receipt: CommitReceipt | null
  }>>
  interrupt(input: Mutation<P> & Readonly<{
    run: RunId; urgent: Extract<RoutedInput, { kind: 'ordinary' }>; decision: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
  /** Idempotent by state: a frozen session returns the original receipt with recovered = true. */
  freeze(input: Mutation<P> & Readonly<{ verdict: FreezeVerdict }>): Reply<CommitReceipt>
}
export type AgentEventFact =
  | Readonly<{ kind: 'input-taken'; batch: InputBatch }>
  | Readonly<{ kind: 'waiting'; waits: readonly Waiting[] }>
  | Readonly<{ kind: 'producer'; result: ProducedResult; consumption: ConsumptionId }>
  | Readonly<{
      kind: 'control'; control: SessionOperationId
      stage: 'intent-established' | 'qualification-revoked' | 'producer-confirmed' | 'physically-stopped' | 'duty-released'
      state: 'reached' | 'unresolved'
    }>
  | Readonly<{ kind: 'ended'; conclusion: 'complete' | 'fail' | 'cancelled'; cause: DurableEvidence | null; disposition: DurableEvidence }>
export type ProducerFact =
  | Readonly<{
      kind: 'agent-event'; execution: string; sequence: string | null
      attachment: string; source: DurableEvidence; body: AgentEventFact
    }>
  | Readonly<{
      kind: 'input-handover'; execution: string; input: InputId
      result: Readonly<{ kind: 'accepted'; receipt: DurableEvidence }> | Readonly<{ kind: 'rejected'; reason: string; rejection: DurableEvidence }>
    }>
  | Readonly<{ kind: 'agent-exit'; advance: AdvanceRef; source: DurableEvidence }>
  | Readonly<{ kind: 'execution'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{ kind: 'account'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{ kind: 'release'; consumption: ConsumptionId; result: ProducedResult; source: DurableEvidence }>
  | Readonly<{ kind: 'cascade'; child: SessionId; childOperation: SessionOperationId; source: DurableEvidence }>
  | Readonly<{ kind: 'routed-input'; originalOperation: SessionOperationId; source: DurableEvidence }>
  | Readonly<{
      kind: 'scope-release'; archive: SessionOperationId; scope: string
      dispositions: readonly ScopeReleaseDisposition[]; source: DurableEvidence
    }>
  | Readonly<{ kind: 'start-fence'; operation: SessionOperationId; advance: AdvanceRef; source: DurableEvidence }>
/** unresolved: unknown operations; controls: a control stays propagating; tasks: tasks non-empty; idle-due: confirmed idle evidence is due under the current policy; release: a preserved or processed result still waits for delivery release. */
export type PendingReason = 'unresolved' | 'controls' | 'tasks' | 'idle-due' | 'release'
/** One session that references a resident key. Carries the first-loaded shape, never the definition body. */
export type ResidentReference = Readonly<{ tenant: TenantId; session: SessionId; capability: string; shape: JsonValue }>
/** One scope that an archive released, read back from SE25. task is the original scope-release operation. */
export type ReleasedScope = Readonly<{ tenant: TenantId; session: SessionId; task: SessionOperationId; scope: string }>
export interface SessionReconciliation<P> {
  receive(input: Mutation<P> & Readonly<{ fact: ProducerFact }>): Reply<CommitReceipt>
  pending(input: Readonly<{
    principal: P; tenant: TenantId; after: string | null; limit: number; reason?: PendingReason
  }>): Reply<Readonly<{ sessions: readonly SessionId[]; next: string | null }>>
  /** System scope. No Access<P>: the query spans tenants and returns identities and shapes only. */
  references(input: Readonly<{
    principal: P; scope: 'system'; key: ResidentKey; after: string | null; limit: number
  }>): Reply<Readonly<{ sessions: readonly ResidentReference[]; next: string | null }>>
  /** System scope. Pages through scopes that archives released, for re-release after an execution-environment provider change. */
  releasedScopes(input: Readonly<{
    principal: P; scope: 'system'; after: string | null; limit: number
  }>): Reply<Readonly<{ scopes: readonly ReleasedScope[]; next: string | null }>>
}
export type HistoryEntry = Readonly<{
  id: EntryId; revision: SessionRevision; kind: string; schema: Adoption
  payload: JsonValue; origin: Readonly<{ owner: string; via: string | null; source: DurableEvidence }>
}>
export type HistoryPage = Readonly<{
  source: string; interpreter: Adoption; upper: SessionRevision
  entries: readonly HistoryEntry[]; scannedThrough: string
  next: string | null; exhausted: boolean
  /** SE33 entries committed up to upper whose target lies in this page but which are not in entries. */
  annotations: readonly HistoryEntry[]
}>
/** One model-visible sequence between two compactions. upper is the last row committed when the basis was taken. */
export type ModelViewBasis = Readonly<{ epoch: string; upper: string }>
export type ModelViewRow = Readonly<{
  seq: string; entry: EntryId; bytes: number; prefixDigest: string; message: Message
}>
export type ModelViewRead =
  | Readonly<{ kind: 'page'; basis: ModelViewBasis; rows: readonly ModelViewRow[]; next: string | null }>
  | Readonly<{ kind: 'epoch-changed'; current: ModelViewBasis }>
export interface SessionHistory<P> {
  begin(input: Access<P> & Readonly<{
    kinds: readonly string[]; from: EntryId | null; direction: 'forward' | 'backward'; pageBytes: number
  }>): Reply<HistoryPage>
  next(input: Access<P> & Readonly<{ cursor: string }>): Reply<HistoryPage>
  since(input: Access<P> & Readonly<{
    after: EntryId; kinds: readonly string[]; pageBytes: number
  }>): Reply<HistoryPage>
  /** basis null reads the current epoch. A basis whose epoch is no longer current returns epoch-changed. */
  readModelView(input: Access<P> & Readonly<{
    basis: ModelViewBasis | null; after: string | null; pageBytes: number
  }>): Reply<ModelViewRead>
}
/** The four faces as one value. The Cordis abstract class SessionService in session-cordis-contract exposes them under the key `session`. */
export type SessionFaces<P> = Readonly<{
  work: SessionWork<P>
  management: SessionManagement<P>
  reconciliation: SessionReconciliation<P>
  history: SessionHistory<P>
}>
```

`HistoryEntry.origin.via` 只供人与诊断使用，不参与治理。

## 领域服务与归约

[行为与约束](../SPEC.md#领域服务与归约)。九个领域服务、`reduce` 与 `decide` 都是纯函数。`openWork` 只有一个实现。

```ts
export type AdvanceJudgment =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'stale-advance'; current: AdvanceRef | null }>
  | Readonly<{ kind: 'changed'; revision: SessionRevision }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
  | Readonly<{ kind: 'archived' }>
export type AdvanceClaim =
  | Readonly<{ kind: 'attempt'; advance: AdvanceRef; expected: SessionRevision }>
  | Readonly<{ kind: 'bounded'; run: RunId; expected: SessionRevision; basis: BoundedClose }>
  | Readonly<{ kind: 'participation'; execution: string; joint: Participation['joint'] }>
export type RouteJudgment =
  | Readonly<{ kind: 'queue'; destination: 'current-run' | 'next-run' }>
  | Readonly<{ kind: 'card'; destination: DurableEvidence }>
  | Readonly<{ kind: 'business'; owner: string }>
  | Readonly<{ kind: 'rejected'; reason: 'archived' | 'frozen' | 'invalid' }>
export type RunStartJudgment =
  | Readonly<{ kind: 'eligible'; first: InputId }>
  | Readonly<{ kind: 'not-ready' | 'archived' | 'frozen' | 'run-active' | 'no-input' | 'login-required' }>
/** Six parts, all derived from the snapshot. unreadEvents: Agent events after readThrough count as open work. */
export type OpenWork = Readonly<{
  pending: readonly InputId[]; handed: readonly InputId[]
  waiting: readonly Waiting[]; backgroundPlaceholders: readonly ConsumptionId[]
  unresolved: readonly SessionOperationId[]
  unreadEvents: readonly Readonly<{ execution: string; after: string }>[]
}>
export type CompletionJudgment =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'blocked'; pendingInputs: readonly InputId[] }>
  | Readonly<{ kind: 'cancelled'; terminal: RunTerminal }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
export type ControlScope =
  | Readonly<{
      kind: 'scope'; producers: readonly ProducerRef[]; revokes: readonly ('advance' | 'pending' | 'delivery')[]
      cancelsRun: RunId | null; cascade: readonly RecoveryTask[]; scopeRelease: boolean
    }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
  | Readonly<{ kind: 'invalid'; reason: string }>
export type IdleJudgment =
  | Readonly<{ kind: 'due' | 'not-due' | 'exempt' | 'disabled' }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
export type OperationJudgment =
  | Readonly<{ kind: 'new' }>
  | Readonly<{ kind: 'recovered'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'conflict'; operation: SessionOperationId }>
export type OperationRecord = Readonly<{ operation: SessionOperationId; digest: string; receipt: CommitReceipt }>
export type CommittedBatch = Readonly<{ revision: SessionRevision; entries: readonly HistoryEntry[] }>
export type ReduceResult =
  | Readonly<{ kind: 'reduced'; snapshot: WorkSnapshot }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>

export declare function judgeAdvance(snapshot: WorkSnapshot, claim: AdvanceClaim): AdvanceJudgment
export declare function routeInput(snapshot: WorkSnapshot, input: RoutedInput): RouteJudgment
export declare function judgeRunStart(snapshot: WorkSnapshot, entry: EntryClass): RunStartJudgment
export declare function openWork(snapshot: WorkSnapshot): OpenWork
export declare function judgeCompletion(snapshot: WorkSnapshot, execution: string): CompletionJudgment
export declare function resolveControlScope(snapshot: WorkSnapshot, intent: ControlIntent): ControlScope
export declare function resolveCascade(snapshot: WorkSnapshot, children: readonly SessionId[]): readonly RecoveryTask[]
export declare function judgeIdle(snapshot: WorkSnapshot, input: Readonly<{
  observation: IdleObservation; policy: AutoArchivePolicy; coverage: IdleCoverage
}>): IdleJudgment
export declare function resolveOperation(record: OperationRecord | null, operation: SessionOperationId, digest: string): OperationJudgment
export declare function reduce(previous: WorkSnapshot | null, batch: CommittedBatch): ReduceResult
/** Entries without id and revision; the storage provider assigns both at commit. */
export type EncodedEntry = Omit<HistoryEntry, 'id' | 'revision'>
export type Decision =
  | Readonly<{ kind: 'entries'; entries: readonly EncodedEntry[] }>
  | Readonly<{ kind: 'recovered'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'rejected'; failure: SessionFailure }>
/** Runs the domain services for one command and encodes the batch. reduce(decide(...)) round-trips under one interpreter. */
/** History the storage participant reads inside the transaction. Only commitDerived(compaction) needs it; null otherwise. open holds the entry references of the open work that openWork names. */
export type DecideReads = Readonly<{ compaction: CompactionContext | null }>
export declare function decide(previous: WorkSnapshot, command: SessionCommand, guards: readonly GuardCommand[], record: OperationRecord | null, reads: DecideReads): Decision
```

## 出站端口与块声明

[构造依赖端口与出站端口](../SPEC.md#构造依赖端口与出站端口)、[会话块声明与设置值的固定时点](../SPEC.md#会话块声明与设置值的固定时点)。出站端口的参数只含本成员的值与不透明证据，输入只带身份，内容由适配器经 `readInput` 取得。服务键归 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md#端口服务键)。

```ts
export type DriveFailure =
  | Readonly<{ kind: 'denied' | 'busy' | 'terminal' | 'changed' | 'stale-advance' | 'unsupported' | 'conflict' }>
  | Readonly<{ kind: 'invalid'; reason: string; rejection: DurableEvidence }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'commit-unknown'; operation: string }>
export type DriveReply<T> = Promise<Outcome<T, DriveFailure>>
export type DriveTarget = Readonly<{ tenant: TenantId; session: SessionId; execution: string; operation: string }>
export type DriveReceipt = Readonly<{ revision: string; evidence: DurableEvidence }>
export type ExecutionStatus = Readonly<{
  revision: string | null
  state: 'missing' | 'open' | 'suspended' | 'ended'
  attachment: 'active' | 'detached' | 'superseded' | null
  conclusion: Readonly<{ outcome: 'complete' | 'fail' | 'cancelled'; cause: DurableEvidence | null; disposition: DurableEvidence }> | null
  evidence: DurableEvidence
}>
export interface AgentDrivePort {
  invoke(input: DriveTarget & Readonly<{ first: InputId; source: DurableEvidence; grant: DurableEvidence }>): DriveReply<DriveReceipt>
  submit(input: DriveTarget & Readonly<{ input: InputId; source: DurableEvidence }>): DriveReply<DriveReceipt>
  resume(input: DriveTarget & Readonly<{ recovery: DurableEvidence; grant: DurableEvidence }>): DriveReply<DriveReceipt>
  control(input: DriveTarget & Readonly<{ control: SessionOperationId; intent: Control }>): DriveReply<DriveReceipt>
  detach(input: DriveTarget & Readonly<{ advance: AdvanceRef }>): DriveReply<DurableEvidence>
  recordResult(input: DriveTarget & Readonly<{
    consumption: ConsumptionId; result: ProducedResult
    transfer: Readonly<{ kind: 'custody'; retained: DurableEvidence }> | Readonly<{ kind: 'processed'; completion: DurableEvidence }> | Readonly<{ kind: 'none' }>
    release: Readonly<{ kind: 'pending' }> | Readonly<{ kind: 'confirmed'; receipt: DurableEvidence }>
  }>): DriveReply<DriveReceipt>
  query(input: DriveTarget): DriveReply<'committed' | 'excluded' | 'unknown'>
  inspect(input: Omit<DriveTarget, 'operation'>): DriveReply<ExecutionStatus>
  /** Not called until the Agent host instance-creation entry exists (SPEC P-7). */
  prewarm(input: Readonly<{ tenant: TenantId; session: SessionId; adoption: Adoption; counters: DurableEvidence }>): DriveReply<'requested'>
}
export interface ToolStartFencePort {
  invalidate(input: Readonly<{
    tenant: TenantId; session: SessionId; operation: SessionOperationId
    scope: Readonly<{ kind: 'run'; run: RunId }> | Readonly<{ kind: 'attempt'; advance: AdvanceRef }> | Readonly<{ kind: 'session' }>
    revision: SessionRevision
  }>): Promise<'effective' | 'pending' | 'unavailable' | 'commit-unknown'>
}
export type ScopeReleaseReadback = Readonly<{
  dispositions: readonly ScopeReleaseDisposition[]; source: DurableEvidence
}>
export interface DeliveryReleasePort {
  /** Model ACK or Tool delivery release for one result version, with the custody or completion evidence. */
  release(input: Readonly<{
    tenant: TenantId; session: SessionId; operation: SessionOperationId
    consumption: ConsumptionId; result: ProducedResult; evidence: DurableEvidence
  }>): Promise<
    | Readonly<{ kind: 'confirmed'; source: DurableEvidence }>
    | Readonly<{ kind: 'not-ready' | 'unavailable' | 'commit-unknown' }>
  >
}
export interface ScopeReleasePort {
  release(input: Readonly<{
    tenant: TenantId; session: SessionId; task: SessionOperationId; scope: string
  }>): Promise<ScopeReleaseReadback>
}
export type SessionBlockDeclaration = Readonly<{
  name: 'session.modes'; kind: 'supplied'; recovery: 'persisted'; volatility: 'stable'
  consumers: readonly ('model' | 'coordinator')[]; schema: Adoption
}>
export declare const sessionModesBlock: SessionBlockDeclaration
```

`ScopeReleasePort` 的参数不含恢复授权。恢复授权由应用装配层的维护拥有者签发，经装配注入端口实现。`query` 的 `excluded` 是 Agent 的排除证明，等于本成员 `OperationResolution` 的 `not-committed`。`invalidate` 返回 `unavailable` 或 `commit-unknown` 时，`ControlProgress.startFence` 与 `tasks.start-fence` 保持 `pending`。`release` 结果未知或抛出时任务状态为 `unknown`，以同一操作身份重试。

## 当前增量与后续接口

[构造依赖端口与出站端口](../SPEC.md#构造依赖端口与出站端口)。

```ts
export type MutationName =
  | 'accept' | 'startRun' | 'claim' | 'reload' | 'recordMessage'
  | 'preserveResult' | 'completeConsumption' | 'completeExternalConsumption'
  | 'bindExternalCall' | 'commitDerived' | 'release'
  | 'control' | 'finishRun' | 'create' | 'completeInitialization' | 'change'
  | 'setRelation' | 'configureAutoArchive' | 'considerAutoArchive' | 'recordIdle' | 'interrupt' | 'freeze' | 'receive'
type Mutations = Pick<SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>, MutationName>
export type SessionCommand = {
  readonly [K in MutationName]: Readonly<{
    kind: K; input: Omit<Parameters<Mutations[K]>[0], 'principal'>
  }>
}[MutationName]
export type GuardCommand = Readonly<{
  owner: string; participant: string; protocol: Adoption; facts: JsonValue
}>
export interface SessionIdentityBridge<P> {
  prepare(input: Access<P>, command: SessionCommand): Reply<GuardCommand>
}
export interface SessionEvidenceBridge {
  prepare(command: SessionCommand): Reply<readonly GuardCommand[]>
}
export interface SessionClock {
  sample(): Reply<ClockSample>
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export interface SessionIdleInput<P> {
  inspect(input: Access<P> & Readonly<{ time: ClockSample }>): Reply<IdleObservation>
  prepare(input: Access<P>, command: Extract<SessionCommand, {
    kind: 'recordIdle' | 'considerAutoArchive'
  }>): Reply<readonly GuardCommand[]>
}
export interface SessionContextInput<P> {
  prepare(input: Access<P>, command: Extract<SessionCommand, {
    kind: 'create' | 'change' | 'startRun' | 'reload'
  }>): Reply<readonly GuardCommand[]>
}
export interface SessionTransactionPort<P> {
  commit<K extends MutationName>(input: Readonly<{
    command: Extract<SessionCommand, { kind: K }>; guards: readonly GuardCommand[]
  }>): ReturnType<Mutations[K]>
  readWork(input: Access<P>): Reply<WorkSnapshot>
  readInput(input: Access<P> & Readonly<{ input: InputId }>): Reply<Extract<RoutedInput, { kind: 'ordinary' }>>
  queryOperation(input: Access<P> & Readonly<{ operation: SessionOperationId }>): Reply<OperationResolution>
  readonly history: SessionHistory<P>
  pending(input: Readonly<{
    principal: P; tenant: TenantId; after: string | null; limit: number; reason?: PendingReason
  }>): Reply<Readonly<{ sessions: readonly SessionId[]; next: string | null }>>
  references(input: Readonly<{
    principal: P; scope: 'system'; key: ResidentKey; after: string | null; limit: number
  }>): Reply<Readonly<{ sessions: readonly ResidentReference[]; next: string | null }>>
  /** System scope. Pages through scopes that archives released, for re-release after an execution-environment provider change. */
  releasedScopes(input: Readonly<{
    principal: P; scope: 'system'; after: string | null; limit: number
  }>): Reply<Readonly<{ scopes: readonly ReleasedScope[]; next: string | null }>>
}
/** Principals the application assembly issues for commands that Session's own coordinators and schedulers submit. The identity bridge verifies them. */
export type SessionInternalPrincipals<P> = Readonly<{ coordinator: P; maintainer: P }>
export interface SessionNotifier {
  committed(input: Readonly<{
    tenant: TenantId; session: SessionId; revision: SessionRevision
    source: DurableEvidence; kinds: readonly string[]
  }>): Promise<void>
}
```

## 实现工厂

配置、依赖聚合及构造函数由 [通用实现](../../session/docs/public-api.md) 拥有。调度策略是 `session` 工厂配置的一部分，不在本成员定义。有界恢复者重试的上限是该策略的配置字段，默认值只是初值。这里的提供者端口仍是可替换边界，不指定实现。
