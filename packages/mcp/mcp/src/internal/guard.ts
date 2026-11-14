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

export function withdraws(decision: GateDecision): boolean {
  return decision.kind === 'not-adopted' || decision.kind === 'blocked'
}

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

export async function decideForUse<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<GateDecision> {
  const decision = await admit(gate.ports, access, ref)
  await closeIfWithdrawn(gate, access, ref, decision)
  return decision
}

export async function admitForUse<P, S>(
  gate: UseGate<P, S>,
  access: Access<P>,
  ref: EndpointRef,
): Promise<Outcome<AdmittedEndpoint, GateRefusal>> {
  const decision = await decideForUse(gate, access, ref)
  return decision.kind === 'admitted' ? succeed(decision.endpoint) : fail(refusalOf(decision))
}

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
