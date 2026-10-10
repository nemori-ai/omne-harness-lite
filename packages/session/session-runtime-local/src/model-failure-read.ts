import {
  modelLogJsonEqual,
  readSettlementPrefix,
  rejectAcknowledgedHistory,
  type SessionModelFailureReadInput,
  type SessionModelFailureReadResult,
  type SessionModelSourceCapture,
} from '@omne-harness-lite/model-request-runtime'
import { createModelFailureSource, readFailureSubject } from './model-failure-subject.ts'

export const captureSessionModelSource: SessionModelSourceCapture = async input => {
  const read = await readSettlementPrefix(input)
  return 'prefix' in read ? { source: read.prefix.source } : read
}

export async function readSessionModelFailure(
  input: SessionModelFailureReadInput,
): Promise<SessionModelFailureReadResult> {
  const prefix = await readSettlementPrefix(input)
  if ('unavailable' in prefix) return { unavailable: true }
  const history = rejectAcknowledgedHistory(input.history.call(prefix.prefix, input.callId))
  if (!('known' in history)) return { unavailable: true }
  const latest = history.known.dispatches.at(-1)
  if (
    latest?.response === null ||
    latest?.response === undefined ||
    !modelLogJsonEqual(latest.response.value, input.response)
  )
    return { unavailable: true }
  const subject = readFailureSubject({
    prefix: prefix.prefix,
    callId: input.callId,
    dispatches: history.known.dispatches,
    source: input.history.failure,
  })
  if (!('subject' in subject)) return { unavailable: true }
  if (input.consume === undefined) return { subject: subject.subject }
  const source = createModelFailureSource({
    prefix: prefix.prefix,
    callId: input.callId,
    owner: input.owner,
    subject: subject.subject,
    usable: input.consume.usable,
    retain: input.consume.retain,
    forget: input.consume.forget,
  })
  return source === null ? { unavailable: true } : { subject: subject.subject, source }
}
