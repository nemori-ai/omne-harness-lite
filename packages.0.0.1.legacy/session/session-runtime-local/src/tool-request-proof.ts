import type { CheckedPrefix } from '@omne-harness-lite/session-log'
import type { ToolJournalPayload } from '@omne-harness-lite/tool-execution-runtime'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import { inspectActionBatch } from './driver-action-facts.ts'
import { object } from './tool-custody-values.ts'

/** A non-execution result must come from the Session's completed original batch. */
export function hasOriginalToolFailure(
  prefix: CheckedPrefix,
  intent: Extract<ToolJournalPayload, { kind: 'execution_intended' }>,
): boolean {
  const input = intent.input
  if (!object(input) || !Object.hasOwn(input, 'notExecutable')) return true
  if (input.format !== 'tool-input/1' || intent.selected !== undefined) return false
  const submission = input.submission
  if (!object(submission) || !equal(submission.origin, intent.origin)) return false
  const item = completedItem(prefix, intent, submission.adoption)
  if (!item) return false
  return (
    item.decision.kind === 'notExecutable' &&
    item.decision.reason === input.notExecutable &&
    equal(item.effectiveCall, submission.call)
  )
}

function completedItem(
  prefix: CheckedPrefix,
  intent: Extract<ToolJournalPayload, { kind: 'execution_intended' }>,
  adoption: unknown,
) {
  const records = prefix.entries.flatMap(entry => {
    const record = inspectActionBatch(prefix, entry)
    return record && equal(record.value.origin, intent.origin) ? [record] : []
  })
  if (records.length !== 1 || records[0]!.value.adoption !== adoption) return
  const items = records[0]!.value.completion.items.filter(item => item.callId === intent.ref.callId)
  return items.length === 1 ? items[0] : undefined
}
