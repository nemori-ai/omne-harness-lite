import type { LoopExtensionRunnerService } from '@omne-harness-lite/loop-extension-runner'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import type { createToolDriverJournal } from './tool-driver-journal.ts'
import { toolDenialSource } from './tool-denial-source.ts'

type Journal = Extract<Awaited<ReturnType<typeof createToolDriverJournal>>, { kind: 'journal' }>
const unavailable = { kind: 'rejected', reason: 'unavailable' } as const

/** Claims the denial route before hooks, then confirms the actual message in one shared batch. */
export async function deliverDeniedAction(input: {
  readonly journal: Journal
  readonly runner: LoopExtensionRunnerService
  readonly callId: string
  readonly signal: AbortSignal
}) {
  let history = await input.journal.read()
  if ('unavailable' in history) return unavailable
  const facts = history.calls.get(input.callId)
  if (!facts || facts.batch.kind !== 'complete' || facts.route.kind === 'execution')
    return unavailable
  const decision = facts.batch.completion.items.find(item => item.callId === input.callId)
  if (decision?.decision.kind !== 'denied') return unavailable
  if (facts.route.kind === 'none') {
    const claimed = await input.journal.commit({
      kind: 'action_denial_intended',
      origin: facts.origin,
      adoption: facts.adoption.key,
      call: decision.effectiveCall,
      reason: decision.decision.reason,
    })
    if (claimed.kind !== 'committed') return claimed
    history = await input.journal.read()
    if ('unavailable' in history) return unavailable
  }
  const source = toolDenialSource(history, input.callId)
  if (!source) return unavailable
  if (source.confirmed) return { kind: 'confirmed' } as const
  const { origin } = source.intent
  const each = await input.runner.dispatch(
    {
      position: 'after_action',
      dimension: { scope: 'each' },
      subject: source.subject,
      manifest: history.prefix.scope.session,
      anchor: source.anchor,
      run: origin.run,
      attempt: origin.attempt,
    },
    input.signal,
  )
  if ('failure' in each || each.effect.kind !== 'proceed') return unavailable
  const reviewed = await input.runner.dispatch(
    {
      position: 'before_persist_message',
      subject: { producer: 'tool', message: source.message },
      manifest: history.prefix.scope.session,
      anchor: `${source.anchor}:persist`,
      run: origin.run,
      attempt: origin.attempt,
    },
    input.signal,
  )
  if (
    'failure' in reviewed ||
    reviewed.effect.kind !== 'proceed' ||
    !('message' in reviewed.effect.subject) ||
    reviewed.effect.subject.message.type !== 'tool'
  )
    return unavailable
  const message = reviewed.effect.subject.message
  const captured = captureModelLogValue({
    category: 'message',
    input: { kind: 'value', value: message },
  })
  if (!('ok' in captured)) return unavailable
  const current = await input.journal.read()
  if ('unavailable' in current) return unavailable
  const prepared = prepareModelLogEntry({
    ...current.prefix.scope,
    shell: { tenant: current.prefix.scope.tenant, run: origin.run, attempt: origin.attempt },
    captured: captured.ok,
    purpose: { kind: 'message' },
    messagePrefix: current.models.entries.flatMap(record =>
      record.captured.message !== null && record.captured.message.type !== 'system'
        ? [record.captured.message]
        : [],
    ),
  })
  if (!('ok' in prepared)) return unavailable
  const committed = await input.journal.commit(
    {
      kind: 'action_denied',
      origin,
      callId: source.intent.call.callId,
      reason: source.intent.reason,
      message,
    },
    prepared.ok,
  )
  return committed.kind === 'committed' ? ({ kind: 'confirmed' } as const) : committed
}
