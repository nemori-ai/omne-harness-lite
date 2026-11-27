import { NO_RESEND_RETRY_POLICY, type SupplierPort } from '@omne-harness/model'
import {
  LIVE_REPRESENTATION,
  type ModelFailure,
  type ModelNeed,
} from '@omne-harness/model-contract'
import {
  judgeModelRequest,
  type ModelLivePreparation,
  type ModelProfiles,
} from '@omne-harness/model-contract/provider'

export type LivePreparationOptions<P> = Readonly<{
  profiles: Pick<ModelProfiles<P>, 'resolve'>
  supplierOf: SupplierPort<P>
}>

const invalid = (field: string, reason: string): { failure: ModelFailure } => ({
  failure: { kind: 'invalid', field, reason },
})

// A live call is a spoken one: it takes voice in and gives voice out.
const SPOKEN: ModelNeed<'live'> = Object.freeze({
  kind: 'live',
  modalities: Object.freeze({
    input: Object.freeze(['voice'] as const),
    output: Object.freeze(['voice'] as const),
  }),
  source: Object.freeze({
    owner: LIVE_REPRESENTATION.owner,
    record: LIVE_REPRESENTATION.name,
    revision: LIVE_REPRESENTATION.revision,
    digest: LIVE_REPRESENTATION.digest,
  }),
})

/** Forms a live request on the `live` profile its model resolves to: it takes in what the profile takes in. */
export function createLivePreparation<P>(
  options: LivePreparationOptions<P>,
): ModelLivePreparation<P> {
  return {
    async prepare({ principal, tenant, model, instructions, history = [], voice, source }) {
      const resolved = await options.profiles.resolve({
        principal,
        tenant,
        route: model,
        required: SPOKEN,
      })
      if (!('ok' in resolved)) return resolved
      const resolution = resolved.ok
      if (resolution.kind === 'absent')
        return invalid(
          'model',
          resolution.reason === 'unknown-name' ? 'not-a-live-model' : resolution.reason,
        )
      const [reason] = resolution.reasons
      if (reason !== undefined) return invalid('model', reason)
      const { profile } = resolution
      const { definition } = profile
      if (voice !== undefined && !definition.voices.includes(voice))
        return invalid('voice', 'not-offered')
      const supplier = options.supplierOf({
        principal,
        tenant,
        profile,
        supplier: definition.suppliers[0],
      })
      if (!('ok' in supplier)) return supplier
      const judged = judgeModelRequest('live', {
        kind: 'live',
        profile: profile.adoption,
        suppliers: [supplier.ok],
        fallback: false,
        retryPolicy: NO_RESEND_RETRY_POLICY,
        source,
        input: definition.input,
        instructions,
        history,
        voice: voice ?? null,
        media: { via: 'link', audio: definition.audioFormats[0] },
      })
      return 'ok' in judged ? judged : invalid(judged.failure.field, judged.failure.reason)
    },
  }
}
