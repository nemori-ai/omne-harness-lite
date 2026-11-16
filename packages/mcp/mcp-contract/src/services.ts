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
  OutputValidator,
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

export interface EndpointInspection extends BodyContract {
  inspect(body: unknown): Outcome<EndpointDefinition, EndpointBodyRejection>
  launchesLocalCommand(body: unknown): Outcome<boolean, EndpointBodyRejection>
}

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

export type KeptReason =
  | Readonly<{ kind: 'superseded' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'listing-incomplete'; defect: ListingDefect }>

export type RefreshResult =
  | Readonly<{ kind: 'published'; revision: CatalogRevision }>
  | Readonly<{ kind: 'kept'; reason: KeptReason }>

export interface ActionDiscovery<P> {
  current(access: Access<P>, ref: EndpointRef): Promise<Outcome<CatalogView, ReadFailure>>
  refresh(
    access: Access<P>,
    request: Readonly<{ ref: EndpointRef; connectBound?: Millis; signal?: AbortSignal }>,
  ): Promise<Outcome<RefreshResult, OperationFailure>>
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
  inputResponses?: JsonValue
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
  cancel(access: Access<P>, correlationKey: CorrelationKey): Promise<CancelAnswer>
}

export type TaskRef = Readonly<{
  ref: EndpointRef
  taskId: TaskId
  issuedAt: Generation
  connectBound?: Millis
}>

export interface TaskControl<P> {
  queryTask(
    access: Access<P>,
    task: TaskRef,
  ): Promise<Outcome<TaskReport | 'expired', OperationFailure>>
  taskResult(
    access: Access<P>,
    task: TaskRef,
  ): Promise<Outcome<CallOutcome | 'not-finished' | 'expired' | 'cancelled', OperationFailure>>
  provideTaskInput(
    access: Access<P>,
    task: TaskRef,
    inputResponses: JsonValue,
  ): Promise<Outcome<'accepted', OperationFailure>>
  cancelTask(access: Access<P>, task: TaskRef): Promise<Outcome<'requested', OperationFailure>>
}

export type ActionInvoker<P> = ActionCalls<P> & TaskControl<P>

export type DegradedReason = 'discover-failed' | 'list-failed'

export type LostReason =
  | 'preparation-failed'
  | 'discover-failed'
  | 'close-unconfirmed'
  | 'authorization-required'
  | 'process-exited'
  | 'stream-broken'
  | 'negotiation-invalid'
  | 'session-ended'

export type Residual = Readonly<{ kind: 'process'; confirmed: StopScope }>

export type ConnectionState =
  | Readonly<{ kind: 'none' | 'preparing' | 'ready' }>
  | Readonly<{ kind: 'degraded'; reason: DegradedReason }>
  | Readonly<{ kind: 'lost'; reason: LostReason; residual?: readonly Residual[] }>

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
  list(access: Access<P>, scope: S): Promise<Outcome<readonly EndpointStatusView[], 'unknown'>>
}

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
  closeAll(): Promise<readonly Readonly<{ ref: EndpointRef; process: StopScope | 'no-process' }>[]>
}

export type McpPorts<P, S> = Readonly<{
  adoption: AdoptionView<P, S>
  eligibility: UseEligibility<P>
  credentials: CredentialUse<P>
  landing: ProcessLanding<P>
  store: CatalogStore
  transports: McpTransportFactory
  checkOutput: OutputValidator
  clock?: McpClock
}>

export type McpConfig<P> = Readonly<{
  principalKey: (principal: P) => string
  maxListingPages: number
  maxActions: number
  instructionsByteLimit: number
}>

export type McpServices<P, S> = Readonly<{
  inspection: EndpointInspection
  discovery: ActionDiscovery<P>
  invoker: ActionInvoker<P>
  status: EndpointStatus<P, S>
  connections: Connections<P>
}>
