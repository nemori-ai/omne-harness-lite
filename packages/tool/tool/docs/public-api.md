# Tool 公开入口与设计定义

当前根入口只导出 `toolBodyContract`。下列独立执行、托管执行及实例目录接口已完成设计接受，尚未实现。

已实现的导出与公开校验由 [src/index.ts](../src/index.ts) 及其导出模块拥有。本页拥有尚未实现接口的唯一设计定义。实现接管后，本页改为源码导航，不保留第二套手写签名。

行为、调用资格、参数与依赖分类归 [SPEC 的运行契约](../SPEC.md#342-主干运行契约候选)。消费路径见 [context](context.md)，对象关系见 [object-model](object-model.md)。

## 值、定义和固定请求

[行为与约束](../SPEC.md#342-值定义和固定请求)。

```ts
import type { Outcome } from '@omne-harness/kernel-basis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { BlockId, ContentBlock, ContentReference, ReferenceContentBlock, TextContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallAccount } from '@omne-harness/call-account'
import type { SchemaRef, SchemaIssue } from '@omne-harness/schema-provider'

declare const toolIdentity: unique symbol
export type ToolIdentity<K extends string> = string & { readonly [toolIdentity]: K }
export type ToolCallId = ToolIdentity<'ToolCallId'>
export type ToolOperationId = ToolIdentity<'ToolOperationId'>
export type ToolInstanceId = ToolIdentity<'ToolInstanceId'>
export type ToolWaitId = ToolIdentity<'ToolWaitId'>
export type ToolResultVersion = ToolIdentity<'ToolResultVersion'>
export type ToolDeliveryId = ToolIdentity<'ToolDeliveryId'>
export type ToolCursor = ToolIdentity<'ToolCursor'>
export type ToolRevision = ToolIdentity<'ToolRevision'>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type ConsumerRef = Readonly<{ owner: string; work: string; position: string; purpose: string }>
export type DurableEvidence = Readonly<{ owner: string; record: string; revision: string; digest: string }>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
export type CallAccess<P> = Access<P> & Readonly<{ call: ToolCallId }>
export type Mutation<P> = CallAccess<P> & Readonly<{ operation: ToolOperationId }>
export type ParameterContract = Readonly<{
  schema: JsonValue; vocabulary: Adoption; descriptions: readonly Readonly<{ path: string; text: string }>[]
}>
export type ToolSchemaIdentity = Readonly<{
  id: string; revision: string; digest: string
}>
export type ToolValueSchema<T> = Readonly<{
  identity: ToolSchemaIdentity; ref: SchemaRef<T>; maxBytes: number
}>
export type ToolProgramDeclaration =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'json'; contract: Adoption; schema: ToolSchemaIdentity; definition: ParameterContract; maxBytes: number }>
export type ToolReturnDeclaration = Readonly<{
  kind: 'ordinary' | 'structured'; program: ToolProgramDeclaration
}>
export type ToolDefinitionMetadata = Readonly<{
  adoption: Adoption; name: string; description: string
  requiredCapabilities: readonly string[]
  backgroundAllowed: boolean
  programmable?: boolean
  declarations: ToolDeclarations
}>
export type ToolDefinition = ToolDefinitionMetadata & (
  | Readonly<{ kind: 'function'; parameters: ParameterContract; returns: ToolReturnDeclaration }>
  | Readonly<{
      kind: 'commands'; commands: readonly Readonly<{
        name: string; summary: string
        parameters: Readonly<{ kind: 'declared'; value: ParameterContract }> | Readonly<{ kind: 'executor-owned' }>
        returns: ToolReturnDeclaration
      }>[]
    }>
)
export type ToolAvailability =
  | Readonly<{ kind: 'available'; definition: ToolDefinition; executor: Adoption }>
  | Readonly<{ kind: 'known-unavailable'; definition: ToolDefinition; reason: string }>
export type ToolArguments = Readonly<{
  original: string; effective: string; complete: boolean
}>
export type ResourceScope =
  | Readonly<{ kind: 'session'; owner: string; session: string }>
  | Readonly<{ kind: 'independent'; owner: string; resource: string }>
export type ToolInvocation = Readonly<{
  kind: 'direct' | 'programmatic'
  source: DurableEvidence
}>

export type FixedToolRequest = Readonly<{
  availability: ToolAvailability
  invocation: ToolInvocation
  command: string | null
  arguments: ToolArguments
  settings: Adoption; context: Adoption; workspace: Adoption | null
  environment: Adoption; resources: readonly Adoption[]
  scope: ResourceScope; consumer: ConsumerRef
  batchDecision: DurableEvidence | null
  mode: 'foreground' | 'background'
  limits: Readonly<{
    concurrency: number | null; foregroundMs: number | null; backgroundAfterMs: number | null
  }>
}>
```

## 返回与执行事实

[行为与约束](../SPEC.md#342-返回与执行事实)。

```ts
export type Attachment = ContentReference
export type ToolMessageContentBlock = TextContentBlock | ReferenceContentBlock
export declare function projectToolResult(
  value: ToolResult<ContentBlock>, attachmentBlockIds: readonly BlockId[],
): Outcome<
  readonly ToolMessageContentBlock[], Readonly<{ field: string; reason: string }>
>
export type ToolResult<B extends ContentBlock> = Readonly<{
  content: readonly B[]
  data: ToolResultData
  original: Readonly<{ kind: 'none' }> | Readonly<{
    kind: 'offloaded'; source: Attachment; summary: readonly B[]
  }>
  attachments: readonly Attachment[]
}>
export type ToolResultData =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'json'; contract: Adoption; schema: ToolSchemaIdentity; value: JsonValue
    }>
export type Effect =
  | Readonly<{ kind: 'not-started' }>
  | Readonly<{ kind: 'not-occurred'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'occurred'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
export type StopReason = 'user' | 'foreground-timeout' | 'run-cancelled'
  | 'session-archived' | 'interruption' | 'agent-owned-background'
export type ToolTerminal =
  | Readonly<{ kind: 'completed' }>
  | Readonly<{ kind: 'failed'; cause: 'arguments' | 'environment' | 'executor' | 'runtime-lost' | 'result'; diagnostic: string }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{ kind: 'interrupted'; reason: StopReason }>
  | Readonly<{ kind: 'no-response'; wait: ToolWaitId; reason: string }>
export type ToolFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict'; operation: ToolOperationId }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>
  | Readonly<{ kind: 'commit-unknown'; operation: ToolOperationId }>
  | Readonly<{ kind: 'not-settled' }>
  | Readonly<{ kind: 'stale-instance'; instance: ToolInstanceId }>
  | Readonly<{ kind: 'stale-revision'; current: ToolRevision }>
  | Readonly<{ kind: 'invalid-cursor'; reason: string }>
  | Readonly<{ kind: 'unsupported'; adoption: Adoption; reason: string }>
export type Reply<T> = Promise<Outcome<T, ToolFailure>>
export type WaitState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'ask'; wait: ToolWaitId; card: DurableEvidence; resume: DurableEvidence
      decision: DurableEvidence | null
    }>
  | Readonly<{
      kind: 'resource'; wait: ToolWaitId; contract: Adoption
      deadline: string | null; resume: DurableEvidence; registration: DurableEvidence
    }>
export type DeliveryState =
  | Readonly<{ kind: 'pending'; delivery: ToolDeliveryId; consumer: ConsumerRef }>
  | Readonly<{ kind: 'released'; delivery: ToolDeliveryId; consumer: ConsumerRef; evidence: DurableEvidence }>
export type ToolState = Readonly<{
  call: ToolCallId; revision: ToolRevision
  source: DurableEvidence; foreground: ForegroundReturn | null
  effect: Effect; execution: PhysicalExecution
  timing: ToolTiming; queue: QueuePosition; controls: readonly ControlRecord[]
  delivery: DeliveryState | null
  supplements: readonly Readonly<{
    result: ToolResultVersion; actual: ToolTerminal; delivery: DeliveryState; source: DurableEvidence
  }>[]
}> & (
  | (Readonly<{ phase: 'accepted' | 'preparing' | 'queued' | 'starting'; wait: Readonly<{ kind: 'none' }> }> & ToolRelation)
  | (Readonly<{ phase: 'running'; instance: ToolInstanceId }> & ActiveRelation)
  | (Readonly<{ phase: 'suspended'; checkpoint: DurableEvidence }> & ActiveRelation)
  | (Readonly<{ phase: 'settled'; wait: Readonly<{ kind: 'none' }>; result: ToolResultVersion }> & (
      | Readonly<{ relation: 'foreground'; terminal: ToolTerminal }>
      | Readonly<{ relation: 'background'; terminal: Exclude<ToolTerminal, { kind: 'no-response' }> }>
    ))
)
export type ToolRelation = Readonly<{ relation: 'foreground' | 'background' }>
export type ActiveRelation =
  | Readonly<{ relation: 'foreground'; wait: WaitState }>
  | Readonly<{ relation: 'background'; wait: Readonly<{ kind: 'none' }> }>
export type ResultPage<B extends ContentBlock> = Readonly<{
  result: ToolResultVersion; terminal: ToolTerminal; effect: Effect
  actualTerminal: ToolTerminal | null; relation: 'original' | 'late'; delivery: ToolDeliveryId
  source: DurableEvidence
  value: ToolResult<B>; next: string | null
}>
export type OperationResolution =
  | Readonly<{ kind: 'committed'; revision: ToolRevision; receipt: DurableEvidence }>
  | Readonly<{ kind: 'rolled-back' | 'not-committed' }>
  | Readonly<{ kind: 'unknown' }>
export type ToolLookup = Readonly<{ kind: 'found'; state: ToolState }>
  | Readonly<{ kind: 'not-accepted'; operation: ToolOperationId }>
```

## 普通操作与实例目录

[行为与约束](../SPEC.md#342-普通操作与实例目录)。

```ts
export type ToolControl =
  | Readonly<{ kind: 'stop'; reason: StopReason }>
  | Readonly<{ kind: 'background'; reason: 'user' | 'threshold' | 'foreground-limit' | 'interruption' }>
export type ControlReceipt = Readonly<{
  operation: ToolOperationId; state: ToolState
  progress: ControlProgress
}>
export type ForegroundReturn =
  | Readonly<{ kind: 'final'; result: ToolResultVersion }>
  | Readonly<{ kind: 'background'; call: ToolCallId; reason: string }>
export type ProcessBlock = Readonly<{
  index: string; mode: 'append' | 'replace'; state: 'open' | 'closed'; sequence: string
  content: ContentBlock
  trim: Readonly<{ removed: string; reason: string }> | null
}>
export type ToolObservation =
  | Readonly<{ kind: 'snapshot'; cursor: ToolCursor; state: ToolState; process: readonly ProcessBlock[]; foreground: ForegroundReturn | null }>
  | Readonly<{ kind: 'delta'; from: ToolCursor; cursor: ToolCursor; state: ToolState; blocks: readonly ProcessBlock[] }>
  | Readonly<{ kind: 'gap'; after: ToolCursor; reason: 'buffer' | 'history' }>
  | Readonly<{ kind: 'ended'; reason: 'closed' | 'denied' | 'unavailable' | 'stale-instance' }>
export interface ToolHandle<P> {
  readonly instance: ToolInstanceId
  observe(input: Access<P> & Readonly<{ after: ToolCursor | null; signal: AbortSignal }>): AsyncIterable<ToolObservation>
}
export interface ToolDirectory<P> {
  connect(input: CallAccess<P>): Reply<Readonly<{ kind: 'live'; handle: ToolHandle<P> }> | Readonly<{ kind: 'no-live-route' }>>
}
export type Handoff =
  | Readonly<{ kind: 'retained'; custody: DurableEvidence }>
  | Readonly<{ kind: 'processed'; completion: DurableEvidence }>
export interface ToolRuntime<P, B extends ContentBlock> {
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  admit(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): Reply<Readonly<{ state: ToolState; recovered: boolean }>>
  lookup(input: CallAccess<P> & Readonly<{ admission: ToolOperationId }>): Reply<ToolLookup>
  queryOperation(input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>): Reply<OperationResolution>
  control(input: Mutation<P> & Readonly<{ intent: ToolControl }>): Reply<ControlReceipt>
  acceptDecision(input: Mutation<P> & Readonly<{ wait: ToolWaitId; decision: DurableEvidence }>): Reply<WaitState>
  acceptResource(input: Mutation<P> & Readonly<{ wait: ToolWaitId; response: DurableEvidence }>): Reply<WaitRecord>
  readProcess(input: CallAccess<P> & Readonly<{ at: ToolCursor | null }>): Reply<ProcessSnapshot>
  readWait(input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>): Reply<WaitRecord>
  readDiagnostics(input: CallAccess<P> & Readonly<{ after: string | null }>): Reply<DiagnosticPage>
  readResult(input: CallAccess<P> & Readonly<{ result: ToolResultVersion; after: string | null }>): Reply<ResultPage<B>>
  releaseDelivery(input: Mutation<P> & Readonly<{
    result: ToolResultVersion; delivery: ToolDeliveryId; consumer: ConsumerRef; evidence: Handoff
  }>): Reply<DeliveryState>
  account(input: CallAccess<P>): Reply<CallAccount>
  readonly catalog: ToolCatalog<P>
  readonly content: ToolContentReader<P>
  readonly instances: ToolDirectory<P>
}
```

## 作者执行上下文

本节是作者唯一的过程输出和内部等待接口。异步 `emit` 返回接管回执；同步等待指作者使用 `await wait` 暂停本次工具的后续步骤。两者都不阻塞宿主线程。完整语义归 [P11](../SPEC.md#p11-作者输出与等待原语)，使用示例归 [flows](flows.md#作者调用-emit-和-wait)。

```ts
export type ToolProcessUpdate =
  | Readonly<{ kind: 'append-text'; index: string; text: string; close: boolean }>
  | Readonly<{ kind: 'replace'; index: string; content: ContentBlock; close: boolean }>
export type ToolEmitReceipt = Readonly<{ sequence: string }> & (
  | Readonly<{ kind: 'local' }>
  | Readonly<{ kind: 'retained'; evidence: DurableEvidence }>
)
export type ToolPrimitiveFailure = Readonly<{ reason: string }> & (
  | Readonly<{
      kind: 'invalid' | 'unsupported' | 'capacity' | 'too-large' | 'busy' | 'conflict' | 'closed' | 'cancelled'
    }>
  | Readonly<{ kind: 'unavailable' | 'unknown'; operation: string }>
)
declare const toolWaitContract: unique symbol
export type ToolWaitProtocolDefinition<A, K extends 'ask' | 'resource'> = Readonly<{
  kind: K; adoption: Adoption
  request: ToolValueSchema<unknown>; response: ToolValueSchema<A>
  expiry: K extends 'ask' ? 'forbidden' : 'forbidden' | 'supported'
}>
export type ToolWaitContract<A, K extends 'ask' | 'resource'> = ToolWaitProtocolDefinition<A, K>
  & Readonly<{ [toolWaitContract]: true }>
export declare function defineToolWaitContract<A, K extends 'ask' | 'resource'>(
  definition: ToolWaitProtocolDefinition<A, K>,
): Outcome<ToolWaitContract<A, K>, Readonly<{ reason: string }>>
export type ToolDecision<A> =
  | Readonly<{ kind: 'answer'; value: A }>
  | Readonly<{ kind: 'no-answer' }>
  | Readonly<{ kind: 'declined' }>
export type ToolAskRequest<A = JsonValue> = Readonly<{
  kind: 'ask'; key: string; contract: ToolWaitContract<A, 'ask'>; request: JsonValue
}>
export type ToolResourceWaitRequest<A = JsonValue> = Readonly<{
  kind: 'resource'; key: string; contract: ToolWaitContract<A, 'resource'>; request: JsonValue; deadline: string | null
}>
export type ToolResourceReply<A = JsonValue> =
  | Readonly<{ kind: 'response'; value: A }>
  | Readonly<{ kind: 'expired' }>
export interface ToolProcessEmitter {
  emit(update: ToolProcessUpdate): Promise<Outcome<ToolEmitReceipt, ToolPrimitiveFailure>>
}
export interface ToolWaiter {
  wait<A>(request: ToolAskRequest<A>): Promise<Outcome<ToolDecision<A>, ToolPrimitiveFailure>>
  wait<A>(request: ToolResourceWaitRequest<A>): Promise<Outcome<ToolResourceReply<A>, ToolPrimitiveFailure>>
}
export interface ToolExecutionContext extends ToolProcessEmitter, ToolWaiter {
  readonly mode: 'independent' | 'managed'
  readonly signal: AbortSignal
}
export type ToolAuthorLimits = Readonly<{
  authorBufferBytes: number; authorBufferItems: number
  authorWaitHistoryBytes: number; authorWaitHistoryItems: number
}>
export interface ToolExecutionScope {
  readonly context: ToolExecutionContext
  readonly limits: ToolAuthorLimits
  finish(exit: 'returned' | 'failed'): Promise<Outcome<void, ToolPrimitiveFailure>>
}
```

`contract` 携带作者定义的请求和响应 schema；defineToolWaitContract 固定声明，不授予使用资格。执行绑定只装载其允许的契约。请求是严格 JSON 树，响应 A 从所传契约的 SchemaRef 取得，并在运行时验证后产生；不能靠手填泛型绕过校验。底层持久 DecisionValue 仍为 JSON，作者得到 ToolDecision<A>。取消属于失败分支，不属于决定或资源回应。完整输入、提交失败和响应生效次序归 [P12](../SPEC.md#p12-等待-schema-与响应提交)。

```ts
export type ToolWaitSchemaSnapshot = Readonly<{
  contract: Adoption; request: ToolSchemaIdentity; response: ToolSchemaIdentity
  requestMaxBytes: number; responseMaxBytes: number
  expiry: 'forbidden' | 'supported'; source: DurableEvidence
}>
export type ToolResponseCandidate =
  | Readonly<{ kind: 'answer' | 'resource'; value: JsonValue }>
  | Readonly<{ kind: 'no-answer' | 'declined' }>
export type ToolWaitValidation =
  | Readonly<{ kind: 'valid'; candidate: ToolResponseCandidate; qualification: DurableEvidence }>
  | Readonly<{ kind: 'invalid'; issues: readonly SchemaIssue[] }>
  | Readonly<{ kind: 'denied' | 'stale' | 'conflict'; reason: string }>
export interface ToolWaitResponseValidator<P> {
  validate(input: CallAccess<P> & Readonly<{
    wait: ToolWaitId; submission: ToolOperationId; source: DurableEvidence
    candidate: ToolResponseCandidate
  }>): Reply<ToolWaitValidation>
}
```

此 validator 是 HITL 或资源接收者在提交有效回应前消费的门槛。valid 只证明一次校验及适用条件，不证明回应已生效。校验器使用原等待保存的 schema 快照、业务规则和资格；source 必须由受信接收者产生。提交者不能指定替代 schema。响应接收与提交接口仍归 HITL 或资源拥有者，Tool 不新增另一张决定表或 HTTP endpoint。

`ToolProcessEmitter` 和 `ToolWaiter` 是给辅助函数的窄依赖。它们不增加 Cordis 服务键。托管上下文由原执行绑定构造，作者不能填写 tenant、call、start、事实游标或保管证据。独立消费者显式提供作用域，`local` 回执不承诺耐久；托管执行只允许 `retained` 回执。执行包装器持有 ToolExecutionScope，作者只拿 context；finish 负责关闭受理并汇合既存输出，不是作者可调用的停止工具。

## 独立函数与依赖

[行为与约束](../SPEC.md#342-独立函数与依赖)。

```ts
export interface TextRenderer<R> {
  render(value: R): Outcome<string, Readonly<{ reason: string }>>
}
export interface ToolExecutor<A, R, E> {
  execute(argumentsValue: A, environment: E, execution: ToolExecutionContext): Promise<R>
}
export declare function executeTool<A, R, E>(
  argumentsValue: A, executor: ToolExecutor<A, R, E>, environment: E, scope: ToolExecutionScope,
): Promise<Outcome<R, Readonly<{ reason: string; effect: 'not-started' | 'unknown' }>>>
export interface ResultPolicy<B extends ContentBlock> {
  readonly adoption: Adoption
  judge(value: ContentBlock): Outcome<B, Readonly<{ reason: string }>>
  judgeResult(value: ToolResult<ContentBlock>): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
}
export type ToolExecutionRef = Readonly<{
  tenant: TenantId; call: ToolCallId; instance: ToolInstanceId; generation: string
}>
export type WriteContext = ToolExecutionRef & Readonly<{ operation: ToolOperationId; expected: ToolRevision }>
export type ToolRecovery<B extends ContentBlock> = Readonly<{
  state: ToolState; request: FixedToolRequest; admission: ToolOperationId
  initiator: Readonly<{ owner: string; subject: string; revision: string }>
  execution: ToolExecutionRef | null; checkpoint: DurableEvidence | null
  start: ToolStartRecord | null
  startRejection: Readonly<{ reason: string; exclusion: DurableEvidence }> | null
  invocations: readonly ToolStartRecord[]
  controls: readonly ControlRecord[]
  result: ToolResult<B> | null; unresolved: readonly ToolOperationId[]
  preparations: readonly PreparationRecord[]; waits: readonly WaitRecord[]
  suspensions: readonly SuspensionRecord[]; rawOutputs: readonly RawOutput[]
  tasks: readonly ToolTask[]
  program: ProgramClosure | null
  scheduling: ProgramScheduling | null
  streams: readonly FactProgress[]
}>
export interface ToolCommands<P, B extends ContentBlock> {
  admit(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): Reply<ToolState>
  control(input: Mutation<P> & Readonly<{ intent: ToolControl }>): Reply<ControlReceipt>
  acceptDecision(input: Mutation<P> & Readonly<{ wait: ToolWaitId; decision: DurableEvidence }>): Reply<WaitState>
  acceptResource(input: Mutation<P> & Readonly<{ wait: ToolWaitId; response: DurableEvidence }>): Reply<WaitRecord>
  releaseDelivery(input: Mutation<P> & Readonly<{ result: ToolResultVersion; delivery: ToolDeliveryId; consumer: ConsumerRef; evidence: Handoff }>): Reply<DeliveryState>
  scanPending(input: Access<P> & Readonly<{ after: string | null; limit: number }>): Reply<Readonly<{ calls: readonly ToolCallId[]; next: string | null }>>
  loadRecovery(input: CallAccess<P>): Reply<ToolRecovery<B>>
  claim(input: Mutation<P> & Readonly<{ instance: ToolInstanceId; continuity: DurableEvidence }>): Reply<ToolExecutionRef>
  planPreparation(input: WriteContext & Readonly<{ request: FixedToolRequest; purpose: 'initial' | 'resume' }>): Reply<PreparationRecord>
  prepared(input: WriteContext & Readonly<{ preparation: PreparationRecord; resources: DurableEvidence }>): Reply<ToolState>
  enqueue(input: WriteContext): Reply<ToolState>
  prepareStart(input: WriteContext): Reply<Readonly<{ state: ToolState; start: Extract<ToolStartRecord, { kind: 'start' }> }>>
  prepareResume(input: WriteContext & Readonly<{ checkpoint: DurableEvidence }>): Reply<Readonly<{ state: ToolState; start: Extract<ToolStartRecord, { kind: 'resume' }> }>>
  rejectPending(input: WriteContext & Readonly<{ reason: string; exclusion: DurableEvidence }>): Reply<ToolState>
  recordStart(input: WriteContext & Readonly<{ invocation: ToolStartRecord; outcome: StartProgress }>): Reply<ToolState>
  preserveProcess(input: WriteContext & Readonly<{ blocks: readonly ProcessBlock[] }>): Reply<ToolCursor>
  openWait(input: WriteContext & Readonly<{ wait: WaitIntent }>): Reply<WaitRecord>
  attachCard(input: WriteContext & Readonly<{ wait: ToolWaitId; card: DurableEvidence }>): Reply<WaitRecord>
  attachResource(input: WriteContext & Readonly<{ wait: ToolWaitId; registration: DurableEvidence }>): Reply<WaitRecord>
  planSuspension(input: WriteContext & Readonly<{ start: ToolStartRecord; schema: Adoption }>): Reply<SuspensionRecord>
  suspend(input: WriteContext & Readonly<{ suspension: SuspensionRecord; checkpoint: Checkpoint }>): Reply<ToolState>
  preserveResult(input: WriteContext & Readonly<{ raw: RawOutput; value: ToolResult<B>; terminal: ToolTerminal; effect: Effect }>): Reply<ToolState>
  recordResponse(input: WriteContext & Readonly<{ response: ResponseRecord; outcome: ResponseProgress }>): Reply<WaitRecord>
  closeWait(input: WriteContext & Readonly<{ wait: ToolWaitId; continuation: DurableEvidence }>): Reply<ToolState>
  recordControl(input: Mutation<P> & Readonly<{ control: ToolOperationId; source: DurableEvidence; progress: ControlProgress }>): Reply<ControlRecord>
  receiveFacts(input: CallAccess<P> & Readonly<{ start: ToolStartRecord; batch: FactBatch<B> }>): Reply<FactReceipt>
  recordFactAcknowledgement(input: Mutation<P> & Readonly<{ receipt: FactReceipt; sourceReceipt: DurableEvidence }>): Reply<FactProgress>
  recordScheduling(input: WriteContext & Readonly<{ scheduling: ProgramScheduling }>): Reply<ToolState>
  recordAccount(input: Mutation<P> & Readonly<{ start: ToolStartRecord | null; source: DurableEvidence; event: string; value: CallAccount }>): Reply<DurableEvidence>
  planRelease(input: Mutation<P> & Readonly<{ preparation: PreparationRecord; custody: DurableEvidence }>): Reply<ReleaseRecord>
  recordRelease(input: Mutation<P> & Readonly<{ release: ReleaseRecord; outcome: ReleaseProgress }>): Reply<DurableEvidence>
  recordLateFact(input: Mutation<P> & Readonly<{
    source: DurableEvidence; event: string
    fact: Readonly<{ kind: 'account'; value: CallAccount }> | Readonly<{ kind: 'effect'; value: Effect }>
  }>): Reply<ToolRevision>
  recordLateResult(input: Mutation<P> & Readonly<{
    start: ToolStartRecord; source: DurableEvidence; event: string
    raw: RawOutput; value: ToolResult<B>; actual: ToolTerminal; effect: Effect
  }>): Reply<Readonly<{ result: ToolResultVersion; delivery: DeliveryState }>>
  settleLost(input: Mutation<P> & Readonly<{ continuity: DurableEvidence }>): Reply<ToolState>
  recordTask(input: Mutation<P> & Readonly<{ task: ToolTask; resolution: TaskResolution }>): Reply<DurableEvidence>
}
```

## 发起、队列与环境协议

[行为与约束](../SPEC.md#342-发起队列与环境协议)。

## 等待、计时与接续

[行为与约束](../SPEC.md#342-等待计时与接续)。

## 结果、过程与后继责任

[行为与约束](../SPEC.md#342-结果过程与后继责任)。

<a id="当前增量与验证边界"></a>

## 运行契约的验证边界

[行为与约束](../SPEC.md#342-当前增量与验证边界)。

```ts
export type DecisionValue = ToolDecision<JsonValue>
export interface ToolDecisionBridge<P> {
  inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>
  ensure(input: Mutation<P> & Readonly<{ wait: ToolWaitId; request: DurableEvidence }>): Reply<DurableEvidence>
  inspect(input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>): Reply<Readonly<{ card: DurableEvidence; decision: DurableEvidence | null }>>
  invalidate(input: Mutation<P> & Readonly<{ wait: ToolWaitId; terminal: DurableEvidence }>): Reply<DurableEvidence>
  resolve(input: CallAccess<P> & Readonly<{
    wait: ToolWaitId; decision: DurableEvidence
  }>): Reply<DecisionValue>
}
export type ToolExecutionFact<B extends ContentBlock> =
  | Readonly<{ kind: 'process'; blocks: readonly ProcessBlock[] }>
  | Readonly<{ kind: 'wait'; value: WaitIntent }>
  | Readonly<{ kind: 'continued'; wait: ToolWaitId; response: ToolOperationId; timing: DurableEvidence }>
  | Readonly<{ kind: 'program-scheduling'; value: ProgramScheduling }>
  | Readonly<{ kind: 'account'; event: string; value: CallAccount }>
  | Readonly<{ kind: 'final'; raw: RawOutput; result: ToolResult<B>; terminal: ToolTerminal; effect: Effect }>
export interface ToolLiveExecution<B extends ContentBlock> {
  facts(input: Readonly<{ after: string | null; signal: AbortSignal }>): AsyncIterable<FactBatch<B>>
  acknowledge(input: FactReceipt): Reply<DurableEvidence>
  stop(input: ControlDispatch): Reply<ControlProgress>
  inspectControl(input: ControlDispatch): Reply<ControlProgress>
  answer(input: ResponseRecord): Reply<ResponseProgress>
  inspectAnswer(input: ResponseRecord): Reply<ResponseProgress>
}
export type ToolStartRecord = Readonly<{
  operation: ToolOperationId; executor: Adoption; execution: ToolExecutionRef
}> & (
  | Readonly<{ kind: 'start' }>
  | Readonly<{ kind: 'resume'; checkpoint: DurableEvidence }>
)
export type ToolStartLookup<B extends ContentBlock> =
  | Readonly<{ kind: 'not-started'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'live'; execution: ToolLiveExecution<B> }>
  | Readonly<{
      kind: 'settled'; source: DurableEvidence; event: string
      fact: Extract<ToolExecutionFact<B>, { kind: 'final' }>
    }>
  | Readonly<{ kind: 'lost'; continuity: DurableEvidence }>
export type ToolExecutorBinding<P, B extends ContentBlock, E> =
  | Readonly<{
      kind: 'live-only'
      start(input: CallAccess<P> & Readonly<{ start: Extract<ToolStartRecord, { kind: 'start' }>; permit: StartPermit; request: FixedToolRequest }>, environment: E): Reply<ToolLiveExecution<B>>
      inspectStart(input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>): Reply<ToolStartLookup<B>>
    }>
  | Readonly<{
      kind: 'checkpointed'; checkpointSchema: Adoption
      start(input: CallAccess<P> & Readonly<{ start: Extract<ToolStartRecord, { kind: 'start' }>; permit: StartPermit; request: FixedToolRequest }>, environment: E): Reply<ToolLiveExecution<B>>
      inspectStart(input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>): Reply<ToolStartLookup<B>>
      suspend(input: SuspensionRecord): Reply<SuspensionProgress>
      inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>
      resume(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, { kind: 'resume' }>; permit: StartPermit; request: FixedToolRequest
      }>, environment: E): Reply<ToolLiveExecution<B>>
    }>
export interface PreparedEnvironment<E> {
  readonly value: E
  readonly evidence: DurableEvidence
  readonly preparation: PreparationRecord
}
export interface ToolEnvironment<P, E> {
  prepare(input: CallAccess<P> & Readonly<{ preparation: PreparationRecord }>): Reply<PreparationProgress<E>>
  inspectPreparation(input: CallAccess<P> & Readonly<{ preparation: PreparationRecord }>): Reply<PreparationProgress<E>>
  release(input: CallAccess<P> & Readonly<{ release: ReleaseRecord }>): Reply<ReleaseProgress>
  inspectRelease(input: CallAccess<P> & Readonly<{ release: ReleaseRecord }>): Reply<ReleaseProgress>
}
export interface ToolBindings<P, B extends ContentBlock, E> {
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  resolve(input: CallAccess<P> & Readonly<{ request: FixedToolRequest }>): Reply<ToolExecutorBinding<P, B, E>>
  recover(input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>): Reply<ToolRecoveryBinding<B>>
}
export interface ToolInstanceHost<P> {
  install(driver: ToolDriver<P>): Readonly<{ release(): Promise<void> }>
  schedule(input: Readonly<{ tenant: TenantId; call: ToolCallId }>): Reply<Readonly<{ queued: true }>>
  publish(input: ToolExecutionRef, handle: ToolHandle<P>): Reply<Readonly<{ execution: ToolExecutionRef; registration: string }>>
  withdraw(input: Readonly<{ execution: ToolExecutionRef; registration: string }>): Reply<Readonly<{ removed: boolean }>>
  readonly directory: ToolDirectory<P>
}
export interface ToolDriver<P> {
  run(input: CallAccess<P> & Readonly<{ signal: AbortSignal }>): Promise<void>
}
export interface ToolClock {
  now(): string
  begin(input: Readonly<{ operation: ToolOperationId; execution: ToolExecutionRef }>): Reply<ClockSegment>
  elapsed(evidence: DurableEvidence): Reply<Readonly<{ milliseconds: string; evidence: DurableEvidence }>>
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export type ToolConfiguration = ToolAuthorLimits & Readonly<{
  processBatchBytes: number; processBatchDelayMs: number; observerBufferBytes: number
  resultPageBytes: number; reconciliationDelayMs: number
}>
export type ToolDependencies<P, B extends ContentBlock, E> = Readonly<{
  commands: ToolCommands<P, B>; bindings: ToolBindings<P, B, E>
  environments: ToolEnvironment<P, E>; decisions: ToolDecisionBridge<P>
  instances: ToolInstanceHost<P>; clock: ToolClock; resultPolicy: ResultPolicy<B>
  authority: ToolStartAuthority<P>; resources: ToolResourceResponses<P>
  custody: ToolOutputCustody<P>; catalog: ToolCatalog<P>; reads: ToolReads<P, B>
  children: ToolChildren<P>
}>
export interface ToolProvider<P, B extends ContentBlock> {
  readonly runtime: ToolRuntime<P, B>
  recover(input: Access<P>): Reply<Readonly<{ scheduled: string }>>
  quiesce(): Reply<Readonly<{ pending: string; running: string }>>
  inspectDrain(input: Access<P>): Reply<DrainState>
  handover(input: Access<P> & Readonly<{ operation: ToolOperationId; successor: DurableEvidence; inventory: DurableEvidence }>): Reply<DurableEvidence>
}
export declare function createToolRuntime<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>, configuration: ToolConfiguration,
): ToolProvider<P, B>
```

## 定义、作者适配与独立消费

下列声明补齐可独立消费的定义、参数和结果适配。不要求 Cordis 或 Session。托管路径还必须走前述准入。具体操作协议归 [protocols](../SPEC.md#tool-操作协议)，输入与依赖归 [object-model](object-model.md)。

ToolAuthor 表示一个操作，不表示所有命令的返回联合。defineToolOperation 在本地封装该操作的 A/R 关系；defineFunctionTool 与 defineCommandTool 使用相同的操作句柄，生成唯一 ToolDefinition 投影。句柄不公开 executor，不能作为脚本调用通路。构造成功不表示 schema 已异步装载或工具已可用。精确绑定、命令选择及恢复规则见 [多命令协议](../SPEC.md#多命令作者注册与返回选择)，作者组合示例见 [flows](flows.md#多命令函数与独立返回)。

```ts
export type ToolDeclarations = Readonly<{
  adoption: Adoption
  environment: Adoption | null
  attachments: readonly Readonly<{ store: string; mediaTypes: readonly string[] }>[]
  inputModalities: readonly string[]; outputModalities: readonly string[]
  settings: ToolSettingsDeclaration | null
}>
export type ToolSettingsDeclaration = Readonly<{
  schema: ParameterContract
  defaults: JsonValue
  items: readonly Readonly<{
    path: readonly string[]
    category: 'preference' | 'binding' | 'placement-identity' | 'governance'
    sensitive: boolean
  }>[]
}>
export type ToolConsumerProfile =
  | Readonly<{ kind: 'model'; capabilities: DurableEvidence; conversion: Adoption | null; attachmentAccess: DurableEvidence }>
  | Readonly<{ kind: 'independent'; capabilities: DurableEvidence; attachmentAccess: DurableEvidence }>
export type ToolInspection<P> = Access<P> & Readonly<{
  name: string; command: string | null; consumer: ToolConsumerProfile
}>
export type ToolUsage = Readonly<{
  definition: Adoption; command: string | null; description: string
  parameters: ParameterContract | Readonly<{ kind: 'executor-owned'; usage: string; protocol: Adoption }>
  returns: ToolReturnDeclaration
}>
export type ToolPresentation = Readonly<{
  name: string; description: string; programmable: boolean
  commands: readonly Readonly<{ name: string; summary: string }>[]
}>
export interface ToolCatalog<P> {
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  usage(input: ToolInspection<P> & Readonly<{ adoption: Adoption }>): Reply<ToolUsage>
  search(input: Access<P> & Readonly<{
    query: string; consumer: ToolConsumerProfile; invocation: ToolInvocation['kind']; after: string | null; limit: number
  }>): Reply<Readonly<{ entries: readonly ToolAvailability[]; next: string | null }>>
}
export interface ParameterCodec<A> {
  readonly adoption: Adoption
  parse(input: ToolArguments): Outcome<A, Readonly<{ kind: 'incomplete' | 'invalid'; reason: string }>>
}
export interface OutputCodec<R> {
  readonly adoption: Adoption
  encode(value: unknown): Outcome<Uint8Array, Readonly<{ reason: string }>>
  decode(bytes: Uint8Array): Outcome<R, Readonly<{ reason: string }>>
}
export interface ToolReturnValidator<A, R> {
  readonly adoption: Adoption
  check(input: Readonly<{ arguments: A; value: unknown }>): Outcome<R, Readonly<{ reason: string }>>
}
export type ToolProgramContract =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'json'; adoption: Adoption; schema: ToolValueSchema<unknown> }>
export type ToolProgramOutput<R> =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'json'; adoption: Adoption; schema: ToolValueSchema<unknown>
      encode(value: R): Outcome<JsonValue, Readonly<{ reason: string }>>
    }>
export type ToolAuthor<A, R, E, B extends ContentBlock> = Readonly<{
  parameters: ParameterCodec<A>
  waits: readonly ToolWaitContract<unknown, 'ask' | 'resource'>[]
}> & (
  | Readonly<{
      kind: 'ordinary'; executor: ToolExecutor<A, R, E>; codec: OutputCodec<R>
      output: ToolReturnValidator<A, R>; renderer: TextRenderer<R>; program: ToolProgramOutput<R>
    }>
  | Readonly<{
      kind: 'structured'; executor: ToolExecutor<A, ToolResult<B>, E>; codec: OutputCodec<ToolResult<B>>
      output: ToolReturnValidator<A, ToolResult<B>>; program: ToolProgramContract
    }>
)
export type ToolOperationParameters =
  | Readonly<{ kind: 'declared'; value: ParameterContract }>
  | Readonly<{ kind: 'executor-owned'; usage: string; protocol: Adoption }>
declare const toolOperation: unique symbol
declare const toolAuthorRegistration: unique symbol
export type ToolOperation<E, B extends ContentBlock, P extends ToolOperationParameters = ToolOperationParameters> = Readonly<{
  parameters: P
  returns: ToolReturnDeclaration
  [toolOperation]: Readonly<{ environment: (value: E) => E; block: (value: B) => B }>
}>
export type ToolOperationSpec<A, R, E, B extends ContentBlock, P extends ToolOperationParameters> = Readonly<{
  parameters: P
}> & (
  | Readonly<{
      returns: ToolReturnDeclaration & Readonly<{ kind: 'ordinary' }>
      author: Extract<ToolAuthor<A, R, E, B>, { kind: 'ordinary' }>
    }>
  | Readonly<{
      returns: ToolReturnDeclaration & Readonly<{ kind: 'structured' }>
      author: Extract<ToolAuthor<A, R, E, B>, { kind: 'structured' }>
    }>
)
export declare function defineToolOperation<A, R, E, B extends ContentBlock, P extends ToolOperationParameters>(
  input: ToolOperationSpec<A, R, E, B, P>,
): Outcome<ToolOperation<E, B, P>, Readonly<{ field: string; reason: string }>>
export type ToolAuthorRegistration<E, B extends ContentBlock> = Readonly<{
  definition: ToolDefinition
  [toolAuthorRegistration]: Readonly<{ environment: (value: E) => E; block: (value: B) => B }>
}>
export declare function defineFunctionTool<E, B extends ContentBlock>(input: Readonly<{
  metadata: ToolDefinitionMetadata
  operation: ToolOperation<E, B, Extract<ToolOperationParameters, { kind: 'declared' }>>
}>): Outcome<ToolAuthorRegistration<E, B>, Readonly<{ field: string; reason: string }>>
export declare function defineCommandTool<E, B extends ContentBlock>(input: Readonly<{
  metadata: ToolDefinitionMetadata
  commands: Readonly<Record<string, Readonly<{ summary: string; operation: ToolOperation<E, B> }>>>
}>): Outcome<ToolAuthorRegistration<E, B>, Readonly<{ field: string; reason: string }>>
declare const toolLoadedRegistration: unique symbol
export type ToolLoadedRegistration<E, B extends ContentBlock> = Readonly<{
  author: ToolAuthorRegistration<E, B>
  executor: Adoption
  settings: Adoption
  source: DurableEvidence
  [toolLoadedRegistration]: true
}>
export interface ToolLoader<P, E, B extends ContentBlock> {
  load(input: Access<P> & Readonly<{
    definition: Adoption; executor: Adoption; settings: Adoption; source: DurableEvidence
  }>): Reply<ToolLoadedRegistration<E, B>>
}
export interface ToolBindingRegistry<P, E, B extends ContentBlock> {
  register(input: Access<P> & Readonly<{
    loaded: ToolLoadedRegistration<E, B>; authority: DurableEvidence
  }>): Reply<Readonly<{ contribution: string; release(): Promise<Readonly<{ removed: boolean }>> }>>
}
export interface TextResultFactory<B extends ContentBlock> {
  text(value: string): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
}
export declare function judgeToolDefinition(value: unknown): Outcome<ToolDefinition, Readonly<{ field: string; reason: string }>>
export declare function judgeToolState(value: unknown): Outcome<ToolState, Readonly<{ field: string; reason: string }>>
export declare function presentTool(definition: ToolDefinition): ToolPresentation
export declare function renderToolResult<A, R, E, B extends ContentBlock>(
  value: R, author: Extract<ToolAuthor<A, R, E, B>, { kind: 'ordinary' }>, text: TextResultFactory<B>, policy: ResultPolicy<B>,
): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
export declare function renderToolResult<A, E, B extends ContentBlock>(
  value: ToolResult<B>, author: Extract<ToolAuthor<A, never, E, B>, { kind: 'structured' }>, text: TextResultFactory<B>, policy: ResultPolicy<B>,
): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
export type AvailabilityFacts = Readonly<{
  definition: ToolDefinition; executor: Adoption; qualification: 'allowed' | 'denied'
  dependencies: readonly Readonly<{ name: string; available: boolean }>[]
  inputCompatible: boolean; outputCompatible: boolean; attachmentsReadable: boolean
}>
export declare function evaluateToolAvailability(facts: AvailabilityFacts): ToolAvailability
```

## 持久状态与协议记录

这些值是提供者协议，不开放给脚本。值引用均须查验其拥有者记录。时间、序号和字节计数使用规范非负十进制字符串，解析边界禁止符号、前导零、非整数和溢出投影。

```ts
export type PhysicalExecution =
  | Readonly<{ kind: 'not-started' }>
  | Readonly<{ kind: 'starting' | 'live' | 'unknown'; start: ToolOperationId }>
  | Readonly<{ kind: 'suspended'; checkpoint: DurableEvidence }>
  | Readonly<{ kind: 'ended' | 'lost'; evidence: DurableEvidence }>
export type QueuePosition =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'waiting' | 'held'; key: string; ordinal: string }>
  | Readonly<{ kind: 'released'; key: string; ordinal: string; evidence: DurableEvidence }>
export type ClockSegment = Readonly<{
  operation: ToolOperationId; source: string; epoch: string; marker: DurableEvidence
}>
export type ToolTiming = Readonly<{ accumulatedMs: string }> & (
  | Readonly<{ kind: 'running'; segment: ClockSegment }>
  | Readonly<{ kind: 'paused' | 'closed' }>
  | Readonly<{ kind: 'unknown'; segment: ClockSegment; diagnostic: string }>
)
export type ProtocolIdentity = Readonly<{
  tenant: TenantId; call: ToolCallId; operation: ToolOperationId; adoption: Adoption; inputDigest: string
}>
export type PreparationRecord = ProtocolIdentity & Readonly<{
  purpose: 'initial' | 'resume'; request: FixedToolRequest
}>
export type PreparationProgress<E> =
  | Readonly<{ kind: 'prepared'; environment: PreparedEnvironment<E> }>
  | Readonly<{ kind: 'excluded'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: DurableEvidence }>
  | Readonly<{ kind: 'pending' | 'unknown'; diagnostic: string }>
export type ReleaseRecord = ProtocolIdentity & Readonly<{
  preparation: ToolOperationId; resource: DurableEvidence; custody: DurableEvidence
}>
export type ReleaseProgress =
  | Readonly<{ kind: 'released'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'pending' | 'unknown' | 'rejected'; diagnostic: string }>
export type StartProgress =
  | Readonly<{ kind: 'started'; acceptance: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'not-started'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; exclusion: DurableEvidence }>
export type StartGuard = Readonly<{
  owner: string; resource: string; revision: string; evidence: DurableEvidence
  scope: Readonly<{ kind: 'resource' }> | (Readonly<{ kind: 'program'; parent: ToolCallId }> & (
    | Readonly<{ gate: 'open' }>
    | Readonly<{ gate: 'closing' | 'closed'; closure: ToolOperationId; applies: 'all-children' | 'run-foreground-and-unadmitted'; cutoff: DurableEvidence }>
  ))
}>
export type StartPermit = ProtocolIdentity & Readonly<{
  start: ToolStartRecord; guards: readonly StartGuard[]; request: DurableEvidence
}>
export interface ToolStartAuthority<P> {
  exclude(input: Mutation<P> & Readonly<{ reason: string }>): Reply<DurableEvidence>
  prepare(input: CallAccess<P> & Readonly<{ start: ToolStartRecord; request: FixedToolRequest }>): Reply<StartPermit>
  consume(input: CallAccess<P> & Readonly<{ permit: StartPermit; executorReceipt: DurableEvidence }>): Reply<StartProgress>
  inspect(input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>): Reply<StartProgress>
  invalidate(input: Access<P> & Readonly<{ operation: ToolOperationId; guard: StartGuard }>): Reply<DurableEvidence>
}
export type WaitIntent = Readonly<{ wait: ToolWaitId; resume: DurableEvidence; schemas: ToolWaitSchemaSnapshot }> & (
  | Readonly<{ kind: 'ask'; request: DurableEvidence }>
  | Readonly<{ kind: 'resource'; contract: Adoption; request: DurableEvidence; deadline: string | null }>
)
export type ExternalResponse =
  | Readonly<{ kind: 'decision'; value: DecisionValue; source: DurableEvidence }>
  | Readonly<{ kind: 'resource'; value: JsonValue; source: DurableEvidence }>
  | Readonly<{ kind: 'expired'; source: DurableEvidence }>
export type ResponseRecord = ProtocolIdentity & Readonly<{
  start: ToolStartRecord; wait: ToolWaitId; response: ExternalResponse
}>
export type ResponseProgress =
  | Readonly<{ kind: 'accepted'; receipt: DurableEvidence }>
  | Readonly<{ kind: 'continued'; receipt: DurableEvidence; timing: DurableEvidence }>
  | Readonly<{ kind: 'not-accepted'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown' | 'rejected'; diagnostic: string }>
export type WaitRecord = Readonly<{ intent: WaitIntent }> & (
  | Readonly<{ phase: 'opening'; operation: ToolOperationId }>
  | Readonly<{ phase: 'open'; value: Exclude<WaitState, { kind: 'none' }> }>
  | Readonly<{ phase: 'responding'; value: Exclude<WaitState, { kind: 'none' }>; response: ResponseRecord; progress: ResponseProgress }>
  | Readonly<{ phase: 'closed'; cause: 'continued' | 'cancelled' | 'terminal'; evidence: DurableEvidence }>
)
export interface ToolResourceResponses<P> {
  inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>
  ensure(input: Mutation<P> & Readonly<{ wait: Extract<WaitIntent, { kind: 'resource' }> }>): Reply<DurableEvidence>
  inspect(input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>): Reply<Readonly<{ registration: DurableEvidence; response: DurableEvidence | null }>>
  expire(input: Mutation<P> & Readonly<{ wait: Extract<WaitIntent, { kind: 'resource' }>; registration: DurableEvidence }>): Reply<DurableEvidence>
  invalidate(input: Mutation<P> & Readonly<{ wait: ToolWaitId; terminal: DurableEvidence }>): Reply<DurableEvidence>
  resolve(input: CallAccess<P> & Readonly<{ wait: WaitIntent; response: DurableEvidence }>): Reply<Extract<ExternalResponse, { kind: 'resource' | 'expired' }>>
}
export type ExternalOperationResolution =
  | Readonly<{ kind: 'committed'; operation: ToolOperationId; receipt: DurableEvidence }>
  | Readonly<{ kind: 'excluded'; operation: ToolOperationId; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'pending' | 'unknown'; operation: ToolOperationId; diagnostic: string }>
export type ControlProgress =
  | Readonly<{ kind: 'pending' | 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'accepted'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'stopped' | 'already-ended' | 'relation-changed'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: DurableEvidence }>
export type ControlRecord = Readonly<{
  operation: ToolOperationId; intent: ToolControl; source: DurableEvidence; progress: ControlProgress
}>
export type ControlDispatch = ProtocolIdentity & Readonly<{
  start: ToolStartRecord; intent: Extract<ToolControl, { kind: 'stop' }>; source: DurableEvidence
}>
export type SuspensionRecord = ProtocolIdentity & Readonly<{ start: ToolStartRecord; schema: Adoption }>
export type Checkpoint = Readonly<{
  schema: Adoption; payload: DurableEvidence; start: ToolStartRecord
  consumedResponses: readonly ToolOperationId[]; effectBoundary: DurableEvidence; exclusion: DurableEvidence
}>
export type SuspensionProgress =
  | Readonly<{ kind: 'suspended'; checkpoint: Checkpoint }>
  | Readonly<{ kind: 'not-suspended'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unknown' | 'rejected'; diagnostic: string }>
export interface ToolRecoveryBinding<B extends ContentBlock> {
  acknowledge(input: FactReceipt): Reply<DurableEvidence>
  inspectStart(start: ToolStartRecord): Reply<ToolStartLookup<B>>
  inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>
  stop(input: ControlDispatch): Reply<ControlProgress>
  inspectControl(input: ControlDispatch): Reply<ControlProgress>
}
export type FactBatch<B extends ContentBlock> = Readonly<{
  start: ToolStartRecord; source: DurableEvidence; batch: string; after: string | null; cursor: string
  events: readonly Readonly<{ event: string; fact: ToolExecutionFact<B> }>[]
}>
export type FactReceipt = Readonly<{
  start: ToolOperationId; batch: string; cursor: string; custody: DurableEvidence
}>
export type FactProgress = Readonly<{
  start: ToolStartRecord; source: DurableEvidence; cursor: string | null
  pendingAcknowledgements: readonly FactReceipt[]
}>
export type ProgramScheduling = Readonly<{
  execution: ToolExecutionRef; source: DurableEvidence; sequence: string; marker: DurableEvidence
}> & (
  | Readonly<{ kind: 'runnable' }>
  | Readonly<{ kind: 'blocked'; children: readonly ToolCallId[] }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
)
export type ToolTask = Readonly<{ operation: ToolOperationId; state: 'pending' | 'blocked'; diagnostic: string | null }> & (
  | Readonly<{ kind: 'prepare'; preparation: PreparationRecord }>
  | Readonly<{ kind: 'release'; release: ReleaseRecord }>
  | Readonly<{ kind: 'start'; start: ToolStartRecord }>
  | Readonly<{ kind: 'answer'; response: ResponseRecord }>
  | Readonly<{ kind: 'stop'; control: ControlDispatch }>
  | Readonly<{ kind: 'suspend'; suspension: SuspensionRecord }>
  | Readonly<{ kind: 'wait-card'; wait: ToolWaitId; action: 'ensure' | 'invalidate'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'deliver'; result: ToolResultVersion; delivery: ToolDeliveryId; consumer: ConsumerRef }>
  | Readonly<{ kind: 'queue' | 'settle' | 'account' | 'facts' | 'clock'; basis: DurableEvidence }>
  | Readonly<{ kind: 'child'; reservation: ChildReservation; action: 'reconcile' | 'collect' | 'control'; cause: ProgramEnd | null }>
  | Readonly<{ kind: 'program-fence'; end: ProgramEnd; guard: StartGuard }>
  | Readonly<{ kind: 'resource-wait'; wait: Extract<WaitIntent, { kind: 'resource' }>; action: 'ensure' | 'expire' | 'invalidate'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'fact-ack'; start: ToolStartRecord; source: DurableEvidence; receipt: FactReceipt }>
)
export type TaskResolution =
  | Readonly<{ kind: 'done'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'blocked'; reason: string }>
export type DrainState = Readonly<{
  admission: 'open' | 'closed'; inventory: DurableEvidence
  active: readonly ToolCallId[]; tasks: readonly ToolTask[]; untransferred: readonly DurableEvidence[]
}>
```

## 输出保管、持久读取与账目

```ts
export type RawOutput = Readonly<{
  codec: Adoption; content: Attachment; custody: DurableEvidence
}>
export interface ToolOutputCustody<P> {
  preserve(input: Mutation<P> & Readonly<{ codec: Adoption; bytes: Uint8Array; source: DurableEvidence }>): Reply<RawOutput>
  inspect(input: Mutation<P>): Reply<Readonly<{ kind: 'retained'; raw: RawOutput }> | Readonly<{ kind: 'unknown' }> | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>>
  retainResult(input: Mutation<P> & Readonly<{ raw: RawOutput; value: ToolResult<ContentBlock> }>): Reply<DurableEvidence>
}
export type ProcessSnapshot = Readonly<{ cursor: ToolCursor; state: ToolState; blocks: readonly ProcessBlock[] }>
export type DiagnosticPage = Readonly<{
  entries: readonly Readonly<{ operation: ToolOperationId; phase: string; code: string; evidence: DurableEvidence }>[]
  next: string | null
}>
export type ContentPage = Readonly<{
  result: ToolResultVersion; attachment: Attachment; offset: string; bytes: Uint8Array; next: string | null
}>
export interface ToolContentReader<P> {
  read(input: CallAccess<P> & Readonly<{ result: ToolResultVersion; attachment: Attachment; after: string | null; maxBytes: number }>): Reply<ContentPage>
  raw(input: CallAccess<P> & Readonly<{ result: ToolResultVersion }>): Reply<RawOutput>
}
export interface ToolReads<P, B extends ContentBlock> {
  lookup(input: CallAccess<P> & Readonly<{ admission: ToolOperationId }>): Reply<ToolLookup>
  operation(input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>): Reply<OperationResolution>
  result(input: CallAccess<P> & Readonly<{ result: ToolResultVersion; after: string | null }>): Reply<ResultPage<B>>
  process(input: CallAccess<P> & Readonly<{ at: ToolCursor | null }>): Reply<ProcessSnapshot>
  wait(input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>): Reply<WaitRecord>
  diagnostics(input: CallAccess<P> & Readonly<{ after: string | null }>): Reply<DiagnosticPage>
  account(input: CallAccess<P>): Reply<CallAccount>
  readonly content: ToolContentReader<P>
}
export type AccountScope =
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>
  | Readonly<{ kind: 'organization'; organization: string }>
export interface ToolAccounts<P> {
  list(input: Readonly<{ principal: P; scope: AccountScope; after: string | null; limit: number }>): Reply<Readonly<{
    entries: readonly Readonly<{ tenant: TenantId; call: ToolCallId; start: ToolOperationId | null; source: DurableEvidence; account: CallAccount }>[]
    next: string | null
  }>>
}
export interface ToolOffloader<P, B extends ContentBlock> {
  offload(input: Mutation<P> & Readonly<{
    result: ToolResultVersion; maxBytes: number; headBytes: number; tailBytes: number
  }>): Reply<Readonly<{ source: DurableEvidence; value: ToolResult<B>; originalBytes: string }>>
}
```

## 程序编排接缝

[Code 组合协议](../SPEC.md#code-与-tool-的组合协议)规定调用位置、控制范围、计时及结果承接。程序只能取得 `ProgramTools` 的受控代理；其他接口仅交受信宿主。语言、引擎和它们的跨进程编码由 Code 提供者固定采用，本包不开放任意宿主对象。

```ts
export type ChildPosition = Readonly<{ program: DurableEvidence; ordinal: string }>
export type ChildReservation = Readonly<{
  parent: ToolCallId; position: ChildPosition; child: ToolCallId; admission: ToolOperationId
  request: FixedToolRequest; source: DurableEvidence
}>
export type ChildState = Readonly<{ reservation: ChildReservation }> & (
  | Readonly<{ kind: 'reserved' | 'unknown' }>
  | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'admitted'; state: ToolState }>
  | Readonly<{ kind: 'retained'; state: ToolState; result: ToolResultVersion; custody: DurableEvidence; release: DurableEvidence }>
)
export type ProgramEnd =
  | Readonly<{ kind: 'returned'; output: RawOutput }>
  | Readonly<{ kind: 'stopped'; reason: StopReason }>
  | Readonly<{ kind: 'failed'; cause: 'exception' | 'resource-limit' | 'continuity-lost'; evidence: DurableEvidence }>
export type ProgramClosure = Readonly<{
  operation: ToolOperationId; end: ProgramEnd; pending: readonly ToolCallId[]
}> & (
  | Readonly<{ kind: 'closing'; barrier: null }>
  | Readonly<{ kind: 'closed'; barrier: DurableEvidence }>
)
export interface ToolChildren<P> {
  reserve(input: Mutation<P> & Readonly<{ execution: ToolExecutionRef; position: ChildPosition; request: FixedToolRequest }>): Reply<ChildReservation>
  admitted(input: Mutation<P> & Readonly<{ reservation: ChildReservation; outcome: ToolLookup }>): Reply<ChildState>
  retain(input: Mutation<P> & Readonly<{ child: ToolCallId; result: ToolResultVersion; delivery: ToolDeliveryId; custody: DurableEvidence; release: DurableEvidence }>): Reply<ChildState>
  list(input: CallAccess<P> & Readonly<{ after: string | null; limit: number }>): Reply<Readonly<{ children: readonly ChildState[]; next: string | null }>>
  close(input: Mutation<P> & Readonly<{ end: ProgramEnd }>): Reply<ProgramClosure>
  closure(input: CallAccess<P>): Reply<ProgramClosure | null>
  confirmBarrier(input: Mutation<P> & Readonly<{ close: ToolOperationId; evidence: DurableEvidence }>): Reply<ProgramClosure>
  finish(input: Mutation<P> & Readonly<{ output: RawOutput }>): Reply<DurableEvidence>
}
export type ProgramToolResult<B extends ContentBlock> = Readonly<{
  child: ToolCallId; result: ToolResultVersion; terminal: ToolTerminal; effect: Effect; value: ToolResult<B>
}>
export interface ProgramTools<B extends ContentBlock> {
  call(input: Readonly<{ name: string; command: string | null; arguments: JsonValue }>): Reply<ProgramToolResult<B>>
  read(input: Readonly<{ child: ToolCallId; result: ToolResultVersion; after: string | null }>): Reply<ResultPage<B>>
  attachment(input: Readonly<{ child: ToolCallId; result: ToolResultVersion; attachment: Attachment; after: string | null; maxBytes: number }>): Reply<ContentPage>
}
```

ProgramTools.call 交回唯一 ToolResult 封装，其 data 为程序值，content 为展示内容。宿主只在 [P13](../SPEC.md#p13-双返回形态与程序输出契约) 的验证及可靠交接后交给脚本。动态名称调用没有凭空推断出的 T；具体语言 SDK 根据固定的返回声明生成或绑定访问器，仍须核验真实结果。无程序 schema 的工具可显式声明 program=none，程序只得到受验证的 ToolResult，不获得假定存在的业务字段。
