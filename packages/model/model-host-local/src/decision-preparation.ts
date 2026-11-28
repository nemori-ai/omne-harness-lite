import { NO_RESEND_RETRY_POLICY, type SupplierPort } from '@omne-harness/model'
import {
  DECISION_REPRESENTATION,
  type ModelFailure,
  type ModelNeed,
} from '@omne-harness/model-contract'
import {
  judgeModelRequest,
  type ModelDecisionPreparation,
  type ModelProfiles,
} from '@omne-harness/model-contract/provider'

export type DecisionPreparationOptions<P> = Readonly<{
  profiles: Pick<ModelProfiles<P>, 'resolve'>
  supplierOf: SupplierPort<P>
}>

const invalid = (field: string, reason: string): { failure: ModelFailure } => ({
  failure: { kind: 'invalid', field, reason },
})

// A decision takes its material as text: the form every decision call is written in says so.
const TEXT_MATERIAL: ModelNeed<'decisions'> = Object.freeze({
  kind: 'decisions',
  modalities: Object.freeze({ input: Object.freeze(['text'] as const) }),
  source: Object.freeze({
    owner: DECISION_REPRESENTATION.owner,
    record: DECISION_REPRESENTATION.name,
    revision: DECISION_REPRESENTATION.revision,
    digest: DECISION_REPRESENTATION.digest,
  }),
})

/** Forms a decision request on the `decisions` profile its model resolves to; a model turned off answers excluded. */
export function createDecisionPreparation<P>(
  options: DecisionPreparationOptions<P>,
): ModelDecisionPreparation<P> {
  return {
    async prepare({ principal, tenant, model, ask, source }) {
      const resolved = await options.profiles.resolve({
        principal,
        tenant,
        route: model,
        required: TEXT_MATERIAL,
      })
      if (!('ok' in resolved)) return resolved
      const resolution = resolved.ok
      if (resolution.kind === 'absent')
        return invalid(
          'model',
          resolution.reason === 'unknown-name' ? 'not-a-decision-model' : resolution.reason,
        )
      const [reason] = resolution.reasons
      if (reason !== undefined) return invalid('model', reason)
      const { profile } = resolution
      const supplier = options.supplierOf({
        principal,
        tenant,
        profile,
        supplier: profile.definition.suppliers[0],
      })
      if (!('ok' in supplier)) return supplier
      const judged = judgeModelRequest('decisions', {
        kind: 'decisions',
        profile: profile.adoption,
        suppliers: [supplier.ok],
        fallback: false,
        retryPolicy: NO_RESEND_RETRY_POLICY,
        ask,
        source,
      })
      return 'ok' in judged ? judged : invalid(judged.failure.field, judged.failure.reason)
    },
  }
}
