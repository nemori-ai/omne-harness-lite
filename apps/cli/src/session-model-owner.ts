import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  LocalSessionIngress,
  RuntimeOptions,
  SessionLifecycleStep,
} from '@omne-harness-lite/session-runtime-local'
import type {
  OriginalIssueAdmission,
  OriginalIssueAuthority,
  OriginalIssueClaim,
  OriginalIssueFailure,
} from '@omne-harness-lite/model-request-runtime'
import {
  createOriginalIssueOwner,
  type OriginalIssueOwner,
} from '@omne-harness-lite/model-request-runtime-local'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
type AdmissionResult = Awaited<ReturnType<LocalSessionIngress['modelInvocation']['admit']>>
export type ModelIssueUnknown = Extract<AdmissionResult, { kind: 'unknownCommit' }>
export interface SessionOriginalModelOwnerOptions {
  readonly storage: AtomicStorage
  readonly current: OriginalIssueAuthority
  readonly maxRecords: number
  readonly maxInFlight: number
}
export interface SessionOriginalModelOwner {
  readonly modelIssue: NonNullable<RuntimeOptions['modelIssue']>
  readonly bind: (
    ingress: Pick<LocalSessionIngress, 'coordinationAuthority' | 'modelInvocation'>,
    scope: SessionScope,
    preparation: Preparation,
    retainUnknown: (result: ModelIssueUnknown) => Promise<void>,
  ) => OriginalIssueAdmission
  readonly close: () => Promise<{ readonly kind: 'released' } | { readonly kind: 'pending' }>
}
/** The application selects the actual model owner. References stay in the trusted host. */
export function createSessionOriginalModelOwner(
  options: SessionOriginalModelOwnerOptions,
): SessionOriginalModelOwner {
  let original: OriginalIssueOwner | undefined
  let closing = false
  const modelIssue = Object.freeze<SessionOriginalModelOwner['modelIssue']>({
    maxRecords: options.maxRecords,
    current: options.current,
    create(binding) {
      if (closing || original) throw new Error('original model owner already attached or closed')
      original = createOriginalIssueOwner({
        storage: options.storage,
        log: binding.log,
        access: binding.access,
        authority: binding.authority,
        limit: options.maxInFlight,
      })
      return original.participant
    },
  })
  return Object.freeze({
    modelIssue,
    bind(ingress, scope, preparation, retainUnknown) {
      const owner = original
      if (!owner) throw new Error('original model owner not attached')
      const fixedScope = Object.freeze({
        tenant: Object.freeze({ ...scope.tenant }),
        session: scope.session,
      })
      const fixedPreparation = Object.freeze({ ...preparation })
      const claims = new WeakSet<OriginalIssueClaim>()
      return Object.freeze<OriginalIssueAdmission>({
        async admitOriginal(input) {
          if (closing) return { kind: 'unavailable' }
          const prepared = owner.prepareOriginal(input)
          if ('kind' in prepared) return prepared
          const issued = await ingress.modelInvocation.admit(
            ingress.coordinationAuthority,
            fixedScope,
            input.source,
            fixedPreparation,
            prepared.ticket,
          )
          if ('failure' in issued) return mappedFailure(issued.failure)
          if (issued.kind === 'unknownCommit') {
            await retainUnknown(issued)
            return { kind: 'unavailable' }
          }
          if (issued.kind === 'alreadyIssued') return { kind: 'conflict' }
          if (issued.kind !== 'issued') return issued
          claims.add(issued.claim)
          return { confirmed: true, positions: issued.positions, claim: issued.claim }
        },
        consumeOriginal(claim) {
          if (!claims.has(claim)) return Promise.resolve({ kind: 'invalidInput' } as const)
          return owner.consumeOriginal(claim)
        },
      })
    },
    async close() {
      closing = true
      return original ? original.close() : { kind: 'released' as const }
    },
  } satisfies SessionOriginalModelOwner)
}
function mappedFailure(
  failure: Extract<AdmissionResult, { failure: string }>['failure'],
): OriginalIssueFailure {
  if (failure === 'retryFromFacts') return { kind: 'conflict' }
  if (failure === 'terminal') return { kind: 'staleAttempt' }
  return { kind: failure }
}
