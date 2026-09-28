import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as loopShape, type RetryPlan } from '@omne-harness-lite/loop-extension'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
import { dispatchGuard, type DispatchGuardPhase } from './dispatch-guard.ts'
import { withOwnedReads } from './service-calls.ts'
import type { CallHistoryResult } from './call-history.ts'
import type {
  CallOperationState,
  CallKey,
  DispatchAgainInput,
  DispatchInput,
  DispatchResult,
  DispatchAgainResult,
  RuntimeConstruction,
  SessionRuntimeBinding,
} from './service-types.ts'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import type { SettlementRegistration } from './settlement-types.ts'
import type { PlannedSemantics } from './types.ts'

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

export function positiveDurationMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !toolShape('Duration', value).valid) return undefined
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value)
  if (match === null) return undefined
  const milliseconds =
    Number(match[1] ?? '0') * 3_600_000 +
    Number(match[2] ?? '0') * 60_000 +
    Number(match[3] ?? '0') * 1_000
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined
}

/** RT8 S-21/S-66: only the current authenticated AE4 input can supply the two limits.
 * Fractional milliseconds remain fractional; neither rounding nor a host default is used. */
export async function currentDispatchTiming<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  session: SessionRuntimeBinding,
  retained: Set<SettlementRegistration>,
): Promise<
  | { readonly firstContentTimeoutMs: number; readonly idleContentTimeoutMs: number }
  | { readonly unavailable: true }
> {
  const received = await withOwnedReads(
    session.selection.owner,
    runtime.settlementContention.limits.concurrent,
    retained,
    async registration =>
      await registration.start(
        'read',
        async () =>
          await session.currentEvaluationInputs.read(session.log.session, session.log.tenant),
      ).completion,
  )
  if ('unavailable' in received || !('input' in received.ok)) return { unavailable: true }
  const input = received.ok.input
  if (!tenantIdEquals(input.tenant, session.log.tenant) || input.standing.standing !== 'effective')
    return { unavailable: true }
  const evaluated = evaluate(input)
  if (!('ok' in evaluated)) return { unavailable: true }
  const assembly = evaluated.ok
  const root = capabilityCanonicalString(assembly.root)
  function one(item: string): number | undefined {
    const values = assembly.values.filter(
      value => capabilityCanonicalString(value.capability) === root && value.item === item,
    )
    return values.length === 1 ? positiveDurationMs(values[0]?.value) : undefined
  }
  const firstContentTimeoutMs = one('first_token_wait_limit')
  const idleContentTimeoutMs = one('post_first_token_stall_limit')
  return firstContentTimeoutMs === undefined || idleContentTimeoutMs === undefined
    ? { unavailable: true }
    : { firstContentTimeoutMs, idleContentTimeoutMs }
}

export function validDispatchInput(input: DispatchInput | DispatchAgainInput): boolean {
  return (
    input !== null &&
    typeof input === 'object' &&
    'ok' in parseOpaqueIdentifier(input.session, 'SessionRef') &&
    'ok' in judgeAccountValue('ModelCallId', input.callId) &&
    (input.attempt === undefined || 'ok' in judgeAccountValue('AttemptId', input.attempt))
  )
}

function effectivePhase(
  history: CallHistoryResult,
  local: CallOperationState | undefined,
): DispatchGuardPhase | 'absent' | 'unknown' {
  if ('unavailable' in history) return 'unknown'
  if ('absent' in history) return local === undefined ? 'absent' : 'open'
  if (history.known.phase === null) return 'unknown'
  if (history.known.phase === 'speaking' && local?.phase === 'reply_pending') return 'reply_pending'
  return history.known.phase
}

function alreadySpoke(history: CallHistoryResult): boolean {
  return 'known' in history && history.known.dispatches.some(item => item.opened !== null)
}

export type DispatchAdmission =
  | { readonly allowed: true; readonly dispatch: number; readonly provider: string }
  | Extract<DispatchResult, { readonly callNotFound: true }>
  | Extract<DispatchResult, { readonly alreadyEnded: true }>
  | Extract<DispatchResult, { readonly retryRefused: object }>
  | Extract<DispatchResult, { readonly wrongPhase: object }>
  | Extract<DispatchResult, { readonly unavailable: true }>

/** RT7 S-29 order: authoritative terminal and opened facts outrank local readiness. */
export function dispatchAdmission(
  history: CallHistoryResult,
  local: CallOperationState | undefined,
  firstProvider: string,
): DispatchAdmission {
  const phase = effectivePhase(history, local)
  if (phase === 'unknown') return { unavailable: true }
  if (phase === 'absent') return { callNotFound: true }
  if (phase === 'complete' || phase === 'handed_up' || phase === 'interrupted')
    return { alreadyEnded: true }
  if (phase === 'reply_pending') return { alreadyEnded: true }
  if (alreadySpoke(history)) return { retryRefused: { why: 'already_spoke' } }
  if (phase !== 'open' && phase !== 'resumable') return { wrongPhase: { phase } }
  if (firstProvider.length === 0) return { unavailable: true }
  return {
    allowed: true,
    dispatch: 'known' in history ? history.known.dispatches.length + 1 : 1,
    provider:
      'known' in history
        ? (history.known.dispatches.at(-1)?.record.provider ?? firstProvider)
        : firstProvider,
  }
}

export type DispatchAgainAdmission =
  | { readonly allowed: true; readonly dispatch: number; readonly provider: string }
  | Extract<DispatchAgainResult, { readonly callNotFound: true }>
  | Extract<DispatchAgainResult, { readonly alreadyEnded: true }>
  | Extract<DispatchAgainResult, { readonly retryRefused: object }>
  | Extract<DispatchAgainResult, { readonly wrongPhase: object }>
  | Extract<DispatchAgainResult, { readonly unavailable: true }>
  | Extract<DispatchAgainResult, { readonly invalidInput: object }>

/** Use the same closed S-30/S-50 guard for actual resend; never derive a weaker check. */
export function dispatchAgainAdmission(
  key: CallKey,
  history: CallHistoryResult,
  local: CallOperationState | undefined,
  snapshot: ModelProfileSnapshot,
  plan: RetryPlan,
): DispatchAgainAdmission {
  if (!loopShape('RetryPlan', plan).valid) return { invalidInput: { reason: 'malformed' } }
  const phase = effectivePhase(history, local)
  if (phase === 'unknown') return { unavailable: true }
  const last = 'known' in history ? history.known.dispatches.at(-1) : undefined
  const failure = last?.response?.projection.failure
  const cause = object(failure) ? failure.cause : undefined
  const checked = dispatchGuard({
    session: key.session,
    callId: key.callId,
    call:
      phase === 'absent'
        ? { known: null }
        : { known: { session: key.session, callId: key.callId, phase: { known: phase } } },
    dispatches:
      'known' in history
        ? {
            known: {
              session: history.known.session,
              callId: history.known.callId,
              opened: history.known.dispatches.map(item => ({ known: item.opened !== null })),
            },
          }
        : { known: { session: key.session, callId: key.callId, opened: [] } },
    latestFailure:
      typeof cause === 'string' && loopShape('FailureCause', cause).valid
        ? { known: cause }
        : { unknown: true },
    snapshot: { known: snapshot },
    plan,
  })
  if ('allowed' in checked)
    return {
      allowed: true,
      dispatch: ('known' in history ? history.known.dispatches.length : 0) + 1,
      provider: plan.provider,
    }
  if ('refused' in checked) return { retryRefused: checked.refused }
  if (checked.rejected === 'wrongPhase') return { wrongPhase: { phase: checked.phase } }
  if (checked.rejected === 'alreadyEnded') return { alreadyEnded: true }
  if (checked.rejected === 'callNotFound') return { callNotFound: true }
  if (checked.rejected === 'invalidInput') return { invalidInput: { reason: 'malformed' } }
  return { unavailable: true }
}
