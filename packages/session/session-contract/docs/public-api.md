# Session 公开入口与候选定义

当前根入口为 `export {}`，尚无工作治理和日志操作的生产导出。

实际导出与公开校验由 [src/index.ts](../src/index.ts) 及其导出模块拥有。下列声明是 #342 尚未技术接受、尚未实现的唯一候选定义，不是现有包的使用承诺。后继实现接管精确定义时，本页改为源码导航，不保留第二套手写签名。

行为、调用资格、参数与依赖分类归 [SPEC 的候选章节](../SPEC.md#342-主干运行契约候选)。消费路径见 [context](context.md)，对象关系见 [object-model](object-model/README.md)。

## 值、当前工作与原位置

[行为与约束](../SPEC.md#342-值当前工作与原位置)。

```ts
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Message } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'

declare const sessionIdentity: unique symbol
export type SessionIdentity<K extends string> = string & { readonly [sessionIdentity]: K }
export type SessionId = SessionIdentity<'SessionId'>
export type RunId = SessionIdentity<'RunId'>
export type AttemptId = SessionIdentity<'AttemptId'>
export type InputId = SessionIdentity<'SessionInputId'>
export type BatchId = SessionIdentity<'SessionBatchId'>
export type SessionOperationId = SessionIdentity<'SessionOperationId'>
export type SessionRevision = SessionIdentity<'SessionRevision'>
export type ConsumptionId = SessionIdentity<'SessionConsumptionId'>
export type EntryId = SessionIdentity<'SessionEntryId'>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type DurableEvidence = Readonly<{ owner: string; record: string; revision: string; digest: string }>
export type ConsumerRef = Readonly<{ owner: string; work: string; position: string; purpose: string }>
export type AgentInstanceRef = Readonly<{ owner: 'agent'; id: string }>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId; session: SessionId }>
export type Mutation<P> = Access<P> & Readonly<{ operation: SessionOperationId }>
export type AdvanceRef = Readonly<{ run: RunId; attempt: AttemptId; instance: AgentInstanceRef }>
export type AdvanceWrite<P> = Mutation<P> & Readonly<{ advance: AdvanceRef; expected: SessionRevision }>
export type Continuation = Readonly<{
  position: string; definition: Adoption; schema: Adoption; value: JsonValue
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
  id: ConsumptionId; binding: CallBinding
  results: readonly ResultConsumption[]; resume: Continuation | null
}>
export type InputBatch = Readonly<{
  id: BatchId; boundary: SessionRevision; ordered: readonly InputId[]
}>
export type RunTerminal = Readonly<{
  run: RunId; outcome: 'completed' | 'failed' | 'cancelled'; evidence: DurableEvidence
}>
export type RunState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'active'; run: RunId; adoption: Adoption; batch: InputBatch
      advance: AdvanceRef | null; ordinal: string; continuation: Continuation
    }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
export type Waiting =
  | Readonly<{ kind: 'producer'; binding: CallBinding; position: string }>
  | Readonly<{
      kind: 'extension-batch'; passage: string; position: string
      members: readonly Readonly<{ action: string; card: DurableEvidence; decision: DurableEvidence | null }>[]
    }>
export type ControlTarget =
  | Readonly<{ kind: 'run'; run: RunId }>
  | Readonly<{ kind: 'producer'; producer: ProducerRef }>
  | Readonly<{ kind: 'session' }>
export type ControlProgress = Readonly<{
  operation: SessionOperationId; target: ControlTarget; intent: ControlIntent
  state: 'committed' | 'propagating' | 'reconciled'; pending: readonly ProducerRef[]
}>
export type ControlIntent =
  | Readonly<{ kind: 'control'; value: Control }>
  | Readonly<{ kind: 'interrupt'; run: RunId; urgent: Extract<RoutedInput, { kind: 'ordinary' }>; decision: DurableEvidence }>
  | Readonly<{ kind: 'auto-archive'; idleEvidence: DurableEvidence }>
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
export type WorkSnapshot = Readonly<{
  session: SessionId; tenant: TenantId; revision: SessionRevision; interpreter: Adoption; source: DurableEvidence
  lifecycle: 'initializing' | 'dormant' | 'active' | 'archived'
  definition: Readonly<{ name: string; adopted: Adoption }>
  execution: Adoption; declarations: DurableEvidence
  run: RunState; pending: readonly InputId[]
  waiting: readonly Waiting[]; consumptions: readonly Consumption[]
  controls: readonly ControlProgress[]; unresolved: readonly SessionOperationId[]
  creation: SessionCreation; tasks: readonly RecoveryTask[]
  idle: Readonly<{ observation: IdleObservation; commit: DurableEvidence }> | null
}>
```

## 输入、推进、结果及终态操作

[行为与约束](../SPEC.md#342-输入推进结果及终态操作)。

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
  | Readonly<{ kind: 'archived' | 'no-input' | 'run-active' | 'stale-advance' | 'blocked' }>
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
export type StartedRun = Readonly<{
  receipt: CommitReceipt; advance: AdvanceRef; adopted: Adoption; inputs: InputBatch
}>
export type Completion = Readonly<{
  consumption: ConsumptionId; result: ProducedResult; position: string
  processing: DurableEvidence; message: Message | null
  extensionConclusions: readonly DurableEvidence[]; resume: Continuation
}>
export type ExternalCompletion = Readonly<{
  consumption: ConsumptionId; result: ProducedResult; position: string
  processing: DurableEvidence; message: Message | null
}>
export type BatchPage = Readonly<{
  batch: InputBatch; inputs: readonly Extract<RoutedInput, { kind: 'ordinary' }>[]
  next: string | null; exhausted: boolean
}>
export type FixedRequestMaterial = Readonly<{
  consumption: ConsumptionId; producer: ProducerRef; source: DurableEvidence
  schema: Adoption; value: JsonValue
}>
export type Control =
  | Readonly<{ kind: 'cancel-run'; run: RunId; urgency: 'graceful' | 'force' }>
  | Readonly<{ kind: 'stop-call'; producer: ProducerRef }>
  | Readonly<{ kind: 'background-tool'; producer: Extract<ProducerRef, { kind: 'tool' }> }>
  | Readonly<{ kind: 'archive' }>
  | Readonly<{ kind: 'unarchive' }>
export type RunConclusion =
  | Readonly<{ kind: 'complete'; beforeTerminal: DurableEvidence }>
  | Readonly<{ kind: 'fail'; cause: DurableEvidence }>
export type DerivedMessage =
  | Readonly<{ kind: 'compaction'; message: Message; derivation: DurableEvidence; original: DurableEvidence }>
  | Readonly<{ kind: 'context-reminder'; message: Message; source: DurableEvidence }>
  | Readonly<{ kind: 'background-placeholder'; message: Message; producer: Extract<ProducerRef, { kind: 'tool' }>; source: DurableEvidence }>
export interface SessionWork<P> {
  accept(input: Mutation<P> & Readonly<{ value: RoutedInput }>): Reply<CommitReceipt>
  readWork(input: Access<P>): Reply<WorkSnapshot>
  readBatch(input: Access<P> & Readonly<{ batch: BatchId; cursor: string | null }>): Reply<BatchPage>
  readRequest(input: Access<P> & Readonly<{ consumption: ConsumptionId }>): Reply<FixedRequestMaterial>
  startRun(input: Mutation<P> & Readonly<{
    candidate: Adoption; initial: Continuation; instance: AgentInstanceRef
  }>): Reply<StartedRun>
  takeInputs(input: AdvanceWrite<P> & Readonly<{ position: string }>): Reply<Readonly<{ receipt: CommitReceipt; batch: InputBatch }>>
  claim(input: Mutation<P> & Readonly<{
    run: RunId; instance: AgentInstanceRef; continuity: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  reload(input: Mutation<P> & Readonly<{
    run: RunId; candidate: Adoption; instance: AgentInstanceRef; resume: Continuation; handover: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  bindCall(input: AdvanceWrite<P> & Readonly<{
    binding: CallBinding; resume: Continuation
  }>): Reply<Readonly<{ receipt: CommitReceipt; consumption: ConsumptionId }>>
  bindExternalCall(input: Mutation<P> & Readonly<{
    expected: SessionRevision; qualification: DurableEvidence
    binding: CallBinding & Readonly<{ initiatingAttempt: null }>
  }>): Reply<Readonly<{ receipt: CommitReceipt; consumption: ConsumptionId }>>
  preserveResult(input: Mutation<P> & Readonly<{
    consumption: ConsumptionId; result: ProducedResult; custody: DurableEvidence
  }>): Reply<DurableEvidence>
  completeConsumption(input: AdvanceWrite<P> & Readonly<{ completion: Completion }>): Reply<DurableEvidence>
  completeExternalConsumption(input: Mutation<P> & Readonly<{
    expected: SessionRevision; qualification: DurableEvidence; completion: ExternalCompletion
  }>): Reply<DurableEvidence>
  recordProgress(input: AdvanceWrite<P> & Readonly<{
    passage: DurableEvidence; resume: Continuation; waiting: readonly Waiting[]
  }>): Reply<CommitReceipt>
  commitDerived(input: AdvanceWrite<P> & Readonly<{
    value: DerivedMessage; judgment: DurableEvidence; resume: Continuation
  }>): Reply<CommitReceipt>
  release(input: AdvanceWrite<P> & Readonly<{ resume: Continuation }>): Reply<CommitReceipt>
  control(input: Mutation<P> & Readonly<{ intent: Control }>): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
  finishRun(input: AdvanceWrite<P> & Readonly<{ conclusion: RunConclusion }>): Reply<Readonly<{ receipt: CommitReceipt; terminal: RunTerminal }>>
  queryOperation(input: Access<P> & Readonly<{ operation: SessionOperationId }>): Reply<OperationResolution>
  loadRecovery(input: Access<P>): Reply<WorkSnapshot>
}
```

## 同提交守卫与跨成员使用

[行为与约束](../SPEC.md#342-同提交守卫与跨成员使用)。

## 控制、恢复与保管边界

[行为与约束](../SPEC.md#342-控制恢复与保管边界)。

## 创建、声明与历史

[行为与约束](../SPEC.md#342-创建声明与历史)。

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
export type DeclarationChange =
  | Readonly<{ kind: 'permission-mode'; value: Modes['permission']; authorization: DurableEvidence }>
  | Readonly<{ kind: 'collaboration-mode'; value: Modes['collaboration']; authorization: DurableEvidence }>
  | Readonly<{ kind: 'environment-mode'; value: Adoption; authorization: DurableEvidence }>
  | Readonly<{ kind: 'workspace'; value: Adoption | null; basis: DurableEvidence }>
  | Readonly<{ kind: 'model'; name: string; basis: DurableEvidence }>
  | Readonly<{ kind: 'context-registration'; registration: DurableEvidence }>
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
export interface SessionManagement<P> {
  inspectIdle(input: Access<P>): Reply<IdleObservation>
  recordIdle(input: Mutation<P> & Readonly<{
    expected: SessionRevision; observation: IdleObservation
  }>): Reply<CommitReceipt>
  create(input: Mutation<P> & Readonly<{ creation: SessionCreation }>): Reply<Readonly<{ receipt: CommitReceipt; state: WorkSnapshot }>>
  completeInitialization(input: Mutation<P> & Readonly<{ result: InitializationResult }>): Reply<CommitReceipt>
  change(input: Mutation<P> & Readonly<{ declaration: DeclarationChange }>): Reply<CommitReceipt>
  setRelation(input: Mutation<P> & Readonly<{ relation: Relation }>): Reply<CommitReceipt>
  configureAutoArchive(input: Mutation<P> & Readonly<{
    policy: Readonly<{ kind: 'disabled' }> | Readonly<{ kind: 'enabled'; idleMs: string }>
  }>): Reply<CommitReceipt>
  considerAutoArchive(input: Mutation<P> & Readonly<{ idleEvidence: DurableEvidence }>): Reply<Readonly<{
    result: 'archived' | 'not-due' | 'exempt' | 'disabled'; receipt: CommitReceipt | null
  }>>
  interrupt(input: Mutation<P> & Readonly<{
    run: RunId; urgent: Extract<RoutedInput, { kind: 'ordinary' }>; decision: DurableEvidence
  }>): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
}
export type ProducerFact =
  | Readonly<{ kind: 'execution'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{ kind: 'account'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{ kind: 'release'; consumption: ConsumptionId; result: ProducedResult; source: DurableEvidence }>
  | Readonly<{ kind: 'control'; control: SessionOperationId; source: DurableEvidence }>
  | Readonly<{ kind: 'cascade'; child: SessionId; childOperation: SessionOperationId; source: DurableEvidence }>
  | Readonly<{ kind: 'routed-input'; originalOperation: SessionOperationId; source: DurableEvidence }>
export interface SessionReconciliation<P> {
  receive(input: Mutation<P> & Readonly<{ fact: ProducerFact }>): Reply<CommitReceipt>
  pending(input: Readonly<{ principal: P; tenant: TenantId; after: string | null; limit: number }>): Reply<Readonly<{
    sessions: readonly SessionId[]; next: string | null
  }>>
}
export type HistoryEntry = Readonly<{
  id: EntryId; revision: SessionRevision; kind: string; schema: Adoption
  payload: JsonValue; origin: DurableEvidence
}>
export type HistoryPage = Readonly<{
  source: string; interpreter: Adoption; upper: SessionRevision
  entries: readonly HistoryEntry[]; scannedThrough: string
  next: string | null; exhausted: boolean
}>
export interface SessionHistory<P> {
  begin(input: Access<P> & Readonly<{
    kinds: readonly string[]; from: EntryId | null; pageBytes: number
  }>): Reply<HistoryPage>
  next(input: Access<P> & Readonly<{ cursor: string }>): Reply<HistoryPage>
}
export interface SessionService<P> {
  readonly work: SessionWork<P>
  readonly management: SessionManagement<P>
  readonly reconciliation: SessionReconciliation<P>
  readonly history: SessionHistory<P>
}
```

## 当前增量与后续接口

[行为与约束](../SPEC.md#342-当前增量与后续接口)。

```ts
export type MutationName =
  | 'accept' | 'startRun' | 'takeInputs' | 'claim' | 'reload' | 'bindCall'
  | 'bindExternalCall' | 'completeExternalConsumption'
  | 'preserveResult' | 'completeConsumption' | 'recordProgress' | 'release'
  | 'commitDerived'
  | 'control' | 'finishRun' | 'create' | 'completeInitialization' | 'change'
  | 'setRelation' | 'configureAutoArchive' | 'considerAutoArchive' | 'recordIdle' | 'interrupt' | 'receive'
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
  readBatch(input: Access<P> & Readonly<{ batch: BatchId; cursor: string | null }>): Reply<BatchPage>
  readRequest(input: Access<P> & Readonly<{ consumption: ConsumptionId }>): Reply<FixedRequestMaterial>
  queryOperation(input: Access<P> & Readonly<{ operation: SessionOperationId }>): Reply<OperationResolution>
  readonly history: SessionHistory<P>
  pending(input: Readonly<{ principal: P; tenant: TenantId; after: string | null; limit: number }>): Reply<Readonly<{
    sessions: readonly SessionId[]; next: string | null
  }>>
}
export interface SessionNotifier {
  committed(input: Readonly<{ tenant: TenantId; session: SessionId; revision: SessionRevision; source: DurableEvidence }>): Promise<void>
}
```

## 实现工厂

配置、依赖聚合及构造函数由 [通用实现](../../session/docs/public-api.md) 拥有。这里的提供者端口仍是可替换边界，不指定实现。
