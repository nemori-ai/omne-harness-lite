import {
  checkAppendInput,
  type LogEntry,
  type LogEntryInput,
  type SessionLog,
} from '@omne-harness-lite/session-log-jsonl'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import {
  judgeConclusionForSubject,
  type PositionedSubject,
} from '@omne-harness-lite/loop-extension'
import { passKeys } from './keys.ts'
import { inspectRunnerConclusion } from './conclusion-codec.ts'
import type { RunnerExecution } from './conclusion-codec.ts'
import type { RunnerPass, RunnerPorts, RunnerRecordResult } from './run-pass.ts'
import type { RunnerLogBinding, RunnerTaskOwner } from './task-owner.ts'

export interface RunnerLogAdapter {
  readonly binding: RunnerLogBinding
  readonly readConclusions: RunnerPorts['readConclusions']
  readonly record: RunnerPorts['record']
}

/** Bind the public runner to one SL3 log generation; the host retains the task owner. */
export function createRunnerLogAdapter(input: {
  readonly log: SessionLog
  readonly binding: RunnerLogBinding
  readonly owner: RunnerTaskOwner
  /** Bound by this invocation's host to the original subject for each proposed conclusion. */
  readonly subjectForCandidate: (
    entry: LogEntryInput,
  ) => PositionedSubject | { readonly unavailable: true }
}): RunnerLogAdapter {
  const { log, binding, owner, subjectForCandidate } = input
  const session = parseOpaqueIdentifier(binding.session, 'SessionRef')
  if (!('ok' in session)) throw new TypeError('Invalid runner log session binding')
  const sessionRef = session.ok
  async function readConclusions(pass: RunnerPass) {
    const keys = passKeys({
      position: pass.initial.position,
      ...(pass.initial.dimension === undefined ? {} : { dimension: pass.initial.dimension }),
      anchor: pass.anchor,
    })
    if ('invalidInput' in keys) return { failure: 'invalidInput' } as const
    if (owner.hasUnknown(binding, keys.pass)) return { failure: 'unavailable' } as const
    const started = owner.start({
      kind: 'read',
      execute: () => log.readByKey(sessionRef, keys.pass),
    })
    if ('unavailable' in started) return { failure: 'unavailable' } as const
    try {
      return await started.completion
    } catch {
      return { failure: 'unavailable' } as const
    }
  }

  async function readWinner(key: string): Promise<LogEntry | undefined> {
    const started = owner.start({
      kind: 'read',
      execute: () => log.readByKey(sessionRef, key),
    })
    if ('unavailable' in started) return undefined
    try {
      const read = await started.completion
      return 'entries' in read && read.entries.length === 1 ? read.entries[0] : undefined
    } catch {
      return undefined
    }
  }

  async function record(
    entry: LogEntryInput,
    execution: RunnerExecution,
  ): Promise<RunnerRecordResult> {
    const key = entry.dedupeKey
    if (key === undefined) return { kind: 'invalidInput' }
    let subject: PositionedSubject | { readonly unavailable: true }
    try {
      subject = subjectForCandidate(entry)
    } catch {
      return { kind: 'unavailable' }
    }
    if ('unavailable' in subject) return { kind: 'unavailable' }
    const checked = checkAppendInput(
      sessionRef,
      [entry],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    const owned = 'ok' in checked ? checked.ok.entries[0] : undefined
    if (owned === undefined) return { kind: 'invalidInput' }
    const inspected = inspectRunnerConclusion({
      session: binding.session,
      tenant: binding.tenant,
      entry: { ...owned, session: sessionRef, position: 1 },
    })
    if ('invalid' in inspected || 'unrelated' in inspected) return { kind: 'invalidInput' }
    const admitted = judgeConclusionForSubject(inspected.conclusion, {
      positionedSubject: subject,
      extensionName: inspected.conclusion.extension,
    })
    if (!('ok' in admitted)) return { kind: 'invalidInput' }
    const started = owner.start({
      kind: 'append',
      candidate: { binding, entry, subject },
      execute: () =>
        log.append(
          sessionRef,
          [entry],
          execution.kind === 'withRun'
            ? { kind: 'fenced', run: execution.run, attempt: execution.attempt }
            : { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      unknown: result => 'failure' in result && result.failure === 'unavailable',
    })
    if ('unavailable' in started) return { kind: 'unavailable' }
    let result: Awaited<typeof started.completion>
    try {
      result = await started.completion
    } catch {
      return { kind: 'unknown' }
    }
    if ('failure' in result) {
      if (result.failure === 'unavailable') return { kind: 'unknown' }
      if (result.failure === 'attemptSuperseded') return { kind: 'attemptSuperseded' }
      if (result.failure === 'alreadyRecorded') {
        const winner = await readWinner(key)
        return winner === undefined
          ? { kind: 'unavailable' }
          : { kind: 'alreadyRecorded', entry: winner }
      }
      return result.failure === 'invalidInput' || result.failure === 'tenantMismatch'
        ? { kind: 'invalidInput' }
        : { kind: 'unavailable' }
    }
    const entryAtPosition = await readWinner(key)
    return entryAtPosition === undefined
      ? { kind: 'unavailable' }
      : { kind: 'confirmed', entry: entryAtPosition }
  }

  return Object.freeze({ binding, readConclusions, record })
}
