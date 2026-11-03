// MCP 限界上下文：五个应用服务（对外的读口、调用口、状态口、类别端口）。
// 接口在 @omne-harness/mcp-contract；实现是 @omne-harness/mcp 的工厂函数，
// 只依赖端口与公共值，不含 Cordis，不含官方 SDK。

import type { Access, BodyContract, JsonValue, Outcome } from '../shared.ts'
import type { ActionCatalogRecord, KnownAction } from './catalog.ts'
import type { InvokeResult, Refusal, TaskStatus, CallOutcome } from './outcomes.ts'
import type {
  AdoptionView,
  CatalogStore,
  CredentialUse,
  McpTransportFactory,
  ProcessLanding,
  StopScope,
  UseEligibility,
} from './ports.ts'
import type { EndpointBodyRejection } from './functions.ts'
import type {
  ActionName,
  CallMode,
  CorrelationKey,
  DefinitionDigest,
  EndpointDefinition,
  EndpointRef,
  Generation,
  Millis,
  PeerIdentity,
  RequestState,
  TaskId,
} from './values.ts'
import type { CancelAnswer } from './in-flight.ts'

// ───────────── 类别端口（不带 access：只读正文） ─────────────

export interface EndpointInspection extends BodyContract {
  inspect(body: unknown): Outcome<EndpointDefinition, EndpointBodyRejection>
  launchesLocalCommand(body: unknown): Outcome<boolean, EndpointBodyRejection>
}

// ───────────── 读口 ─────────────

export type CatalogView =
  | Readonly<{ kind: 'not-acquired' }>
  | Readonly<{
      kind: 'acquired'
      revision: ActionCatalogRecord['revision']
      basis: ActionCatalogRecord['basis']
      freshness: ActionCatalogRecord['freshness'] & Readonly<{ basisMatchesConnection: boolean }>
      actions: readonly KnownAction[]
    }>

export type RefreshResult =
  | Readonly<{ kind: 'published'; revision: ActionCatalogRecord['revision'] }>
  | Readonly<{ kind: 'kept'; reason: 'newer-adoption' | 'listing-incomplete' | 'connection-unavailable' | 'superseded' }>

export interface ActionDiscovery<P> {
  /** 不连接，不发现。 */
  current(access: Access<P>, ref: EndpointRef): Promise<Outcome<CatalogView, Refusal>>
  /** 首次发现也经它触发。写入不可用时答 unknown，不报新修订。 */
  refresh(access: Access<P>, ref: EndpointRef): Promise<Outcome<RefreshResult, Refusal>>
  peer(access: Access<P>, ref: EndpointRef): Promise<Outcome<Readonly<{ peer: PeerIdentity; generation: Generation }>, Refusal | Readonly<{ kind: 'not-connected' }>>>
}

// ───────────── 调用口与状态口（同一实现，两个窄接口） ─────────────

export type InvokeRequest = Readonly<{
  ref: EndpointRef
  action: ActionName
  args: JsonValue
  expectedDefinition: DefinitionDigest
  correlationKey: CorrelationKey
  mode: CallMode
  signal: AbortSignal
  observe?: (notification: Readonly<{ untrusted: JsonValue }>) => void
}>

export type ContinueRequest = Omit<InvokeRequest, 'expectedDefinition' | 'observe'> &
  Readonly<{ requestState: RequestState; inputResponses: JsonValue; issuedAt: Generation }>

export interface ActionCalls<P> {
  invoke(access: Access<P>, request: InvokeRequest): Promise<InvokeResult>
  continueWithInput(access: Access<P>, request: ContinueRequest): Promise<InvokeResult>
  cancel(access: Access<P>, correlationKey: CorrelationKey): Promise<CancelAnswer>
}

type TaskRef = Readonly<{ ref: EndpointRef; taskId: TaskId; issuedAt: Generation }>

export interface TaskControl<P> {
  queryTask(access: Access<P>, task: TaskRef): Promise<Outcome<TaskStatus | 'expired', Refusal>>
  taskResult(access: Access<P>, task: TaskRef): Promise<Outcome<CallOutcome | 'not-finished' | 'expired', Refusal>>
  /** 只有发起该任务的同一租户与主体能取消；不核采用与当前资格。 */
  cancelTask(access: Access<P>, task: TaskRef): Promise<'requested' | 'already-terminal' | 'unknown'>
}

export type ActionInvoker<P> = ActionCalls<P> & TaskControl<P>

// ───────────── 状态口 ─────────────

export type EndpointStatusView = Readonly<{
  ref: EndpointRef
  connection: 'none' | 'preparing' | 'ready' | 'degraded' | 'lost'
  credential: 'present' | 'absent' | 'not-required' // 只给有无与归属，不给值
  blocked?: Refusal & { kind: 'blocked' }
}>

export interface EndpointStatus<P, S> {
  inspect(access: Access<P>, ref: EndpointRef): Promise<Outcome<EndpointStatusView, Refusal>>
  /** 只列主体有使用资格的接入点。 */
  list(access: Access<P>, scope: S): Promise<Outcome<readonly EndpointStatusView[], 'unknown'>>
}

export interface Connections<P> {
  release(access: Access<P>, ref: EndpointRef): Promise<Outcome<StopScope, Refusal>>
  /** 只供持有本组实例的宿主在退出时调用；只报告实际确认的范围。 */
  closeAll(): Promise<readonly Readonly<{ ref: EndpointRef; confirmed: StopScope }>[]>
}

// ───────────── 装配：一个注册入口，五个窄接口 ─────────────

export type McpPorts<P, S> = Readonly<{
  adoption: AdoptionView<P, S>
  eligibility: UseEligibility<P>
  credentials: CredentialUse<P>
  landing: ProcessLanding<P>
  store: CatalogStore
  transports: McpTransportFactory
}>

export type McpConfig<P> = Readonly<{
  /** 在途表与连接表按主体分键；P 对 MCP 不透明，由调用方给出稳定键。 */
  principalKey: (principal: P) => string
  /** 连接时限缺值且调用方没给上界时报 config-missing。 */
  fallbackConnectBound?: Millis
  instructionsByteLimit: number
}>

export type McpServices<P, S> = Readonly<{
  inspection: EndpointInspection
  discovery: ActionDiscovery<P>
  invoker: ActionInvoker<P>
  status: EndpointStatus<P, S>
  connections: Connections<P>
}>

export declare function createMcp<P, S>(ports: McpPorts<P, S>, config: McpConfig<P>): McpServices<P, S>
export declare function createInMemoryCatalogStore(): CatalogStore
