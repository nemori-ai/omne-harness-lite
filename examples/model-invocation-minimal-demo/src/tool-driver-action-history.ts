import { validate as contentValid, type ToolCallBlock } from '@omne-harness-lite/content-blocks'
import type { BeforeActionSubject, PositionedSubject } from '@omne-harness-lite/loop-extension'
import { composeEffect, type RunnerPiece } from '@omne-harness-lite/loop-extension-runner'
import { readPassConclusions } from '@omne-harness-lite/loop-extension-runner-local'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import { compareInteger, type CheckedPrefix } from '@omne-harness-lite/session-log'
import {
  OFFICIAL_ADMISSION_NAME,
  type ActionOrigin,
  type FinalAction,
} from '@omne-harness-lite/tool-admission'
import type { DriverValue } from './tool-driver-types.ts'
import type { AdoptedAttempt, DriverRecord, DriverRunnerRecord } from './tool-driver-run-history.ts'
import { requireHistory } from './tool-driver-model-history.ts'

export type CompletedActions = DriverRecord & {
  readonly value: Extract<DriverValue, { kind: 'actions_completed' }>
}
export function sameActionOrigin(left: ActionOrigin, right: ActionOrigin): boolean {
  return (
    left.run === right.run &&
    compareInteger(left.attempt, right.attempt) === 0 &&
    left.assistantMessage === right.assistantMessage
  )
}
function checkOfficial(chain: readonly RunnerPiece[], completed: CompletedActions): void {
  requireHistory(
    chain.every(piece => piece.definition.position === 'before_action'),
    'action chain includes another position',
  )
  const official = chain.filter(piece => piece.definition.name === OFFICIAL_ADMISSION_NAME)
  const item = official[0]
  requireHistory(
    official.length <= 1 &&
      (item === undefined ||
        (chain.at(-1) === item &&
          item.power === 'veto' &&
          item.fallback === 'admission' &&
          item.definition.implementation.kind === 'builtin' &&
          item.definition.implementation.builtinName === OFFICIAL_ADMISSION_NAME)),
    'official identity or slot is invalid',
  )
  const gate = completed.value.completion.gate
  requireHistory(
    gate.kind === 'missing' && gate.reason === 'chain' ? item === undefined : item !== undefined,
    'gate conflicts with the adopted chain',
  )
}
function missingDecision(item: FinalAction, completed: CompletedActions): void {
  const decision = item.decision,
    key = completed.key
  requireHistory(
    decision.kind === 'denied' &&
      decision.conclusion === key &&
      decision.reason.kind === 'admission_unavailable' &&
      decision.reason.by === OFFICIAL_ADMISSION_NAME &&
      decision.reason.conclusion === key,
    'missing official must deny by the completion record',
  )
}
function finalDenial(item: FinalAction, terminal: DriverRunnerRecord): void {
  const decision = item.decision,
    conclusion = terminal.inspected.conclusion
  requireHistory(
    decision.kind === 'denied' &&
      decision.conclusion === terminal.entry.dedupeKey &&
      decision.reason.by === conclusion.extension &&
      decision.reason.conclusion === terminal.entry.dedupeKey,
    'denial does not locate its actual final conclusion',
  )
  const reason = decision.reason
  if (conclusion.extension === OFFICIAL_ADMISSION_NAME) {
    if (
      conclusion.output?.kind === 'veto' &&
      contentValid('AdmissionDenialCode', conclusion.output.reason).valid
    ) {
      requireHistory(
        reason.kind === 'admission' && reason.code === conclusion.output.reason,
        'official denial code changed',
      )
    } else
      requireHistory(
        reason.kind === 'admission_unavailable',
        'official failure is not a normal admission decision',
      )
  } else {
    requireHistory(
      reason.kind === 'extension_veto' &&
        (conclusion.output?.kind !== 'veto' || reason.explanation === conclusion.output.reason),
      'extension veto reason changed',
    )
  }
}

/** Reconstructs each pass only at the completion's position. Later violations remain visible to token verification. */
export function checkCompletedActions(
  prefix: CheckedPrefix,
  completed: CompletedActions,
  calls: readonly ToolCallBlock[],
  adoption: AdoptedAttempt,
  runners: readonly DriverRunnerRecord[],
): void {
  const { completion, chain, origin } = completed.value
  checkOfficial(chain, completed)
  requireHistory(
    completion.items.length === calls.length &&
      completion.items.every((item, index) => item.callId === calls[index]?.callId),
    'completion omits or reorders the original batch',
  )
  const anchors = new Set<string>()
  for (const [index, item] of completion.items.entries()) {
    const original = calls[index]!
    if (original.unparseable === true) {
      requireHistory(
        item.anchor === undefined &&
          item.conclusions.length === 0 &&
          equal(item.effectiveCall, original),
        'unparseable call has a fabricated pass',
      )
      if (completion.gate.kind === 'missing') missingDecision(item, completed)
      else
        requireHistory(
          item.decision.kind === 'notExecutable' &&
            item.decision.reason === 'unparseable' &&
            item.decision.conclusion === undefined,
          'unparseable disposition changed',
        )
      continue
    }
    requireHistory(
      item.anchor !== undefined && !anchors.has(item.anchor),
      'parsed action has no unique anchor',
    )
    anchors.add(item.anchor)
    const records = runners.filter(
      record =>
        record.inspected.conclusion.position === 'before_action' &&
        record.inspected.anchor === item.anchor &&
        compareInteger(record.entry.position, completed.entry.position) < 0,
    )
    requireHistory(
      records.every(
        record =>
          record.entry.run === origin.run &&
          record.entry.attempt !== undefined &&
          compareInteger(record.entry.attempt, origin.attempt) === 0 &&
          compareInteger(record.entry.position, adoption.entry.position) > 0,
      ),
      'pass has wrong original execution or predates adoption',
    )
    requireHistory(
      equal(
        records.map(record => record.entry.dedupeKey),
        item.conclusions,
      ),
      'completion changes its actual ordered conclusion keys',
    )
    const initial: PositionedSubject = {
      position: 'before_action',
      subject: {
        call: original,
        definition: { name: original.tool },
        batch: [calls[0]!.callId, ...calls.slice(1).map(call => call.callId)],
      },
    }
    const read = readPassConclusions({
      initial,
      anchor: item.anchor,
      run: origin.run,
      chain,
      binding: { ...prefix.scope, logGeneration: prefix.ownerGeneration },
      entries: records.map(record => record.entry),
      tail: completed.entry.position,
    })
    requireHistory(Array.isArray(read), 'action pass history is inconsistent')
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
      'asked action is not complete',
    )
    const last = finals.at(-1),
      conclusion = last?.inspected.conclusion
    const terminal =
      conclusion?.output?.kind === 'veto' ||
      (conclusion?.skipped === 'unavailable' &&
        (conclusion.unavailability === 'veto' ||
          (conclusion.unavailability === 'fallback' &&
            conclusion.extension === OFFICIAL_ADMISSION_NAME)))
    const effect = composeEffect(
      initial,
      (terminal ? finals.slice(0, -1) : finals).map(record => record.inspected.conclusion),
    )
    requireHistory(
      'effect' in effect && effect.effect.kind === 'proceed',
      'completion contains a non-final action effect',
    )
    const effective = effect.effect.subject as BeforeActionSubject
    requireHistory(
      equal(item.effectiveCall, effective.call),
      'completion changes the actual effective call',
    )
    if (terminal && last !== undefined && conclusion?.extension !== OFFICIAL_ADMISSION_NAME) {
      finalDenial(item, last)
    } else if (completion.gate.kind === 'missing') {
      missingDecision(item, completed)
    } else if (terminal && last !== undefined) {
      finalDenial(item, last)
    } else {
      requireHistory(
        last !== undefined &&
          finals.length === chain.length &&
          conclusion?.extension === OFFICIAL_ADMISSION_NAME &&
          conclusion.output?.kind === 'observed' &&
          conclusion.skipped === undefined,
        'allow lacks complete official final observation',
      )
      const tool = adoption.value.tools.find(tool => tool.name === effective.call.tool)
      const decision = item.decision
      requireHistory(
        decision.conclusion === last.entry.dedupeKey,
        'disposition does not locate the official final',
      )
      if (tool === undefined)
        requireHistory(
          decision.kind === 'notExecutable' && decision.reason === 'no_such_entry',
          'unknown tool needs no_such_entry',
        )
      else
        requireHistory(
          decision.kind === 'allow' &&
            adoption.value.report.effectivePermissions[tool.name] !== 'not_in_composition',
          'a held tool requires actual admission instead of no_such_entry',
        )
    }
  }
}
