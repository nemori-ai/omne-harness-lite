// The pure rules of the two named controls (SPEC「XC-INTERRUPT」). They read the lookups that the
// provider fills inside the commit transaction; a missing or stale item is unknown (FR-01), never
// absence. The answers that need no entry are `control-answer` decisions; a live target goes through
// the same `resolveControlScope`/`decideControl` as the older `control`.
import type { SessionFailure } from './faces.ts'
import type { SessionCommand } from './ports.ts'
import type { WorkSnapshot } from './values.ts'
import type { Decision } from './judgments.ts'
import { resolveControlScope } from './judgments.ts'
import { decideControl } from './decide-management.ts'
import { rejected } from './decision-support.ts'
import type { DecideReads } from './judgments.ts'

const unknownLookup = (what: string): Decision =>
  rejected({
    kind: 'unavailable',
    owner: 'session-history',
    diagnostic: `${what} is missing or does not cover this snapshot`,
  })

/** The failures that `cancelRun` and `stopCall` may return; every other kind is an unknown state here. */
const CANCEL_KINDS: ReadonlySet<SessionFailure['kind']> = new Set([
  'denied',
  'invalid',
  'conflict',
  'commit-unknown',
  'unavailable',
  'quarantined',
])
const STOP_KINDS: ReadonlySet<SessionFailure['kind']> = new Set([...CANCEL_KINDS, 'unsupported'])

/** Keeps the failure set of the two controls closed: an outside kind is an unknown state, not a new answer. */
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

export function decideStopCall(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'stopCall' }>,
  reads: DecideReads,
): Decision {
  const { producer, operation } = command.input
  const found = (reads.calls ?? []).filter(
    item => item.producer.kind === producer.kind && item.producer.call === producer.call,
  )
  const [lookup] = found
  if (found.length !== 1 || lookup === undefined) return unknownLookup('the call lookup')
  if (lookup.kind === 'absent') {
    if (lookup.covered !== snapshot.revision) return unknownLookup('the call lookup')
    return { kind: 'control-answer', answer: { kind: 'not-found' }, source: snapshot.source }
  }
  if (lookup.terminal !== null)
    return {
      kind: 'control-answer',
      answer: { kind: 'ended', terminal: lookup.terminal },
      source: lookup.terminal.source,
    }
  const intent = { kind: 'control', value: { kind: 'stop-call', producer } } as const
  return decideControl(snapshot, intent, operation, reads)
}
