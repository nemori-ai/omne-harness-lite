import {
  copyJsonValue,
  validate as validateContent,
  type ActionDenialReason,
  type AdmissionDenialCode,
} from '@omne-harness-lite/content-blocks'
import type { BeforeActionSubject, Conclusion } from '@omne-harness-lite/loop-extension'
import {
  composeEffect,
  encodeRunnerAdmissionToken,
  inspectRunnerConclusion,
  type LoopExtensionRunnerService,
  type RunnerActionRequest,
  type RunnerActionResult,
  type RunnerActionSource,
} from '@omne-harness-lite/loop-extension-runner'
import type { CheckedPrefix, SessionLogOwnerOperations } from '@omne-harness-lite/session-log'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import {
  OFFICIAL_ADMISSION_NAME,
  type ActionBatchCompletion,
  type FinalAction,
} from '@omne-harness-lite/tool-admission'
import {
  readToolActionSource,
  type ToolActionAuthority,
  type ToolActionIdentity,
} from './tool-action-source.ts'
import type { createToolDriverJournal } from './tool-driver-journal.ts'
import type { DriverValue } from './tool-driver-types.ts'

type Journal = Extract<Awaited<ReturnType<typeof createToolDriverJournal>>, { kind: 'journal' }>
type Finished = Exclude<RunnerActionResult, { readonly failure: string }>

function terminal(conclusion: Conclusion | undefined): boolean {
  return (
    conclusion?.output?.kind === 'veto' ||
    (conclusion?.skipped === 'unavailable' &&
      (conclusion.unavailability === 'veto' ||
        (conclusion.unavailability === 'fallback' &&
          conclusion.extension === OFFICIAL_ADMISSION_NAME)))
  )
}
function denied(conclusion: Conclusion, key: string): FinalAction['decision'] {
  const by = conclusion.extension,
    output = conclusion.output
  let reason: ActionDenialReason
  if (
    by === OFFICIAL_ADMISSION_NAME &&
    output?.kind === 'veto' &&
    validateContent('AdmissionDenialCode', output.reason).valid
  )
    reason = { kind: 'admission', code: output.reason as AdmissionDenialCode, by, conclusion: key }
  else
    reason = {
      kind: by === OFFICIAL_ADMISSION_NAME ? 'admission_unavailable' : 'extension_veto',
      by,
      conclusion: key,
      explanation:
        output?.kind === 'veto' ? output.reason : 'The extension could not authorize this action.',
    }
  return { kind: 'denied', reason, conclusion: key }
}

/** Derive proposed values from actual recorded conclusions. The journal independently checks all relations. */
function completion(input: {
  readonly prefix: CheckedPrefix
  readonly source: RunnerActionSource
  readonly request: RunnerActionRequest
  readonly result: Finished
}): ActionBatchCompletion | undefined {
  const { prefix, source, request, result } = input
  const key = `tool-driver/1/${JSON.stringify(['actions', source.assistantMessage])}`
  const missing: FinalAction['decision'] = {
    kind: 'denied',
    conclusion: key,
    reason: {
      kind: 'admission_unavailable',
      by: OFFICIAL_ADMISSION_NAME,
      conclusion: key,
      explanation: 'The official admission chain or contribution is absent.',
    },
  }
  const items: FinalAction[] = []
  for (const call of source.calls) {
    if (call.unparseable) {
      items.push({
        callId: call.callId,
        effectiveCall: call,
        conclusions: [],
        decision:
          result.gate.kind === 'missing'
            ? missing
            : { kind: 'notExecutable', reason: 'unparseable' },
      })
      continue
    }
    const index = request.actions.findIndex(item => item.call.callId === call.callId),
      anchor = source.anchors[index]
    if (index < 0 || anchor === undefined) return
    const records = prefix.entries.flatMap(entry => {
      const inspected = inspectRunnerConclusion({ ...prefix.scope, entry })
      return 'conclusion' in inspected &&
        inspected.conclusion.position === 'before_action' &&
        inspected.anchor === anchor
        ? [{ entry, inspected }]
        : []
    })
    if (records.some(record => record.entry.dedupeKey === undefined)) return
    const finals = records.filter(record => record.inspected.occurrence.kind === 'final'),
      last = finals.at(-1)
    const isTerminal = terminal(last?.inspected.conclusion)
    const composed = composeEffect(
      { position: 'before_action', subject: request.actions[index]! },
      (isTerminal ? finals.slice(0, -1) : finals).map(record => record.inspected.conclusion),
    )
    if (
      !('effect' in composed) ||
      composed.effect.kind !== 'proceed' ||
      !('call' in composed.effect.subject)
    )
      return
    const effective = composed.effect.subject as BeforeActionSubject
    let decision: FinalAction['decision']
    if (
      isTerminal &&
      last !== undefined &&
      last.inspected.conclusion.extension !== OFFICIAL_ADMISSION_NAME
    )
      decision = denied(last.inspected.conclusion, last.entry.dedupeKey!)
    else if (result.gate.kind === 'missing') decision = missing
    else if (isTerminal && last !== undefined)
      decision = denied(last.inspected.conclusion, last.entry.dedupeKey!)
    else {
      if (last === undefined) return
      decision = source.toolNames.includes(effective.call.tool)
        ? { kind: 'allow', conclusion: last.entry.dedupeKey! }
        : { kind: 'notExecutable', reason: 'no_such_entry', conclusion: last.entry.dedupeKey! }
    }
    items.push({
      callId: call.callId,
      effectiveCall: effective.call,
      anchor,
      conclusions: records.map(record => record.entry.dedupeKey!),
      decision,
    })
  }
  return items[0] === undefined
    ? undefined
    : { key, gate: result.gate, items: [items[0], ...items.slice(1)] }
}

function delivered(value: ActionBatchCompletion) {
  const admissions = value.items.flatMap(item => {
    if (item.decision.kind !== 'allow') return []
    const token = encodeRunnerAdmissionToken(item.effectiveCall, item.decision.conclusion)
    if (typeof token !== 'string')
      throw new Error('checked action completion cannot encode its locator')
    return [{ callId: item.callId, token }]
  })
  return { kind: 'complete' as const, completion: value, admissions }
}

/** The driver publishes the whole batch before returning any execution locator. */
export function createToolActionDriver(input: {
  readonly journal: Journal
  readonly owner: SessionLogOwnerOperations
  readonly authorization: SessionAccessOperations
  readonly authority: ToolActionAuthority
  readonly runner: LoopExtensionRunnerService
}) {
  return Object.freeze({
    async dispatch(origin: ToolActionIdentity, signal: AbortSignal) {
      const captured = copyJsonValue(origin)
      if ('failed' in captured) return { kind: 'rejected', reason: 'invalidInput' } as const
      const start = await input.journal.read()
      if ('unavailable' in start) return { kind: 'rejected', reason: 'unavailable' } as const
      const acquired = await readToolActionSource({
        ...input,
        origin: captured.ok as unknown as ToolActionIdentity,
      })
      if ('failure' in acquired) return { kind: 'rejected', reason: acquired.failure } as const
      const facts = start.calls.get(acquired.source.calls[0].callId)
      if (facts === undefined) return { kind: 'rejected', reason: 'unavailable' } as const
      if (facts.batch.kind === 'complete') return delivered(facts.batch.completion)
      const result = await input.runner.dispatch(acquired.request, signal)
      if ('failure' in result) return { kind: 'rejected', reason: result.failure } as const
      if (
        result.admissions === undefined ||
        result.results.some(item => item.effect.kind === 'asked')
      )
        return { kind: 'waiting' } as const
      const current = await input.journal.read()
      if ('unavailable' in current) return { kind: 'rejected', reason: 'unavailable' } as const
      const completed = completion({ prefix: current.prefix, ...acquired, result })
      if (completed === undefined) return { kind: 'rejected', reason: 'unavailable' } as const
      const value: DriverValue = {
        kind: 'actions_completed',
        origin: {
          run: acquired.source.run,
          attempt: acquired.source.attempt,
          assistantMessage: acquired.source.assistantMessage,
        },
        adoption: facts.adoption.key,
        chain: result.chain,
        completion: completed,
      }
      const committed = await input.journal.commit(value)
      return committed.kind === 'committed' ? delivered(completed) : committed
    },
  })
}
