import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ConnectFailure,
  EndpointConnect,
  EndpointRef,
  McpClock,
  McpConfig,
  McpPorts,
} from '@omne-harness/mcp-contract'
import type { ConnectInput, GrantKey } from '@omne-harness/mcp-contract/provider'
import type { ChangeFeed } from './internal/changes.ts'
import { admit, refusalOf, type AdoptedOnly } from './internal/gate.ts'

export type ConnectDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  clock: McpClock
  changes: ChangeFeed
}>

const UNAVAILABLE: ConnectFailure = { kind: 'refused', reason: 'unavailable' }

const keyOf = <P>(access: Access<P>, endpoint: AdoptedOnly): GrantKey => ({
  tenant: access.tenant,
  holding: endpoint.ref.holding,
  endpoint: endpoint.ref.name,
})

/** An endpoint the person may see: usable or disabled; disabled ones can be disconnected, not connected. */
async function visible<P, S>(
  ports: McpPorts<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<Readonly<{ endpoint: AdoptedOnly; usable: boolean }>, ConnectFailure>> {
  const decision = await admit(ports, access, ref)
  if (decision.kind === 'admitted') return succeed({ endpoint: decision.endpoint, usable: true })
  if (decision.kind === 'blocked') return succeed({ endpoint: decision.endpoint, usable: false })
  const refusal = refusalOf(decision)
  return fail(refusal.kind === 'blocked' ? { kind: 'unknown' } : refusal)
}

function inputOf<P>(
  deps: ConnectDependencies<P, unknown>,
  access: Access<P>,
  endpoint: AdoptedOnly,
): Outcome<Omit<ConnectInput, 'redirectUri' | 'signal'>, ConnectFailure> {
  const { target, clientId } = endpoint.settings
  if (target.kind !== 'value')
    return fail({
      kind: target.kind === 'absent' ? 'config-missing' : 'config-invalid',
      item: 'target',
    })
  if (clientId?.kind === 'invalid') return fail({ kind: 'config-invalid', item: 'client-id' })
  const document = deps.config.oauth?.metadataDocument
  return succeed({
    key: keyOf(access, endpoint),
    target: target.value,
    initiator: deps.config.principalKey(access.principal),
    ...(clientId?.kind === 'value' ? { configured: { clientId: clientId.value } } : {}),
    ...(document === undefined ? {} : { metadataDocument: document }),
  })
}

export function createConnect<P, S>(deps: ConnectDependencies<P, S>): EndpointConnect<P> {
  const { ports, config, clock, changes } = deps
  async function begin(access: Access<P>, ref: EndpointRef) {
    const seen = await visible(ports, access, ref)
    if ('failure' in seen) return seen
    const { endpoint, usable } = seen.ok
    if (!usable) return fail({ kind: 'blocked', reason: 'disabled' } as const)
    if (endpoint.definition.auth !== 'oauth') return fail({ kind: 'not-oauth' } as const)
    const input = inputOf(deps as ConnectDependencies<P, unknown>, access, endpoint)
    if ('failure' in input) return input
    const oauth = config.oauth
    if (ports.grants === undefined || ports.callbacks === undefined || oauth === undefined)
      return fail(UNAVAILABLE)
    const redirect = await ports.callbacks.open(clock.now().getTime() + oauth.pendingMs)
    if ('failure' in redirect) return fail(UNAVAILABLE)
    const begun = await ports.grants.begin({
      ...input.ok,
      redirectUri: redirect.ok,
      signal: AbortSignal.timeout(oauth.requestMs),
    })
    changes.changed(access.tenant)
    return 'failure' in begun ? fail({ kind: 'refused', reason: begun.failure } as const) : begun
  }
  async function disconnect(access: Access<P>, ref: EndpointRef) {
    const seen = await visible(ports, access, ref)
    if ('failure' in seen) return seen
    const { endpoint } = seen.ok
    if (endpoint.definition.auth !== 'oauth') return fail({ kind: 'not-oauth' } as const)
    if (ports.grants === undefined) return fail(UNAVAILABLE)
    const done = await ports.grants.disconnect(keyOf(access, endpoint))
    changes.changed(access.tenant)
    return 'failure' in done ? fail(UNAVAILABLE) : succeed('disconnected' as const)
  }
  return { callback: () => ports.callbacks?.address?.(), begin, disconnect }
}
