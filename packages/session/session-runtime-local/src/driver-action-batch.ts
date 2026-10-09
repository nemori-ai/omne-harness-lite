import {
  copyJsonValue,
  validate,
  type AdmissionDenialCode,
  type ToolCallBlock,
} from '@omne-harness-lite/content-blocks'
import type { Conclusion } from '@omne-harness-lite/loop-extension'
import {
  composeEffect,
  encodeRunnerAdmissionToken,
  type RunnerActionRequest,
  type RunnerActionResult,
} from '@omne-harness-lite/loop-extension-runner'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import {
  addInteger,
  compareInteger,
  factLogPayload,
  type CheckedPrefix,
} from '@omne-harness-lite/session-log'
import { OFFICIAL_ADMISSION_NAME, type FinalAction } from '@omne-harness-lite/tool-admission'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type { SessionDriverRunSources } from './driver-types.ts'
import { DriverHistoryInvalid, requireHistory } from './driver-model-history.ts'
import { readDriverToolBatch, type DriverToolBatch } from './driver-tool-source.ts'
import {
  actionAnchor,
  actionBatchKey,
  captureActionBatch,
  inspectActionBatch,
  sessionActionBatchOwner,
  type DriverActionBatchFact,
  type DriverActionBatchRecord,
  type ReadActionConclusions,
} from './driver-action-facts.ts'
import {
  actionInitial,
  actionRecords,
  checkActionBatch,
  isActionTerminal,
  type ActionConclusionRecord,
} from './driver-action-check.ts'

type Finished = Exclude<RunnerActionResult, { readonly failure: string }>
type Input = {
  readonly journal: BorrowedRunJournal
  readonly message: string
  readonly actions: SessionDriverRunSources['actions']
  readonly signal: AbortSignal
}

/** The actual Runner finishes every parsed pass before Session publishes the whole original batch. */
export async function publishDriverActionBatch(input: Input) {
  try {
    const prefix = await readPrefix(input.journal)
    const read = readDriverToolBatch(prefix, input.message)
    requireHistory(read.kind === 'batch', 'original complete tool reply unavailable')
    const batch = read.batch
    requireHistory(batch.origin.run === input.journal.run, 'foreign original Run batch')
    const previous = prefix.entries.flatMap(entry => {
      const read = inspectActionBatch(prefix, entry)
      return read?.value.origin.assistantMessage === input.message ? [read] : []
    })
    requireHistory(previous.length <= 1, 'duplicate completed batch')
    if (previous[0]) return await recognize(input, prefix, batch, previous[0])
    requireHistory(
      !input.signal.aborted &&
        batch.runState === 'open' &&
        compareInteger(batch.latestAttempt, batch.origin.attempt) === 0,
      'original attempt no longer current',
    )
    const request = actionRequest(input, batch)
    const result = await input.actions.runner.dispatch(request, input.signal)
    if ('failure' in result) return { kind: 'unavailable' as const, reason: result }
    if (
      result.admissions === undefined ||
      result.results.some(result => result.effect.kind === 'asked')
    )
      return { kind: 'waiting' as const }
    const current = await readPrefix(input.journal)
    const proposed = propose(current, batch, result)
    const payload = copyJsonValue(factLogPayload(sessionActionBatchOwner, '1', proposed))
    requireHistory('ok' in payload, 'invalid proposed batch payload')
    const entry = {
      session: current.scope.session,
      tenant: current.scope.tenant,
      position: addInteger(current.tail, 1),
      run: batch.origin.run,
      attempt: batch.origin.attempt,
      dedupeKey: proposed.completion.key,
      readKeys: [proposed.completion.key],
      payload: payload.ok,
    }
    const record = inspectActionBatch(current, entry)
    requireHistory(record !== undefined, 'invalid proposed completed batch')
    const readConclusions = await replay(input, current, batch, record)
    checkActionBatch(readConclusions, current, record, batch)
    return await commit(input, current, proposed)
  } catch (error) {
    if (error instanceof DriverHistoryInvalid) return { kind: 'unavailable' as const }
    throw error
  }
}
async function commit(input: Input, current: CheckedPrefix, proposed: DriverActionBatchFact) {
  const appended = await input.journal.log.append(
    current.scope.session,
    [
      {
        tenant: current.scope.tenant,
        run: proposed.origin.run,
        attempt: proposed.origin.attempt,
        dedupeKey: proposed.completion.key,
        readKeys: [proposed.completion.key],
        payload: factLogPayload(sessionActionBatchOwner, '1', proposed),
      },
    ],
    { kind: 'fenced', run: proposed.origin.run, attempt: proposed.origin.attempt },
    { kind: 'tailEquals', tail: current.tail },
  )
  if (!('positions' in appended))
    return { kind: 'unconfirmed' as const, value: proposed, result: appended }
  return delivered(proposed)
}
async function readPrefix(journal: BorrowedRunJournal): Promise<CheckedPrefix> {
  const prefix = await journal.readPrefix()
  requireHistory(!('failure' in prefix), 'original Run prefix unavailable')
  return {
    scope: journal.scope,
    ownerGeneration: prefix.source.journalGeneration,
    entries: prefix.entries,
    tail: prefix.tail,
  }
}
function actionRequest(input: Input, batch: DriverToolBatch): RunnerActionRequest {
  const parsed = batch.calls.filter(call => call.unparseable !== true)
  return {
    position: 'before_action',
    actions: parsed.map(call => actionInitial(batch.calls, call).subject),
    anchors: parsed.map(call => actionAnchor(input.message, call.callId)),
    assistantMessage: input.message,
    manifest: input.journal.scope.session,
    run: batch.origin.run,
    attempt: batch.origin.attempt,
    admission: { ...input.actions.admission, report: batch.adoption.adoption.report },
  }
}
async function recognize(
  input: Input,
  prefix: CheckedPrefix,
  batch: DriverToolBatch,
  record: DriverActionBatchRecord,
) {
  const read = await replay(input, prefix, batch, record)
  checkActionBatch(read, prefix, record, batch)
  return delivered(record.value)
}
async function replay(
  input: Input,
  prefix: CheckedPrefix,
  batch: DriverToolBatch,
  record: DriverActionBatchRecord,
): Promise<ReadActionConclusions> {
  const captured = new Map<
    string,
    { initial: ReturnType<typeof actionInitial>; conclusions: readonly Conclusion[] }
  >()
  for (const call of batch.calls) {
    if (call.unparseable) continue
    const initial = actionInitial(batch.calls, call),
      anchor = actionAnchor(input.message, call.callId)
    const conclusions = await input.actions.runner.replay({
      ...initial,
      anchor,
      manifest: prefix.scope.session,
      run: batch.origin.run,
    })
    requireHistory(Array.isArray(conclusions), 'actual Runner cannot replay original pass')
    captured.set(anchor, { initial, conclusions: conclusions as readonly Conclusion[] })
  }
  return request => {
    const pass = captured.get(request.anchor)
    requireHistory(
      pass !== undefined &&
        equal(pass.initial, request.initial) &&
        equal(request.binding, { ...prefix.scope, logGeneration: prefix.ownerGeneration }) &&
        request.run === batch.origin.run &&
        equal(request.chain, record.value.chain),
      'replay changes original bound pass',
    )
    requireHistory(
      equal(
        pass.conclusions,
        request.entries.map(entry => {
          const records = actionRecords({ ...prefix, entries: [entry] })
          requireHistory(records.length === 1, 'replay includes unrelated record')
          return records[0]!.inspected.conclusion
        }),
      ),
      'actual replay differs from recorded original conclusions',
    )
    return pass.conclusions
  }
}
function missing(key: string): FinalAction['decision'] {
  return {
    kind: 'denied',
    conclusion: key,
    reason: {
      kind: 'admission_unavailable',
      by: OFFICIAL_ADMISSION_NAME,
      conclusion: key,
      explanation: 'The official admission chain or contribution is absent.',
    },
  }
}
function denial(record: ActionConclusionRecord): FinalAction['decision'] {
  const conclusion = record.inspected.conclusion,
    key = record.entry.dedupeKey!
  const by = conclusion.extension,
    output = conclusion.output
  if (
    by === OFFICIAL_ADMISSION_NAME &&
    output?.kind === 'veto' &&
    validate('AdmissionDenialCode', output.reason).valid
  )
    return {
      kind: 'denied',
      conclusion: key,
      reason: {
        kind: 'admission',
        code: output.reason as AdmissionDenialCode,
        by,
        conclusion: key,
      },
    }
  return {
    kind: 'denied',
    conclusion: key,
    reason: {
      kind: by === OFFICIAL_ADMISSION_NAME ? 'admission_unavailable' : 'extension_veto',
      by,
      conclusion: key,
      explanation:
        output?.kind === 'veto' ? output.reason : 'The extension could not authorize this action.',
    },
  }
}
function disposition(
  result: Finished,
  batch: DriverToolBatch,
  call: ToolCallBlock,
  last: ActionConclusionRecord | undefined,
): FinalAction['decision'] {
  const terminal = isActionTerminal(last?.inspected.conclusion)
  if (terminal && last && last.inspected.conclusion.extension !== OFFICIAL_ADMISSION_NAME)
    return denial(last)
  if (result.gate.kind === 'missing') return missing(actionBatchKey(batch.origin.assistantMessage))
  if (terminal && last) return denial(last)
  requireHistory(last !== undefined, 'no original official conclusion')
  return batch.adoption.adoption.tools.some(tool => tool.name === call.tool)
    ? { kind: 'allow', conclusion: last.entry.dedupeKey! }
    : { kind: 'notExecutable', reason: 'no_such_entry', conclusion: last.entry.dedupeKey! }
}
function propose(
  prefix: CheckedPrefix,
  batch: DriverToolBatch,
  result: Finished,
): DriverActionBatchFact {
  const records = actionRecords(prefix)
  const items = batch.calls.map(call => proposalItem(batch, result, records, call))
  return captureActionBatch({
    kind: 'actions_completed',
    origin: batch.origin,
    adoption: batch.adoption.key,
    chain: result.chain,
    completion: { key: actionBatchKey(batch.origin.assistantMessage), gate: result.gate, items },
  })
}
function proposalItem(
  batch: DriverToolBatch,
  result: Finished,
  all: readonly ActionConclusionRecord[],
  call: ToolCallBlock,
): FinalAction {
  if (call.unparseable)
    return {
      callId: call.callId,
      effectiveCall: call,
      conclusions: [],
      decision:
        result.gate.kind === 'missing'
          ? missing(actionBatchKey(batch.origin.assistantMessage))
          : { kind: 'notExecutable', reason: 'unparseable' },
    }
  const anchor = actionAnchor(batch.origin.assistantMessage, call.callId)
  const records = all.filter(record => record.inspected.anchor === anchor)
  requireHistory(
    records.every(record => record.entry.dedupeKey !== undefined),
    'original conclusion lacks key',
  )
  const finals = records.filter(record => record.inspected.occurrence.kind === 'final'),
    last = finals.at(-1)
  const effect = composeEffect(
    actionInitial(batch.calls, call),
    (isActionTerminal(last?.inspected.conclusion) ? finals.slice(0, -1) : finals).map(
      record => record.inspected.conclusion,
    ),
  )
  requireHistory(
    'effect' in effect && effect.effect.kind === 'proceed' && 'call' in effect.effect.subject,
    'no complete effective original action',
  )
  const effectiveCall = effect.effect.subject.call
  return {
    callId: call.callId,
    effectiveCall,
    anchor,
    conclusions: records.map(record => record.entry.dedupeKey!),
    decision: disposition(result, batch, effectiveCall, last),
  }
}
function delivered(value: DriverActionBatchFact) {
  const admissions = value.completion.items.flatMap(item => {
    if (item.decision.kind !== 'allow') return []
    const token = encodeRunnerAdmissionToken(item.effectiveCall, item.decision.conclusion)
    requireHistory(typeof token === 'string', 'invalid original execution locator')
    return [{ callId: item.callId, token }]
  })
  return { kind: 'complete' as const, completion: value.completion, admissions }
}
