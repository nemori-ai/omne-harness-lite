import type * as M from '@omne-harness/model-contract'
import type { Access } from './refs.js'
import type { AssemblyFailure, AssemblyUnknown, SelectedModel } from './values.js'
import { canonical } from './internal.js'

export type MeasureContext<P> = Readonly<{
  access: Access<P>
  preparation: M.ModelPreparationResources<P>
}>
type Failure = AssemblyFailure | AssemblyUnknown

function leaseFailure(failure: M.ModelFailure): Failure {
  switch (failure.kind) {
    case 'denied':
      return {
        kind: 'denied',
        action: 'assemble',
        diagnostic: `Model preparation refused ${failure.action}`,
      }
    case 'invalid':
      return {
        kind: 'invalid',
        field: `preparation.${failure.field}`,
        reason: 'unsupported-format',
      }
    case 'commit-unknown':
      return { kind: 'unknown', source: 'read', diagnostic: 'Model preparation outcome unknown' }
    default:
      return { kind: 'unavailable', owner: 'preparation', diagnostic: canonical(failure) }
  }
}
function sameSupplier(left: M.Supplier, right: M.ProfileSupplier): boolean {
  return (
    canonical(left.adoption) === canonical(right.adoption) &&
    left.recipient === right.recipient &&
    left.model === right.model
  )
}

/**
 * Measures one complete candidate (RQ-05): acquire a lease with this access and lineage, plan
 * per supplier, measure with that supplier's own representation and parameter adoptions, then
 * give the lease back on every path. A release failure never yields a fixable success.
 */
export async function measureCandidate<P>(
  context: MeasureContext<P>,
  selection: SelectedModel,
  lineage: M.PreparationLineage,
  assembled: M.AssembledModelInput,
): Promise<M.RequestBudget | Failure> {
  const profile = selection.profile
  const acquired = await context.preparation.acquire({
    ...context.access,
    profile,
    lineage,
  })
  if ('failure' in acquired) return leaseFailure(acquired.failure)
  const lease = acquired.ok
  let outcome: M.RequestBudget | Failure | undefined
  try {
    outcome = measureWithLease(lease, profile, assembled)
  } finally {
    const released = await lease.release()
    if (released.failure !== undefined && outcome !== undefined && !isFailure(outcome))
      outcome = {
        kind: 'unavailable',
        owner: 'preparation',
        diagnostic: `Model preparation lease was not given back: ${released.failure.diagnostic}`,
      }
  }
  return outcome
}
function isFailure(value: M.RequestBudget | Failure): value is Failure {
  return ['denied', 'invalid', 'unavailable', 'unknown'].includes(value.kind)
}
function measureWithLease(
  lease: M.ModelPreparationLease,
  profile: M.ModelProfile,
  assembled: M.AssembledModelInput,
): M.RequestBudget | Failure {
  const definition = profile.definition
  const reports: M.RequestBudget[] = []
  for (const binding of lease.bindings) {
    const supplier = definition.suppliers.find(s => sameSupplier(binding.supplier, s))
    if (supplier === undefined)
      return {
        kind: 'unavailable',
        owner: 'preparation',
        diagnostic: 'Lease supplier is not in the profile',
      }
    const plan = binding.rules.plan({ profile, supplier: binding.supplier, assembled })
    if ('failure' in plan)
      return { kind: 'unavailable', owner: 'meter', diagnostic: canonical(plan.failure) }
    const result = binding.meter.measure({
      profile: profile.adoption,
      supplier,
      context: definition.context,
      limits: definition.limits,
      assembled,
      parameters: plan.ok.parameters,
      representation: plan.ok.representation,
    })
    if ('failure' in result)
      return { kind: 'unavailable', owner: 'meter', diagnostic: canonical(result.failure) }
    reports.push(result.ok)
  }
  const first = reports[0]
  if (first === undefined)
    return { kind: 'invalid', field: 'profile.suppliers', reason: 'missing-input' }
  return { ...first, checks: reports.flatMap(r => r.checks) }
}
