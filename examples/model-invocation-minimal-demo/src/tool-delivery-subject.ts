import { createHash } from 'node:crypto'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { AfterActionEachSubject } from '@omne-harness-lite/loop-extension'
import type { ToolMessage } from '@omne-harness-lite/messages'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { ToolJournalHistory } from '@omne-harness-lite/tool-execution-runtime'

/** The result offered to a hook comes from won A, not from a caller's terminal promise. */
export function afterEachSubject(
  execution: ToolJournalHistory,
): AfterActionEachSubject | undefined {
  const ended = execution.terminal?.value
  if (!ended) return
  const terminal = ended.terminal
  const eligible =
    terminal.outcome === 'completed' ||
    (terminal.outcome === 'failed' &&
      ['business_failure', 'implementation_error', 'result_rejected'].includes(terminal.code))
  return {
    callId: execution.intent.value.ref.callId,
    outcome: terminal.outcome,
    ...(eligible ? { result: ended.delivery.result } : {}),
  }
}

/** A stable candidate permits receipt recognition without replacing time, identity or content on retry. */
export function toolDeliveryMessage(execution: ToolJournalHistory): ToolMessage | undefined {
  const ended = execution.terminal?.value,
    ready = execution.ready?.value
  if (!ended || !ready) return
  const ref = execution.intent.value.ref
  const digest = createHash('sha256')
    .update(JSON.stringify([ref.tenant, ref.session, ref.callId, 'tool-result-message']))
    .digest('hex')
  const message = {
    id: unwrap(parseOpaqueIdentifier(`tool-message-${digest}`, 'MessageId')),
    type: 'tool',
    callId: ref.callId,
    createdAt: ended.account.wallClock.endedAt ?? ended.account.wallClock.startedAt,
    blocks: [ready.result],
  }
  const judged = judgeMessage(message)
  return 'ok' in judged && judged.ok.type === 'tool' ? judged.ok : undefined
}
