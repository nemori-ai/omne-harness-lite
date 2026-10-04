import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime-local'
import { inspectModelLogEntry } from '@omne-harness-lite/model-request-runtime-local'
import type { LogPrefixView, SystemReminderMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import {
  judgeConclusionForSubject,
  type PositionedSubject,
} from '@omne-harness-lite/loop-extension'
import {
  checkAppendInput,
  type LogEntry,
  type LogEntryInput,
} from '@omne-harness-lite/session-log-jsonl'
import { inspectRunnerConclusion } from './conclusion-codec.ts'

export interface RunnerLogBinding {
  readonly session: string
  readonly tenant: LogEntryInput['tenant']
  /** Identifies the physical log owner whose work this task owner retains. */
  readonly logGeneration: string
}

interface CandidateBase {
  readonly binding: RunnerLogBinding
  readonly entry: LogEntryInput
}

export interface RunnerConclusionCandidate extends CandidateBase {
  readonly kind?: 'conclusion'
  readonly subject: PositionedSubject
}

export interface RunnerReminderCandidate extends CandidateBase {
  readonly kind: 'reminder'
  readonly message: SystemReminderMessage
  readonly messagePrefix: LogPrefixView
}

export type RunnerAppendCandidate = RunnerConclusionCandidate | RunnerReminderCandidate

export type RunnerRecoveryResult =
  | { readonly kind: 'same'; readonly entry: LogEntry }
  | { readonly kind: 'winner'; readonly entry: LogEntry }
  | { readonly kind: 'absent' }
  | { readonly kind: 'replayInconsistent' }
  | { readonly kind: 'unavailable' }

export interface RunnerRecoveredLog {
  /** This closure is supplied only after the old physical log has stopped and recovery admitted. */
  readonly binding: RunnerLogBinding
  readonly readByKey: (key: string) => Promise<readonly LogEntry[] | { readonly unavailable: true }>
}

export interface RunnerTaskOwner {
  readonly start: <T>(task: {
    readonly kind: 'read' | 'append'
    readonly candidate?: RunnerAppendCandidate
    readonly execute: () => Promise<T>
    readonly unknown?: (result: T) => boolean
  }) => { readonly completion: Promise<T> } | { readonly unavailable: true }
  readonly hasUnknown: (binding: RunnerLogBinding, passKey?: string) => boolean
  readonly closeAdmission: () => void
  readonly drain: () => Promise<void>
  readonly reconcileStoppedLog: (
    recovered: RunnerRecoveredLog,
  ) => Promise<readonly RunnerRecoveryResult[] | { readonly unavailable: true }>
}

interface UnknownTask {
  readonly candidate: RunnerAppendCandidate
  readonly settle: () => void
}

function sameBinding(left: RunnerLogBinding, right: RunnerLogBinding): boolean {
  return (
    left.session === right.session &&
    left.logGeneration === right.logGeneration &&
    modelLogJsonEqual(left.tenant, right.tenant)
  )
}

/** The actual log host owns this object until physical stop, recovery, and drain finish. */
export function createRunnerTaskOwner(binding: RunnerLogBinding): RunnerTaskOwner {
  const session = parseOpaqueIdentifier(binding.session, 'SessionRef')
  if (!('ok' in session)) throw new TypeError('Invalid runner task owner session binding')
  const sessionRef = session.ok
  let admitting = true
  const active = new Set<Promise<unknown>>()
  const unknown = new Set<UnknownTask>()
  const drainWaiters = new Set<() => void>()
  const notifyDrain = (): void => {
    if (active.size !== 0 || unknown.size !== 0) return
    for (const resolve of drainWaiters) resolve()
    drainWaiters.clear()
  }
  return Object.freeze({
    start<T>(task: {
      readonly kind: 'read' | 'append'
      readonly candidate?: RunnerAppendCandidate
      readonly execute: () => Promise<T>
      readonly unknown?: (result: T) => boolean
    }): { readonly completion: Promise<T> } | { readonly unavailable: true } {
      if (
        !admitting ||
        (task.kind === 'append' && task.candidate === undefined) ||
        (task.kind === 'read' && task.candidate !== undefined)
      )
        return { unavailable: true }
      if (task.candidate !== undefined && !sameBinding(binding, task.candidate.binding))
        return { unavailable: true }
      // Register the lifetime before executing user/provider code.
      let resolveStarted: (() => void) | undefined
      const started = new Promise<void>(resolve => {
        resolveStarted = resolve
      })
      const completion = started.then(task.execute)
      active.add(completion)
      const retainUnknown = (): void => {
        if (task.candidate === undefined) return
        let settle: (() => void) | undefined
        const retained = new Promise<void>(resolve => {
          settle = resolve
        })
        if (settle === undefined) return
        unknown.add({ candidate: task.candidate, settle })
        active.add(retained)
        void retained.then(() => {
          active.delete(retained)
          notifyDrain()
        })
      }
      const observed = completion.then(
        result => {
          let unresolved = false
          try {
            unresolved = task.unknown?.(result) ?? false
          } catch {
            // A failed receipt classifier cannot release a possibly committed candidate.
            unresolved = true
          }
          if (unresolved) retainUnknown()
          active.delete(completion)
          notifyDrain()
        },
        () => {
          retainUnknown()
          active.delete(completion)
          notifyDrain()
        },
      )
      // The owner observes both branches even when the caller stops waiting.
      void observed
      resolveStarted?.()
      return { completion }
    },
    hasUnknown(searched: RunnerLogBinding, passKey?: string): boolean {
      if (!sameBinding(binding, searched)) return true
      for (const task of unknown) {
        if (
          passKey === undefined ||
          task.candidate.entry.readKeys.includes(passKey) ||
          task.candidate.entry.dedupeKey === passKey
        )
          return true
      }
      return false
    },
    closeAdmission(): void {
      admitting = false
    },
    drain(): Promise<void> {
      if (active.size === 0 && unknown.size === 0) return Promise.resolve()
      return new Promise(resolve => drainWaiters.add(resolve))
    },
    async reconcileStoppedLog(
      recovered: RunnerRecoveredLog,
    ): Promise<readonly RunnerRecoveryResult[] | { readonly unavailable: true }> {
      if (admitting || !sameBinding(binding, recovered.binding)) return { unavailable: true }
      const results: RunnerRecoveryResult[] = []
      for (const task of [...unknown]) {
        const candidate = task.candidate
        const key = candidate.entry.dedupeKey
        if (key === undefined) return { unavailable: true }
        let read: readonly LogEntry[] | { readonly unavailable: true }
        try {
          read = await recovered.readByKey(key)
        } catch {
          return { unavailable: true }
        }
        if (!Array.isArray(read)) return { unavailable: true }
        if (read.length > 1) return { unavailable: true }
        const actual = read[0]
        if (actual === undefined) {
          results.push({ kind: 'absent' })
        } else {
          results.push(recoverCandidate(candidate, actual, key, binding, sessionRef))
        }
        unknown.delete(task)
        task.settle()
      }
      notifyDrain()
      return Object.freeze(results)
    },
  })
}

function recoverCandidate(
  candidate: RunnerAppendCandidate,
  actual: LogEntry,
  key: string,
  binding: RunnerLogBinding,
  sessionRef: LogEntry['session'],
): RunnerRecoveryResult {
  const checked = checkAppendInput(
    sessionRef,
    [candidate.entry],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  const owned = 'ok' in checked ? checked.ok.entries[0] : undefined
  if (owned === undefined) {
    return { kind: 'replayInconsistent' }
  }
  const candidateEntry: LogEntry = {
    ...owned,
    session: sessionRef,
    position: actual.position,
  }
  if (candidate.kind === 'reminder')
    return recoverReminder(candidate, candidateEntry, actual, key, binding)
  return recoverConclusion(candidate, candidateEntry, actual, key, binding)
}

function recoverReminder(
  candidate: RunnerReminderCandidate,
  candidateEntry: LogEntry,
  actual: LogEntry,
  key: string,
  binding: RunnerLogBinding,
): RunnerRecoveryResult {
  const candidateInspected = inspectModelLogEntry({
    session: binding.session,
    tenant: binding.tenant,
    entry: candidateEntry,
    purpose: { kind: 'message' },
    messagePrefix: candidate.messagePrefix,
  })
  const inspected = inspectModelLogEntry({
    session: binding.session,
    tenant: binding.tenant,
    entry: actual,
    purpose: { kind: 'message' },
    messagePrefix: candidate.messagePrefix,
  })
  const { session: _session, position: _position, ...actualInput } = actual
  return 'invalidValue' in candidateInspected ||
    'invalidValue' in inspected ||
    actual.dedupeKey !== key ||
    !modelLogJsonEqual(inspected.ok.captured.message, candidate.message) ||
    !modelLogJsonEqual(actualInput, candidate.entry)
    ? { kind: 'replayInconsistent' }
    : { kind: 'same', entry: actual }
}

function recoverConclusion(
  candidate: RunnerConclusionCandidate,
  candidateEntry: LogEntry,
  actual: LogEntry,
  key: string,
  binding: RunnerLogBinding,
): RunnerRecoveryResult {
  const candidateInspected = inspectRunnerConclusion({
    session: binding.session,
    tenant: binding.tenant,
    entry: candidateEntry,
  })
  const inspected = inspectRunnerConclusion({
    session: binding.session,
    tenant: binding.tenant,
    entry: actual,
  })
  if (
    'invalid' in candidateInspected ||
    'unrelated' in candidateInspected ||
    'invalid' in inspected ||
    'unrelated' in inspected ||
    actual.dedupeKey !== key ||
    actual.run !== candidateEntry.run ||
    inspected.conclusion.callId !== candidateInspected.conclusion.callId ||
    inspected.conclusion.modelCallId !== candidateInspected.conclusion.modelCallId
  )
    return { kind: 'replayInconsistent' }
  else {
    let admitted: ReturnType<typeof judgeConclusionForSubject>
    try {
      admitted = judgeConclusionForSubject(inspected.conclusion, {
        positionedSubject: candidate.subject,
        extensionName: candidateInspected.conclusion.extension,
      })
    } catch {
      return { kind: 'replayInconsistent' }
    }
    if (!('ok' in admitted)) {
      return { kind: 'replayInconsistent' }
    }
    const { session: _session, position: _position, ...actualInput } = actual
    return modelLogJsonEqual(actualInput, candidate.entry)
      ? { kind: 'same', entry: actual }
      : { kind: 'winner', entry: actual }
  }
}
