import { createHash } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { AfterActionBatchSubject } from '@omne-harness-lite/loop-extension'
import type { ActionOrigin } from '@omne-harness-lite/tool-admission'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { compareInteger } from '@omne-harness-lite/session-log'
import { inspectDriverEntry } from './tool-driver-codec.ts'
import type { DriverHistory } from './tool-driver-history.ts'

/** A batch return is a confirmed message route, not merely a terminal Promise. */
export function toolBatch(history: DriverHistory, origin: ActionOrigin) {
  const reply = history.models.replies.get(origin.assistantMessage)
  if (
    !reply ||
    reply.entry.run !== origin.run ||
    reply.entry.attempt === undefined ||
    compareInteger(reply.entry.attempt, origin.attempt) !== 0
  )
    return
  const calls = reply.message.blocks.flatMap(block =>
    block.kind === 'tool_call' && block.complete ? [block] : [],
  )
  const tools = projectToolJournal(history.prefix.scope, history.prefix.entries)
  if ('invalid' in tools || !calls.length) return
  const outcomes: AfterActionBatchSubject['outcomes'][number][] = []
  const returned: import('@omne-harness-lite/session-log').LogEntry[] = []
  for (const call of calls) {
    const facts = history.calls.get(call.callId)
    if (!facts || facts.batch.kind !== 'complete') return
    if (facts.route.kind === 'execution') {
      const execution = tools.executions.get(call.callId)
      if (!execution?.confirmed || !execution.terminal) return
      outcomes.push({ callId: call.callId, outcome: execution.terminal.value.terminal.outcome })
      returned.push(execution.confirmed.entry)
    } else if (facts.route.kind === 'denial') {
      const denial = history.prefix.entries.flatMap(entry => {
        const inspected = inspectDriverEntry(history.prefix.scope, entry)
        return 'value' in inspected &&
          inspected.value.kind === 'action_denied' &&
          inspected.value.callId === call.callId
          ? [inspected]
          : []
      })
      if (denial.length !== 1) return
      outcomes.push({ callId: call.callId, outcome: 'denied' })
      returned.push(denial[0]!.entry)
    } else return
  }
  const first = outcomes[0]
  if (!first) return
  const anchor = `tool-batch-${createHash('sha256')
    .update(
      JSON.stringify([
        history.prefix.scope.tenant.organization,
        history.prefix.scope.tenant.account,
        history.prefix.scope.session,
        origin.run,
        ExactDecimal.from(origin.attempt).toCanonicalString(),
        origin.assistantMessage,
      ]),
    )
    .digest('hex')}`
  return {
    anchor,
    subject: { outcomes: [first, ...outcomes.slice(1)] } as AfterActionBatchSubject,
    returned,
  }
}
