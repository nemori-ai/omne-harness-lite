import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, ToolFailure } from '@omne-harness/tool-contract'
import {
  judgePreparationFact,
  type PreparationProgress,
  type PreparationRecord,
} from '@omne-harness/tool-contract/provider'
import { judgeAdoptionField } from './boundary.ts'

/** A provider replacement cannot act on the previous provider's operations or resources. */
export function matchEnvironmentAdoption(
  provider: Readonly<{ adoption: Adoption }>,
  original: Adoption,
): Outcome<void, ToolFailure> {
  try {
    const current = judgeAdoptionField(provider.adoption, 'environment.adoption')
    if (
      'ok' in current &&
      current.ok.owner === original.owner &&
      current.ok.name === original.name &&
      current.ok.revision === original.revision &&
      current.ok.digest === original.digest
    )
      return succeed(undefined)
  } catch {
    // A provider whose identity cannot be read cannot handle the original operation.
  }
  return fail({
    kind: 'unavailable',
    dependency: 'tool-environment',
    diagnostic: 'the original environment adapter is unavailable',
  })
}

/** Provider facts never become executable or adoptable until their original binding is checked. */
export function checkedPreparationProgress<E>(
  progress: PreparationProgress<E>,
  expected: PreparationRecord,
): Outcome<PreparationProgress<E>, ToolFailure> {
  if (progress.kind !== 'allocated' && progress.kind !== 'prepared') return succeed(progress)
  const fact = progress.kind === 'allocated' ? progress : progress.environment
  const checked = judgePreparationFact(
    { preparation: fact.preparation, evidence: fact.evidence },
    expected,
  )
  if ('failure' in checked) return fail({ kind: 'invalid', ...checked.failure })
  return succeed(
    progress.kind === 'allocated'
      ? { kind: 'allocated', ...checked.ok }
      : { kind: 'prepared', environment: { value: progress.environment.value, ...checked.ok } },
  )
}
