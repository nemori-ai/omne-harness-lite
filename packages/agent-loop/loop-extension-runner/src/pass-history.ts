import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isJsonNumber,
  isNonNegativeJsonInteger,
  copyJsonValue,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  judgeDefinition,
  judgePositionedSubject,
  judgeConclusionForSubject,
  type Conclusion,
  type PositionedSubject,
  type Power,
} from '@omne-harness-lite/loop-extension'
import type { SystemReminderMessage } from '@omne-harness-lite/messages'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { LogEntry, ReadResult } from '@omne-harness-lite/session-log-jsonl'
import { inspectRunnerConclusion } from './conclusion-codec.ts'
import { composeEffect } from './effect.ts'
import { passKeys, type RunnerOccurrence } from './keys.ts'
import type { RunnerFailure, RunnerPiece } from './run-pass.ts'
import type { RunnerLogBinding } from './task-owner.ts'

export type RunnerReplayFailure = Extract<
  RunnerFailure,
  {
    readonly failure:
      'invalidInput' | 'positionUnknown' | 'manifestMissing' | 'replayInconsistent' | 'unavailable'
  }
>
export interface RunnerHistoryScope {
  readonly initial: PositionedSubject
  readonly anchor: string
  readonly run?: string
}
export interface ReadPassConclusionsInput extends RunnerHistoryScope {
  readonly binding: RunnerLogBinding
  readonly chain: readonly RunnerPiece[]
  readonly entries: readonly LogEntry[]
  readonly tail: JsonNumber
}
const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
const unavailable = Object.freeze({ failure: 'unavailable' } as const)
const replayInconsistent = Object.freeze({ failure: 'replayInconsistent' } as const)
const identity = (value: unknown): boolean => 'ok' in parseOpaqueIdentifier(value, 'RunnerIdentity')
const sameJson = modelLogJsonEqual

/** Package-private control failure. The boundary returns this exact occurrence's value. */
export class RunnerFailureSignal extends Error {
  constructor(readonly result: RunnerFailure) {
    super(result.failure)
  }

  replayResult(): RunnerReplayFailure {
    const result = this.result
    switch (result.failure) {
      case 'invalidInput':
      case 'positionUnknown':
      case 'manifestMissing':
      case 'replayInconsistent':
      case 'unavailable':
        return result
      default:
        throw this
    }
  }
}

/** Pure S-22 interpretation: no attempt, ports, I/O, effect resolution, or reminder recovery. */
export function readPassConclusions(
  input: ReadPassConclusionsInput,
): readonly Conclusion[] | RunnerReplayFailure {
  try {
    // The pure value boundary must not execute accessor code supplied as history.
    if ('failed' in copyJsonValue(input)) return invalidInput
    if (
      !input ||
      typeof input !== 'object' ||
      Object.hasOwn(input, 'attempt') ||
      (Object.hasOwn(input, 'run') && input.run === undefined)
    )
      return invalidInput
    validateHistoryScope(input, input.chain, false)
    if (
      !input.binding ||
      !identity(input.binding.session) ||
      !identity(input.binding.logGeneration) ||
      !('ok' in parseTenantId(input.binding.tenant)) ||
      !Array.isArray(input.entries)
    )
      return invalidInput
    const read = readPassHistory(input, input.chain, input.binding, {
      entries: input.entries,
      tail: input.tail,
    })
    return Object.freeze(read.map(item => item.conclusion))
  } catch (error) {
    if (error instanceof RunnerFailureSignal) return error.replayResult()
    return invalidInput
  }
}

export interface Historical {
  readonly entry: LogEntry
  readonly conclusion: Conclusion
  readonly occurrence: RunnerOccurrence
  readonly reminders: readonly SystemReminderMessage[]
}

export function samePosition(
  left: { readonly position: string; readonly dimension?: unknown },
  right: { readonly position: string; readonly dimension?: unknown },
): boolean {
  return left.position === right.position && sameJson(left.dimension, right.dimension)
}

export function validateHistoryScope(
  pass: RunnerHistoryScope,
  chain: readonly RunnerPiece[],
  nested: boolean,
): void {
  if (!pass || typeof pass !== 'object' || !identity(pass.anchor))
    throw new RunnerFailureSignal(invalidInput)
  const first = judgePositionedSubject(pass.initial)
  if ('rejected' in first)
    throw new RunnerFailureSignal(
      first.rejected === 'position_unknown' ? { failure: 'positionUnknown' } : invalidInput,
    )
  if (!Array.isArray(chain)) throw new RunnerFailureSignal(invalidInput)
  const { position, subject } = first.ok
  if (pass.run === undefined) {
    if (
      position !== 'before_persist_message' ||
      (position === 'before_persist_message' &&
        (subject.producer === 'model' || subject.producer === 'tool'))
    )
      throw new RunnerFailureSignal(invalidInput)
  } else if (
    position === 'before_persist_message' &&
    subject.producer !== 'model' &&
    subject.producer !== 'tool' &&
    // S-19: only runner-owned reminder nesting inherits the outer write fence.
    !(nested && subject.producer === 'system')
  ) {
    throw new RunnerFailureSignal(invalidInput)
  } else if (!identity(pass.run)) throw new RunnerFailureSignal(invalidInput)
  const seen = new Set<string>()
  for (const piece of chain) {
    if (!piece || typeof piece !== 'object') throw new RunnerFailureSignal(invalidInput)
    const judged = judgeDefinition(piece.definition)
    if ('rejected' in judged) throw new RunnerFailureSignal(invalidInput)
    if (
      !samePosition(first.ok, judged.ok) ||
      seen.has(judged.ok.name) ||
      !['observe', 'rewrite', 'veto'].includes(piece.power)
    )
      throw new RunnerFailureSignal(invalidInput)
    seen.add(judged.ok.name)
    const levels: readonly Power[] = ['observe', 'rewrite', 'veto']
    if (levels.indexOf(piece.power) > levels.indexOf(judged.ok.power))
      throw new RunnerFailureSignal(invalidInput)
    if (
      piece.onError !== undefined &&
      !['ignore', 'record', 'treat_as_veto'].includes(piece.onError)
    )
      throw new RunnerFailureSignal(invalidInput)
    if (piece.fallback !== undefined) {
      if (
        (piece.fallback === 'modality' && position !== 'before_persist_message') ||
        (piece.fallback === 'admission' &&
          (judged.ok.name !== 'omne-official:admission-judgment' ||
            position !== 'before_action' ||
            piece.power !== 'veto')) ||
        (piece.fallback === 'retry' &&
          (judged.ok.name !== 'omne-official:default-retry' ||
            first.ok.position !== 'after_model_call' ||
            first.ok.dimension.ending !== 'failure' ||
            piece.power !== 'rewrite')) ||
        (piece.fallback === 'offload' &&
          (judged.ok.name !== 'omne-official:offload-judgment' ||
            first.ok.position !== 'after_action' ||
            first.ok.dimension.scope !== 'each')) ||
        (piece.fallback === 'loop' &&
          (first.ok.position !== 'after_model_call' ||
            first.ok.dimension.ending !== 'complete_reply'))
      )
        throw new RunnerFailureSignal(invalidInput)
    }
  }
}

export function currentSubject(
  initial: PositionedSubject,
  finals: readonly Conclusion[],
  failure: RunnerReplayFailure,
): PositionedSubject {
  const combined = composeEffect(initial, finals)
  if ('invalidInput' in combined || combined.effect.kind !== 'proceed')
    throw new RunnerFailureSignal(failure)
  const judged = judgePositionedSubject({ ...initial, subject: combined.effect.subject })
  if (!('ok' in judged)) throw new RunnerFailureSignal(failure)
  return judged.ok
}

export function readPassHistory(
  pass: RunnerHistoryScope,
  chain: readonly RunnerPiece[],
  binding: RunnerLogBinding,
  read: ReadResult,
): readonly Historical[] {
  if (!('entries' in read)) throw new RunnerFailureSignal(unavailable)
  if (!isNonNegativeJsonInteger(read.tail)) throw new RunnerFailureSignal(replayInconsistent)
  const key = passKeys({
    position: pass.initial.position,
    ...(pass.initial.dimension === undefined ? {} : { dimension: pass.initial.dimension }),
    anchor: pass.anchor,
  })
  if ('invalidInput' in key) throw new RunnerFailureSignal(invalidInput)
  const records: Historical[] = []
  const historicalFinals: Conclusion[] = []
  let pieceIndex = 0
  let askOrdinal = ExactDecimal.from(0)
  let previousPosition = ExactDecimal.from(0)
  for (const entry of read.entries) {
    if (
      !isJsonNumber(entry.position) ||
      ExactDecimal.from(entry.position).compare(previousPosition) <= 0 ||
      ExactDecimal.from(entry.position).compare(ExactDecimal.from(read.tail)) > 0 ||
      !entry.readKeys.includes(key.pass)
    )
      throw new RunnerFailureSignal(replayInconsistent)
    previousPosition = ExactDecimal.from(entry.position)
    const inspected = inspectRunnerConclusion({
      session: binding.session,
      tenant: binding.tenant,
      entry,
    })
    if ('invalid' in inspected || 'unrelated' in inspected)
      throw new RunnerFailureSignal(replayInconsistent)
    if (
      inspected.anchor !== pass.anchor ||
      !samePosition(pass.initial, inspected.conclusion) ||
      (pass.run !== undefined &&
        (inspected.execution.kind !== 'withRun' || inspected.execution.run !== pass.run)) ||
      (pass.run === undefined && inspected.execution.kind !== 'noRun')
    )
      throw new RunnerFailureSignal(replayInconsistent)
    const piece = chain[pieceIndex]
    if (piece === undefined || inspected.conclusion.extension !== piece.definition.name)
      throw new RunnerFailureSignal(replayInconsistent)
    if (inspected.conclusion.power !== piece.power)
      throw new RunnerFailureSignal(replayInconsistent)
    const historicalSubject = currentSubject(pass.initial, historicalFinals, replayInconsistent)
    const admitted = judgeConclusionForCurrent(inspected.conclusion, historicalSubject, piece)
    if ('failure' in admitted) throw new RunnerFailureSignal(replayInconsistent)
    if (inspected.occurrence.kind === 'ask') {
      askOrdinal = askOrdinal.add(ExactDecimal.from(1))
      if (ExactDecimal.from(inspected.occurrence.ordinal).compare(askOrdinal) !== 0)
        throw new RunnerFailureSignal(replayInconsistent)
    } else {
      historicalFinals.push(inspected.conclusion)
      pieceIndex++
      askOrdinal = ExactDecimal.from(0)
    }
    records.push({
      entry,
      conclusion: inspected.conclusion,
      occurrence: inspected.occurrence,
      reminders: inspected.reminders,
    })
  }
  return records
}

export function judgeConclusionForCurrent(
  value: unknown,
  subject: PositionedSubject,
  piece: RunnerPiece,
): { readonly conclusion: Conclusion } | RunnerReplayFailure {
  const result = judgeConclusionForSubject(value, {
    positionedSubject: subject,
    extensionName: piece.definition.name,
  })
  return 'ok' in result ? { conclusion: result.ok } : invalidInput
}
