// The use boundary of SPEC S1 and invariant 6, composed on the gate: an endpoint that is
// withdrawn or blocked by a setting has its connection closed before the answer. The block is an
// endpoint-level setting; a principal without eligibility is a principal-level fact and closes
// nothing, and an unknown answer closes nothing either.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AdoptionRevision, EndpointRef } from '@omne-harness/mcp-contract'
import {
  admit,
  adopted,
  refusalOf,
  type AdmittedEndpoint,
  type GatePorts,
  type GateRefusal,
  type GateRefused,
} from './gate.ts'
import type { ConnectionTable } from './table.ts'

export type UseGate<P, S> = Readonly<{ ports: GatePorts<P, S>; table: ConnectionTable<P> }>

/** True when the decision means the tenant's connection must not stay open (invariant 6). */
export function withdraws(decision: GateRefused): boolean {
  return decision.kind === 'not-adopted' || decision.kind === 'blocked'
}

async function refused<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
  decision: GateRefused,
): Promise<GateRefusal> {
  if (withdraws(decision)) await gate.table.close(access.tenant, ref.holding)
  return refusalOf(decision)
}

/** The gate at a use: adoption, eligibility, and the close of invariant 6 on the way. */
export async function admitForUse<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdmittedEndpoint, GateRefusal>> {
  const decision = await admit(gate.ports, access, ref)
  if (decision.kind === 'admitted') return succeed(decision.endpoint)
  return fail(await refused(gate, access, ref, decision))
}

/**
 * The gate at a publish boundary: the same decision, then the adoption read once more as the
 * last asynchronous step, so the revision compared is the one of that moment. A revision other
 * than the one the listing was produced under means the listing is superseded.
 */
export async function stillAdmitted<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
  revision: AdoptionRevision,
): Promise<Outcome<'admitted' | 'superseded', GateRefusal>> {
  const decision = await admit(gate.ports, access, ref)
  if (decision.kind !== 'admitted') return fail(await refused(gate, access, ref, decision))
  const now = await adopted(gate.ports, access, ref)
  if ('failure' in now) return fail(await refused(gate, access, ref, { kind: now.failure }))
  return succeed(now.ok.revision === revision ? 'admitted' : 'superseded')
}
