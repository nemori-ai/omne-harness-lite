import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  judgeConclusion,
  judgeInput,
  judgeOutput,
  judgePositionedSubject,
  type Conclusion,
  type ErrorPolicy,
  type ExtensionInput,
  type ExtensionOutput,
  type LoopExtensionDefinition,
  type PositionedSubject,
  type Power,
} from '@omne-harness-lite/loop-extension'
import { judgeMessage, type SystemReminderMessage } from '@omne-harness-lite/messages'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { LogEntry, LogEntryInput, ReadResult } from '@omne-harness-lite/session-log-jsonl'
import {
  prepareRunnerConclusion,
  inspectRunnerConclusion,
  type RunnerExecution,
} from './conclusion-codec.ts'
import { composeEffect, type RunnerEffect } from './effect.ts'
import { passKeys, type RunnerOccurrence } from './keys.ts'
import type { RunnerLogBinding } from './task-owner.ts'
import {
  validateHistoryScope,
  readPassHistory,
  currentSubject,
  samePosition,
  judgeConclusionForCurrent,
  type Historical,
} from './pass-history.ts'

export interface RunnerPass {
  readonly initial: PositionedSubject
  readonly anchor: string
  readonly execution: RunnerExecution
}

export interface RunnerPiece {
  /** The immutable definition read with the same manifest evaluation as the chain. */
  readonly definition: LoopExtensionDefinition
  readonly power: Power
  readonly onError?: ErrorPolicy
  /** Only a trusted system chain source may designate one of the five fixed fallbacks. */
  readonly fallback?: 'modality' | 'retry' | 'admission' | 'loop' | 'offload'
}

export type RunnerFailure =
  | { readonly failure: 'invalidInput' }
  | { readonly failure: 'positionUnknown' }
  | { readonly failure: 'manifestMissing' }
  | { readonly failure: 'replayInconsistent' }
  | { readonly failure: 'unavailable' }
  | { readonly failure: 'attemptSuperseded' }
  | { readonly failure: 'cancelled' }

export type RunnerPassResult =
  { readonly conclusions: readonly Conclusion[]; readonly effect: RunnerEffect } | RunnerFailure

export interface RunnerAskAssociation {
  readonly binding: RunnerLogBinding
  readonly pass: RunnerPass
  readonly piece: string
  readonly askEntry: LogEntry
  readonly askHistory: readonly Conclusion[]
  readonly earlier: readonly Conclusion[]
  readonly subject: PositionedSubject
}

export interface RunnerReplayBinding {
  readonly association: RunnerAskAssociation
  readonly cardId: string
  readonly batchId: string
  readonly answerId: string
  /** The waiting owner latches any deviation, even when the contributor catches it. */
  readonly control: () => 'valid' | 'replayInconsistent' | 'unavailable'
  readonly release: () => void
}

export type RunnerAskState =
  | {
      readonly kind: 'pending'
      readonly association: RunnerAskAssociation
      readonly card?: { readonly cardId: string; readonly batchId: string }
    }
  | { readonly kind: 'ready'; readonly binding: RunnerReplayBinding }
  | { readonly kind: 'replayInconsistent' }
  | { readonly kind: 'unavailable' }

export type RunnerInvocationMode =
  { readonly kind: 'fresh' } | { readonly kind: 'replay'; readonly binding: RunnerReplayBinding }

export interface RunnerHandles {
  readonly log: ExtensionInput['log']
  readonly environment: ExtensionInput['environment']
  readonly release: () => void
}

export type RunnerInvocationResult =
  | { readonly kind: 'output'; readonly value: unknown }
  | {
      readonly kind: 'errored'
      readonly error: string
      readonly classification?: 'ordinary' | 'nonzero_exit' | 'timeout' | 'bad_output'
    }
  | { readonly kind: 'notStartedUnavailable' }
  | { readonly kind: 'replayInconsistent' }
  | { readonly kind: 'controlUnavailable' }

export type RunnerCapabilityResult =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalidInput' }

export type RunnerRecordResult =
  | { readonly kind: 'confirmed'; readonly entry: LogEntry }
  | { readonly kind: 'alreadyRecorded'; readonly entry: LogEntry }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'attemptSuperseded' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalidInput' }

export type RunnerReminderRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'same' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'unavailable' }

export type RunnerReminderAppend =
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'alreadyRecorded' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'attemptSuperseded' }
  | { readonly kind: 'unavailable' }

export interface RunnerPorts {
  readonly binding: RunnerLogBinding
  /** Reads all runner entries for this pass from one log generation. */
  readonly readConclusions: (pass: RunnerPass) => Promise<ReadResult>
  readonly readAskState: (
    association: RunnerAskAssociation,
    signal: AbortSignal,
  ) => Promise<RunnerAskState>
  readonly presence: (piece: RunnerPiece) => Promise<'present' | 'absent' | 'unavailable'>
  readonly openHandles: (
    piece: RunnerPiece,
    mode: RunnerInvocationMode,
  ) => Promise<RunnerHandles | { readonly unavailable: true }>
  /** The execution owner controls waits and reports deviations outside contributor catch blocks. */
  readonly invoke: (
    piece: RunnerPiece,
    input: ExtensionInput,
    signal: AbortSignal,
    mode: RunnerInvocationMode,
  ) => Promise<RunnerInvocationResult>
  readonly verifyFailure: (
    subject: PositionedSubject,
    binding: RunnerLogBinding,
  ) => Promise<
    | {
        readonly kind: 'verified'
        readonly subject: PositionedSubject
        readonly release: () => void
      }
    | { readonly kind: 'invalidInput' }
    | { readonly kind: 'unavailable' }
  >
  readonly judgeCapabilities: (
    input: ExtensionInput,
    output: ExtensionOutput,
  ) => Promise<RunnerCapabilityResult>
  readonly record: (entry: LogEntryInput, execution: RunnerExecution) => Promise<RunnerRecordResult>
  readonly now: () => string | { readonly unavailable: true }
  readonly mintReminder: () => string | { readonly unavailable: true }
  readonly isActive: () => boolean
  readonly fallbackNeedsProjection: (
    subject: PositionedSubject,
  ) => Promise<boolean | { readonly unavailable: true }>
  readonly reminders: {
    readonly inspect: (message: SystemReminderMessage) => Promise<RunnerReminderRead>
    readonly nestedChain: (
      message: SystemReminderMessage,
    ) => Promise<readonly RunnerPiece[] | { readonly unavailable: true }>
    readonly append: (
      message: SystemReminderMessage,
      execution: RunnerExecution,
    ) => Promise<RunnerReminderAppend>
  }
}

const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
const unavailable = Object.freeze({ failure: 'unavailable' } as const)
const replayInconsistent = Object.freeze({ failure: 'replayInconsistent' } as const)
const cancelled = Object.freeze({ failure: 'cancelled' } as const)
const attemptSuperseded = Object.freeze({ failure: 'attemptSuperseded' } as const)

function isFailure(value: RunnerPassResult): value is RunnerFailure {
  return 'failure' in value
}

function sameJson(left: unknown, right: unknown): boolean {
  return modelLogJsonEqual(left, right)
}

function identity(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'RunnerIdentity')
}

function validPorts(value: RunnerPorts): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.binding !== null &&
    typeof value.binding === 'object' &&
    identity(value.binding.session) &&
    identity(value.binding.logGeneration) &&
    typeof value.readConclusions === 'function' &&
    typeof value.readAskState === 'function' &&
    typeof value.presence === 'function' &&
    typeof value.openHandles === 'function' &&
    typeof value.invoke === 'function' &&
    typeof value.verifyFailure === 'function' &&
    typeof value.judgeCapabilities === 'function' &&
    typeof value.record === 'function' &&
    typeof value.now === 'function' &&
    typeof value.mintReminder === 'function' &&
    typeof value.isActive === 'function' &&
    typeof value.fallbackNeedsProjection === 'function' &&
    value.reminders !== null &&
    typeof value.reminders === 'object' &&
    typeof value.reminders.inspect === 'function' &&
    typeof value.reminders.nestedChain === 'function' &&
    typeof value.reminders.append === 'function'
  )
}

function validatePass(
  pass: RunnerPass,
  chain: readonly RunnerPiece[],
  nested: boolean,
): RunnerFailure | undefined {
  if (!pass || typeof pass !== 'object' || !identity(pass.anchor)) return invalidInput
  const first = judgePositionedSubject(pass.initial)
  if ('rejected' in first)
    return first.rejected === 'position_unknown' ? { failure: 'positionUnknown' } : invalidInput
  if (!Array.isArray(chain) || !pass.execution || typeof pass.execution !== 'object')
    return invalidInput
  if (
    pass.execution.kind !== 'noRun' &&
    (pass.execution.kind !== 'withRun' ||
      !identity(pass.execution.run) ||
      !isJsonNumber(pass.execution.attempt) ||
      !ExactDecimal.from(pass.execution.attempt).isInteger ||
      ExactDecimal.from(pass.execution.attempt).compare(ExactDecimal.from(0)) <= 0)
  )
    return invalidInput
  return validateHistoryScope(
    {
      initial: pass.initial,
      anchor: pass.anchor,
      ...(pass.execution.kind === 'withRun' ? { run: pass.execution.run } : {}),
    },
    chain,
    nested,
  )
}

function checkControl(signal: AbortSignal, ports: RunnerPorts): RunnerFailure | undefined {
  if (signal.aborted) return cancelled
  try {
    if (!ports.isActive()) return unavailable
  } catch {
    return unavailable
  }
  return undefined
}

function awaitWithAbort<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'failed' }
> {
  return new Promise(resolve => {
    let completed = false
    const finish = (
      result:
        | { readonly kind: 'value'; readonly value: T }
        | { readonly kind: 'aborted' }
        | { readonly kind: 'failed' },
    ): void => {
      if (completed) return
      completed = true
      signal.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const onAbort = (): void => finish({ kind: 'aborted' })
    signal.addEventListener('abort', onAbort, { once: true })
    void work.then(
      value => finish({ kind: 'value', value }),
      () => finish({ kind: 'failed' }),
    )
    if (signal.aborted) onAbort()
  })
}

async function resolveEffect(
  initial: PositionedSubject,
  finals: readonly Conclusion[],
  chain: readonly RunnerPiece[],
  ports: RunnerPorts,
): Promise<{ readonly effect: RunnerEffect } | RunnerFailure> {
  for (const [index, value] of finals.entries()) {
    if (value.skipped !== 'unavailable' || value.unavailability !== 'fallback') continue
    const piece = chain[index]
    if (piece === undefined || piece.definition.name !== value.extension) return replayInconsistent
    if (piece.fallback === 'admission') return { effect: { kind: 'vetoed', by: value.extension } }
    if (piece.fallback === 'modality') {
      const before = composeEffect(initial, finals.slice(0, index))
      if ('invalidInput' in before || before.effect.kind !== 'proceed') return replayInconsistent
      const positioned = judgePositionedSubject({ ...initial, subject: before.effect.subject })
      if (!('ok' in positioned)) return replayInconsistent
      let needed: Awaited<ReturnType<RunnerPorts['fallbackNeedsProjection']>>
      try {
        needed = await ports.fallbackNeedsProjection(positioned.ok)
      } catch {
        return unavailable
      }
      if (typeof needed !== 'boolean') return unavailable
      if (needed) return { effect: { kind: 'vetoed', by: value.extension } }
    }
    if (piece.fallback === undefined) return replayInconsistent
  }
  const combined = composeEffect(initial, finals)
  return 'invalidInput' in combined ? replayInconsistent : combined
}

function failureIdentity(initial: PositionedSubject): Record<string, unknown> {
  if (initial.position === 'after_model_call' && 'dispatches' in initial.subject) {
    const first = initial.subject.dispatches[0]
    return first === undefined ? {} : { modelCallId: first.call }
  }
  if (initial.position === 'before_action') return { callId: initial.subject.call.callId }
  if (initial.position === 'after_action' && 'callId' in initial.subject)
    return { callId: initial.subject.callId }
  return {}
}

function policy(piece: RunnerPiece, position: PositionedSubject['position']): ErrorPolicy {
  const defaultPolicy: ErrorPolicy =
    piece.power === 'observe' ? 'ignore' : piece.power === 'rewrite' ? 'record' : 'treat_as_veto'
  const wanted = piece.onError ?? defaultPolicy
  if (piece.power === 'observe' && wanted !== 'ignore') return 'ignore'
  if (piece.power === 'rewrite' && wanted === 'treat_as_veto') return 'record'
  if (position === 'after_terminal') return 'ignore'
  return wanted
}

function errorOutput(
  effective: ErrorPolicy,
  position: PositionedSubject['position'],
  reminder?: SystemReminderMessage,
): ExtensionOutput {
  if (effective === 'ignore' || position === 'after_terminal') return { kind: 'observed' }
  if (effective === 'record')
    return reminder === undefined ? { kind: 'observed' } : { kind: 'inject', message: reminder }
  const before = [
    'before_persist_message',
    'before_compaction',
    'before_model_call',
    'before_action',
    'before_terminal',
  ].includes(position)
  return before
    ? { kind: 'veto', reason: 'Extension failed; treat_as_veto policy applied.' }
    : {
        kind: 'stop',
        terminal: 'failed',
        reason: 'Extension failed; treat_as_veto policy applied.',
      }
}

function fallbackPolicy(
  piece: RunnerPiece,
  position: PositionedSubject['position'],
): 'skip' | 'veto' | 'fallback' {
  if (piece.fallback !== undefined) return 'fallback'
  if (
    piece.definition.unavailability === 'veto' &&
    piece.power === 'veto' &&
    [
      'before_persist_message',
      'before_compaction',
      'before_model_call',
      'before_action',
      'before_terminal',
    ].includes(position)
  )
    return 'veto'
  return 'skip'
}

function sameAssociation(left: RunnerAskAssociation, right: RunnerAskAssociation): boolean {
  return (
    left.binding.session === right.binding.session &&
    left.binding.logGeneration === right.binding.logGeneration &&
    tenantIdEquals(left.binding.tenant, right.binding.tenant) &&
    left.piece === right.piece &&
    sameJson(left.pass, right.pass) &&
    sameJson(left.askEntry, right.askEntry) &&
    sameJson(left.askHistory, right.askHistory) &&
    sameJson(left.earlier, right.earlier) &&
    sameJson(left.subject, right.subject)
  )
}

function entryFromRecord(
  record: RunnerRecordResult,
  expected: string,
  pass: RunnerPass,
  piece: RunnerPiece,
  binding: RunnerLogBinding,
): Historical | RunnerFailure {
  if (record.kind === 'unknown' || record.kind === 'unavailable') return unavailable
  if (record.kind === 'invalidInput') return invalidInput
  if (record.kind === 'attemptSuperseded') return attemptSuperseded
  const inspected = inspectRunnerConclusion({
    session: binding.session,
    tenant: binding.tenant,
    entry: record.entry,
  })
  if (
    'invalid' in inspected ||
    'unrelated' in inspected ||
    record.entry.dedupeKey !== expected ||
    inspected.anchor !== pass.anchor ||
    inspected.conclusion.extension !== piece.definition.name ||
    inspected.conclusion.power !== piece.power ||
    !samePosition(pass.initial, inspected.conclusion) ||
    (pass.execution.kind === 'noRun' && inspected.execution.kind !== 'noRun') ||
    (pass.execution.kind === 'withRun' &&
      (inspected.execution.kind !== 'withRun' || inspected.execution.run !== pass.execution.run))
  )
    return replayInconsistent
  return {
    entry: record.entry,
    conclusion: inspected.conclusion,
    occurrence: inspected.occurrence,
    reminders: inspected.reminders,
  }
}

async function persistReminders(
  records: readonly Historical[],
  pass: RunnerPass,
  ports: RunnerPorts,
  signal: AbortSignal,
  nested: boolean,
): Promise<RunnerFailure | undefined> {
  if (nested) return undefined
  for (const record of records) {
    for (const reminder of record.reminders) {
      const stopped = checkControl(signal, ports)
      if (stopped !== undefined) return stopped
      let existing: RunnerReminderRead
      try {
        existing = await ports.reminders.inspect(reminder)
      } catch {
        return unavailable
      }
      if (existing.kind === 'same') continue
      if (existing.kind === 'conflict') return replayInconsistent
      if (existing.kind !== 'absent') return unavailable
      let chain: readonly RunnerPiece[] | { readonly unavailable: true }
      try {
        chain = await ports.reminders.nestedChain(reminder)
      } catch {
        return unavailable
      }
      if (!Array.isArray(chain)) return unavailable
      const nestedInitial = judgePositionedSubject({
        position: 'before_persist_message',
        subject: { message: reminder, producer: 'system' },
      })
      if ('rejected' in nestedInitial) return invalidInput
      const nestedResult = await runPassInternal(
        { initial: nestedInitial.ok, anchor: reminder.id, execution: pass.execution },
        chain,
        ports,
        signal,
        true,
      )
      if (isFailure(nestedResult)) return nestedResult
      if (nestedResult.effect.kind === 'vetoed') continue
      if (nestedResult.effect.kind !== 'proceed') return replayInconsistent
      const prior = checkControl(signal, ports)
      if (prior !== undefined) return prior
      let appended: RunnerReminderAppend
      try {
        appended = await ports.reminders.append(reminder, pass.execution)
      } catch {
        return unavailable
      }
      if (appended.kind === 'attemptSuperseded') return attemptSuperseded
      if (appended.kind === 'unknown' || appended.kind === 'unavailable') return unavailable
      if (appended.kind === 'alreadyRecorded') {
        let reread: RunnerReminderRead
        try {
          reread = await ports.reminders.inspect(reminder)
        } catch {
          return unavailable
        }
        if (reread.kind === 'conflict') return replayInconsistent
        if (reread.kind !== 'same') return unavailable
      }
    }
  }
  return undefined
}

/** Execute one pass against explicitly bound sources; no Cordis or hidden session state. */
export async function runPass(
  pass: RunnerPass,
  chain: readonly RunnerPiece[],
  ports: RunnerPorts,
  signal: AbortSignal,
): Promise<RunnerPassResult> {
  try {
    return await runPassInternal(pass, chain, ports, signal, false)
  } catch {
    // Port and disposer failures are control-source failures, never contributor onError input.
    return unavailable
  }
}

async function runPassInternal(
  pass: RunnerPass,
  chain: readonly RunnerPiece[],
  ports: RunnerPorts,
  signal: AbortSignal,
  nested: boolean,
): Promise<RunnerPassResult> {
  if (!validPorts(ports) || !(signal instanceof AbortSignal)) return invalidInput
  const passFailure = validatePass(pass, chain, nested)
  if (passFailure !== undefined) return passFailure
  const initialJudged = judgePositionedSubject(pass.initial)
  if (!('ok' in initialJudged)) return invalidInput
  let initial = initialJudged.ok
  const firstStop = checkControl(signal, ports)
  if (firstStop !== undefined) return firstStop
  let releaseFailure: (() => void) | undefined
  try {
    if (initial.position === 'after_model_call' && initial.dimension.ending === 'failure') {
      const verified = await ports.verifyFailure(initial, ports.binding)
      if (verified.kind !== 'verified')
        return verified.kind === 'invalidInput' ? invalidInput : unavailable
      const judged = judgePositionedSubject(verified.subject)
      if (!('ok' in judged) || !sameJson(initial, judged.ok)) {
        verified.release()
        return invalidInput
      }
      releaseFailure = verified.release
      initial = judged.ok
    }
    let read: ReadResult
    try {
      read = await ports.readConclusions(pass)
    } catch {
      return unavailable
    }
    const existing = readPassHistory(
      {
        initial: pass.initial,
        anchor: pass.anchor,
        ...(pass.execution.kind === 'withRun' ? { run: pass.execution.run } : {}),
      },
      chain,
      ports.binding,
      read,
    )
    if ('failure' in existing) return existing
    const history: Historical[] = [...existing]
    let index = 0
    let cursor = 0
    const finals: Conclusion[] = []
    while (index < chain.length) {
      const piece = chain[index]
      if (piece === undefined) return replayInconsistent
      const stopped = checkControl(signal, ports)
      if (stopped !== undefined) return stopped
      const thisPiece: Historical[] = []
      while (
        cursor < history.length &&
        history[cursor]?.conclusion.extension === piece.definition.name
      ) {
        const item = history[cursor]
        if (item === undefined) return replayInconsistent
        thisPiece.push(item)
        cursor++
      }
      const last = thisPiece.at(-1)
      if (last?.occurrence.kind === 'final') {
        finals.push(last.conclusion)
        const composed = await resolveEffect(initial, finals, chain, ports)
        if ('failure' in composed) return composed
        if (composed.effect.kind !== 'proceed') break
        index++
        continue
      }
      const subject = currentSubject(initial, finals)
      if (subject === null) return replayInconsistent
      let mode: RunnerInvocationMode = { kind: 'fresh' }
      if (last !== undefined) {
        if (last.occurrence.kind !== 'ask') return replayInconsistent
        const association: RunnerAskAssociation = {
          binding: ports.binding,
          pass,
          piece: piece.definition.name,
          askEntry: last.entry,
          askHistory: thisPiece.map(item => item.conclusion),
          earlier: finals,
          subject,
        }
        let state: RunnerAskState
        try {
          state = await ports.readAskState(association, signal)
        } catch {
          return unavailable
        }
        const afterWait = checkControl(signal, ports)
        if (afterWait !== undefined) {
          if (state.kind === 'ready') state.binding.release()
          return afterWait
        }
        if (state.kind === 'unavailable') return unavailable
        if (state.kind === 'replayInconsistent') return replayInconsistent
        if (state.kind === 'pending') {
          if (!sameAssociation(state.association, association)) return replayInconsistent
          const effective = [...finals, last.conclusion]
          const result = await resolveEffect(initial, effective, chain, ports)
          if ('failure' in result || result.effect.kind !== 'asked') return replayInconsistent
          const remindersFailure = await persistReminders(history, pass, ports, signal, nested)
          if (remindersFailure !== undefined) return remindersFailure
          return { conclusions: history.map(item => item.conclusion), effect: result.effect }
        }
        if (!sameAssociation(state.binding.association, association)) {
          state.binding.release()
          return replayInconsistent
        }
        if (
          !identity(state.binding.cardId) ||
          !identity(state.binding.batchId) ||
          !identity(state.binding.answerId)
        ) {
          state.binding.release()
          return unavailable
        }
        mode = { kind: 'replay', binding: state.binding }
      }
      try {
        let presence: Awaited<ReturnType<RunnerPorts['presence']>>
        try {
          presence = await ports.presence(piece)
        } catch {
          return unavailable
        }
        const afterPresence = checkControl(signal, ports)
        if (afterPresence !== undefined) return afterPresence
        if (presence === 'unavailable') return unavailable
        let candidateOutput: ExtensionOutput | undefined
        let candidateError:
          | {
              readonly error: string
              readonly classification?: 'ordinary' | 'nonzero_exit' | 'timeout' | 'bad_output'
            }
          | undefined
        let unavailablePiece = presence === 'absent'
        let input: ExtensionInput | undefined
        if (!unavailablePiece) {
          let handles: RunnerHandles | { readonly unavailable: true }
          try {
            handles = await ports.openHandles(piece, mode)
          } catch {
            return unavailable
          }
          if ('unavailable' in handles) return checkControl(signal, ports) ?? unavailable
          try {
            const afterHandles = checkControl(signal, ports)
            if (afterHandles !== undefined) return afterHandles
            const rawInput = {
              ...subject,
              earlier: finals,
              log: handles.log,
              environment: handles.environment,
              ...(subject.position === 'before_persist_message' || pass.execution.kind === 'noRun'
                ? {}
                : { run: pass.execution.run, attempt: pass.execution.attempt }),
            }
            const judged = judgeInput(rawInput)
            if (!('ok' in judged)) return invalidInput
            input = judged.ok
            let work: Promise<RunnerInvocationResult>
            try {
              work = ports.invoke(piece, judged.ok, signal, mode)
            } catch {
              return unavailable
            }
            const completion = await awaitWithAbort(work, signal)
            if (completion.kind === 'aborted') return cancelled
            if (completion.kind === 'failed') return unavailable
            const invoked = completion.value
            if (mode.kind === 'replay') {
              const control = mode.binding.control()
              if (control === 'replayInconsistent') return replayInconsistent
              if (control !== 'valid') return unavailable
            }
            const halted = checkControl(signal, ports)
            if (halted !== undefined) return halted
            if (invoked.kind === 'replayInconsistent') return replayInconsistent
            if (invoked.kind === 'controlUnavailable') return unavailable
            if (invoked.kind === 'notStartedUnavailable') unavailablePiece = true
            else if (invoked.kind === 'errored') candidateError = invoked
            else if (invoked.kind === 'output') {
              const output = judgeOutput(invoked.value)
              if ('rejected' in output) candidateError = { error: output.rejected }
              else candidateOutput = output.ok
            } else return unavailable
          } finally {
            handles.release()
          }
        }
        const at = ports.now()
        if (typeof at !== 'string') return unavailable
        const base = {
          extension: piece.definition.name,
          position: initial.position,
          ...(initial.dimension === undefined ? {} : { dimension: initial.dimension }),
          ...failureIdentity(initial),
          power: piece.power,
          at,
        }
        let reminders: SystemReminderMessage[] = []
        let rawConclusion: unknown
        if (unavailablePiece) {
          rawConclusion = {
            ...base,
            skipped: 'unavailable',
            unavailability: fallbackPolicy(piece, initial.position),
          }
        } else {
          if (candidateOutput !== undefined && input !== undefined) {
            let judged: ReturnType<typeof judgeConclusion>
            try {
              judged = judgeConclusion(
                { ...base, output: candidateOutput },
                {
                  input,
                  extensionName: piece.definition.name,
                },
              )
            } catch {
              return invalidInput
            }
            if ('rejected' in judged) candidateError = { error: judged.rejected }
            else {
              let capability: RunnerCapabilityResult
              try {
                capability = await ports.judgeCapabilities(input, candidateOutput)
              } catch {
                return unavailable
              }
              if (capability.kind === 'unavailable') return unavailable
              if (capability.kind === 'invalidInput') return invalidInput
              if (capability.kind === 'rejected') candidateError = { error: capability.reason }
              else {
                if (nested && candidateOutput.kind === 'inject')
                  candidateError = { error: 'output_not_allowed_at_position' }
                else if (candidateOutput.kind === 'inject') {
                  const readReminder = await ports.reminders.inspect(candidateOutput.message)
                  if (readReminder.kind === 'unavailable') return unavailable
                  if (readReminder.kind === 'conflict')
                    candidateError = { error: 'inject_message_id_conflict' }
                }
                if (candidateError === undefined) {
                  rawConclusion = judged.ok
                  if (candidateOutput.kind === 'inject') reminders = [candidateOutput.message]
                }
              }
            }
          }
          if (rawConclusion === undefined) {
            const effective =
              candidateError?.classification !== undefined &&
              candidateError.classification !== 'ordinary' &&
              piece.definition.implementation.kind === 'command'
                ? 'ignore'
                : policy(piece, initial.position)
            if (effective === 'record' && !nested && initial.position !== 'after_terminal') {
              const id = ports.mintReminder()
              if (typeof id !== 'string' || !identity(id)) return unavailable
              const proposed = judgeMessage({
                id,
                type: 'system_reminder',
                blocks: [
                  {
                    id: `${id}-text`,
                    kind: 'text',
                    text: 'Extension failed during this pass.',
                    visibility: { toHuman: true, toModel: true },
                  },
                ],
                createdAt: at,
                nature: 'event',
                source: { kind: 'extension', extension: piece.definition.name },
              })
              if (!('ok' in proposed) || proposed.ok.type !== 'system_reminder') return invalidInput
              reminders = [proposed.ok]
            }
            const output = errorOutput(effective, initial.position, reminders[0])
            rawConclusion = {
              ...base,
              skipped: 'errored',
              error: candidateError?.error ?? 'extension_execution_failed',
              output,
            }
          }
        }
        const conclusionJudged = judgeConclusionForCurrent(rawConclusion, subject, piece)
        if ('failure' in conclusionJudged) return conclusionJudged
        const finalOutput = conclusionJudged.conclusion.output
        if (
          finalOutput?.kind === 'ask' &&
          (initial.position === 'before_persist_message' || initial.position === 'after_terminal')
        )
          return invalidInput
        const occurrence: RunnerOccurrence =
          finalOutput?.kind === 'ask'
            ? {
                kind: 'ask',
                ordinal: ExactDecimal.from(
                  last?.occurrence.kind === 'ask' ? last.occurrence.ordinal : 0,
                )
                  .add(ExactDecimal.from(1))
                  .toJsonNumber(),
              }
            : { kind: 'final' }
        const prepared = prepareRunnerConclusion({
          session: ports.binding.session,
          tenant: ports.binding.tenant,
          execution: pass.execution,
          anchor: pass.anchor,
          occurrence,
          value: conclusionJudged.conclusion,
          reminders,
        })
        if ('invalidInput' in prepared) return invalidInput
        const keys = passKeys({
          position: initial.position,
          ...(initial.dimension === undefined ? {} : { dimension: initial.dimension }),
          anchor: pass.anchor,
          extension: piece.definition.name,
          occurrence,
          ...(initial.position === 'after_model_call' && 'dispatches' in initial.subject
            ? { modelCallId: initial.subject.dispatches[0]?.call }
            : {}),
        })
        if ('invalidInput' in keys) return invalidInput
        const expectedKey = occurrence.kind === 'ask' ? keys.ask : keys.final
        if (expectedKey === undefined) return invalidInput
        const beforeWrite = checkControl(signal, ports)
        if (beforeWrite !== undefined) return beforeWrite
        let work: Promise<RunnerRecordResult>
        try {
          work = ports.record(prepared.entry, pass.execution)
        } catch {
          return unavailable
        }
        const completion = await awaitWithAbort(work, signal)
        if (completion.kind === 'aborted') return cancelled
        if (completion.kind === 'failed') return unavailable
        const written = completion.value
        const recorded = entryFromRecord(written, expectedKey, pass, piece, ports.binding)
        if ('failure' in recorded) return recorded
        const afterWrite = checkControl(signal, ports)
        if (afterWrite !== undefined) return afterWrite
        if (recorded.occurrence.kind === 'ask') {
          if (
            last?.occurrence.kind === 'ask' &&
            ExactDecimal.from(recorded.occurrence.ordinal).compare(
              ExactDecimal.from(last.occurrence.ordinal),
            ) <= 0
          )
            return replayInconsistent
          history.push(recorded)
          const effective = [...finals, recorded.conclusion]
          const effect = await resolveEffect(initial, effective, chain, ports)
          if ('failure' in effect || effect.effect.kind !== 'asked') return replayInconsistent
          const reminderFailure = await persistReminders(history, pass, ports, signal, nested)
          if (reminderFailure !== undefined) return reminderFailure
          return { conclusions: history.map(item => item.conclusion), effect: effect.effect }
        }
        if (recorded.occurrence.kind !== 'final') return replayInconsistent
        history.push(recorded)
        finals.push(recorded.conclusion)
        const effect = await resolveEffect(initial, finals, chain, ports)
        if ('failure' in effect) return effect
        if (effect.effect.kind !== 'proceed') break
        index++
      } finally {
        if (mode.kind === 'replay') mode.binding.release()
      }
    }
    if (cursor !== existing.length) return replayInconsistent
    const effect = await resolveEffect(initial, finals, chain, ports)
    if ('failure' in effect) return effect
    const reminderFailure = await persistReminders(history, pass, ports, signal, nested)
    if (reminderFailure !== undefined) return reminderFailure
    return { conclusions: history.map(item => item.conclusion), effect: effect.effect }
  } finally {
    releaseFailure?.()
  }
}
