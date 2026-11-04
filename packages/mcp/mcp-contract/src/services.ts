// The five application services: the category port, the read port, the call and status ports.
// Interfaces and result values only; the implementation is not part of this member.
import type { BodyContract } from '@omne-harness/assets'
import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ActionName,
  CatalogRevision,
  CorrelationKey,
  DefinitionDigest,
  Generation,
  Millis,
  RequestState,
  TaskId,
} from './brands.ts'
import type { AdoptionBasis, Freshness, KnownAction } from './catalog.ts'
import type { ListingDefect } from './listing.ts'
import type { EndpointBodyRejection } from './endpoint.ts'
import type {
  BlockedReason,
  CallOutcome,
  InvokeResult,
  OperationFailure,
  ReadFailure,
  Refusal,
  TaskReport,
} from './outcomes.ts'
import type {
  AdoptionView,
  CatalogStore,
  CredentialUse,
  McpClock,
  ProcessLanding,
  StopScope,
  UseEligibility,
} from './ports.ts'
import type { McpTransportFactory, PeerNotification } from './transport.ts'
import type { EndpointDefinition, EndpointRef, PeerIdentity } from './values.ts'

/** The category port, with the parse and the local-command judgment on a body. No access. */
export interface EndpointInspection extends BodyContract {
  inspect(body: unknown): Outcome<EndpointDefinition, EndpointBodyRejection>
  launchesLocalCommand(body: unknown): Outcome<boolean, EndpointBodyRejection>
}

/** The catalog view. `basisCurrent` tells whether the basis still fits the current connection. */
export type CatalogView =
  | Readonly<{ kind: 'not-acquired' }>
  | Readonly<{
      kind: 'acquired'
      revision: CatalogRevision
      basis: AdoptionBasis
      freshness: Freshness
      basisCurrent: 'matches' | 'differs' | 'no-connection'
      actions: readonly KnownAction[]
    }>

/** Why a refresh kept the earlier adoption. */
export type KeptReason =
  | Readonly<{ kind: 'superseded' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'listing-incomplete'; defect: ListingDefect }>

export type RefreshResult =
  | Readonly<{ kind: 'published'; revision: CatalogRevision }>
  | Readonly<{ kind: 'kept'; reason: KeptReason }>

export interface ActionDiscovery<P> {
  /** The catalog as stored. It does not connect and does not discover. */
  current(access: Access<P>, ref: EndpointRef): Promise<Outcome<CatalogView, ReadFailure>>
  /**
   * Discovers and publishes. A store that cannot be read or written answers `unknown`. The
   * signal belongs to this refresh alone; when it fires, the refresh answers `kept` (`cancelled`).
   */
  refresh(
    access: Access<P>,
    request: Readonly<{ ref: EndpointRef; connectBound?: Millis; signal?: AbortSignal }>,
  ): Promise<Outcome<RefreshResult, OperationFailure>>
  /** The negotiated facts of the current connection. It does not connect to answer. */
  peer(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<
    Outcome<
      Readonly<{ peer: PeerIdentity; generation: Generation }>,
      ReadFailure | Readonly<{ kind: 'not-connected' }>
    >
  >
}

export type InvokeRequest = Readonly<{
  ref: EndpointRef
  action: ActionName
  args: JsonValue
  expectedDefinition: DefinitionDigest
  correlationKey: CorrelationKey
  signal: AbortSignal
  connectBound?: Millis
  observe?: (notification: PeerNotification) => void
}>

export type ContinueRequest = Readonly<{
  ref: EndpointRef
  action: ActionName
  args: JsonValue
  requestState?: RequestState
  inputResponses: JsonValue
  issuedAt: Generation
  correlationKey: CorrelationKey
  signal: AbortSignal
  connectBound?: Millis
  observe?: (notification: PeerNotification) => void
}>

export type CancelAnswer = 'signalled' | 'no-call-in-flight' | 'unknown'

export interface ActionCalls<P> {
  invoke(access: Access<P>, request: InvokeRequest): Promise<InvokeResult>
  continueWithInput(access: Access<P>, request: ContinueRequest): Promise<InvokeResult>
  /** Finds the call by tenant, principal and correlation key. It does not check eligibility. */
  cancel(access: Access<P>, correlationKey: CorrelationKey): Promise<CancelAnswer>
}

export type TaskRef = Readonly<{
  ref: EndpointRef
  taskId: TaskId
  issuedAt: Generation
  connectBound?: Millis
}>

/**
 * The task operations. Each one is open only to the tenant and principal that started the task
 * in this run; anyone else, and any task not in this run's table, gets `unknown`, whether the task
 * exists or not.
 */
export interface TaskControl<P> {
  queryTask(
    access: Access<P>,
    task: TaskRef,
  ): Promise<Outcome<TaskReport | 'expired', OperationFailure>>
  taskResult(
    access: Access<P>,
    task: TaskRef,
  ): Promise<Outcome<CallOutcome | 'not-finished' | 'expired' | 'cancelled', OperationFailure>>
  /** Hands the answers to the input requests of an `input_required` task to the peer. */
  provideTaskInput(
    access: Access<P>,
    task: TaskRef,
    inputResponses: JsonValue,
  ): Promise<Outcome<'accepted', OperationFailure>>
  /** Does not check adoption or eligibility. A terminal state is learned through `queryTask`. */
  cancelTask(access: Access<P>, task: TaskRef): Promise<Outcome<'requested', OperationFailure>>
}

export type ActionInvoker<P> = ActionCalls<P> & TaskControl<P>

/** Why a connection is degraded: the last non-call request that failed for a while. */
export type DegradedReason = 'discover-failed' | 'list-failed'

/** Why a connection is lost. */
export type LostReason =
  | 'preparation-failed'
  | 'discover-failed'
  | 'close-unconfirmed'
  | 'authorization-required'
  | 'process-exited'
  | 'stream-broken'
  | 'negotiation-invalid'
  | 'session-ended'

/** A process that a closed or failed preparation left, and the stop range that was confirmed. */
export type Residual = Readonly<{ kind: 'process'; confirmed: StopScope }>

export type ConnectionState =
  | Readonly<{ kind: 'none' | 'preparing' | 'ready' }>
  | Readonly<{ kind: 'degraded'; reason: DegradedReason }>
  | Readonly<{ kind: 'lost'; reason: LostReason; residual?: readonly Residual[] }>

/**
 * The status of one endpoint. The credential is reported only as present, absent, invalid or not
 * required; no value is shown. Processes left behind appear on the `lost` connection state.
 */
export type EndpointStatusView = Readonly<{
  ref: EndpointRef
  connection: ConnectionState
  credential: 'present' | 'absent' | 'invalid' | 'not-required'
  use: Readonly<{ kind: 'usable' }> | Readonly<{ kind: 'blocked'; reason: BlockedReason }>
}>

export interface EndpointStatus<P, S> {
  inspect(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<
    Outcome<EndpointStatusView, Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>>
  >
  /** Lists only the endpoints that the principal has use eligibility for. */
  list(access: Access<P>, scope: S): Promise<Outcome<readonly EndpointStatusView[], 'unknown'>>
}

/** What a release confirmed. A connection without a process has no process to stop. */
export type ReleaseReport =
  | Readonly<{ kind: 'released'; process: StopScope | 'no-process' }>
  | Readonly<{ kind: 'no-connection' }>

export interface Connections<P> {
  release(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<
    Outcome<
      ReleaseReport,
      Extract<Refusal, { kind: 'not-available-to-you' | 'blocked' | 'unknown' }>
    >
  >
  /** For the host that holds this instance, at exit. It reports only what was confirmed. */
  closeAll(): Promise<readonly Readonly<{ ref: EndpointRef; process: StopScope | 'no-process' }>[]>
}

export type McpPorts<P, S> = Readonly<{
  adoption: AdoptionView<P, S>
  eligibility: UseEligibility<P>
  credentials: CredentialUse<P>
  landing: ProcessLanding<P>
  store: CatalogStore
  transports: McpTransportFactory
  /** The clock that stamps catalog freshness. Absent: the implementation takes the host clock. */
  clock?: McpClock
}>

/**
 * The configuration of one MCP instance. Every field is required and has no default. The three
 * bounds are positive safe integers.
 */
export type McpConfig<P> = Readonly<{
  /** A stable text for a principal. The in-flight and task tables key entries by it. */
  principalKey: (principal: P) => string
  /** The most `tools/list` pages that one acquisition reads. */
  maxListingPages: number
  /** The most actions that one acquisition accepts. */
  maxActions: number
  /** The most UTF-8 bytes of peer instructions that are kept; the rest is cut. */
  instructionsByteLimit: number
}>

export type McpServices<P, S> = Readonly<{
  inspection: EndpointInspection
  discovery: ActionDiscovery<P>
  invoker: ActionInvoker<P>
  status: EndpointStatus<P, S>
  connections: Connections<P>
}>
