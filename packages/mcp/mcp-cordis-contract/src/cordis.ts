import { heldPoint } from '@omne-harness/assets'
import { type Context, Service } from '@deepseek-ai/cordis'
import type {
  ActionDiscovery,
  ActionInvoker,
  EndpointConnect,
  EndpointStatus,
  EventCatalogRecord,
  TaskWatch,
} from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  AuthorizationRecords,
  CallbackReceiver,
  CatalogStore,
  ContinuationRecords,
  CredentialUse,
  GrantConnector,
  HoldingRows,
  TaskRecords,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'

/**
 * The action discovery of MCP as a service: the stored catalog, the refresh that discovers and
 * publishes, and the negotiated facts of the current connection.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class ActionDiscoveryService<P> extends Service implements ActionDiscovery<P> {
  static readonly provide = 'mcpActionDiscovery'
  constructor(ctx: Context) {
    super(ctx, ActionDiscoveryService.provide)
  }
  abstract current(
    ...args: Parameters<ActionDiscovery<P>['current']>
  ): ReturnType<ActionDiscovery<P>['current']>
  abstract refresh(
    ...args: Parameters<ActionDiscovery<P>['refresh']>
  ): ReturnType<ActionDiscovery<P>['refresh']>
  abstract peer(
    ...args: Parameters<ActionDiscovery<P>['peer']>
  ): ReturnType<ActionDiscovery<P>['peer']>
  abstract eventTypes(
    ...args: Parameters<ActionDiscovery<P>['eventTypes']>
  ): ReturnType<ActionDiscovery<P>['eventTypes']>
}

export const mcpActionDiscoveryKey = ActionDiscoveryService.provide

/**
 * The action invoker of MCP as a service: the calls of actions and the control of the tasks they
 * start.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class ActionInvokerService<P> extends Service implements ActionInvoker<P> {
  static readonly provide = 'mcpActionInvoker'
  constructor(ctx: Context) {
    super(ctx, ActionInvokerService.provide)
  }
  abstract invoke(
    ...args: Parameters<ActionInvoker<P>['invoke']>
  ): ReturnType<ActionInvoker<P>['invoke']>
  abstract continueWithInput(
    ...args: Parameters<ActionInvoker<P>['continueWithInput']>
  ): ReturnType<ActionInvoker<P>['continueWithInput']>
  abstract cancel(
    ...args: Parameters<ActionInvoker<P>['cancel']>
  ): ReturnType<ActionInvoker<P>['cancel']>
  abstract queryTask(
    ...args: Parameters<ActionInvoker<P>['queryTask']>
  ): ReturnType<ActionInvoker<P>['queryTask']>
  abstract taskResult(
    ...args: Parameters<ActionInvoker<P>['taskResult']>
  ): ReturnType<ActionInvoker<P>['taskResult']>
  abstract provideTaskInput(
    ...args: Parameters<ActionInvoker<P>['provideTaskInput']>
  ): ReturnType<ActionInvoker<P>['provideTaskInput']>
  abstract cancelTask(
    ...args: Parameters<ActionInvoker<P>['cancelTask']>
  ): ReturnType<ActionInvoker<P>['cancelTask']>
}

export const mcpActionInvokerKey = ActionInvokerService.provide

/**
 * The endpoint status of MCP as a service: the status of one endpoint, and the list of the
 * endpoints the principal is eligible for.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class EndpointStatusService<P, S> extends Service implements EndpointStatus<P, S> {
  static readonly provide = 'mcpEndpointStatus'
  constructor(ctx: Context) {
    super(ctx, EndpointStatusService.provide)
  }
  abstract inspect(
    ...args: Parameters<EndpointStatus<P, S>['inspect']>
  ): ReturnType<EndpointStatus<P, S>['inspect']>
  abstract list(
    ...args: Parameters<EndpointStatus<P, S>['list']>
  ): ReturnType<EndpointStatus<P, S>['list']>
  abstract subscribe(
    ...args: Parameters<EndpointStatus<P, S>['subscribe']>
  ): ReturnType<EndpointStatus<P, S>['subscribe']>
}

export const mcpEndpointStatusKey = EndpointStatusService.provide

/**
 * The adoption view port of MCP as a service. Another domain provides it by loading a subclass; the
 * MCP plugin reads it on each call and treats its absence as `unknown`. It is an optional
 * dependency, so nobody writes it in `inject`.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class AdoptionViewService<P, S> extends Service implements AdoptionView<P, S> {
  static readonly provide = 'mcpAdoptionView'
  constructor(ctx: Context) {
    super(ctx, AdoptionViewService.provide)
  }
  abstract endpoints(
    ...args: Parameters<AdoptionView<P, S>['endpoints']>
  ): ReturnType<AdoptionView<P, S>['endpoints']>
  abstract endpoint(
    ...args: Parameters<AdoptionView<P, S>['endpoint']>
  ): ReturnType<AdoptionView<P, S>['endpoint']>
}

export const mcpAdoptionViewKey = AdoptionViewService.provide

/**
 * The use eligibility port of MCP as a service, with the same rules as the adoption view port.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class UseEligibilityService<P> extends Service implements UseEligibility<P> {
  static readonly provide = 'mcpUseEligibility'
  constructor(ctx: Context) {
    super(ctx, UseEligibilityService.provide)
  }
  abstract check(
    ...args: Parameters<UseEligibility<P>['check']>
  ): ReturnType<UseEligibility<P>['check']>
}

export const mcpUseEligibilityKey = UseEligibilityService.provide

/**
 * The credential use port of MCP as a service, with the same rules as the adoption view port.
 * `acquire` has two overloads, one for each purpose; it is declared as a property of the method
 * type so that both overloads stay.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class CredentialUseService<P> extends Service implements CredentialUse<P> {
  static readonly provide = 'mcpCredentialUse'
  constructor(ctx: Context) {
    super(ctx, CredentialUseService.provide)
  }
  abstract readonly acquire: CredentialUse<P>['acquire']
}

export const mcpCredentialUseKey = CredentialUseService.provide

/**
 * Where the catalogs of MCP are kept across a restart, as a service. The core takes it at each read and write;
 * while it is away both answer unavailable.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class CatalogStoreService extends Service implements CatalogStore {
  static readonly provide = 'mcpCatalogStore'
  constructor(ctx: Context) {
    super(ctx, CatalogStoreService.provide)
  }
  abstract readonly read: CatalogStore['read']
  abstract readonly write: CatalogStore['write']
}

export const mcpCatalogStoreKey = CatalogStoreService.provide

export abstract class EventCatalogStoreService
  extends Service
  implements CatalogStore<EventCatalogRecord>
{
  static readonly provide = 'mcpEventCatalogStore'
  constructor(ctx: Context) {
    super(ctx, EventCatalogStoreService.provide)
  }
  abstract readonly read: CatalogStore<EventCatalogRecord>['read']
  abstract readonly write: CatalogStore<EventCatalogRecord>['write']
}

export const mcpEventCatalogStoreKey = EventCatalogStoreService.provide

/**
 * Where the bridge marks a checkpoint whose continuation it sends, as a service; the bridge takes it at each resume.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class ContinuationRecordsService extends Service implements ContinuationRecords {
  static readonly provide = 'mcpContinuationRecords'
  constructor(ctx: Context) {
    super(ctx, ContinuationRecordsService.provide)
  }
  abstract readonly mark: ContinuationRecords['mark']
}

export const mcpContinuationRecordsKey = ContinuationRecordsService.provide

/**
 * The durable task table of MCP as a service; the core takes it at each use, absent means the store is unavailable.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class TaskRecordsService extends Service implements TaskRecords {
  static readonly provide = 'mcpTaskRecords'
  constructor(ctx: Context) {
    super(ctx, TaskRecordsService.provide)
  }
  abstract readonly record: TaskRecords['record']
  abstract readonly read: TaskRecords['read']
  abstract readonly move: TaskRecords['move']
  abstract readonly following: TaskRecords['following']
}

export const mcpTaskRecordsKey = TaskRecordsService.provide

/**
 * The task watcher of MCP as a service: the bridge gives it the principal of a waiting call, the assembly wakes calls it tells of.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class TaskWatchService<P> extends Service implements TaskWatch<P> {
  static readonly provide = 'mcpTaskWatch'
  constructor(ctx: Context) {
    super(ctx, TaskWatchService.provide)
  }
  abstract readonly follow: TaskWatch<P>['follow']
  abstract readonly drop: TaskWatch<P>['drop']
  abstract readonly following: TaskWatch<P>['following']
  abstract readonly subscribe: TaskWatch<P>['subscribe']
}

export const mcpTaskWatchKey = TaskWatchService.provide

/** The OAuth grants, pending authorizations and client registrations, kept across a restart. */
export abstract class AuthorizationRecordsService extends Service implements AuthorizationRecords {
  static readonly provide = 'mcpAuthorizationRecords'
  constructor(ctx: Context) {
    super(ctx, AuthorizationRecordsService.provide)
  }
  abstract readonly begin: AuthorizationRecords['begin']
  abstract readonly take: AuthorizationRecords['take']
  abstract readonly void: AuthorizationRecords['void']
  abstract readonly read: AuthorizationRecords['read']
  abstract readonly write: AuthorizationRecords['write']
  abstract readonly remove: AuthorizationRecords['remove']
  abstract readonly registration: AuthorizationRecords['registration']
  abstract readonly register: AuthorizationRecords['register']
}

export const mcpAuthorizationRecordsKey = AuthorizationRecordsService.provide

/** The rows MCP keeps under each holding, so those of a removed holding go in one cleanup. */
export abstract class HoldingRowsService extends Service implements HoldingRows {
  static readonly provide = 'mcpHoldingRows'
  constructor(ctx: Context) {
    super(ctx, HoldingRowsService.provide)
  }
  abstract readonly kept: HoldingRows['kept']
  abstract readonly forget: HoldingRows['forget']
}

export const mcpHoldingRowsKey = HoldingRowsService.provide

/** The OAuth grants of MCP endpoints, as MCP's core uses them. */
export abstract class GrantConnectorService extends Service implements GrantConnector {
  static readonly provide = 'mcpGrantConnector'
  constructor(ctx: Context) {
    super(ctx, GrantConnectorService.provide)
  }
  abstract readonly begin: GrantConnector['begin']
  abstract readonly disconnect: GrantConnector['disconnect']
  abstract readonly standing: GrantConnector['standing']
}

export const mcpGrantConnectorKey = GrantConnectorService.provide

/** Where a person's browser comes back after an OAuth consent. */
export abstract class CallbackReceiverService extends Service implements CallbackReceiver {
  static readonly provide = 'mcpCallbackReceiver'
  constructor(ctx: Context) {
    super(ctx, CallbackReceiverService.provide)
  }
  abstract readonly open: CallbackReceiver['open']
}

export const mcpCallbackReceiverKey = CallbackReceiverService.provide

/** Connecting and disconnecting an OAuth endpoint, for the person's entry only. */
export abstract class EndpointConnectService<P> extends Service implements EndpointConnect<P> {
  static readonly provide = 'mcpEndpointConnect'
  constructor(ctx: Context) {
    super(ctx, EndpointConnectService.provide)
  }
  abstract readonly begin: EndpointConnect<P>['begin']
  abstract readonly disconnect: EndpointConnect<P>['disconnect']
}

export const mcpEndpointConnectKey = EndpointConnectService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpActionDiscovery: ActionDiscoveryService<unknown>
    mcpActionInvoker: ActionInvokerService<unknown>
    mcpEndpointStatus: EndpointStatusService<unknown, unknown>
    mcpAdoptionView: AdoptionViewService<unknown, unknown>
    mcpUseEligibility: UseEligibilityService<unknown>
    mcpCredentialUse: CredentialUseService<unknown>
    mcpCatalogStore: CatalogStoreService
    mcpEventCatalogStore: EventCatalogStoreService
    mcpContinuationRecords: ContinuationRecordsService
    mcpTaskRecords: TaskRecordsService
    mcpTaskWatch: TaskWatchService<unknown>
    mcpAuthorizationRecords: AuthorizationRecordsService
    mcpHoldingRows: HoldingRowsService
    mcpGrantConnector: GrantConnectorService
    mcpCallbackReceiver: CallbackReceiverService
    mcpEndpointConnect: EndpointConnectService<unknown>
  }
}

/** The point of the category: each layer's held definitions are its items. */
export const mcpEndpointsPoint = heldPoint({
  name: 'mcp.endpoints',
  key: 'the endpoint name',
  summary: 'The MCP endpoint definitions each layer holds, by name.',
})
