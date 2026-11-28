import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type {
  ActionDiscovery,
  EndpointConnect,
  EndpointStatus,
  EventSubscriptions,
  Millis,
} from '@omne-harness/mcp-contract'
import type { AdoptionView } from '@omne-harness/mcp-contract/provider'

export interface McpPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
  /** The person a principal stands for, as the subscriber of a subscription. */
  subscriberOf(principal: Principal): string
}

/** The faces of MCP, read on each call; the scope of the adoption and the status is `null`. Connecting and subscribing are optional: without one its operations are unavailable. */
export type McpFaces = Readonly<{
  adoption: Pick<AdoptionView<Principal, null>, 'endpoints'>
  status: Pick<EndpointStatus<Principal, null>, 'inspect' | 'subscribe'>
  discovery: Pick<ActionDiscovery<Principal>, 'current' | 'refresh' | 'eventTypes'>
  connect?: EndpointConnect<Principal>
  subscriptions?: EventSubscriptions<Principal>
}>

export type McpAccessSettings = Readonly<{
  refresh: Readonly<{ connectBoundMs: Millis }>
}>
