import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ModelFailure } from '../result.ts'
import type { ModelReferenceFailure } from '../reference.ts'

export function referenceRejected(
  failure: ModelReferenceFailure,
  action: string,
): Outcome<never, ModelFailure> {
  switch (failure.kind) {
    case 'malformed':
      return fail({
        kind: 'invalid',
        field: 'reference',
        reason: 'reference-' + failure.rejection.reason,
      })
    case 'invalid-tenant':
      return fail({ kind: 'denied', action: 'tenant' })
    case 'foreign-tenant':
      return fail({ kind: 'denied', action })
  }
}
