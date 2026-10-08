import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import {
  validate as loopShape,
  type FailureCause,
  type RetryPlan,
} from '@omne-harness-lite/loop-extension'
import {
  validate as profileShape,
  type ModelProfileSnapshot,
} from '@omne-harness-lite/model-profile'
import type { ModelCallId } from '@omne-harness-lite/call-accounts'

/** Explicit availability of caller-owned facts, never a default or a durable record. */
export type DispatchGuardFact<T> = { readonly known: T } | { readonly unknown: true }

/** RT4 S-6. This is a projection of the caller's current authoritative facts. */
export type DispatchGuardPhase =
  | 'open'
  | 'in_flight'
  | 'speaking'
  | 'reply_pending'
  | 'awaiting_decision'
  | 'resumable'
  | 'complete'
  | 'handed_up'
  | 'interrupted'

export interface DispatchGuardCallFacts {
  readonly session: string
  readonly callId: ModelCallId
  readonly phase: DispatchGuardFact<DispatchGuardPhase>
}

export interface DispatchGuardDispatchFacts {
  readonly session: string
  readonly callId: ModelCallId
  /** All dispatches of this call, including earlier attempts; no local filtering. */
  readonly opened: readonly DispatchGuardFact<boolean>[]
}

export interface DispatchGuardInput {
  readonly session: string
  readonly callId: ModelCallId
  /** known:null means the call is known not to exist in this session. */
  readonly call: DispatchGuardFact<DispatchGuardCallFacts | null>
  readonly dispatches: DispatchGuardFact<DispatchGuardDispatchFacts>
  readonly latestFailure: DispatchGuardFact<FailureCause>
  readonly snapshot: DispatchGuardFact<ModelProfileSnapshot>
  readonly plan: RetryPlan
}

export type DispatchGuardResult =
  | { readonly allowed: true }
  | {
      readonly refused: {
        readonly why: 'already_spoke' | 'fact_class' | 'provider_not_allowed'
      }
    }
  | { readonly rejected: 'invalidInput' | 'callNotFound' | 'alreadyEnded' | 'unavailable' }
  | { readonly rejected: 'wrongPhase'; readonly phase: DispatchGuardPhase }

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function members(value: Readonly<Record<string, unknown>>, names: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === names.length && keys.every(key => names.includes(key))
}

function identifier(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'dispatchGuard')
}

function phase(value: unknown): value is DispatchGuardPhase {
  return (
    value === 'open' ||
    value === 'in_flight' ||
    value === 'speaking' ||
    value === 'reply_pending' ||
    value === 'awaiting_decision' ||
    value === 'resumable' ||
    value === 'complete' ||
    value === 'handed_up' ||
    value === 'interrupted'
  )
}

function fact<T>(
  value: unknown,
  check: (value: unknown) => value is T,
): value is DispatchGuardFact<T> {
  return (
    object(value) &&
    ((members(value, ['unknown']) && value.unknown === true) ||
      (members(value, ['known']) && check(value.known)))
  )
}

function call(value: unknown): value is DispatchGuardCallFacts | null {
  return (
    value === null ||
    (object(value) &&
      members(value, ['session', 'callId', 'phase']) &&
      identifier(value.session) &&
      identifier(value.callId) &&
      fact(value.phase, phase))
  )
}

function opened(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function dispatches(value: unknown): value is DispatchGuardDispatchFacts {
  return (
    object(value) &&
    members(value, ['session', 'callId', 'opened']) &&
    identifier(value.session) &&
    identifier(value.callId) &&
    Array.isArray(value.opened) &&
    value.opened.every(item => fact(item, opened))
  )
}

function failure(value: unknown): value is FailureCause {
  return loopShape('FailureCause', value).valid
}

function snapshot(value: unknown): value is ModelProfileSnapshot {
  return profileShape('ModelProfileSnapshot', value).valid
}

function input(value: unknown): value is DispatchGuardInput {
  return (
    object(value) &&
    members(value, [
      'session',
      'callId',
      'call',
      'dispatches',
      'latestFailure',
      'snapshot',
      'plan',
    ]) &&
    identifier(value.session) &&
    identifier(value.callId) &&
    fact(value.call, call) &&
    fact(value.dispatches, dispatches) &&
    fact(value.latestFailure, failure) &&
    fact(value.snapshot, snapshot) &&
    loopShape('RetryPlan', value.plan).valid
  )
}

function rejected(
  rejected: 'invalidInput' | 'callNotFound' | 'alreadyEnded' | 'unavailable',
): DispatchGuardResult {
  return Object.freeze({ rejected })
}

function refused(
  why: 'already_spoke' | 'fact_class' | 'provider_not_allowed',
): DispatchGuardResult {
  return Object.freeze({ refused: Object.freeze({ why }) })
}

function callPhase(
  call: DispatchGuardInput['call'],
  session: string,
  callId: ModelCallId,
): DispatchGuardPhase | DispatchGuardResult {
  if ('unknown' in call) return rejected('unavailable')
  const current = call.known
  if (current === null || current.session !== session || current.callId !== callId)
    return rejected('callNotFound')
  if ('unknown' in current.phase) return rejected('unavailable')
  const currentPhase = current.phase.known
  if (
    currentPhase === 'complete' ||
    currentPhase === 'handed_up' ||
    currentPhase === 'interrupted' ||
    currentPhase === 'reply_pending'
  )
    return rejected('alreadyEnded')
  return currentPhase
}

function historyRejection(
  dispatches: DispatchGuardInput['dispatches'],
  currentPhase: DispatchGuardPhase,
): DispatchGuardResult | undefined {
  if ('unknown' in dispatches) return rejected('unavailable')
  const history = dispatches.known.opened
  if (history.some(item => 'known' in item && item.known)) return refused('already_spoke')
  if (history.some(item => 'unknown' in item)) return rejected('unavailable')
  if (currentPhase !== 'awaiting_decision')
    return Object.freeze({ rejected: 'wrongPhase', phase: currentPhase })
  return undefined
}

function retryDecision(
  latestFailure: DispatchGuardInput['latestFailure'],
  snapshot: DispatchGuardInput['snapshot'],
  plan: RetryPlan,
): DispatchGuardResult {
  if ('unknown' in latestFailure) return rejected('unavailable')
  if (
    latestFailure.known === 'credential_unavailable' ||
    latestFailure.known === 'request_rejected'
  )
    return refused('fact_class')
  if ('unknown' in snapshot) return rejected('unavailable')
  const profile = snapshot.known
  if (
    !profile.providers.includes(plan.provider) ||
    (!profile.allowFallback && plan.provider !== profile.providers[0])
  )
    return refused('provider_not_allowed')
  return Object.freeze({ allowed: true })
}

/**
 * RT4 S-60: the synchronous S-30/S-50 table over explicit, legally obtained facts.
 * Checks unknown input at the owned JSON boundary. Never reads authority or sends.
 */
export function dispatchGuard(value: unknown): DispatchGuardResult {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !input(copied.ok)) return rejected('invalidInput')
  const owned = copied.ok
  // History supplied for a different call cannot establish any opened fact here.
  if (
    'known' in owned.dispatches &&
    (owned.dispatches.known.session !== owned.session ||
      owned.dispatches.known.callId !== owned.callId)
  )
    return rejected('invalidInput')
  const currentPhase = callPhase(owned.call, owned.session, owned.callId)
  if (typeof currentPhase !== 'string') return currentPhase
  const history = historyRejection(owned.dispatches, currentPhase)
  if (history !== undefined) return history
  return retryDecision(owned.latestFailure, owned.snapshot, owned.plan)
}
