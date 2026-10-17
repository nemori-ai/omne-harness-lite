import type { Context } from '@deepseek-ai/cordis'
import { ModelCredentialService } from './cordis.ts'
import type { SendFace } from '@omne-harness/model-contract'
import { deliver, type CallRecord } from './deliver.ts'

export function deliverInjected(ctx: Context, record: CallRecord, face: SendFace) {
  let outcome: ReturnType<typeof deliver> | undefined
  const fiber = ctx.inject([ModelCredentialService.provide], inner => {
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
