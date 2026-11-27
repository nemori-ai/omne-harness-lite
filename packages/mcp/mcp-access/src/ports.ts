import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { ActionDiscovery, EndpointStatus, Millis } from '@omne-harness/mcp-contract'
import type { AdoptionView } from '@omne-harness/mcp-contract/provider'

export interface McpPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

/** The three faces of MCP, read on each call; the scope of the adoption and the status is `null`. */
export type McpFaces = Readonly<{
  adoption: Pick<AdoptionView<Principal, null>, 'endpoints'>
  status: Pick<EndpointStatus<Principal, null>, 'inspect' | 'subscribe'>
  discovery: Pick<ActionDiscovery<Principal>, 'current' | 'refresh'>
}>

export type McpAccessSettings = Readonly<{
  refresh: Readonly<{ connectBoundMs: Millis }>
}>
