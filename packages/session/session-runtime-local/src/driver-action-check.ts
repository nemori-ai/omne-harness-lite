import { validate, type ToolCallBlock } from '@omne-harness-lite/content-blocks'
import type { Conclusion, PositionedSubject } from '@omne-harness-lite/loop-extension'
import {
  composeEffect,
  inspectRunnerConclusion,
  type RunnerPiece,
} from '@omne-harness-lite/loop-extension-runner'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import { compareInteger, type CheckedPrefix, type LogEntry } from '@omne-harness-lite/session-log'
import { OFFICIAL_ADMISSION_NAME, type FinalAction } from '@omne-harness-lite/tool-admission'
import { requireHistory } from './driver-model-history.ts'
import type { DriverToolBatch } from './driver-tool-source.ts'
import {
  actionAnchor,
  type DriverActionBatchRecord,
  type ReadActionConclusions,
} from './driver-action-facts.ts'

export type ActionConclusionRecord = {
  readonly entry: LogEntry
  readonly inspected: Extract<ReturnType<typeof inspectRunnerConclusion>, { conclusion: unknown }>
}
export function actionRecords(prefix: CheckedPrefix): readonly ActionConclusionRecord[] {
  return prefix.entries.flatMap(entry => {
    const read = inspectRunnerConclusion({ ...prefix.scope, entry })
    requireHistory(!('invalid' in read), 'uninterpretable Runner conclusion')
    return 'conclusion' in read && read.conclusion.position === 'before_action'
      ? [{ entry, inspected: read }]
      : []
  })
}
export function officialChain(chain: readonly RunnerPiece[], completed: DriverActionBatchRecord) {
  requireHistory(
    chain.every(piece => piece.definition.position === 'before_action'),
    'another position in action chain',
  )
  const official = chain.filter(piece => piece.definition.name === OFFICIAL_ADMISSION_NAME)
  const piece = official[0]
  requireHistory(
    official.length <= 1 &&
      (piece === undefined ||
        (chain.at(-1) === piece &&
          piece.power === 'veto' &&
          piece.fallback === 'admission' &&
          piece.definition.implementation.kind === 'builtin' &&
          piece.definition.implementation.builtinName === OFFICIAL_ADMISSION_NAME)),
    'invalid official admission identity or slot',
  )
  const gate = completed.value.completion.gate
  requireHistory(
    gate.kind === 'missing' && gate.reason === 'chain' ? piece === undefined : piece !== undefined,
    'completion gate changes its selected chain',
  )
}
export function actionInitial(
  calls: DriverToolBatch['calls'],
  call: ToolCallBlock,
): Extract<PositionedSubject, { position: 'before_action' }> {
  return {
    position: 'before_action',
    subject: {
      call,
      definition: { name: call.tool },
      batch: [calls[0].callId, ...calls.slice(1).map(call => call.callId)],
    },
  }
}
export function isActionTerminal(conclusion: Conclusion | undefined): boolean {
  return (
    conclusion?.output?.kind === 'veto' ||
    (conclusion?.skipped === 'unavailable' &&
      (conclusion.unavailability === 'veto' ||
        (conclusion.unavailability === 'fallback' &&
          conclusion.extension === OFFICIAL_ADMISSION_NAME)))
  )
}
export function checkActionBatch(
  read: ReadActionConclusions,
  prefix: CheckedPrefix,
  completed: DriverActionBatchRecord,
  batch: DriverToolBatch,
) {
  const { value } = completed
  officialChain(value.chain, completed)
  requireHistory(
    equal(value.origin, batch.origin) &&
      value.adoption === batch.adoption.key &&
      compareInteger(batch.reply.entry.position, completed.entry.position) < 0,
    'completion changes original reply or adoption',
  )
  const items = value.completion.items
  requireHistory(
    items.length === batch.calls.length &&
      items.every((item, i) => item.callId === batch.calls[i]?.callId),
    'completion drops or reorders original calls',
  )
  const records = actionRecords(prefix)
  const anchors = new Set<string>()
  for (const [index, item] of items.entries()) {
    const original = batch.calls[index]!
    if (original.unparseable) {
      checkUnparseable(item, original, completed)
      continue
    }
    requireHistory(
      item.anchor === actionAnchor(batch.origin.assistantMessage, item.callId) &&
        !anchors.has(item.anchor),
      'parsed call changes its unique original anchor',
    )
    anchors.add(item.anchor)
    checkActionPass(read, prefix, completed, batch, item, original, records)
  }
}
function checkUnparseable(
  item: FinalAction,
  original: ToolCallBlock,
  completed: DriverActionBatchRecord,
) {
  requireHistory(
    item.anchor === undefined &&
      item.conclusions.length === 0 &&
      equal(item.effectiveCall, original),
    'unparseable call has a fabricated pass',
  )
  if (completed.value.completion.gate.kind === 'missing') return checkMissing(item, completed)
  requireHistory(
    item.decision.kind === 'notExecutable' &&
      item.decision.reason === 'unparseable' &&
      item.decision.conclusion === undefined,
    'unparseable disposition changed',
  )
}
function checkActionPass(
  read: ReadActionConclusions,
  prefix: CheckedPrefix,
  completed: DriverActionBatchRecord,
  batch: DriverToolBatch,
  item: FinalAction,
  original: ToolCallBlock,
  all: readonly ActionConclusionRecord[],
) {
  const records = all.filter(
    record =>
      record.inspected.anchor === item.anchor &&
      compareInteger(record.entry.position, completed.entry.position) < 0,
  )
  requireHistory(
    records.every(
      record =>
        record.entry.run === batch.origin.run &&
        record.entry.attempt !== undefined &&
        compareInteger(record.entry.attempt, batch.origin.attempt) === 0 &&
        compareInteger(record.entry.position, batch.reply.entry.position) > 0,
    ),
    'pass changes original execution or order',
  )
  requireHistory(
    equal(
      records.map(record => record.entry.dedupeKey),
      item.conclusions,
    ),
    'completion changes original conclusion keys',
  )
  const initial = actionInitial(batch.calls, original)
  const replayed = read({
    initial,
    anchor: item.anchor!,
    run: batch.origin.run,
    chain: completed.value.chain,
    binding: { ...prefix.scope, logGeneration: prefix.ownerGeneration },
    entries: records.map(record => record.entry),
    tail: completed.entry.position,
  })
  requireHistory(Array.isArray(replayed), 'inconsistent original action pass')
  const finals = records.filter(record => record.inspected.occurrence.kind === 'final')
  requireHistory(
    records.every(
      record =>
        record.inspected.occurrence.kind !== 'ask' ||
        finals.some(
          final =>
            final.inspected.conclusion.extension === record.inspected.conclusion.extension &&
            compareInteger(final.entry.position, record.entry.position) > 0,
        ),
    ),
    'action pass still asked',
  )
  const last = finals.at(-1)
  const terminal = isActionTerminal(last?.inspected.conclusion)
  const effect = composeEffect(
    initial,
    (terminal ? finals.slice(0, -1) : finals).map(record => record.inspected.conclusion),
  )
  requireHistory(
    'effect' in effect && effect.effect.kind === 'proceed' && 'call' in effect.effect.subject,
    'action pass has no complete ordinary subject',
  )
  requireHistory(
    equal(item.effectiveCall, effect.effect.subject.call),
    'completion changes effective call',
  )
  checkDecision(item, last, terminal, finals.length, completed, batch)
}
function checkDecision(
  item: FinalAction,
  last: ActionConclusionRecord | undefined,
  terminal: boolean,
  count: number,
  completed: DriverActionBatchRecord,
  batch: DriverToolBatch,
) {
  if (terminal && last && last.inspected.conclusion.extension !== OFFICIAL_ADMISSION_NAME)
    return checkDenial(item, last)
  if (completed.value.completion.gate.kind === 'missing') return checkMissing(item, completed)
  if (terminal && last) return checkDenial(item, last)
  checkOfficialObservation(last, count, completed)
  checkSelectedDisposition(item, last, batch)
}
function checkOfficialObservation(
  last: ActionConclusionRecord | undefined,
  count: number,
  completed: DriverActionBatchRecord,
): asserts last is ActionConclusionRecord {
  const conclusion = last?.inspected.conclusion
  requireHistory(
    last !== undefined &&
      count === completed.value.chain.length &&
      conclusion?.extension === OFFICIAL_ADMISSION_NAME &&
      conclusion.output?.kind === 'observed' &&
      conclusion.skipped === undefined,
    'allow lacks complete official final observation',
  )
}
function checkSelectedDisposition(
  item: FinalAction,
  last: ActionConclusionRecord,
  batch: DriverToolBatch,
) {
  const tool = batch.adoption.adoption.tools.find(tool => tool.name === item.effectiveCall.tool)
  requireHistory(
    item.decision.conclusion === last.entry.dedupeKey,
    'decision changes its official final',
  )
  if (!tool) {
    requireHistory(
      item.decision.kind === 'notExecutable' && item.decision.reason === 'no_such_entry',
      'unknown tool changes disposition',
    )
    return
  }
  requireHistory(
    item.decision.kind === 'allow' &&
      batch.adoption.adoption.report.effectivePermissions[tool.name] !== 'not_in_composition',
    'held tool lacks original allowed disposition',
  )
}
function checkMissing(item: FinalAction, completed: DriverActionBatchRecord) {
  const decision = item.decision
  requireHistory(
    decision.kind === 'denied' &&
      decision.conclusion === completed.key &&
      decision.reason.kind === 'admission_unavailable' &&
      decision.reason.by === OFFICIAL_ADMISSION_NAME &&
      decision.reason.conclusion === completed.key,
    'missing admission lacks original fail-closed decision',
  )
}
function checkDenial(item: FinalAction, last: ActionConclusionRecord) {
  const decision = item.decision,
    conclusion = last.inspected.conclusion
  requireHistory(
    decision.kind === 'denied' &&
      decision.conclusion === last.entry.dedupeKey &&
      decision.reason.by === conclusion.extension &&
      decision.reason.conclusion === last.entry.dedupeKey,
    'denial changes its final conclusion',
  )
  const reason = decision.reason
  if (conclusion.extension !== OFFICIAL_ADMISSION_NAME) {
    requireHistory(
      reason.kind === 'extension_veto' &&
        (conclusion.output?.kind !== 'veto' || reason.explanation === conclusion.output.reason),
      'extension denial changed',
    )
    return
  }
  if (
    conclusion.output?.kind === 'veto' &&
    validate('AdmissionDenialCode', conclusion.output.reason).valid
  ) {
    requireHistory(
      reason.kind === 'admission' && reason.code === conclusion.output.reason,
      'official denial code changed',
    )
    return
  }
  requireHistory(
    reason.kind === 'admission_unavailable',
    'official failure changed to an ordinary decision',
  )
}
