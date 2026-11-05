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
  type GateDecision,
  type GatePorts,
  type GateRefusal,
  type GateRefused,
} from './gate.ts'
import type { ConnectionTable } from './table.ts'

export type UseGate<P, S> = Readonly<{ ports: GatePorts<P, S>; table: ConnectionTable<P> }>

/** True when the decision means the tenant's connection must not stay open (invariant 6). */
export function withdraws(decision: GateDecision): boolean {
  return decision.kind === 'not-adopted' || decision.kind === 'blocked'
}

/** The close of invariant 6: a withdrawn or blocked endpoint does not keep its connection. */
async function closeIfWithdrawn<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
  decision: GateDecision,
): Promise<void> {
  if (withdraws(decision)) await gate.table.close(access.tenant, ref.holding)
}

async function refused<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
  decision: GateRefused,
): Promise<GateRefusal> {
  await closeIfWithdrawn(gate, access, ref, decision)
  return refusalOf(decision)
}

/**
 * The decision of the gate at a use (S1), with the close of invariant 6 on the way: the caller
 * reads the decision itself. For the task operations, whose refusals are not R1's (SPEC S2).
 */
export async function decideForUse<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<GateDecision> {
  const decision = await admit(gate.ports, access, ref)
  await closeIfWithdrawn(gate, access, ref, decision)
  return decision
}

/** The gate at a use: adoption, eligibility, the close of invariant 6, and the refusal of R1. */
export async function admitForUse<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdmittedEndpoint, GateRefusal>> {
  const decision = await decideForUse(gate, access, ref)
  return decision.kind === 'admitted' ? succeed(decision.endpoint) : fail(refusalOf(decision))
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
