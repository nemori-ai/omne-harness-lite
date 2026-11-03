// The status port `EndpointStatus` (SPEC S1, S7), composed on the gate. It reads adoption,
// eligibility and the connection table; it connects to nothing. The credential is reported in
// four states, never by value.
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
  adoptedOnlyOf,
  judge,
  refusalOf,
  type AdoptedOnly,
  type GateDecision,
} from './internal/gate.ts'
import { withdraws } from './internal/guard.ts'
import type { ConnectionTable } from './internal/table.ts'

export type StatusDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  table: ConnectionTable<P>
}>

type InspectRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>

/** The credential in four states (S7), from the parsed body and the setting value. */
function credentialOf(adopted: AdoptedOnly): EndpointStatusView['credential'] {
  if (adopted.definition.auth === 'none') return 'not-required'
  const { credential } = adopted.settings
  return credential.kind === 'value' ? 'present' : credential.kind
}

/** The use of a decided endpoint: usable, blocked, or a refusal of inspect. */
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

  function viewOf(
    access: Access<P>,
    endpoint: AdoptedOnly,
    use: EndpointStatusView['use'],
  ): EndpointStatusView {
    return {
      ref: endpoint.ref,
      connection: table.stateOf(access.tenant, endpoint.ref.holding),
      credential: credentialOf(endpoint),
      use,
    }
  }

  async function inspect(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<EndpointStatusView, InspectRefusal>> {
    const decision = await admit(ports, access, ref)
    // Invariant 6 at this use: a withdrawn or blocked endpoint does not keep its connection.
    if (decision.kind !== 'admitted' && withdraws(decision))
      await table.close(access.tenant, ref.holding)
    const use = useOf(decision)
    if ('failure' in use)
      return fail(use.failure === 'not-eligible' ? { kind: 'not-available-to-you' } : use.failure)
    return succeed(viewOf(access, use.ok.endpoint, use.ok.use))
  }

  async function list(
    access: Access<P>,
    scope: S,
  ): Promise<Outcome<readonly EndpointStatusView[], 'unknown'>> {
    const adopted = await ports.adoption.endpoints(access, scope)
    if ('failure' in adopted) return fail('unknown')
    const views: EndpointStatusView[] = []
    for (const endpoint of adopted.ok) {
      const token = adoptedOnlyOf(endpoint)
      if ('failure' in token) return fail('unknown')
      const use = useOf(await judge(ports, access, token.ok))
      if ('failure' in use) {
        if (use.failure === 'not-eligible') continue
        return fail('unknown')
      }
      views.push(viewOf(access, use.ok.endpoint, use.ok.use))
    }
    return succeed(views)
  }

  return { inspect, list }
}
