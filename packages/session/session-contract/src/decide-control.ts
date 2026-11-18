import type { SessionFailure } from './faces.ts'
import type { SessionCommand } from './ports.ts'
import type { ProducerRef, WorkSnapshot } from './values.ts'
import type { BackgroundCallRecord } from './background-calls.ts'
import type { Decision } from './judgments.ts'
import { resolveControlScope } from './judgments.ts'
import { decideControl } from './decide-management.ts'
import { invalid, rejected } from './decision-support.ts'
import type { DecideReads } from './judgments.ts'
import { decideRetryRun } from './decide-retry.ts'
import { backgroundRecordOf, withStopReminder } from './background-outcome.ts'
import { equalValue } from './session-validation.ts'

const REASON_MAX_CHARS = 500

export function decideNamedControl(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'cancelRun' | 'stopCall' | 'retryRun' }>,
  reads: DecideReads,
): Decision {
  if (command.kind === 'retryRun') return decideRetryRun(snapshot, command, reads)
  return command.kind === 'cancelRun'
    ? decideCancelRun(snapshot, command, reads)
    : decideStopCall(snapshot, command, reads)
}

const unknownLookup = (what: string): Decision =>
  rejected({
    kind: 'unavailable',
    owner: 'session-history',
    diagnostic: `${what} is missing or does not cover this snapshot`,
  })

const CANCEL_KINDS: ReadonlySet<SessionFailure['kind']> = new Set([
  'denied',
  'invalid',
  'conflict',
  'commit-unknown',
  'unavailable',
  'quarantined',
])
const STOP_KINDS: ReadonlySet<SessionFailure['kind']> = new Set([...CANCEL_KINDS, 'unsupported'])

export function closeControlFailure(decision: Decision, command: SessionCommand): Decision {
  if (command.kind !== 'cancelRun' && command.kind !== 'stopCall') return decision
  const allowed = command.kind === 'cancelRun' ? CANCEL_KINDS : STOP_KINDS
  if (decision.kind !== 'rejected' || allowed.has(decision.failure.kind)) return decision
  return rejected({
    kind: 'unavailable',
    owner: '@omne-harness/session-contract',
    diagnostic: `${command.kind}: the state answers ${decision.failure.kind}, which is outside the failure set`,
  })
}

export function decideCancelRun(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'cancelRun' }>,
  reads: DecideReads,
): Decision {
  const { run, urgency, operation } = command.input
  if (typeof run !== 'string' || run.length === 0)
    return invalid('run', 'empty or not a Run identity')
  if (urgency !== 'graceful' && urgency !== 'force')
    return invalid('urgency', 'not a registered urgency')
  const found = (reads.runs ?? []).filter(item => item.run === run)
  const [lookup] = found
  if (found.length !== 1 || lookup === undefined) return unknownLookup('the Run lookup')
  if (lookup.kind === 'absent') {
    if (lookup.covered !== snapshot.revision) return unknownLookup('the Run lookup')
    return { kind: 'control-answer', answer: { kind: 'not-found' }, source: snapshot.source }
  }
  if (lookup.terminal !== null)
    return {
      kind: 'control-answer',
      answer: { kind: 'ended', terminal: lookup.terminal },
      source: lookup.terminal.evidence,
    }
  const intent = { kind: 'control', value: { kind: 'cancel-run', run, urgency } } as const
  if (resolveControlScope(snapshot, intent).kind === 'terminal')
    return unknownLookup('the Run lookup (the snapshot holds a terminal that the lookup lacks)')
  return decideControl(snapshot, intent, operation, reads)
}

// The call as the lookup knows it: unknown until the lookup covers this snapshot.
function lookupStop(snapshot: WorkSnapshot, producer: ProducerRef, reads: DecideReads) {
  const found = (reads.calls ?? []).filter(
    item => item.producer.kind === producer.kind && item.producer.call === producer.call,
  )
  const [lookup] = found
  if (found.length !== 1 || lookup === undefined) return unknownLookup('the call lookup')
  if (lookup.kind === 'absent')
    return lookup.covered !== snapshot.revision
      ? unknownLookup('the call lookup')
      : ({
          kind: 'control-answer',
          answer: { kind: 'not-found' },
          source: snapshot.source,
        } as const)
  if (lookup.terminal === null) return null
  return {
    kind: 'control-answer',
    answer: { kind: 'ended', terminal: lookup.terminal },
    source: lookup.terminal.source,
  } as const
}

function reasonFailure(reason: unknown): Decision | null {
  if (reason === null) return null
  if (typeof reason !== 'string' || reason.trim() === '')
    return invalid('reason', 'empty or not text')
  return [...reason].length > REASON_MAX_CHARS
    ? invalid('reason', `longer than ${REASON_MAX_CHARS} characters`)
    : null
}

// A second stop of a call in the background answers the first one (SW-I17).
function earlierStop(snapshot: WorkSnapshot, placed: BackgroundCallRecord | null): Decision | null {
  const earlier = placed?.stop
  const original = snapshot.controls.find(item => item.operation === earlier?.operation)
  return original === undefined
    ? null
    : {
        kind: 'control-answer',
        answer: { kind: 'requested', progress: original },
        source: snapshot.source,
      }
}

export function decideStopCall(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'stopCall' }>,
  reads: DecideReads,
): Decision {
  const { producer, operation } = command.input
  if (producer.kind !== 'model' && producer.kind !== 'tool')
    return invalid('producer.kind', 'not a registered producer kind')
  if (typeof producer.call !== 'string' || producer.call.length === 0)
    return invalid('producer.call', 'empty or not a call identity')
  const known = lookupStop(snapshot, producer, reads)
  if (known !== null) return known
  const reason = command.input.reason ?? null
  const refused = reasonFailure(reason)
  if (refused !== null) return refused
  const record = (snapshot.backgroundCalls ?? []).find(item => equalValue(item.producer, producer))
  const placed = record === undefined ? null : backgroundRecordOf(snapshot, record.consumption)
  const answered = earlierStop(snapshot, placed)
  if (answered !== null) return answered
  const initiator = command.input.initiator ?? 'user'
  const value = { kind: 'stop-call', producer, initiator, reason } as const
  const decision = decideControl(snapshot, { kind: 'control', value }, operation, reads)
  if (decision.kind !== 'entries' || placed === null || initiator !== 'user') return decision
  return withStopReminder(
    decision,
    snapshot,
    placed,
    { initiator, reason, operation },
    reads.intake,
  )
}
