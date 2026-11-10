import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import type { ActivationPlan } from './activation-schema.ts'
import { submittedOperation } from './apply-operation.ts'
import { readGovernanceStanding } from './standing-custody.ts'
import { finishOperation } from './operation.ts'
import { catalogPageSchema } from './catalog-schema.ts'
import { governanceFailureSchema } from './registrar-results.ts'
import { equal } from './encoding.ts'
import { isCatalogCapture } from './operation-schema.ts'

export function applyCapture(
  port: ParticipantPort,
  plan: Extract<ActivationPlan, { kind: 'capture' }>,
) {
  const { binding, execution } = plan.request
  const candidate = submittedOperation(port, binding, execution)
  if (candidate.kind !== 'ready') return candidate
  if (!isCatalogCapture(candidate.record.request)) throw new Error('Wrong catalog capture request')
  const custody = readGovernanceStanding(port, binding)
  if (custody.kind !== 'held') return { kind: 'unavailable' as const, owner: 'identity-standing' }
  const result = catalogPageSchema.or(governanceFailureSchema).parse(plan.result)
  if (plan.result === null || !equal(result, plan.result))
    throw new Error('Noncanonical capture result')
  if (
    result.kind === 'page' &&
    (!equal(result.snapshot.scope, binding.ref.scope) ||
      result.snapshot.epoch !== candidate.record.epoch)
  )
    throw new Error('Capture result binding changed')
  return finishOperation(
    port,
    binding,
    result.kind === 'page' ? 'committed' : 'aborted',
    plan.result,
  )
}
