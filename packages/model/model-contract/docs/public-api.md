<a id="model-领域公开契约候选"></a>
# Model 领域公开契约

本页的 TypeScript 代码块是本包公开声明的唯一设计，源码按本页章节分文件（`src/` 下每章一个文件）。根入口已经导出其中不引用共享 `ToolCallPart` 的类型声明。引用 `ToolCallPart` 的声明，以及全部运行值（身份解码函数、比较函数、两个常量、`deriveGuardControlOperation`），尚未落地：前者等共享消息契约发布该类型，后者随运行实现落地。根入口的运行时键暂时仍为空。逐名落地状态见[导出清单](../tests/fixtures/exports.json)的 `pending` 标记。全部落地后，本页转为源码导航，不保留第二套签名。

## 导出归属与落地前置

本包拥有领域值、品牌、公开操作与可替换提供者端口，包括 ModelProvider 管理接口。executeModel、createModelRuntime 及其 ModelDependencies、ModelConfiguration 由[领域实现](../../model/docs/public-api.md)拥有，不从本包转导出。Cordis 类与键由[框架契约](../../model-cordis-contract/docs/public-api.md)拥有。

凭据纯契约也由本包拥有。现有 CredentialId、CredentialReference、CredentialQuery、CredentialPort 及其操作结果须从 model 的 [credential.ts](../../model/src/credential.ts) 迁入，并保持品牌唯一。该文件中的内部判定状态和磁盘格式不属于本包。源码迁移前，这些名字仍从现有实现入口取得，本页不复制另一套声明；迁移时同步真实消费者和导出清单。精确归属见[组架构](../../docs/architecture.md#凭据切片的现有装配边界)。

`Outcome` 引用 `@omne-harness/operation-result` 的唯一类型。该共享成员没有生产依赖。本包已将它列为生产依赖，真实导出还须按[安装闭包要求](../../docs/architecture.md#安装闭包与共同依赖前置)验证实际产物。不复制 `Outcome`，不以 `import type` 代替完整安装依赖检查。

行为及调用资格归 [SPEC](../SPEC.md)，消费路径归 [context](context.md)，对象关系归 [object-model](object-model.md)。

## 能力边界

[行为与约束](../SPEC.md#342-能力边界)。

## 根入口的值与请求

[行为与约束](../SPEC.md#342-根入口的值与请求)。

```ts
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ContentBlock, ContentReference } from '@omne-harness/content-block'
import type { Message, ToolCallPart } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallAccount } from '@omne-harness/call-account'

declare const identity: unique symbol
export type Identity<K extends string> = string & { readonly [identity]: K }
export type ModelCallId = Identity<'ModelCallId'>
export type DispatchId = Identity<'ModelDispatchId'>
export type ModelInstanceId = Identity<'ModelInstanceId'>
export type ModelOperationId = Identity<'ModelOperationId'>
export type ResultVersion = Identity<'ModelResultVersion'>
export type OutputCursor = Identity<'ModelOutputCursor'>
export type ReadId = Identity<'ModelReadId'>
export type Revision = Identity<'ModelRevision'>

export type ModelIdentityKey =
  | 'ModelCallId' | 'ModelDispatchId' | 'ModelInstanceId' | 'ModelOperationId'
  | 'ModelReadId' | 'ModelDiagnosticId' | 'ModelDiagnosticCursor'
  | 'ModelRevision' | 'ModelResultVersion' | 'ModelOutputCursor'

export type ModelIdentityRejection<K extends ModelIdentityKey> = Readonly<{
  field: K
  reason: 'type' | 'empty' | 'length' | 'prefix' | 'character' | 'leading-zero'
}>

export const MODEL_IDENTITY_MAX_LENGTH = 256
export const MODEL_IDENTITY_PREFIXES: Readonly<{
  ModelCallId: 'mcall_'; ModelDispatchId: 'mdisp_'; ModelInstanceId: 'minst_'
  ModelOperationId: 'mop_'; ModelResultVersion: 'mrver_'; ModelReadId: 'mread_'
  ModelDiagnosticId: 'mdiag_'; ModelDiagnosticCursor: 'mdcur_'
}>

export function decodeModelCallId(text: unknown): Outcome<ModelCallId, ModelIdentityRejection<'ModelCallId'>>
export function decodeDispatchId(text: unknown): Outcome<DispatchId, ModelIdentityRejection<'ModelDispatchId'>>
export function decodeModelInstanceId(text: unknown): Outcome<ModelInstanceId, ModelIdentityRejection<'ModelInstanceId'>>
export function decodeModelOperationId(text: unknown): Outcome<ModelOperationId, ModelIdentityRejection<'ModelOperationId'>>
export function decodeReadId(text: unknown): Outcome<ReadId, ModelIdentityRejection<'ModelReadId'>>
export function decodeRevision(text: unknown): Outcome<Revision, ModelIdentityRejection<'ModelRevision'>>
export function decodeResultVersion(text: unknown): Outcome<ResultVersion, ModelIdentityRejection<'ModelResultVersion'>>
export function decodeOutputCursor(text: unknown): Outcome<OutputCursor, ModelIdentityRejection<'ModelOutputCursor'>>

export function compareRevisions(left: Revision, right: Revision): -1 | 0 | 1
export function compareOutputCursors(left: OutputCursor, right: OutputCursor): -1 | 0 | 1

export type Adoption = Readonly<{
  owner: string; name: string; revision: string; digest: string
}>
export type ConsumerRef = Readonly<{
  owner: string; work: string; position: string; purpose: string
}>
export type ActorRef = Readonly<{ owner: string; subject: string; revision: string }>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
export type CallAccess<P> = Access<P> & Readonly<{ call: ModelCallId }>
export type Mutation<P> = CallAccess<P> & Readonly<{ operation: ModelOperationId }>
export type Parameter =
  | Readonly<{ kind: 'temperature'; value: number }>
  | Readonly<{ kind: 'top-p'; value: number }>
  | Readonly<{ kind: 'max-output-tokens'; value: string }>
  | Readonly<{ kind: 'stop'; value: readonly string[] }>
  | Readonly<{ kind: 'extension'; definition: Adoption; value: JsonValue }>
export type ToolDeclaration = Readonly<{
  name: string; description: string; argumentsSchema: JsonValue
}>
export type Supplier = Readonly<{
  adoption: Adoption; recipient: string; model: string
  credential: Readonly<{ kind: 'tenant'; id: string }> | Readonly<{ kind: 'factory' }>
}>
export type FixedModelRequest = Readonly<{
  profile: Adoption
  suppliers: readonly [Supplier, ...Supplier[]]
  fallback: boolean
  retryPolicy: Adoption
  parameters: readonly Parameter[]
  system: readonly ContentBlock[]
  messages: readonly Message[]
  tools: readonly ToolDeclaration[]
  toolChoice: 'none' | 'auto' | 'required' | Readonly<{ name: string }>
  representation: Adoption
  limits: readonly ModelLimit[]
  meter: Adoption
  budget: RequestBudget
  parameterAdoptions: readonly ParameterAdoption[]
  source: Adoption
}>
export type ResultCapacity = Readonly<{
  bytes: string; blocks: string; attachmentBytes: string
}>
export type Admit<P> = Mutation<P> & Readonly<{
  request: FixedModelRequest; consumer: ConsumerRef; capacity: ResultCapacity
}>
```

身份和序列的文本规则如下，行为条款归[根入口的值与请求](../SPEC.md#342-根入口的值与请求)。

- 每个品牌在根入口有一个同名解码函数，接收 `unknown`，返回 `Outcome`，不抛异常，不读环境、时钟或随机值。`ModelDiagnosticId` 与 `ModelDiagnosticCursor` 的解码函数在[供应商尝试诊断](#供应商尝试诊断)一节，与两个品牌同处。
- 解码只核格式。成功只得到品牌，不证明对象存在、属于某租户或可以使用。所属租户与已有关系由处理该操作的提供者核验。
- 身份类（`ModelCallId`、`DispatchId`、`ModelInstanceId`、`ModelOperationId`、`ResultVersion`、`ReadId`、`ModelDiagnosticId`、`ModelDiagnosticCursor`）是固定前缀加主体。前缀见 `MODEL_IDENTITY_PREFIXES`，主体是 1 个以上 `[A-Za-z0-9_-]` 字符。只比较相等，用 `===`。
- 序列类（`Revision`、`OutputCursor`）是十进制非负整数的规范写法：`0`，或不以 `0` 开头的数字串。相等用 `===`，先后用 `compareRevisions` 与 `compareOutputCursors`，按整数值比较，不转为浮点数。比较只对同一对象的修订或同一调用流内的游标有定义。
- 全部品牌的文本不超过 `MODEL_IDENTITY_MAX_LENGTH`（256）个 UTF-16 码元。函数不裁剪空白，不折叠大小写。检查按 `ModelIdentityRejection.reason` 的顺序 `type`、`empty`、`length`、`prefix`、`character`、`leading-zero` 自上而下，返回第一个失败。`prefix` 只适用身份类，`leading-zero` 只适用序列类。
- 失败值的 `field` 是品牌键 `ModelIdentityKey`（例如 `'ModelDispatchId'`），不是导出类型名（`DispatchId`）。品牌键带领域前缀，跨领域日志中不会与 Tool 的同名身份混淆。
- 品牌值就是线上文本，编码是恒等函数，所以不发布编码函数。品牌相等即文本相等，不发布相等函数。
- `ModelOperationId` 的主体不得以 `--` 开头。该前缀保留给守卫派生的控制 operation（见[消费者 owner 的装配声明](#消费者-owner-的装配声明)）。`decodeModelOperationId` 仍只核格式，不拒绝它。接受调用方提交的 `ModelOperationId` 的公开方法在收到保留值时按[资格、共同提交与实际发送](../SPEC.md#342-资格共同提交与实际发送)返回 `invalid`。

## 结果、失败和状态

[行为与约束](../SPEC.md#342-结果失败和状态)。

```ts
export type ModelFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unsupported'; field: string; adapter: Adoption }>
  | Readonly<{ kind: 'conflict'; operation: ModelOperationId; revision: Revision }>
  | Readonly<{ kind: 'capacity'; required: ResultCapacity }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>
  | Readonly<{ kind: 'commit-unknown'; operation: ModelOperationId }>
  | Readonly<{ kind: 'stale-instance'; instance: ModelInstanceId }>
  | Readonly<{ kind: 'not-settled' }>
  | Readonly<{ kind: 'handoff-invalid'; reason: string }>
export type Reply<T> = Promise<Outcome<T, ModelFailure>>
export type ToolSuggestion = ToolCallPart
export type ModelBlock = ContentBlock | ToolSuggestion
export type ModelFault = Readonly<{
  cause: 'profile-withdrawn' | 'excluded' | 'modality' | 'credential'
    | 'input-rejected' | 'upstream-unavailable' | 'stream-lost'
    | 'runtime-lost' | 'persistence' | 'policy-unavailable' | 'upstream-protocol' | 'unclassified'
  diagnostic: string
  upstreamStatus: string | null
}>
export type Termination =
  | Readonly<{ kind: 'completed'; reason: 'stop' | 'limit' | 'tool-suggestions' }>
  | Readonly<{ kind: 'failed'; fault: ModelFault }>
  | Readonly<{ kind: 'interrupted'; control: ModelOperationId }>
export type Settlement = Readonly<{
  version: ResultVersion; termination: Termination; cursor: OutputCursor; source: DurableEvidence
}>
export type CustodyState =
  | Readonly<{ kind: 'producer' }>
  | Readonly<{
      kind: 'acknowledged'; operation: ModelOperationId; receipt: DurableEvidence
      cleanup: 'pending' | 'running' | 'blocked' | 'released'; diagnostic: string | null
    }>
export type CallState = Readonly<{
  call: ModelCallId; revision: Revision; consumer: ConsumerRef
  control: ControlState; custody: CustodyState
}> & (
  | Readonly<{ phase: 'accepted' }>
  | Readonly<{
      phase: 'running'; dispatch: DispatchId
      firstContent: 'none-proven' | 'observed' | 'uncertain'
    }>
  | Readonly<{ phase: 'retry-decision'; dispatch: DispatchId }>
  | Readonly<{ phase: 'settled'; settlement: Settlement }>
)
export type ControlState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'requested'; operation: ModelOperationId
      propagation: 'pending' | 'sent' | 'unavailable'
      upstream: 'unknown' | 'stopped' | 'completed'
    }>
export type Lookup =
  | Readonly<{ kind: 'found'; state: CallState }>
  | Readonly<{ kind: 'not-accepted'; operation: ModelOperationId }>
export type Admission = Readonly<{ call: ModelCallId; revision: Revision; recovered: boolean }>
export type DurableEvidence = Readonly<{
  owner: string; record: string; revision: string; digest: string
}>
export type Handoff =
  | Readonly<{ kind: 'processed'; completion: DurableEvidence }>
  | Readonly<{ kind: 'retained'; custody: DurableEvidence }>
export type AckInput<P> = Mutation<P> & Readonly<{
  result: ResultVersion; evidence: Handoff
}>
export type AckReceipt = Readonly<{
  call: ModelCallId; result: ResultVersion; custody: Extract<CustodyState, { kind: 'acknowledged' }>
}>
```

## 普通调用面与实例观察

[行为与约束](../SPEC.md#342-普通调用面与实例观察)。

```ts
export type GrowingContentKind = 'text' | 'thinking' | 'tool-arguments' | 'voice'
export type VisibleBlock =
  | Readonly<{ kind: 'sealed'; index: string; block: ModelBlock }>
  | Readonly<{
      kind: 'growing'; index: string; mode: 'append' | 'replace'
      content: GrowingContentKind; value: string
    }>
export type Snapshot = Readonly<{
  call: ModelCallId; cursor: OutputCursor; blocks: readonly VisibleBlock[]
  state: CallState
}>
export type Observation =
  | Readonly<{ kind: 'snapshot'; value: Snapshot }>
  | Readonly<{ kind: 'changed'; value: Snapshot }>
  | Readonly<{ kind: 'ended'; reason: 'observer-closed' | 'stale-instance' | 'denied' | 'unavailable' }>
export interface ModelHandle<P> {
  readonly instance: ModelInstanceId
  observe(input: Access<P> & Readonly<{ signal: AbortSignal }>): AsyncIterable<Observation>
}
export type LiveRoute<P> =
  | Readonly<{ kind: 'live'; handle: ModelHandle<P> }>
  | Readonly<{ kind: 'no-live-route' }>
export type ResultPage = Readonly<{
  blocks: readonly ModelBlock[]; next: string | null; settlement: Settlement
}>
export type ReadState =
  | Readonly<{ kind: 'reading'; page: ResultPage }>
  | Readonly<{ kind: 'ended'; reason: 'complete' | 'closed' | 'denied' | 'stalled' | 'owner-lost' }>
export type ReadStart =
  | Readonly<{ kind: 'started'; read: ReadId; value: ReadState }>
  | Readonly<{ kind: 'acknowledged'; custody: Extract<CustodyState, { kind: 'acknowledged' }> }>
export type DispatchRecord = Readonly<{
  dispatch: DispatchId; supplier: Supplier; intent: ModelOperationId
  send: 'prepared' | 'started' | 'unknown' | 'not-sent'
  firstContent: 'none-proven' | 'observed' | 'uncertain'; terminal: Termination | null
  account: CallAccount | null
  materialization: Readonly<{ receipt: MaterializationReceipt; source: DurableEvidence }> | null
}>
export interface ModelCalls<P> {
  admit(input: Admit<P>): Reply<Admission>
  inspect(input: CallAccess<P> & Readonly<{ admission: ModelOperationId }>): Reply<Lookup>
  dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]>
  cancel(input: Mutation<P>): Reply<ControlState>
}
export interface ModelConsumption<P> {
  beginRead(input: Mutation<P> & Readonly<{ result: ResultVersion }>): Reply<ReadStart>
  readNext(input: CallAccess<P> & Readonly<{ read: ReadId; after: string }>): Reply<ReadState>
  closeRead(input: CallAccess<P> & Readonly<{ read: ReadId }>): Reply<ReadState>
  acknowledge(input: AckInput<P>): Reply<AckReceipt>
}
export interface ModelDirectory<P> {
  connect(input: CallAccess<P>): Reply<LiveRoute<P>>
}
export interface ModelRuntime<P> {
  readonly calls: ModelCalls<P>
  readonly consumption: ModelConsumption<P>
  readonly instances: ModelDirectory<P>
}
```

## 逐操作行为

[行为与约束](../SPEC.md#342-逐操作行为)。

## 独立执行与提供者操作

[行为与约束](../SPEC.md#342-独立执行与提供者操作)。

ToolDeclaration 是 Model 的请求值，只表达名称、已组装说明和参数 JSON Schema。请求组装者负责从工具定义形成该值并保存原工具及命令路由，Model 不读取 ToolDefinition、programmable 或工具注册表。ModelToolPayloadAdapter 将该请求值转换为供应商私有 payload。工具调用输出采用 [共享 ToolCallPart](../../../common/message/docs/public-api.md)，不复制消息关联身份。

ModelMediaReader 只在实际发送阶段读取模型可见的内容 ref；附件地址文本不触发读取。prepare 不预载二进制；materialize 在本次发送准备阶段完成读取、完整性及预算检查，MaterializedTransport.start 在最终资格围栏内立即发送。原来源、取消、失败和租约规则归 [工具声明转换与内容引用加载](../SPEC.md#工具定义转换与内容引用加载)。这两个接缝由发送提供者注入，不增加工具执行通路。

TransportFact 是传输提供者向 Model 交出的事实。Model runtime 映射为共享到达步骤，序号、整交块及终止的精确规则见 [共享到达映射](../SPEC.md#供应商解释与流状态归约)。它不替代 common/stream-arrival，也不直接传给 assembleStream。

```ts
export type TransportFailure = Extract<ModelFailure, { kind: 'denied' | 'invalid' | 'unsupported' | 'unavailable' }>
export interface ModelToolPayloadAdapter<TPayload> {
  convertToModelPayload(declaration: ToolDeclaration): Outcome<TPayload, TransportFailure>
}
export interface ModelMediaLease {
  readonly bytes: AsyncIterable<Uint8Array>
  close(): Promise<void>
}
export interface ModelMediaReader<P> {
  open(input: Access<P> & Readonly<{
    invocation: Readonly<{ kind: 'managed'; call: ModelCallId; dispatch: DispatchId }>
      | Readonly<{ kind: 'independent' }>
    request: FixedModelRequest
    source: DurableEvidence; reference: ContentReference; recipient: string
  }>, signal: AbortSignal): Promise<Outcome<ModelMediaLease, TransportFailure>>
}
export type TransportTermination = Exclude<Termination, { kind: 'interrupted' }>
  | Readonly<{ kind: 'interrupted'; stop: 'confirmed' }>
export type TransportFact =
  | Readonly<{ kind: 'block-open'; index: string; mode: 'append' | 'replace'; content: GrowingContentKind }>
  | Readonly<{ kind: 'block-delta'; index: string; delta: string }>
  | Readonly<{ kind: 'block-replace'; index: string; value: string }>
  | Readonly<{ kind: 'block-seal'; index: string; block: ModelBlock }>
  | Readonly<{ kind: 'trim'; index: string; removed: string; reason: string }>
  | Readonly<{ kind: 'account'; event: string; value: CallAccount }>
  | Readonly<{ kind: 'ended'; termination: TransportTermination }>
export type IndependentModelFact = TransportFact
  | Readonly<{ kind: 'not-started'; reason: 'cancelled' }>
  | Readonly<{ kind: 'not-started'; reason: 'rejected'; failure: TransportFailure }>
export type CompleteRequestBudget = Extract<RequestBudget, { kind: 'complete' }>
export type MaterializationReceipt = Readonly<{
  supplier: Adoption; budget: CompleteRequestBudget
  representation: Adoption; payloadDigest: string
}>
export interface MaterializedTransport {
  readonly receipt: MaterializationReceipt
  start(signal: AbortSignal): AsyncIterable<TransportFact>
  close(): Promise<void>
}
export interface PreparedTransport {
  materialize(signal: AbortSignal): Promise<Outcome<MaterializedTransport, TransportFailure>>
  close(): Promise<void>
}
export interface ModelTransport {
  prepare(request: FixedModelRequest, supplier: Supplier): Promise<Outcome<PreparedTransport, TransportFailure>>
}
export type ExecutionRef = Readonly<{
  tenant: TenantId; call: ModelCallId; instance: ModelInstanceId; generation: string
}>
export type WriteContext = ExecutionRef & Readonly<{
  operation: ModelOperationId; expected: Revision
}>
export type CommitQuery<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'rolled-back' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'not-committed' }>
export type DispatchPlan = Readonly<{
  dispatch: DispatchId; supplier: Supplier; policyDecision: DurableEvidence | null
}>
export type RetryDecision =
  | Readonly<{ kind: 'stop'; fault: ModelFault }>
  | Readonly<{ kind: 'retry'; supplier: Supplier; notBefore: string; basis: Adoption }>
export type RetryPosition = Readonly<{
  operation: ModelOperationId; dispatch: DispatchId; policy: Adoption; consumer: ConsumerRef
}>
export type RetryResolution =
  | Readonly<{ kind: 'pending'; position: RetryPosition }>
  | Readonly<{ kind: 'decided'; position: RetryPosition; decision: RetryDecision; source: DurableEvidence }>
export type RecoveryRecord = Readonly<{
  state: CallState; request: FixedModelRequest; capacity: ResultCapacity
  initiator: ActorRef; admission: ModelOperationId
  execution: ExecutionRef | null; retry: RetryDecision | null
  retryPosition: RetryPosition | null
  unresolved: readonly ModelOperationId[]
  tasks: readonly ('execute' | 'control' | 'handoff' | 'cleanup' | 'account')[]
}>
export type LateDispatchFact =
  | Readonly<{ kind: 'account'; event: string; value: CallAccount }>
  | Readonly<{ kind: 'terminal'; event: string; actual: Termination }>
export interface ModelCommands<P> {
  admit(input: Admit<P>): Reply<Admission>
  recall(input: CallAccess<P> & Readonly<{ admission: ModelOperationId }>): Reply<Lookup>
  scanPending(input: Access<P> & Readonly<{
    after: string | null; limit: number
  }>): Reply<Readonly<{ calls: readonly ModelCallId[]; next: string | null }>>
  loadRecovery(input: CallAccess<P>): Reply<RecoveryRecord>
  claim(input: CallAccess<P> & Readonly<{
    instance: ModelInstanceId; operation: ModelOperationId; continuity: DurableEvidence
  }>): Reply<ExecutionRef>
  prepareDispatch(input: WriteContext & DispatchPlan): Reply<Revision>
  recordMaterialization(input: WriteContext & Readonly<{
    dispatch: DispatchId; receipt: MaterializationReceipt
  }>): Reply<Readonly<{ revision: Revision; source: DurableEvidence }>>
  recordSend(input: WriteContext & Readonly<{
    dispatch: DispatchId; state: 'started' | 'unknown' | 'not-sent'
  }>): Reply<Revision>
  openReceiveWindow(input: WriteContext & Readonly<{
    dispatch: DispatchId; window: string
  }>): Reply<Revision>
  preserve(input: WriteContext & Readonly<{
    dispatch: DispatchId; window: string; facts: readonly TransportFact[]
  }>): Reply<Snapshot>
  recordLateFact(input: Access<P> & Readonly<{
    call: ModelCallId; dispatch: DispatchId; operation: ModelOperationId
    source: DurableEvidence; fact: LateDispatchFact
  }>): Reply<Readonly<{ revision: Revision; recovered: boolean }>>
  prepareRetry(input: WriteContext & Readonly<{ dispatch: DispatchId }>): Reply<RetryPosition>
  decideRetry(input: WriteContext & Readonly<{
    position: RetryPosition; decision: RetryDecision; source: DurableEvidence
  }>): Reply<Revision>
  settle(input: WriteContext & Readonly<{ termination: Termination }>): Reply<Settlement>
  control(input: Mutation<P>): Reply<ControlState>
  acquireRead(input: Mutation<P> & Readonly<{ result: ResultVersion }>): Reply<ReadStart>
  nextRead(input: CallAccess<P> & Readonly<{ read: ReadId; after: string }>): Reply<ReadState>
  endRead(input: CallAccess<P> & Readonly<{ read: ReadId }>): Reply<ReadState>
  handoff(input: AckInput<P>): Reply<AckReceipt>
  advanceCleanup(input: ExecutionRef & Readonly<{
    operation: ModelOperationId
  }>): Reply<CustodyState>
  query(input: CallAccess<P> & Readonly<{
    operation: ModelOperationId
  }>): Reply<CommitQuery<Readonly<{ revision: Revision }>>>
  dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]>
}
export type SendDemand<P> = CallAccess<P> & Readonly<{
  execution: ExecutionRef; dispatch: DispatchId; request: FixedModelRequest
  supplier: Supplier; consumer: ConsumerRef; initiator: ActorRef
}>
export type SendResult =
  | Readonly<{ kind: 'started'; facts: AsyncIterable<TransportFact> }>
  | Readonly<{ kind: 'not-started'; failure: ModelFailure }>
  | Readonly<{ kind: 'unknown'; dispatch: DispatchId; diagnostic: string }>
export interface ModelSendBoundary<P> {
  send(input: SendDemand<P>, signal: AbortSignal): Promise<SendResult>
}
export interface ModelRetryPolicy<P> {
  decide(input: CallAccess<P> & Readonly<{
    position: RetryPosition; initiator: ActorRef
    request: FixedModelRequest; dispatches: readonly DispatchRecord[]; failure: ModelFault
  }>): Reply<RetryResolution>
  inspect(input: CallAccess<P> & Readonly<{ position: RetryPosition }>): Reply<RetryResolution>
}
export type Publication = Readonly<{
  execution: ExecutionRef; registration: string
}>
export interface ModelInstanceHost<P> {
  schedule(input: Readonly<{ tenant: TenantId; call: ModelCallId }>): Reply<Readonly<{ queued: true }>>
  publish(input: ExecutionRef, handle: ModelHandle<P>): Reply<Publication>
  withdraw(input: Publication): Reply<Readonly<{ removed: boolean }>>
  directory: ModelDirectory<P>
}
export interface ModelClock {
  now(): string
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export interface ModelProvider<P> {
  readonly runtime: ModelRuntime<P>
  recover(input: Access<P>): Reply<Readonly<{ scheduled: string }>>
  quiesce(): Reply<Readonly<{ pending: string; running: string }>>
}
```

## 参数与注入的裁定

[行为与约束](../SPEC.md#342-参数与注入的裁定)。

## 资格、共同提交与实际发送

[行为与约束](../SPEC.md#342-资格共同提交与实际发送)。

## 消费者 owner 的装配声明

[行为与约束](../SPEC.md#342-资格共同提交与实际发送)。

```ts
export type ModelConsumerOwnerDeclaration = Readonly<{
  consumerOwner: string
  work:
    | Readonly<{ kind: 'guarded'; participant: Adoption }>
    | Readonly<{ kind: 'exempt' }>
  evidence: Adoption
}>

export function deriveGuardControlOperation(call: ModelCallId): ModelOperationId
```

- `consumerOwner` 与 `ConsumerRef.owner` 按文本相等比较。字段不叫 `owner`，以免与 `Adoption.owner` 混淆。
- `evidence` 指明该 owner 的受信证据适配器。免守卫声明也必须给出它。
- `work.kind = 'guarded'` 的 `participant` 是已登记资格参加者的版本化身份。资格参加者协议（守卫读数的提交内载体、载体拥有者、参加者先后保证）是前置依赖，尚未闭合。在它闭合前，这一支是暂定形状，受守卫 owner 的装配被拒绝，见 [SPEC](../SPEC.md#342-资格共同提交与实际发送)。可受理的只有免守卫 owner。
- 声明由承载受理提交的 ModelCommands 实现持有并冻结。怎样取得声明由实现自定。同一 `consumerOwner` 出现两次是装配错误，构造时失败。
- 守卫问答事实的形状不在本包发布，原因同上。

`deriveGuardControlOperation(call)` 返回 `mop_--` 加 `call` 去掉 `mcall_` 前缀后的主体。它是纯函数，是契约唯一铸造身份的位置。

- 派生值与原调用等长，不超过 256 个 UTF-16 码元。`mcall_` 与 `mop_--` 都是 6 个字符。
- 派生值能通过 `decodeModelOperationId`，因为 `-` 在主体字符集内。
- 同一调用得到同一值，不同调用得到不同值（单射）。
- 主体以 `--` 开头的 `ModelOperationId` 只由本函数产生。其他铸造方的生成器不得产生这种主体。ULID 与 UUID 原样满足。字母表含 `-` 的生成器（nanoid、base64url）须过滤首两字符。

## 重试、失联与恢复

[行为与约束](../SPEC.md#342-重试失联与恢复)。

## 协议状态图与证据边界

[行为与约束](../SPEC.md#342-协议状态图与证据边界)。

## 档案与请求准备

这些接口供维护入口、选择列表的调用方及组装方分别消费。它们不扩展 ModelRuntime 的控制权限。规则及准备/发送两阶段区别见 [准备协议](../SPEC.md#档案与请求准备协议)。

```ts
export type ModelModality = 'text' | 'image' | 'voice'
export type ProfileScope =
  | Readonly<{ kind: 'factory' }>
  | Readonly<{ kind: 'organization'; organization: string }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>
export type ProfileIdentity = Readonly<{ scope: ProfileScope; route: string }>
export type LimitMetric = 'input-tokens' | 'output-tokens' | 'image-bytes'
  | 'image-count' | 'request-bytes' | 'voice-bytes' | 'voice-duration-ms'
export type UpstreamLimit =
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'finite'; amount: string; source: Adoption }>
  | Readonly<{ kind: 'unlimited' | 'not-applicable'; source: Adoption }>
export type ModelLimit = Readonly<{
  metric: LimitMetric; provided: string
  upstream: readonly Readonly<{ supplier: Adoption; limit: UpstreamLimit }>[]
}>
export type ProfileSupplier = Omit<Supplier, 'credential'>
export type ModelProfileDefinition = Readonly<{
  suppliers: readonly [ProfileSupplier, ...ProfileSupplier[]]
  fallback: boolean
  input: readonly [ModelModality, ...ModelModality[]]
  output: readonly [ModelModality, ...ModelModality[]]
  limits: readonly ModelLimit[]
  parameters: readonly Parameter[]
  representation: Adoption; meter: Adoption; retryPolicy: Adoption
}>
export type ModelProfile = Readonly<{
  identity: ProfileIdentity; adoption: Adoption; revision: Revision
  availability: 'active' | 'withdrawn'; definition: ModelProfileDefinition
}>
export type ModalityRequirement = Readonly<{
  modalities: readonly [ModelModality, ...ModelModality[]]
  source: DurableEvidence
}>
export type ProfileResolution =
  | Readonly<{
      kind: 'resolved'; profile: ModelProfile; source: DurableEvidence
      selectable: boolean; reasons: readonly ('modality' | 'locked' | 'scope')[]
      credential: 'available' | 'missing' | 'unreadable' | 'unavailable'
      shadowed: readonly Adoption[]
    }>
  | Readonly<{ kind: 'absent'; reason: 'unknown-name' | 'withdrawn' | 'excluded' }>
export type ModelChoices = Readonly<{
  choices: readonly ProfileResolution[]
  selected: Readonly<{ route: string; resolution: ProfileResolution }> | null
  source: DurableEvidence
}>
export interface ModelProfiles<P> {
  list(input: Access<P> & Readonly<{
    selected: string | null; required: ModalityRequirement
  }>): Reply<ModelChoices>
  resolve(input: Access<P> & Readonly<{
    route: string; required: ModalityRequirement
  }>): Reply<ProfileResolution>
}
export type ProfileChange =
  | Readonly<{ kind: 'create'; identity: ProfileIdentity; definition: ModelProfileDefinition }>
  | Readonly<{ kind: 'revise'; identity: ProfileIdentity; expected: Revision; definition: ModelProfileDefinition }>
  | Readonly<{ kind: 'withdraw' | 'restore'; identity: ProfileIdentity; expected: Revision }>
export interface ModelProfileMaintenance<P> {
  change(input: Access<P> & Readonly<{
    operation: ModelOperationId; change: ProfileChange
  }>): Reply<ModelProfile>
  inspect(input: Access<P> & Readonly<{
    operation: ModelOperationId
  }>): Reply<CommitQuery<ModelProfile>>
}
export type ParameterAdoption = Readonly<{
  supplier: Adoption; applied: Parameter
  origin: Readonly<{ kind: 'explicit'; requested: Parameter; source: Adoption }>
    | Readonly<{ kind: 'default'; source: Adoption }>
}>
export type Measurement =
  | Readonly<{ kind: 'exact' | 'upper-bound'; amount: string; method: Adoption }>
  | Readonly<{ kind: 'estimate'; amount: string; margin: string; method: Adoption; marginSource: Adoption }>
export type BudgetCheck = Readonly<{
  supplier: Adoption; metric: LimitMetric; subject: string
  measurement: Measurement; limit: string
  constraint: Readonly<{ profile: Adoption; upstream: UpstreamLimit }>
}>
export type RequestBudget = Readonly<{
  inputDigest: string; checks: readonly BudgetCheck[]
  counting: readonly [ModelCountingBasis, ...ModelCountingBasis[]]
}> & (
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'deferred-media'; references: readonly [ContentReference, ...ContentReference[]] }>
)
export type AssembledModelInput = Readonly<{
  system: readonly ContentBlock[]; messages: readonly Message[]
  tools: readonly ToolDeclaration[]; toolChoice: FixedModelRequest['toolChoice']
  parameters: readonly Parameter[]
  representation: Adoption; source: Adoption
}>
export interface ModelRequestPreparation<P> {
  prepare(input: Access<P> & Readonly<{
    profile: ModelProfile; required: ModalityRequirement
    assembled: AssembledModelInput
  }>): Reply<FixedModelRequest>
}
export type MediaMeasurementFact = Readonly<{
  reference: ContentReference; bytes: string; mediaType: string
}> & (
  | Readonly<{ kind: 'image'; widthPixels: string; heightPixels: string }>
  | Readonly<{ kind: 'voice'; durationMs: string; sampleRate: string; channels: string }>
  | Readonly<{ kind: 'file' }>
)
export type MeterRepresentation = Readonly<{
  adoption: Adoption; tokenInput: JsonValue
  media: readonly MediaMeasurementFact[]
}> & (
  | Readonly<{ kind: 'pending-media'; references: readonly [ContentReference, ...ContentReference[]] }>
  | Readonly<{ kind: 'materialized'; requestBytes: string }>
)
export interface ModelInputMeter {
  readonly basis: ModelCountingBasis
  measure(input: Readonly<{
    profile: Adoption; supplier: ProfileSupplier; limits: readonly ModelLimit[]
    assembled: AssembledModelInput; parameters: readonly ParameterAdoption[]
    representation: MeterRepresentation
  }>): Outcome<RequestBudget, TransportFailure>
}
```

`ProfileSupplier` 没有凭据字段。求值的 credential 只说明当前可用性，不返回秘密或授予发送资格。ModelProfileMaintenance 的身份参数不是跨层维护许可。精确键和摘要规则由实际提供者采用并验证，不把任意字符串当可信证明。

## 消息转换

消息准入使用 ModelMessageConversion。系统装配提供 ModelConverterCatalog 和本地 ModelConverter；Model runtime 不永久依赖转换目录。共享块保持原身份，转换结果随消息拥有者的原块一起接纳，不能拼成额外消息。消费行为见 [转换契约](../SPEC.md#转换与历史投影协议)。

```ts
export type ConverterKey =
  | Readonly<{ kind: 'media-type'; mediaType: string }>
  | Readonly<{ kind: 'modality'; modality: ModelModality }>
export type ConvertedContent = Readonly<{
  original: ContentBlock
  derived: readonly [ContentBlock, ...ContentBlock[]]
  transcript: string; converter: Adoption
}>
export type ConversionResult =
  | Readonly<{ kind: 'unchanged'; original: ContentBlock; reason: 'human-only' | 'text' | 'no-converter' }>
  | Readonly<{ kind: 'deferred'; original: ContentBlock; source: DurableEvidence }>
  | Readonly<{ kind: 'converted'; value: ConvertedContent }>
export type ConversionFailure = ModelFailure | Readonly<{ kind: 'cancelled' }>
export type ConversionReply<T> = Promise<Outcome<T, ConversionFailure>>
export interface ModelConverter<P> {
  readonly adoption: Adoption
  convert(input: Access<P> & Readonly<{
    original: ContentBlock; source: DurableEvidence; signal: AbortSignal
  }>): ConversionReply<ConvertedContent>
}
export type ConverterLookup<P> =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'selected'; converter: ModelConverter<P>; release(): Promise<void> }>
export interface ModelConverterCatalog<P> {
  acquire(input: Readonly<{ mediaType: string; modality: ModelModality | null }>): Reply<ConverterLookup<P>>
}
export interface ModelMessageConversion<P> {
  prepare(input: Access<P> & Readonly<{
    original: ContentBlock; source: DurableEvidence
    origin: 'inbound' | 'model-output' | 'tool-output'
    signal: AbortSignal
  }>): ConversionReply<ConversionResult>
}
```

转换器读取能力由具体提供者注入，目录只返回已核验的固定采用。ModelConverter 不取得模型调用、Tool 执行或全局 Context。释放一次取得的资源不删除已接纳派生或历史。Tool 来源由可信准入适配器核原事实，不能用 origin 字符串绕过转换或媒体读取规则。


## 文本分词与完整计量依据

ModelTextTokenizer 是具体计量提供者可注入的窄算法接口。普通请求调用者继续使用 ModelRequestPreparation 或 ModelInputMeter，不取得 tokenizer。模板、模型和供应商适用性归计量提供者，精度归 Measurement；本接口不承诺完整请求 token 数。行为见 [分词与计量](../SPEC.md#分词与完整请求计量)。

```ts
export type TokenizerDefinition = Readonly<{
  adoption: Adoption; implementation: Adoption
  vocabulary: Adoption; configuration: Adoption
}>
export type TokenizationSegment =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'special-token'; name: string }>
export type TokenizationFailure =
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unsupported-token'; name: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface ModelTextTokenizer {
  readonly definition: TokenizerDefinition
  count(input: readonly TokenizationSegment[]): Outcome<Readonly<{ tokens: string }>, TokenizationFailure>
}
export type ModelCountingBasis = Readonly<{
  supplier: ProfileSupplier
  meter: Adoption
  tokenization: Readonly<{ kind: 'local'; definition: TokenizerDefinition }>
    | Readonly<{ kind: 'not-used'; method: Adoption }>
  prompt: Readonly<{ kind: 'declared-template'; template: Adoption }>
    | Readonly<{ kind: 'provider-private'; estimation: Adoption }>
  projection: Adoption; mediaTransform: Adoption; replay: Adoption
  evidence: Adoption
}>
```

TokenizerDefinition.configuration 固定规范化、预切分、特殊 token 表及处理规则，vocabulary 固定词表和合并规则。implementation 固定执行这些规则的代码。adoption 指向这一完整组合的不可变描述。资源路径、分词库类型和文件句柄不进入该值。

ModelCountingBasis.supplier 固定供应商、接收方、物理模型及其适配采用。prompt 表示计量所依据的模板或私有模板估算方法。projection、mediaTransform 和 replay 分别固定请求投影、媒体处理、历史回放规则；无处理也必须采用明确的 identity/no-replay 定义，不用缺字段猜默认。basis.evidence 定位适用模型、格式、精度和限制的依据，不是调用者填写的可信布尔值。

RequestBudget.counting 保存所有参与当前报告的计量依据；相同供应商及模型不得出现冲突组合。单个 meter 固定一份 basis，prepare 组合各供应商报告，实际发送回执保留本次供应商的依据。meter.measure 的 supplier、representation.adoption、parameters 和约束须与 basis 及其固定采用相容，跨版本输入明确拒绝，不查同名最新实现补齐。

## 受信宿主驱动

ModelDriver 是提供者给执行宿主的能力，不属于普通 ModelRuntime。ModelDriverHost 在宿主本地绑定该能力，跨线程桥只运输下列身份值，不能序列化 driver、Context 或闭包。独立替代提供者可采用自己的调度构造，仍满足共同协议。

```ts
export type ModelDriveInput<P> = CallAccess<P> & Readonly<{
  instance: ModelInstanceId; operation: ModelOperationId; continuity: DurableEvidence
}>
export interface ModelDriver<P> {
  drive(input: ModelDriveInput<P>, signal: AbortSignal): Reply<void>
}
export interface ModelHostAuthority<P> {
  resolve(input: Readonly<{ tenant: TenantId; call: ModelCallId }>): Reply<ModelDriveInput<P>>
}
export interface ModelDriverBinding {
  close(): Reply<void>
}
export type ModelBindingFailure = Readonly<{ kind: 'conflict' }>
  | Extract<ModelFailure, { kind: 'invalid' | 'unavailable' }>
export interface ModelDriverHost<P> extends ModelInstanceHost<P> {
  bind(driver: ModelDriver<P>): Promise<Outcome<ModelDriverBinding, ModelBindingFailure>>
}
```

精确绑定、唤醒与关闭协议归 [SPEC](../SPEC.md#宿主绑定与驱动协议)。ModelHostAuthority 从当前受信宿主及原受理事实取得工作身份，不能从队列字段或租户字符串伪造主体。

## 档案来源与准备资源

这些端口供替代提供者和装配者使用。普通消费者继续使用 ModelProfiles、ModelRequestPreparation 和 ModelMessageConversion。写入档案的权威提供者直接实现 ModelProfileMaintenance，不增加只转发 change 的工厂层。

```ts
export type ModelProfileSnapshot = Readonly<{
  precedence: readonly ProfileScope[]
  candidates: readonly Readonly<{
    profile: ModelProfile; excluded: boolean; locked: boolean
    credential: 'available' | 'missing' | 'unreadable' | 'unavailable'
  }>[]
  source: DurableEvidence
}>
export interface ModelProfileSource<P> {
  read(input: Access<P>): Reply<ModelProfileSnapshot>
}
export interface ModelRequestRules {
  plan(input: Readonly<{
    profile: ModelProfile; supplier: Supplier; assembled: AssembledModelInput
  }>): Outcome<Readonly<{
    parameters: readonly ParameterAdoption[]; representation: MeterRepresentation
  }>, TransportFailure>
}
export type ModelPreparationLease = Readonly<{
  bindings: readonly [Readonly<{
    supplier: Supplier; rules: ModelRequestRules; meter: ModelInputMeter
  }>, ...Readonly<{ supplier: Supplier; rules: ModelRequestRules; meter: ModelInputMeter }>[]]
  release(): Promise<void>
}>
export interface ModelPreparationResources<P> {
  acquire(input: Access<P> & Readonly<{ profile: ModelProfile }>): Reply<ModelPreparationLease>
}
export interface ModelContentAuthority<P> {
  check(input: Parameters<ModelMessageConversion<P>['prepare']>[0]): ConversionReply<Readonly<{
    treatment: 'human-only' | 'text' | 'tool-ref' | 'convertible'
  }>>
}
```

来源提供者核当前可见范围和设置快照，只返回该租户可读取的档案。precedence 来自当前合法层序，不能由普通调用者传入。读取失败不返回空目录。资源提供者核固定档案、供应商顺序与原采用，取得规则和 meter；凭据只返回合法引用，不读取秘密。一次取得失败整体释放，release 不撤销准备结果。实际发出重新取得相同采用，不能以准备成功永久持有发送资格。

ModelRequestRules 只处理固定声明、参数和可计算表示，不读媒体字节，不联网。ModelContentAuthority 同时核原来源、实际块和当前权限，origin 字段本身不授予转换或绕过资格。

## 供应商尝试诊断

诊断是独立授权的只读面，不挂到普通调用句柄上，也不要求所有 ModelRuntime 消费者依赖它。提供者从原调用和 dispatch 的耐久事实投影，不接受普通调用者提交诊断内容。

```ts
export type ModelDiagnosticId = Identity<'ModelDiagnosticId'>
export type ModelDiagnosticCursor = Identity<'ModelDiagnosticCursor'>
export function decodeModelDiagnosticId(text: unknown): Outcome<ModelDiagnosticId, ModelIdentityRejection<'ModelDiagnosticId'>>
export function decodeModelDiagnosticCursor(text: unknown): Outcome<ModelDiagnosticCursor, ModelIdentityRejection<'ModelDiagnosticCursor'>>
export type ModelDuration = Readonly<{ kind: 'known'; milliseconds: string }>
  | Readonly<{ kind: 'unknown' }>
export type ModelAttemptDiagnostic = Readonly<{
  id: ModelDiagnosticId; call: ModelCallId; dispatch: DispatchId; revision: Revision
  adapter: Adoption
  send: 'not-sent' | 'sent' | 'unknown'
  firstContent: 'none-proven' | 'observed' | 'uncertain'
  outcome: Readonly<{ kind: 'pending' }>
    | Readonly<{ kind: 'completed'; reason: 'stop' | 'limit' | 'tool-suggestions' }>
    | Readonly<{ kind: 'interrupted' }>
    | Readonly<{ kind: 'failed'; cause: ModelFault['cause']; upstreamStatus: number | null }>
  timing: Readonly<{
    materialize: ModelDuration; sendToFirstContent: ModelDuration; execution: ModelDuration
  }>
}>
export type ModelDiagnosticsPage = Readonly<{
  entries: readonly ModelAttemptDiagnostic[]; next: ModelDiagnosticCursor | null
  snapshot: DurableEvidence; retention: Adoption
  coverage: 'complete-through-snapshot' | 'expired-prefix'
}>
export interface ModelDiagnostics<P> {
  list(input: CallAccess<P> & Readonly<{
    after: ModelDiagnosticCursor | null; limit: number
  }>): Reply<ModelDiagnosticsPage>
}
```

诊断不公开 prompt、消息、工具参数、响应正文、凭据或绑定 ID、媒体引用、URL、headers 和原始异常。adapter 采用描述也须为可披露的登记值，不能夹带路径或秘密。诊断 ID 只定位受保护记录，不是读取凭证。两个解码函数只拒绝格式错误。游标的不可猜测与验证由诊断提供者承担：`list` 仍须验证游标、重新授权，并对无效或已淘汰的游标返回 `invalid`。精确的披露、分页与保留协议见 [SPEC](../SPEC.md#诊断查询与保留)。
