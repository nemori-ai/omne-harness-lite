import { NO_RESEND_RETRY_POLICY, type SupplierPort } from '@omne-harness/model'
import {
  DECISION_REPRESENTATION,
  decisionAskMessage,
  type ModelFailure,
} from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  type ModelDecisionPreparation,
} from '@omne-harness/model-contract/provider'
import { decisionSupplierOf } from '@omne-harness/pi-ai-transport/decisions'

export type DecisionPreparationOptions<P> = Readonly<{ supplierOf: SupplierPort<P> }>

const invalid = (field: string, reason: string): { failure: ModelFailure } => ({
  failure: { kind: 'invalid', field, reason },
})

/** Forms decision requests: the one supplier of the model with the credential layer of this tenant, sent once, and no profile of the chat selection. */
export function createDecisionPreparation<P>(
  options: DecisionPreparationOptions<P>,
): ModelDecisionPreparation<P> {
  return {
    async prepare({ principal, tenant, model, message, ask, source }) {
      const known = decisionSupplierOf(model)
      if (known === undefined) return invalid('model', 'not-a-decision-model')
      const asked = decisionAskMessage(message, ask)
      if (asked === null) return invalid('message', 'identity')
      const official = {
        identity: { scope: { kind: 'factory' as const }, kind: 'decisions' as const, route: model },
      }
      const supplier = options.supplierOf({ principal, tenant, profile: official, supplier: known })
      if (!('ok' in supplier)) return supplier
      const produces = `${known.provider}/${known.model}`
      const judged = judgeFixedModelRequest({
        kind: 'decisions',
        profile: known.adoption,
        suppliers: [supplier.ok],
        fallback: false,
        retryPolicy: NO_RESEND_RETRY_POLICY,
        parameters: [],
        system: [],
        messages: [asked],
        tools: [],
        toolChoice: 'none',
        declarations: [{ produces, accepts: [produces], foreignThinking: 'omit' }],
        representation: DECISION_REPRESENTATION,
        parameterAdoptions: [],
        source,
      })
      return 'ok' in judged ? judged : invalid(judged.failure.field, judged.failure.reason)
    },
  }
}
