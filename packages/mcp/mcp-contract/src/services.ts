import type { BodyContract } from '@omne-harness/assets'
import type { JsonValue } from '@omne-harness/json-text'
import type { Access, TenantId } from '@omne-harness/legal-identity'
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
import type { EventCatalogRecord, EventType } from './events.ts'
import type {
  EventConsumer,
  EventRecords,
  StoredOccurrence,
  SubscriptionState,
  TerminationReason,
} from './subscriptions.ts'
import type { ListingDefect } from './listing.ts'
import type { EndpointBodyRejection } from './endpoint.ts'
import type { CallbackReceiver, ConnectRefusal, GrantConnector } from './grant.ts'
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
  TaskArrival,
  TaskRecords,
  TaskRowState,
  UseEligibility,
} from './ports.ts'
import type { McpTransportFactory, PeerNotification } from './transport.ts'
import type { EndpointDefinition, EndpointRef, PeerIdentity } from './values.ts'

export interface EndpointInspection extends BodyContract {
  inspect(body: unknown): Outcome<EndpointDefinition, EndpointBodyRejection>
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

export type EventCatalogView =
  | Readonly<{ kind: 'not-acquired' }>
  | Readonly<{ kind: 'not-declared'; freshness: Freshness }>
  | Readonly<{
      kind: 'acquired'
      revision: CatalogRevision
      freshness: Freshness
      types: readonly EventType[]
    }>

export interface ActionDiscovery<P> {
  current(access: Access<P>, ref: EndpointRef): Promise<Outcome<CatalogView, ReadFailure>>
  eventTypes(access: Access<P>, ref: EndpointRef): Promise<Outcome<EventCatalogView, ReadFailure>>
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

/** A call taken up again from the values its suspension handed out; it may come on another connection. */
export type ContinueRequest = Readonly<{
  ref: EndpointRef
  action: ActionName
  args: JsonValue
  requestState?: RequestState
  inputResponses?: JsonValue
  expectedDefinition: DefinitionDigest
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

export type FollowedTask = Readonly<{ state: TaskRowState; round: number; arrival?: TaskArrival }>

/** The task watcher: follows a task as the principal that gives it, while this process lives, and says when it got somewhere. */
export interface TaskWatch<P> {
  follow(access: Access<P>, task: TaskRef): Promise<Outcome<FollowedTask, OperationFailure>>
  drop(
    access: Access<P>,
    task: TaskRef,
    cancel: boolean,
  ): Promise<Outcome<'dropped' | 'already', OperationFailure>>
  following(tenant: TenantId): Promise<Outcome<readonly CorrelationKey[], 'unavailable'>>
  subscribe(arrived: (tenant: TenantId, call: CorrelationKey) => void): () => void
}

export type TaskWatchConfig = Readonly<{ pollFloorMs: number; backoffCapMs: number }>

export type DegradedReason = 'discover-failed' | 'list-failed'

export type LostReason =
  | 'preparation-failed'
  | 'discover-failed'
  | 'authorization-required'
  | 'credential-rejected'
  | 'stream-broken'
  | 'negotiation-invalid'
  | 'session-ended'

export type ConnectionState =
  | Readonly<{ kind: 'none' | 'preparing' | 'ready' }>
  | Readonly<{ kind: 'degraded'; reason: DegradedReason }>
  | Readonly<{ kind: 'lost'; reason: LostReason }>

export type EndpointStatusView = Readonly<{
  ref: EndpointRef
  connection: ConnectionState
  credential: 'present' | 'absent' | 'invalid' | 'not-required' | 'reconnect-required'
  connect?: 'available' | 'connecting'
  use: Readonly<{ kind: 'usable' }> | Readonly<{ kind: 'blocked'; reason: BlockedReason }>
}>

export type ChangeAbout = 'endpoints' | 'events'

export type EndpointChangeListener = Readonly<{
  /** The endpoints of this tenant, or the events of one of them, may have changed; the subscriber reads them again. */
  changed(tenant: TenantId, about: ChangeAbout): void
  /** The feed is gone with the MCP it belonged to. Nothing more arrives; the subscriber subscribes again. */
  closed(): void
}>

export interface EndpointChanges {
  subscribe(listener: EndpointChangeListener): () => void
}

export interface EndpointStatus<P, S> {
  inspect(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<
    Outcome<EndpointStatusView, Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>>
  >
  list(access: Access<P>, scope: S): Promise<Outcome<readonly EndpointStatusView[], 'unknown'>>
  subscribe: EndpointChanges['subscribe']
}

export type ReleaseReport = Readonly<{ kind: 'released' }> | Readonly<{ kind: 'no-connection' }>

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
  closeAll(): Promise<readonly Readonly<{ ref: EndpointRef }>[]>
}

export type McpPorts<P, S> = Readonly<{
  adoption: AdoptionView<P, S>
  eligibility: UseEligibility<P>
  credentials: CredentialUse<P>
  store: CatalogStore
  eventStore?: CatalogStore<EventCatalogRecord>
  eventRecords?: EventRecords
  eventConsumer?: EventConsumer
  tasks: TaskRecords
  transports: McpTransportFactory
  checkOutput: OutputValidator
  clock?: McpClock
  /** The OAuth grants; without it an OAuth endpoint's credential reads as absent. */
  grants?: GrantConnector
  callbacks?: CallbackReceiver
}>

export type OAuthConfig = Readonly<{
  pendingMs: number
  requestMs: number
  metadataDocument?: string
}>

export type EventsConfig = Readonly<{
  maxEvents: number
  maxAgeMs: number
  pollFloorMs: number
  backoffCapMs: number
}>

export type McpConfig<P> = Readonly<{
  principalKey: (principal: P) => string
  maxListingPages: number
  maxActions: number
  instructionsByteLimit: number
  taskWatch?: TaskWatchConfig
  oauth?: OAuthConfig
  events?: EventsConfig
}>

export type ConnectFailure =
  | Extract<Refusal, { kind: 'not-available-to-you' | 'blocked' | 'unknown' }>
  | Readonly<{ kind: 'not-oauth' }>
  | Readonly<{ kind: 'config-missing' | 'config-invalid'; item: 'target' | 'client-id' }>
  | Readonly<{ kind: 'refused'; reason: ConnectRefusal }>

/** A person connects an OAuth endpoint and ends the connection; agents have no way in. */
export type EndpointConnect<P> = Readonly<{
  begin(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<Readonly<{ url: string; expiresAt: number }>, ConnectFailure>>
  disconnect(access: Access<P>, ref: EndpointRef): Promise<Outcome<'disconnected', ConnectFailure>>
}>

export type SubscriptionView = Readonly<{
  name: string
  arguments: JsonValue
  delivery: 'poll' | 'push'
  state: SubscriptionState
  reason: TerminationReason | null
  subscribers: number
}>

export type SubscribeFailure =
  | ReadFailure
  | Readonly<{ kind: 'not-subscribable'; reason: 'no-events' | 'no-such-type' | 'webhook-only' }>

export type EventSubscriptionRequest = Readonly<{
  name: string
  arguments: JsonValue
  subscriber: string
  connectBound?: Millis
}>

export interface EventSubscriptions<P> {
  subscribe(
    access: Access<P>,
    ref: EndpointRef,
    request: EventSubscriptionRequest,
  ): Promise<Outcome<SubscriptionView, SubscribeFailure>>
  unsubscribe(
    access: Access<P>,
    ref: EndpointRef,
    request: EventSubscriptionRequest,
  ): Promise<Outcome<'unsubscribed' | 'not-subscribed', ReadFailure>>
  list(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<readonly SubscriptionView[], ReadFailure>>
  read(
    access: Access<P>,
    ref: EndpointRef,
    request: Readonly<{
      name: string
      arguments: JsonValue
      after: number
      limit: number
      connectBound?: Millis
    }>,
  ): Promise<
    Outcome<
      Readonly<{ subscription: SubscriptionView; items: readonly StoredOccurrence[] }>,
      ReadFailure | Readonly<{ kind: 'not-subscribed' }>
    >
  >
}

export type McpServices<P, S> = Readonly<{
  inspection: EndpointInspection
  discovery: ActionDiscovery<P>
  invoker: ActionInvoker<P>
  tasks?: TaskWatch<P>
  status: EndpointStatus<P, S>
  connections: Connections<P>
  connect: EndpointConnect<P>
  subscriptions: EventSubscriptions<P>
}>
