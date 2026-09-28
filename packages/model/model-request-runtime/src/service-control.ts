import type { CallHistoryResult } from './call-history.ts'
import type { CallOperationState } from './service-types.ts'
import type { DispatchGuardPhase } from './dispatch-guard.ts'

/** A complete owned prefix is authoritative; local state only supplies a never-dispatched call
 * and the in-process unpersisted reply which the log cannot yet describe. */
export interface ControlFacts {
  readonly durable:
    | {
        readonly phase: Exclude<DispatchGuardPhase, 'open' | 'reply_pending'>
        readonly intentExists: boolean
      }
    | { readonly absent: true }
    | { readonly unavailable: true }
  readonly operation?: Pick<CallOperationState, 'phase'>
  readonly localCall: boolean
}

/** Project only already-validated history; this does not authorize a raw log or infer a Run. */
export function controlFactsFromHistory(
  history: CallHistoryResult,
  localCall: boolean,
  operation?: Pick<CallOperationState, 'phase'>,
): ControlFacts {
  let durable: ControlFacts['durable']
  if ('unavailable' in history) durable = { unavailable: true }
  else if ('absent' in history) durable = { absent: true }
  else if (history.known.phase === null) durable = { unavailable: true }
  else durable = { phase: history.known.phase, intentExists: history.known.intent !== null }
  return { durable, localCall, ...(operation === undefined ? {} : { operation }) }
}

export type InterruptAdmission =
  | { readonly stage: 'before_dispatch' | 'in_flight' | 'speaking'; readonly intentExists: boolean }
  | { readonly rejected: 'callNotFound' | 'alreadyEnded' | 'unavailable' }

export type ReleaseAdmission =
  | { readonly allowed: true }
  | { readonly rejected: 'callNotFound' | 'alreadyEnded' | 'unavailable' }
  | { readonly wrongPhase: DispatchGuardPhase }

function phase(facts: ControlFacts): DispatchGuardPhase | 'absent' | 'unknown' {
  const durable = facts.durable
  if ('unavailable' in durable) return 'unknown'
  if ('absent' in durable) return facts.localCall ? 'open' : 'absent'
  if (
    durable.phase !== 'complete' &&
    durable.phase !== 'handed_up' &&
    durable.phase !== 'interrupted' &&
    facts.operation?.phase === 'reply_pending'
  )
    return 'reply_pending'
  return durable.phase
}

/** RT7 S-31: terminal and reply-pending facts win before an existing intent. */
export function classifyInterrupt(facts: ControlFacts): InterruptAdmission {
  const current = phase(facts)
  if (current === 'absent') return { rejected: 'callNotFound' }
  if (current === 'unknown') return { rejected: 'unavailable' }
  if (
    current === 'complete' ||
    current === 'handed_up' ||
    current === 'interrupted' ||
    current === 'reply_pending'
  )
    return { rejected: 'alreadyEnded' }
  const intentExists = 'intentExists' in facts.durable && facts.durable.intentExists
  if (current === 'in_flight' || current === 'speaking') return { stage: current, intentExists }
  return { stage: 'before_dispatch', intentExists }
}

/** RT7 S-32: release only a settled failed or reconciled resumable call. */
export function classifyRelease(facts: ControlFacts): ReleaseAdmission {
  const current = phase(facts)
  if (current === 'absent') return { rejected: 'callNotFound' }
  if (current === 'unknown') return { rejected: 'unavailable' }
  if (current === 'complete' || current === 'handed_up' || current === 'interrupted')
    return { rejected: 'alreadyEnded' }
  if (current !== 'awaiting_decision' && current !== 'resumable') return { wrongPhase: current }
  return { allowed: true }
}
