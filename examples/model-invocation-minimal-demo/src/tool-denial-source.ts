import { createHash } from 'node:crypto'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { DriverHistory } from './tool-driver-history.ts'
import { inspectDriverEntry } from './tool-driver-codec.ts'

/** A denial has a durable route and a message, but no tool execution account. */
export function toolDenialSource(history: DriverHistory, callId: string) {
  const facts = history.calls.get(callId)
  if (!facts || facts.route.kind !== 'denial') return
  const intentKey = facts.route.intentKey
  const intents = history.prefix.entries.flatMap(entry => {
    const inspected = inspectDriverEntry(history.prefix.scope, entry)
    return 'value' in inspected &&
      inspected.value.kind === 'action_denial_intended' &&
      inspected.key === intentKey
      ? [inspected.value]
      : []
  })
  const intent = intents[0]
  if (intents.length !== 1 || intent?.kind !== 'action_denial_intended') return
  const reply = history.models.replies.get(intent.origin.assistantMessage)
  if (!reply) return
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        history.prefix.scope.tenant.organization,
        history.prefix.scope.tenant.account,
        history.prefix.scope.session,
        intentKey,
      ]),
    )
    .digest('hex')
  const explanation =
    intent.reason.kind === 'admission' ? intent.reason.code : intent.reason.explanation
  const candidate = judgeMessage({
    id: `tool-denied-message-${digest}`,
    type: 'tool',
    callId,
    createdAt: reply.message.createdAt,
    blocks: [
      {
        id: `tool-denied-result-${digest}`,
        kind: 'tool_result',
        callId,
        outcome: 'denied',
        reason: intent.reason,
        visibility: { toHuman: true, toModel: true },
        blocks: [
          {
            id: `tool-denied-text-${digest}`,
            kind: 'text',
            text: `Tool call denied: ${explanation}`,
            visibility: { toHuman: true, toModel: true },
          },
        ],
      },
    ],
  })
  if (!('ok' in candidate) || candidate.ok.type !== 'tool') return
  const confirmed = history.prefix.entries.some(entry => {
    const inspected = inspectDriverEntry(history.prefix.scope, entry)
    return (
      'value' in inspected &&
      inspected.value.kind === 'action_denied' &&
      inspected.value.callId === callId
    )
  })
  return {
    intent,
    anchor: `tool-denial-${digest}`,
    subject: { callId: intent.call.callId, outcome: 'denied' as const },
    message: candidate.ok,
    confirmed,
  }
}
