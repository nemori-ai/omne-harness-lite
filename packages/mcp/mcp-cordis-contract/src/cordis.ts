// The Cordis service definitions of MCP: the abstract Service of each of the three MCP services and
// of the four demand ports that other domains implement. Each Service writes its key once, in
// `provide`; the exported key constants are taken from it. A Service declares no `inject`: the
// plugin that uses a port reads it from its own context on each call and treats its absence as the
// port's `unknown` answer.
import { type Context, Service } from '@deepseek-ai/cordis'
import type { ActionDiscovery, ActionInvoker, EndpointStatus } from '@omne-harness/mcp-contract'
import type {
  AdoptionView,
  CredentialUse,
  ProcessLanding,
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
 * The process landing port of MCP as a service, with the same rules as the adoption view port.
 *
 * @owner packages/mcp/mcp-cordis-contract
 */
export abstract class ProcessLandingService<P> extends Service implements ProcessLanding<P> {
  static readonly provide = 'mcpProcessLanding'
  constructor(ctx: Context) {
    super(ctx, ProcessLandingService.provide)
  }
  abstract start(
    ...args: Parameters<ProcessLanding<P>['start']>
  ): ReturnType<ProcessLanding<P>['start']>
}

export const mcpProcessLandingKey = ProcessLandingService.provide

declare module '@deepseek-ai/cordis' {
  // The principal and scope types stay `unknown` here; an implementation checks every input at run
  // time, and an assembly with a trusted identity adapter narrows them.
  interface Context {
    mcpActionDiscovery: ActionDiscoveryService<unknown>
    mcpActionInvoker: ActionInvokerService<unknown>
    mcpEndpointStatus: EndpointStatusService<unknown, unknown>
    mcpAdoptionView: AdoptionViewService<unknown, unknown>
    mcpUseEligibility: UseEligibilityService<unknown>
    mcpCredentialUse: CredentialUseService<unknown>
    mcpProcessLanding: ProcessLandingService<unknown>
  }
}
