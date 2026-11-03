// MCP 限界上下文：需求端口（五个）与组内传输端口。
// 跨领域四个端口由组外实现；CatalogStore 第一波由 @omne-harness/mcp 的内存实现提供；
// McpTransport 由 mcp-host-local 实现，官方 SDK 只出现在那里。
// 每个端口在 mcp-contract 的 `./testing` 有符合性套件。

import type { Access, JsonValue, Outcome } from '../shared.ts'
import type { ActionCatalogRecord } from './catalog.ts'
import type { CallOutcome, TaskStatus } from './outcomes.ts'
import type {
  ActionDefinition,
  AdoptionRevision,
  CatalogKey,
  CatalogRevision,
  CredentialBinding,
  EndpointHolding,
  EndpointRef,
  EndpointSettings,
  Generation,
  PeerIdentity,
  RequestState,
  StdioLaunch,
  TaskId,
  ConnectionTarget,
  ActionName,
} from './values.ts'

// ───────────── AdoptionView：哪些接入点已采用，正文与配值是什么 ─────────────

export type AdoptedEndpoint = Readonly<{
  ref: EndpointRef
  revision: AdoptionRevision
  body: JsonValue
  settings: EndpointSettings
  processEnv: Readonly<Record<string, string>> // stdio 进程环境所需的非秘密配值
}>

export interface AdoptionView<P, S> {
  endpoints(access: Access<P>, scope: S): Promise<Outcome<readonly AdoptedEndpoint[], 'unknown'>>
  /** 建模新增：按引用取一项。调用口只有 EndpointRef，没有作用域。见 README「发现」F1。 */
  endpoint(access: Access<P>, ref: EndpointRef): Promise<Outcome<AdoptedEndpoint | undefined, 'unknown'>>
}

// ───────────── UseEligibility：这个主体此刻能不能用这个接入点 ─────────────

export type BlockedReason = 'local-command-not-enabled' | 'disabled'
export type EligibilityVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused'; reason: 'not-eligible' }> // 不随接入点是否存在而变
  | Readonly<{ kind: 'refused'; reason: BlockedReason }> // 只在有使用资格时答
  | Readonly<{ kind: 'unknown' }>

export interface UseEligibility<P> {
  check(access: Access<P>, endpoint: EndpointRef): Promise<EligibilityVerdict>
}

// ───────────── CredentialUse：一次凭据的受限使用 ─────────────

export type CredentialPurpose =
  | Readonly<{ kind: 'process-env' }>
  | Readonly<{ kind: 'http-authorization'; target: ConnectionTarget }>

/** 句柄只对这份持有（HTTP 时另限连接目标）有效。秘密值不经过 MCP 的内存表示。 */
export interface CredentialHandle {
  authorize(request: Readonly<{ headers: Headers }>): Promise<Outcome<void, 'rejected' | 'unknown'>>
  reportRejection(): Promise<void>
  release(): Promise<void>
}

export interface CredentialUse<P> {
  /** 建模收窄：只答句柄。对端账号由 peerAccountOf(binding) 派生，不再由端口另答一份。见 README F2。 */
  acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: CredentialPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<CredentialHandle, 'missing' | 'rejected' | 'unknown'>>
}

// ───────────── ProcessLanding：起一个本机进程 ─────────────

export type StopScope = 'tree-confirmed' | 'root-only' | 'unconfirmed'

export interface ProcessHandle {
  readonly stdin: WritableStream<Uint8Array>
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<string> // 已遮盖秘密值
  stop(): Promise<StopScope>
}

export interface ProcessLanding<P> {
  start(
    access: Access<P>,
    launch: StdioLaunch,
    env: Readonly<{ values: Readonly<Record<string, string>>; credentials: readonly CredentialHandle[] }>,
  ): Promise<Outcome<ProcessHandle, 'landing-invalid' | 'facility-missing' | 'unknown'>>
}

// ───────────── CatalogStore：按修订条件整份写入 ─────────────

export type ExpectedRevision = CatalogRevision | 'absent'

export interface CatalogStore {
  read(key: CatalogKey): Promise<Outcome<ActionCatalogRecord | 'absent', 'unavailable'>>
  write(
    key: CatalogKey,
    catalog: ActionCatalogRecord,
    expected: ExpectedRevision,
  ): Promise<Outcome<void, 'unavailable' | 'revision-conflict'>>
}

// ───────────── McpTransport：组内端口，只讲协议 ─────────────

/** 失败只分两种：未发出（没有对端效果）与已发出无应答（效果未知）。 */
export type TransportFailure =
  | Readonly<{ kind: 'not-sent'; cause: 'connection-unavailable' | 'authorization-required'; authorization?: AuthorizationDiscovery }>
  | Readonly<{ kind: 'no-answer'; cause: 'stream-broken' | 'process-exited' | 'abandoned' }>

export type AuthorizationDiscovery = Readonly<{
  resourceMetadata: JsonValue
  issuers: readonly string[]
  scopes: readonly string[]
}>

export type ListingPage = Readonly<{
  actions: readonly ActionDefinition[]
  nextCursor?: string
  ttlMs?: number
}>

export type CallRequest = Readonly<{
  action: ActionName
  args: JsonValue
  mode: 'direct' | 'task'
  continuation?: Readonly<{ requestState: RequestState; inputResponses: JsonValue }>
}>

export interface McpTransport {
  readonly generation: Generation
  discover(): Promise<Outcome<PeerIdentity, TransportFailure>>
  listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>>
  call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: Readonly<{ untrusted: JsonValue }>) => void,
  ): Promise<Readonly<{ requestId: string; outcome: Promise<Outcome<CallOutcome, TransportFailure>> }>>
  cancelRequest(requestId: string): Promise<void>
  getTask(taskId: TaskId): Promise<Outcome<TaskStatus | 'expired', TransportFailure>>
  getTaskResult(taskId: TaskId): Promise<Outcome<CallOutcome | 'not-finished' | 'expired', TransportFailure>>
  cancelTask(taskId: TaskId): Promise<Outcome<'requested' | 'already-terminal', TransportFailure>>
  close(): Promise<StopScope>
}

/**
 * 建模新增的组内端口：按连接键与准备好的材料开一条传输。
 * Connections 用它创建传输而不认识 SDK（依赖倒置）。见 README F3。
 */
export interface McpTransportFactory {
  open(
    material:
      | Readonly<{ kind: 'stdio'; process: ProcessHandle; generation: Generation }>
      | Readonly<{ kind: 'streamable-http'; target: ConnectionTarget; credential?: CredentialHandle; generation: Generation }>,
    signal: AbortSignal,
  ): Promise<Outcome<McpTransport, TransportFailure>>
}
