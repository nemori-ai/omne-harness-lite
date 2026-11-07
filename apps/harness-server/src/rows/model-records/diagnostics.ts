import type { Access } from '@omne-harness/legal-identity'
import type { ModelDiagnostics, ModelFailure } from '@omne-harness/model-contract'
import type { ModelReadLease } from '../../model/qualification.ts'

const failureOf = (failure: ModelFailure) => ({
  failure: failure.kind === 'denied' ? { kind: 'denied' as const, action: 'diagnostics' } : failure,
})

/** Each page owns its qualification, including calls made without ModelCalls first. */
export function qualifyingDiagnostics(
  reader: ModelDiagnostics<unknown>,
  qualify: (access: Access<unknown>) => Promise<ModelReadLease>,
): ModelDiagnostics<unknown> {
  return {
    async list(input) {
      const lease = await qualify(input)
      try {
        const resource = { kind: 'tenant' as const }
        const before = await lease.check('inspect', resource)
        if ('failure' in before) return failureOf(before.failure)
        const result = await reader.list(input)
        const after = await lease.check('inspect', resource)
        return 'failure' in after ? failureOf(after.failure) : result
      } finally {
        lease.release()
      }
    },
  }
}
