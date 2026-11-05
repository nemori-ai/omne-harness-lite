import type { ModelFailure, ModelReferenceFailure } from '@omne-harness/model-contract'

/** Reference rejection precedes all object and permission lookups. */
export function referenceFailure(failure: ModelReferenceFailure): { failure: ModelFailure } {
  switch (failure.kind) {
    case 'malformed':
      return {
        failure: {
          kind: 'invalid',
          field: 'reference',
          reason: 'reference-' + failure.rejection.reason,
        },
      }
    case 'invalid-tenant':
      return { failure: { kind: 'denied', action: 'tenant' } }
  }
}
