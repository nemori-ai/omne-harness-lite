import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  EndpointRef,
  EndpointStatus,
  EndpointStatusView,
  McpPorts,
  Refusal,
} from '@omne-harness/mcp-contract'
import {
  admit,
  admitScope,
  refusalOf,
  type AdoptedOnly,
  type GateDecision,
} from './internal/gate.ts'
import { withdraws } from './internal/guard.ts'
import type { ChangeFeed } from './internal/changes.ts'
import type { ConnectionTable } from './internal/table.ts'

export type StatusDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  table: ConnectionTable<P>
  changes: ChangeFeed
}>

type InspectRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>

type CredentialView = Pick<EndpointStatusView, 'credential' | 'connect'>

const GRANT_VIEW = { none: 'absent', valid: 'present', reconnect: 'reconnect-required' } as const

/** An OAuth endpoint's credential is its grant; a grant that cannot be read is not shown as absent. */
async function credentialOf<P, S>(
  ports: McpPorts<P, S>,
  access: Access<P>,
  adopted: AdoptedOnly,
): Promise<CredentialView | 'unknown'> {
  if (adopted.definition.auth === 'none') return { credential: 'not-required' }
  if (adopted.definition.auth === 'static') {
    const { credential } = adopted.settings
    return { credential: credential.kind === 'value' ? 'present' : credential.kind }
  }
  if (ports.grants === undefined) return { credential: 'absent', connect: 'available' }
  const key = { tenant: access.tenant, holding: adopted.ref.holding, endpoint: adopted.ref.name }
  let stood: Awaited<ReturnType<NonNullable<McpPorts<P, S>['grants']>['standing']>>
  try {
    stood = await ports.grants.standing(key)
  } catch {
    return 'unknown'
  }
  if ('failure' in stood) return 'unknown'
  const connect = stood.ok.connecting ? 'connecting' : 'available'
  return { credential: GRANT_VIEW[stood.ok.grant], connect }
}

function useOf(
  decision: GateDecision,
): Outcome<
  Readonly<{ endpoint: AdoptedOnly; use: EndpointStatusView['use'] }>,
  InspectRefusal | 'not-eligible'
> {
  switch (decision.kind) {
    case 'admitted':
      return succeed({ endpoint: decision.endpoint, use: { kind: 'usable' } })
    case 'blocked':
      return succeed({
        endpoint: decision.endpoint,
        use: { kind: 'blocked', reason: decision.reason },
      })
    case 'not-eligible':
      return fail('not-eligible')
    case 'not-adopted':
    case 'adoption-unknown':
    case 'body-unreadable':
    case 'eligibility-unknown': {
      const refusal = refusalOf(decision)
      return fail(refusal.kind === 'blocked' ? { kind: 'unknown' } : refusal)
    }
    default: {
      const exhaustive: never = decision
      return exhaustive
    }
  }
}

export function createStatus<P, S>(deps: StatusDependencies<P, S>): EndpointStatus<P, S> {
  const { ports, table } = deps

  async function viewOf(
    access: Access<P>,
    endpoint: AdoptedOnly,
    use: EndpointStatusView['use'],
  ): Promise<EndpointStatusView | 'unknown'> {
    const credential = await credentialOf(ports, access, endpoint)
    if (credential === 'unknown') return credential
    return {
      ref: endpoint.ref,
      connection: table.stateOf(access.tenant, endpoint.ref.holding),
      ...credential,
      use,
    }
  }

  async function inspect(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<EndpointStatusView, InspectRefusal>> {
    const decision = await admit(ports, access, ref)
    if (withdraws(decision)) await table.close(access.tenant, ref.holding)
    const use = useOf(decision)
    if ('failure' in use)
      return fail(use.failure === 'not-eligible' ? { kind: 'not-available-to-you' } : use.failure)
    const view = await viewOf(access, use.ok.endpoint, use.ok.use)
    return view === 'unknown' ? fail({ kind: 'unknown' }) : succeed(view)
  }

  async function list(
    access: Access<P>,
    scope: S,
  ): Promise<Outcome<readonly EndpointStatusView[], 'unknown'>> {
    const decisions = await admitScope(ports, access, scope)
    if ('failure' in decisions) return fail('unknown')
    const views: EndpointStatusView[] = []
    for (const decision of decisions.ok) {
      const use = useOf(decision)
      if ('failure' in use) {
        if (use.failure === 'not-eligible') continue
        return fail('unknown')
      }
      const view = await viewOf(access, use.ok.endpoint, use.ok.use)
      if (view === 'unknown') return fail('unknown')
      views.push(view)
    }
    return succeed(views)
  }

  return { inspect, list, subscribe: deps.changes.subscribe }
}
