// The use boundary of SPEC S1 and invariant 6: the gate, and the automatic close of a connection
// whose endpoint was withdrawn or whose use a setting now blocks. A principal without
// eligibility does not close a connection: the endpoint still stands for the tenant.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { EndpointRef, Refusal } from '@omne-harness/mcp-contract'
import type { EligibilityVerdict } from '@omne-harness/mcp-contract/provider'
import {
  admitWithoutEligibility,
  type AdmittedEndpoint,
  type GatePorts,
  type GateRefusal,
} from './gate.ts'
import type { ConnectionTable } from './table.ts'

/** The refusal that an eligibility verdict other than `granted` maps to (SPEC S1). */
export function refusalOf(verdict: Exclude<EligibilityVerdict, { kind: 'granted' }>): GateRefusal {
  if (verdict.kind === 'unknown') return { kind: 'unknown' }
  return verdict.reason === 'not-eligible'
    ? { kind: 'not-available-to-you' }
    : { kind: 'blocked', reason: verdict.reason }
}

/** True when the refusal means the tenant's connection must not stay open (invariant 6). */
function withdraws(refusal: Refusal): boolean {
  return refusal.kind === 'not-available-to-you' || refusal.kind === 'blocked'
}

export type UseGate<P, S> = Readonly<{ ports: GatePorts<P, S>; table: ConnectionTable<P> }>

/**
 * Adoption, then eligibility, with the close of invariant 6 on the way: not adopted closes the
 * endpoint's connection; blocked closes it too. The answer is the gate's.
 */
export async function admitForUse<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdmittedEndpoint, GateRefusal>> {
  const adopted = await admitWithoutEligibility(gate.ports, access, ref)
  if ('failure' in adopted) {
    if (withdraws(adopted.failure)) await gate.table.close(access.tenant, ref.holding)
    return adopted
  }
  const verdict = await gate.ports.eligibility.check(access, ref)
  if (verdict.kind === 'granted') return adopted
  const refusal = refusalOf(verdict)
  if (refusal.kind === 'blocked') await gate.table.close(access.tenant, ref.holding)
  return fail(refusal)
}

/** The eligibility check at a publish boundary; a block closes the connection as above. */
export async function stillEligible<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<'granted', GateRefusal>> {
  const verdict = await gate.ports.eligibility.check(access, ref)
  if (verdict.kind === 'granted') return succeed('granted')
  const refusal = refusalOf(verdict)
  if (refusal.kind === 'blocked') await gate.table.close(access.tenant, ref.holding)
  return fail(refusal)
}
