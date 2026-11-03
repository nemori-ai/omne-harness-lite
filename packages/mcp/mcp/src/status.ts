// The status port `EndpointStatus` (SPEC S1, S7). It reads adoption, eligibility and the
// connection table; it connects to nothing. The credential is reported in four states, never by
// value.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  parseEndpointBody,
  type EndpointRef,
  type EndpointStatus,
  type EndpointStatusView,
  type McpPorts,
  type Refusal,
} from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import { admitWithoutEligibility } from './internal/gate.ts'
import { refusalOf } from './internal/guard.ts'
import type { ConnectionTable } from './internal/table.ts'

export type StatusDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  table: ConnectionTable<P>
}>

type InspectRefusal = Extract<Refusal, { kind: 'not-available-to-you' | 'unknown' }>

const UNKNOWN: InspectRefusal = { kind: 'unknown' }

/** The credential in four states (S7). `unknown` when the body is not one MCP can read. */
function credentialOf(adopted: AdoptedEndpoint): EndpointStatusView['credential'] | 'unknown' {
  const parsed = parseEndpointBody(adopted.body, adopted.ref.name)
  if ('failure' in parsed) return 'unknown'
  if (parsed.ok.auth === 'none') return 'not-required'
  const { credential } = adopted.settings
  return credential.kind === 'value' ? 'present' : credential.kind
}

export function createStatus<P, S>(deps: StatusDependencies<P, S>): EndpointStatus<P, S> {
  const { ports, table } = deps

  function viewOf(
    access: Access<P>,
    adopted: AdoptedEndpoint,
    use: EndpointStatusView['use'],
  ): EndpointStatusView | 'unknown' {
    const credential = credentialOf(adopted)
    if (credential === 'unknown') return 'unknown'
    return {
      ref: adopted.ref,
      connection: table.stateOf(access.tenant, adopted.ref.holding),
      credential,
      use,
    }
  }

  async function inspect(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<EndpointStatusView, InspectRefusal>> {
    const adopted = await admitWithoutEligibility(ports, access, ref)
    if ('failure' in adopted) {
      if (adopted.failure.kind === 'not-available-to-you')
        await table.close(access.tenant, ref.holding)
      return adopted
    }
    const verdict = await ports.eligibility.check(access, ref)
    let use: EndpointStatusView['use'] = { kind: 'usable' }
    if (verdict.kind !== 'granted') {
      const refusal = refusalOf(verdict)
      if (refusal.kind !== 'blocked') return fail(refusal)
      // A blocked endpoint is not a failure of inspect, but its connection does not stay open.
      await table.close(access.tenant, ref.holding)
      use = { kind: 'blocked', reason: refusal.reason }
    }
    const view = viewOf(access, adopted.ok, use)
    return view === 'unknown' ? fail(UNKNOWN) : succeed(view)
  }

  async function list(
    access: Access<P>,
    scope: S,
  ): Promise<Outcome<readonly EndpointStatusView[], 'unknown'>> {
    const adopted = await ports.adoption.endpoints(access, scope)
    if ('failure' in adopted) return fail('unknown')
    const views: EndpointStatusView[] = []
    for (const endpoint of adopted.ok) {
      const verdict = await ports.eligibility.check(access, endpoint.ref)
      if (verdict.kind === 'unknown') return fail('unknown')
      let use: EndpointStatusView['use'] = { kind: 'usable' }
      if (verdict.kind === 'refused') {
        if (verdict.reason === 'not-eligible') continue
        use = { kind: 'blocked', reason: verdict.reason }
      }
      const view = viewOf(access, endpoint, use)
      if (view === 'unknown') return fail('unknown')
      views.push(view)
    }
    return succeed(views)
  }

  return { inspect, list }
}
