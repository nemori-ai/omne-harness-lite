import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as loopShape, type RetryPlan } from '@omne-harness-lite/loop-extension'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
import { createAnchoredModelInvocation } from './anchored-invocation.ts'
import { resolveCallTools } from './call-tools.ts'
import { dispatchGuard, type DispatchGuardPhase } from './dispatch-guard.ts'
import { withOwnedReads } from './service-calls.ts'
import { appendControlRecord } from './service-control.ts'
import { readSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
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
import type { CredentialScope } from '@omne-harness-lite/model-response'
import type { PlanInput, InvocationPolicy } from './types.ts'
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

interface PreparedSend {
  readonly planInput: PlanInput
  readonly credential: string
  readonly credentialScope: CredentialScope
  readonly policy: InvocationPolicy
}

export interface ServiceDispatch {
  readonly dispatch: (input: DispatchInput) => Promise<DispatchResult>
  readonly dispatchAgain: (input: DispatchAgainInput) => Promise<DispatchAgainResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

/** One provider attempt owns its original anchored writer after the short admission is released. */
export function createServiceDispatch<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
): ServiceDispatch {
  const retainedReads = new Set<SettlementRegistration>()
  const unknownWrites = new Set<SettlementRegistration>()

  function run(input: DispatchInput, again: false): Promise<DispatchResult>
  function run(input: DispatchAgainInput, again: true): Promise<DispatchAgainResult>
  async function run(
    input: DispatchInput | DispatchAgainInput,
    again: boolean,
  ): Promise<DispatchResult | DispatchAgainResult> {
    if (!validDispatchInput(input)) return { invalidInput: { reason: 'malformed' } }
    if (again && !('plan' in input)) return { invalidInput: { reason: 'malformed' } }
    const key: CallKey = { session: input.session, callId: input.callId }
    let bound: Awaited<ReturnType<RuntimeConstruction<P, R>['sessions']['bind']>>
    try {
      bound = await runtime.sessions.bind(key.session)
    } catch {
      return { unavailable: true }
    }
    if ('failure' in bound)
      return bound.failure === 'invalidInput'
        ? { invalidInput: { reason: 'malformed' } }
        : { unavailable: true }
    const session = bound.binding
    if (
      session.log.session !== key.session ||
      session.selection.binding.session !== key.session ||
      !tenantIdEquals(session.log.tenant, session.selection.binding.tenant) ||
      session.log.generation !== session.selection.binding.generation
    )
      return { unavailable: true }
    if (session.selection.owner.admission() !== 'open') return { runtimeStopped: true }
    const gate = await runtime.calls.waitReserve(key, {
      policy: runtime.reservationWaitPolicy,
      scheduler: runtime.settlementScheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in gate) return { unavailable: true }
    const reservation = gate.reservation
    let handle: ReturnType<typeof createAnchoredModelInvocation<P, R>> | undefined
    let dispatchNumber = 0
    try {
      const local = reservation.view()
      if (local !== undefined && (local.session !== session || local.request.run !== undefined))
        return { unavailable: true }
      const owner = local?.owner ?? session.selection.owner
      if (owner.admission() !== 'open' || !settlementGenerationCurrent(session.log))
        return { runtimeStopped: true }
      if ('unknown' in owner.opened() || owner.unresolvedWrites().length > 0)
        return { unavailable: true }
      const received = await withOwnedReads(
        owner,
        runtime.settlementContention.limits.concurrent,
        retainedReads,
        async registration => {
          const prefix = await readSettlementPrefix({ binding: session.log, registration })
          return 'unavailable' in prefix
            ? ({ unavailable: true, reason: 'prefix' } as const)
            : runtime.history.call(prefix.prefix, key.callId)
        },
      )
      if ('unavailable' in received) return { unavailable: true }
      const history = received.ok
      if ('unavailable' in history) return { unavailable: true }
      if (again && local === undefined) return { unavailable: true }
      const admission =
        again && 'plan' in input && local !== undefined
          ? dispatchAgainAdmission(
              key,
              history,
              local.operation,
              local.binding.snapshot,
              input.plan,
            )
          : dispatchAdmission(history, local?.operation, local?.binding.snapshot.providers[0] ?? '')
      if (!('allowed' in admission)) return admission
      if (local === undefined) return { unavailable: true }
      if (local.operation.phase !== 'ready') return { unavailable: true }
      // A Run call cannot be inferred from a missing attempt, or vice versa.
      if (input.attempt !== undefined) return { invalidInput: { reason: 'malformed' } }
      const prepared = await prepareSend(
        runtime,
        session,
        key,
        admission.dispatch,
        admission.provider,
        retainedReads,
      )
      if ('unavailable' in prepared) return prepared
      if ('invalidInput' in prepared) return prepared
      if ('credentialUnavailable' in prepared) {
        const first = 'absent' in history || history.known.dispatches.length === 0
        const ending = first ? 'undispatched' : 'released'
        const appended = await appendControlRecord({
          binding: session.log,
          owner,
          concurrent: runtime.settlementContention.limits.concurrent,
          record: {
            kind: 'model_call_ended',
            call: key.callId,
            ending,
            cause: 'credential_unavailable',
          },
          retainUnknown(registration) {
            unknownWrites.add(registration)
          },
        })
        if ('unavailable' in appended) return { unavailable: true }
        return first
          ? { callId: key.callId, state: 'handed_up', undispatched: 'credential_unavailable' }
          : {
              callId: key.callId,
              state: 'handed_up',
              released: { cause: 'credential_unavailable' },
            }
      }
      const { planInput, credential, credentialScope, policy } = prepared.prepared
      const create = () =>
        createAnchoredModelInvocation({
          planInput,
          transport: local.binding.lease.transport,
          credential,
          credentialScope,
          policy,
          signal: local.binding.lease.signal,
          responseId: runtime.identities.response(),
          messageId: runtime.identities.message(),
          profile: local.binding.profile,
          selectedBy: local.binding.selectedBy,
          settlement: {
            binding: session.log,
            owner,
            settlementContention: runtime.settlementContention,
            settlementScheduler: runtime.settlementScheduler,
            diagnostic: runtime.diagnostic,
          },
        })
      if (local.invocation === undefined) {
        handle = create()
        reservation.attachInvocation(handle)
      } else {
        const replaced = await reservation.replaceInvocation(create)
        if ('unavailable' in replaced) return { unavailable: true }
        handle = replaced.attached
      }
      const attached = handle
      reservation.publish({ phase: 'dispatching', abort: attached.abort })
      dispatchNumber = admission.dispatch
    } catch {
      return { unavailable: true }
    } finally {
      reservation.release()
    }
    if (handle === undefined) return { unavailable: true }
    let outcome: Awaited<typeof handle.outcome>
    try {
      outcome = await handle.outcome
    } catch {
      return { unavailable: true }
    }
    const finish = await runtime.calls.waitReserve(key, {
      policy: runtime.reservationWaitPolicy,
      scheduler: runtime.settlementScheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in finish) return { unavailable: true }
    try {
      const view = finish.reservation.view()
      if (view?.invocation !== handle || view.operation.phase !== 'dispatching')
        return { unavailable: true }
      if ('replyPending' in outcome) {
        finish.reservation.publish({ phase: 'reply_pending', pending: outcome.replyPending })
        return { replyPending: outcome.replyPending }
      }
      if ('settled' in outcome) {
        const judged = judgeModelResponse(outcome.settled.settled.response.value)
        if ('rejected' in judged) return { unavailable: true }
        // The shared MR7 judge validated the captured JSON value at this boundary.
        const response = outcome.settled.settled.response.value as unknown as ModelResponse
        const closed = await handle.close()
        if ('unavailable' in closed) return { unavailable: true }
        finish.reservation.publish({ phase: 'ready' })
        if (response.outcome === 'failed') {
          const got = await withOwnedReads(
            view.owner,
            runtime.settlementContention.limits.concurrent,
            retainedReads,
            async registration => {
              const prefix = await readSettlementPrefix({ binding: session.log, registration })
              return 'unavailable' in prefix
                ? ({ unavailable: true } as const)
                : runtime.history.failure(prefix.prefix, key.callId)
            },
          )
          if ('unavailable' in got || 'unavailable' in got.ok) return { unavailable: true }
          return { settled: response, failureSubject: got.ok.subject }
        }
        return response.outcome === 'interrupted' && !('reply' in response)
          ? { settled: response }
          : { unavailable: true }
      }
      if ('rejected' in outcome) {
        const closed = await handle.close()
        if ('unavailable' in closed) return { unavailable: true }
        finish.reservation.publish({ phase: 'ready' })
        if (outcome.rejected === 'invalidInput') {
          if (
            outcome.reason === 'input_limit_missing' ||
            outcome.reason === 'input_size_unavailable'
          )
            return { invalidInput: { reason: outcome.reason, metrics: outcome.metrics } }
          if (outcome.reason === 'input_limit_exceeded')
            return outcome.basis === 'exact'
              ? {
                  invalidInput: {
                    reason: outcome.reason,
                    basis: 'exact',
                    metric: outcome.metric,
                    actual: outcome.actual,
                    limit: outcome.limit,
                  },
                }
              : {
                  invalidInput: {
                    reason: outcome.reason,
                    basis: 'estimated',
                    metric: outcome.metric,
                    estimatedTokens: outcome.estimatedTokens,
                    admissionTokens: outcome.admissionTokens,
                    limit: outcome.limit,
                  },
                }
          return { invalidInput: { reason: 'malformed' } }
        }
        if (outcome.rejected === 'modality_not_carried') {
          if (dispatchNumber > 1) return { invalidInput: { reason: 'modality_mismatch' } }
          const appended = await appendControlRecord({
            binding: session.log,
            owner: view.owner,
            concurrent: runtime.settlementContention.limits.concurrent,
            record: {
              kind: 'model_call_ended',
              call: key.callId,
              ending: 'undispatched',
              cause: 'modality_mismatch',
            },
            retainUnknown(registration) {
              unknownWrites.add(registration)
            },
          })
          return 'appended' in appended
            ? { callId: key.callId, state: 'handed_up', undispatched: 'modality_mismatch' }
            : { unavailable: true }
        }
        return { unavailable: true }
      }
      return { unavailable: true }
    } finally {
      finish.reservation.release()
    }
  }
  return Object.freeze({
    dispatch: (input: DispatchInput) => run(input, false),
    dispatchAgain: (input: DispatchAgainInput) => run(input, true),
    close: async () =>
      retainedReads.size === 0 && unknownWrites.size === 0
        ? ({ released: true } as const)
        : ({ unavailable: true } as const),
  })
}
type PreparationResult =
  | { readonly prepared: PreparedSend }
  | { readonly credentialUnavailable: true }
  | { readonly invalidInput: { readonly reason: 'malformed' | 'unknownTool' } }
  | { readonly unavailable: true }

/** Do not spend a dispatch number or write an anchor before these current provider facts. */
async function prepareSend<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  session: SessionRuntimeBinding,
  key: CallKey,
  dispatch: number,
  provider: string,
  retained: Set<SettlementRegistration>,
): Promise<PreparationResult> {
  const container = runtime.calls.find(key)
  if (container === undefined) return { unavailable: true }
  const view = container.view()
  if (
    view.session !== session ||
    view.request.run !== undefined ||
    view.owner.admission() !== 'open' ||
    !settlementGenerationCurrent(session.log) ||
    'unknown' in view.owner.opened() ||
    view.owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const timing = await currentDispatchTiming(runtime, session, retained)
  if ('unavailable' in timing) return timing
  const credential = await withOwnedReads(
    view.owner,
    runtime.settlementContention.limits.concurrent,
    retained,
    async registration =>
      await registration.start(
        'read',
        async () =>
          await session.credentials.value(session.log.tenant, view.binding.profile.origin),
      ).completion,
  )
  if ('unavailable' in credential) return credential
  if ('failure' in credential.ok)
    return credential.ok.failure === 'credentialUnavailable'
      ? { credentialUnavailable: true }
      : { unavailable: true }
  const value = credential.ok
  if (
    (value.scope.layer === 'tenant' && !tenantIdEquals(value.scope.tenant, session.log.tenant)) ||
    (view.binding.profile.origin === 'custom' && value.scope.layer === 'factory') ||
    !(value.value instanceof Uint8Array)
  )
    return { unavailable: true }
  let credentialText: string
  try {
    credentialText = new TextDecoder('utf-8', { fatal: true }).decode(value.value)
  } catch {
    return { unavailable: true }
  }
  if (credentialText.length === 0) return { credentialUnavailable: true }
  let tools: Awaited<ReturnType<typeof resolveCallTools>>
  try {
    tools = await resolveCallTools(view.request, session.tools)
  } catch {
    return { unavailable: true }
  }
  if ('failure' in tools)
    return tools.failure === 'unavailable'
      ? { unavailable: true }
      : { invalidInput: { reason: tools.reason ?? 'malformed' } }
  const planInput: PlanInput = Object.freeze({
    tokenMargin: runtime.tokenMargin,
    target: { kind: 'model_call' as const, callId: key.callId, dispatch },
    routeName: view.binding.profile.routeName,
    provider,
    snapshot: view.binding.snapshot,
    parameters: view.binding.parameters,
    messages: view.request.messages,
    tools: tools.tools,
  })
  return {
    prepared: {
      planInput,
      credential: credentialText,
      credentialScope: value.scope,
      policy: {
        ...runtime.policy,
        firstContentTimeoutMs: timing.firstContentTimeoutMs,
        idleContentTimeoutMs: timing.idleContentTimeoutMs,
      },
    },
  }
}
