import {
  commandOf,
  failureText,
  mcpActionExecutor,
  unavailableText,
} from '@omne-harness/mcp-bridge'
import {
  parseEndpointBody,
  type ConnectionState,
  type EndpointStatusView,
  type KeptReason,
  type KnownAction,
} from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'

export { unavailableText }

const SHAPE = { resultContract: mcpActionExecutor } as const
const LISTING_FAILED = 'the actions of the endpoint could not be listed'

/** The summary of an action as the command of the bridge says it; an action the bridge does not offer has none. */
export function summaryOf(action: KnownAction): string {
  const made = commandOf(action, SHAPE)
  return 'ok' in made ? made.ok.summary : ''
}

export function blockedText(use: Extract<EndpointStatusView['use'], { kind: 'blocked' }>): string {
  return failureText({ kind: 'blocked', reason: use.reason })
}

/** Why the connection is not what it should be; a connection that is none, preparing or ready says nothing. */
export function connectionText(connection: ConnectionState): string | null {
  if (connection.kind === 'degraded') return LISTING_FAILED
  if (connection.kind !== 'lost') return null
  return unavailableText(
    connection.reason === 'authorization-required'
      ? 'authorization-required'
      : 'connection-unavailable',
  )
}

/** Why no actions are known, from what the endpoint is now; asking for them is not done here. */
export function notAcquiredText(
  adopted: AdoptedEndpoint,
  connection: ConnectionState,
): string | null {
  const { target, credential } = adopted.settings
  if (target.kind === 'absent') return failureText({ kind: 'config-missing', item: 'target' })
  if (target.kind === 'invalid') return failureText({ kind: 'config-invalid', item: 'target' })
  const body = parseEndpointBody(adopted.body)
  if ('ok' in body && body.ok.auth !== 'none' && credential.kind === 'absent')
    return failureText({ kind: 'credential-unavailable', cause: 'missing' })
  return connection.kind === 'lost' ? connectionText(connection) : null
}

export function keptText(
  reason: Exclude<KeptReason, { kind: 'superseded' | 'cancelled' }>,
): string {
  return `the listing of the actions of the endpoint was not complete (${reason.defect})`
}
