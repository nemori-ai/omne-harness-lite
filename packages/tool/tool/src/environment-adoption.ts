import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, ToolFailure } from '@omne-harness/tool-contract'
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
