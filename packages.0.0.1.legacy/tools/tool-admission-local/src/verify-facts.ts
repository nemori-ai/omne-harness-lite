import type { ToolCallBlock } from '@omne-harness-lite/content-blocks'
import {
  admissionArgumentDigest,
  inspectRunnerConclusion,
  type RunnerAdmissionTokenLocator,
} from '@omne-harness-lite/loop-extension-runner'
import { compareInteger, type CheckedPrefix } from '@omne-harness-lite/session-log'
import {
  OFFICIAL_ADMISSION_NAME,
  type ToolActionHistoryOperations,
  type ToolAdmissionOperations,
} from '@omne-harness-lite/tool-admission'

type Verification = Awaited<ReturnType<ToolAdmissionOperations['verifyToken']>>
const invalid = (reason: Extract<Verification, { kind: 'invalid' }>['reason']) =>
  ({ kind: 'invalid', reason }) as const
const unavailable = { kind: 'failed', reason: 'unavailable' } as const

/** A token is a locator. Permission comes from the actual final and common-prefix facts. */
export function verifyFacts(
  prefix: CheckedPrefix,
  locator: RunnerAdmissionTokenLocator,
  call: Extract<ToolCallBlock, { arguments: unknown }>,
  history: ToolActionHistoryOperations,
): Verification {
  const inspected = history.inspect(prefix, call.callId)
  if (inspected.kind === 'unavailable') return unavailable
  if (inspected.kind === 'notFound') return invalid('not_admitted')
  const facts = inspected.facts
  if (facts.batch.kind === 'pending') return invalid('not_admitted')
  const completed = facts.batch.completion
  const item = completed.items.find(item => item.callId === call.callId)
  const row = prefix.entries.find(entry => entry.dedupeKey === locator.finalKey)
  const completion = prefix.entries.find(entry => entry.dedupeKey === completed.key)
  if (
    completed.gate.kind !== 'available' ||
    item?.decision.kind !== 'allow' ||
    item.decision.conclusion !== locator.finalKey ||
    row === undefined ||
    completion === undefined ||
    compareInteger(row.position, completion.position) >= 0 ||
    !item.conclusions.includes(locator.finalKey)
  )
    return invalid('not_admitted')
  const final = inspectRunnerConclusion({ ...prefix.scope, entry: row })
  if (
    !('conclusion' in final) ||
    final.occurrence.kind !== 'final' ||
    final.anchor !== item.anchor ||
    final.conclusion.position !== 'before_action' ||
    final.conclusion.extension !== OFFICIAL_ADMISSION_NAME ||
    final.conclusion.callId !== call.callId ||
    final.conclusion.skipped !== undefined ||
    final.conclusion.output?.kind !== 'observed' ||
    final.execution.kind !== 'withRun' ||
    final.execution.run !== facts.origin.run ||
    compareInteger(final.execution.attempt, facts.origin.attempt) !== 0 ||
    !facts.adoption.tools.some(tool => tool.name === item.effectiveCall.tool)
  )
    return invalid('not_admitted')
  if (
    item.effectiveCall.unparseable === true ||
    item.effectiveCall.tool !== call.tool ||
    admissionArgumentDigest(item.effectiveCall.arguments) !== locator.argumentDigest
  )
    return invalid('arguments_changed')
  // Even a later rewrite back to the same value is a known post-admission violation.
  for (const entry of prefix.entries) {
    if (compareInteger(entry.position, row.position) <= 0) continue
    const later = inspectRunnerConclusion({ ...prefix.scope, entry })
    if ('invalid' in later) return unavailable
    if (
      'conclusion' in later &&
      later.conclusion.position === 'before_action' &&
      later.conclusion.callId === call.callId &&
      later.conclusion.output?.kind === 'rewrite'
    )
      return invalid('arguments_changed')
  }
  if (facts.runState === 'ended') return invalid('run_ended')
  return {
    kind: 'valid',
    checked: { scope: prefix.scope, ownerGeneration: prefix.ownerGeneration, tail: prefix.tail },
  }
}
