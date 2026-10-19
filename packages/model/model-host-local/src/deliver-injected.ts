import type { Context } from '@deepseek-ai/cordis'
import { deliver, type CallRecord } from '@omne-harness/model'
import type { SendFace } from '@omne-harness/model-contract'
import {
  ModelCredentialService,
  modelCredentialKey,
} from '@omne-harness/model-cordis-contract/cordis'

export function deliverInjected(ctx: Context, record: CallRecord, face: SendFace) {
  let outcome: ReturnType<typeof deliver> | undefined
  const fiber = ctx.inject([modelCredentialKey], inner => {
    if (outcome !== undefined) return
    const service = inner.modelCredential
    if (!(service instanceof ModelCredentialService)) {
      outcome = { record, send: { sent: false } }
      return
    }
    outcome = deliver(record, service, face)
  })
  return {
    fiber,
    outcome() {
      return outcome
    },
  }
}
