import { offerReferenceConsumers } from './reference-consumer.ts'
import { publishModelCallContent } from './reference-publish.ts'
import {
  createPlanReuseScopes,
  type PlanReuseScopes,
  type PlanReuseScopeLease,
} from './plan-reuse-scopes.ts'
import { randomUUID } from 'node:crypto'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as loopShape, type RetryPlan } from '@omne-harness-lite/loop-extension'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
import { createAnchoredModelInvocation } from './anchored-invocation.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import { operationDiagnostics } from './service-diagnostics.ts'
import { createModelObserverQueue } from './service-observer-queue.ts'
import { resolveCallTools } from './call-tools.ts'
import { dispatchGuard, type DispatchGuardPhase } from './dispatch-guard.ts'
import { UnknownAppendTracker } from './service-calls.ts'
import {
  appendControlRecord,
  OwnedAppendTracker,
  OwnedReadTracker,
  withOwnedReads,
} from './service-control.ts'
import { readSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import { authorizedCalibration } from './service-calibration.ts'
import { createModelFailureSource, readFailureSubject } from './failure-subject.ts'
import { modelLogJsonEqual } from './log-codec.ts'
import { rejectAcknowledgedHistory, type UnacknowledgedCallHistory } from './call-history.ts'
import type {
  CallOperationState,
  CallKey,
  CallReservation,
  DispatchAgainInput,
  DispatchInput,
  DispatchResult,
  DispatchAgainResult,
  RuntimeConstruction,
  SessionRuntimeBinding,
  ModelObserverQueue,
  ObserverDiagnostic,
  FailureConsumableOperation,
  FailureConsumption,
  ModelFailureSource,
} from './service-types.ts'
import type { ModelProfileSnapshot } from '@omne-harness-lite/model-profile'
import type { CredentialScope } from '@omne-harness-lite/model-response'
import type { PlanInput, InvocationPolicy } from './types.ts'
import type { PlannedSemantics } from './types.ts'
import type { SettlementDiagnostic } from './settlement-types.ts'
import type {
  DiagnosticAssociation,
  DiagnosticEvent,
  DiagnosticReference,
} from './diagnostics-types.ts'

const settlementUnavailableKinds = new Set<string>([
  'settlement.unavailable.dependency',
  'settlement.unavailable.policy',
  'settlement.unavailable.closed',
  'settlement.unavailable.concurrent',
  'settlement.unavailable.budget',
  'settlement.unavailable.cancelled',
  'settlement.unavailable.generation',
  'settlement.unavailable.log',
  'settlement.unavailable.prefix',
  'settlement.unavailable.anchor',
  'settlement.unavailable.members',
  'settlement.unavailable.run_history_unavailable',
  'settlement.unavailable.opened_unknown',
  'settlement.unavailable.write_unknown',
  'settlement.unavailable.task',
  'settlement.unavailable.candidate',
])

export function settlementEvent(event: SettlementDiagnostic): DiagnosticEvent | undefined {
  let outcome: DiagnosticEvent['outcome']
  let settlement: 'unsettled' | 'submitted' | 'committed' | 'unknown'
  switch (event.kind) {
    case 'settlement.enter':
      outcome = 'started'
      settlement = 'unsettled'
      break
    case 'settlement.wait':
    case 'settlement.tail_changed_this':
    case 'settlement.collision':
      outcome = 'waiting'
      settlement = 'unsettled'
      break
    case 'settlement.append':
      outcome = 'accepted'
      settlement = 'submitted'
      break
    case 'settlement.recognized':
    case 'settlement.committed':
      outcome = 'completed'
      settlement = 'committed'
      break
    case 'settlement.receipt_unconfirmed':
    case 'settlement.unknown_retained':
    case 'settlement.stop_unconfirmed':
      outcome = 'unknown'
      settlement = 'unknown'
      break
    case 'settlement.stop_request_failed':
      outcome = 'failed'
      settlement = 'unknown'
      break
    default:
      if (!settlementUnavailableKinds.has(event.kind)) return undefined
      outcome = 'unavailable'
      settlement = 'unknown'
  }
  return {
    source: 'runtime',
    stage: 'settlement',
    outcome,
    facts: {
      kind: 'progress',
      settlement,
      owner: event.owner,
      policy: event.policy,
      submissions: event.submissions,
      tailConflicts: event.tailConflicts,
    },
  }
}

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
  retained: OwnedReadTracker,
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
  history: UnacknowledgedCallHistory,
  local: CallOperationState | undefined,
): DispatchGuardPhase | 'absent' | 'unknown' {
  if ('unavailable' in history) return 'unknown'
  if ('absent' in history) return local === undefined ? 'absent' : 'open'
  if (history.known.phase === null)
    return history.known.dispatches.length === 0 &&
      history.known.intent === null &&
      history.known.ending === null &&
      local?.phase === 'ready'
      ? 'open'
      : 'unknown'
  if (history.known.phase === 'speaking' && local?.phase === 'reply_pending') return 'reply_pending'
  return history.known.phase
}

function alreadySpoke(history: UnacknowledgedCallHistory): boolean {
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
  history: UnacknowledgedCallHistory,
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
  history: UnacknowledgedCallHistory,
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
  readonly dispatch: FailureConsumableOperation<DispatchInput, DispatchResult>
  readonly dispatchAgain: FailureConsumableOperation<DispatchAgainInput, DispatchAgainResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

/** One provider attempt owns its original anchored writer after the short admission is released. */
export function createServiceDispatch<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  borrowedScopes?: PlanReuseScopes,
): ServiceDispatch {
  const scopes = borrowedScopes ?? createPlanReuseScopes(runtime)
  const invocations = new Set<ReturnType<typeof createAnchoredModelInvocation<P, R>>>()
  const retainedReads = new OwnedReadTracker()
  const appends = new OwnedAppendTracker()
  const unknownWrites = new UnknownAppendTracker()
  const lastDiagnosticByCall = new WeakMap<object, DiagnosticReference>()
  const sources = new Set<ModelFailureSource>()
  let closing = false

  let diagnosticFailureReportEnabled = true
  function reportDiagnosticFailure(kind = 'model_runtime.diagnostic_sink_failed'): void {
    if (!diagnosticFailureReportEnabled) return
    try {
      const returned: unknown = runtime.policy.diagnostic({ kind })
      if (drainDiagnosticThenable(returned)) diagnosticFailureReportEnabled = false
    } catch {
      diagnosticFailureReportEnabled = false
    }
  }

  async function retire(reservation: CallReservation<P, R>): Promise<void> {
    const container = runtime.calls.find(reservation.key)
    if (container === undefined) return
    const closed = await container.close()
    if ('released' in closed) runtime.calls.remove(reservation)
  }

  function run(
    input: DispatchInput,
    again: false,
    onFailure?: (source: ModelFailureSource) => void,
  ): Promise<DispatchResult>
  function run(
    input: DispatchAgainInput,
    again: true,
    onFailure?: (source: ModelFailureSource) => void,
  ): Promise<DispatchAgainResult>
  async function run(
    input: DispatchInput | DispatchAgainInput,
    again: boolean,
    onFailure?: (source: ModelFailureSource) => void,
  ): Promise<DispatchResult | DispatchAgainResult> {
    if (closing) return { runtimeStopped: true }
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
    let observerQueue: ModelObserverQueue | undefined
    let dispatchNumber = 0
    let untransferredScope: PlanReuseScopeLease | undefined
    let earlyDiagnostics: ReturnType<typeof operationDiagnostics> | undefined
    try {
      if (closing) return { runtimeStopped: true }
      const local = reservation.view()
      if (local !== undefined && local.session !== session) return { unavailable: true }
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
            : rejectAcknowledgedHistory(runtime.history.call(prefix.prefix, key.callId))
        },
      )
      if ('unavailable' in received) return { unavailable: true }
      const history = received.ok
      if ('unavailable' in history) {
        const authoritative = await runtime.callFacts.lookup({ binding: session.log, ref: key })
        const ended =
          'view' in authoritative &&
          (authoritative.view.state === 'complete' ||
            authoritative.view.state === 'interrupted' ||
            authoritative.view.state === 'handed_up')
        if (ended) {
          const refusal = operationDiagnostics(
            runtime.diagnosticCollector,
            session.log.tenant,
            { executionId: randomUUID(), session: key.session, call: key.callId },
            reportDiagnosticFailure,
          )
          refusal.record({
            source: 'runtime',
            stage: 'admission',
            outcome: 'rejected',
            facts: { kind: 'decision' },
          })
          refusal.close()
        }
        return ended ? { alreadyEnded: true } : { unavailable: true }
      }
      const retrySnapshot =
        local?.binding.snapshot ??
        ('known' in history ? history.known.dispatches.at(-1)?.record.profileSnapshot : undefined)
      if (again && retrySnapshot === undefined)
        return 'absent' in history ? { callNotFound: true } : { unavailable: true }
      const admission =
        again && 'plan' in input && retrySnapshot !== undefined
          ? dispatchAgainAdmission(key, history, local?.operation, retrySnapshot, input.plan)
          : dispatchAdmission(history, local?.operation, local?.binding.snapshot.providers[0] ?? '')
      if (!('allowed' in admission)) {
        const refusal = operationDiagnostics(
          runtime.diagnosticCollector,
          session.log.tenant,
          { executionId: randomUUID(), session: key.session, call: key.callId },
          reportDiagnosticFailure,
        )
        refusal.record({
          source: 'runtime',
          stage: 'admission',
          outcome:
            'unavailable' in admission || 'runtimeStopped' in admission
              ? 'unavailable'
              : 'rejected',
          facts: { kind: 'decision' },
        })
        if (again && 'retryRefused' in admission)
          refusal.record({
            source: 'runtime',
            stage: 'retry',
            outcome: 'rejected',
            facts: { kind: 'progress', retry: 'refused' },
          })
        refusal.close()
        return admission
      }
      const diagnosticOwner = runtime.calls.find(key)
      const priorDiagnostic =
        diagnosticOwner === undefined ? undefined : lastDiagnosticByCall.get(diagnosticOwner)
      const rememberDiagnostic = (reference: DiagnosticReference): void => {
        if (diagnosticOwner !== undefined) lastDiagnosticByCall.set(diagnosticOwner, reference)
      }
      const executionId = randomUUID()
      earlyDiagnostics = operationDiagnostics(
        runtime.diagnosticCollector,
        session.log.tenant,
        {
          executionId,
          ...(again && priorDiagnostic ? { causedBy: priorDiagnostic } : {}),
          session: key.session,
          call: key.callId,
          dispatch: admission.dispatch,
        },
        reportDiagnosticFailure,
        rememberDiagnostic,
      )
      earlyDiagnostics.record({
        source: 'runtime',
        stage: 'admission',
        outcome: 'accepted',
        facts: { kind: 'decision' },
      })
      if (again)
        earlyDiagnostics.record({
          source: 'runtime',
          stage: 'retry',
          outcome: 'started',
          facts: { kind: 'progress', retry: 'again' },
        })
      earlyDiagnostics.record({
        source: 'runtime',
        stage: 'credential',
        outcome: 'started',
        facts: { kind: 'decision' },
      })
      if (local === undefined) return { unavailable: true }
      if (local.operation.phase !== 'ready') return { unavailable: true }
      if (local.request.host.signal.aborted || local.request.host.stopping())
        return { runtimeStopped: true }
      if (
        (local.request.run === undefined) !== (input.attempt === undefined) ||
        (input.attempt !== undefined && !('ok' in judgeAccountValue('AttemptId', input.attempt)))
      )
        return { invalidInput: { reason: 'malformed' } }
      const prepared = await prepareSend(
        runtime,
        session,
        key,
        admission.dispatch,
        admission.provider,
        input.attempt,
        retainedReads,
      )
      if ('unavailable' in prepared) {
        earlyDiagnostics.record({
          source: 'runtime',
          stage: prepared.diagnosticReason === 'scope_disallowed' ? 'binding' : 'credential',
          outcome: 'unavailable',
          facts: {
            kind: 'decision',
            ...(prepared.diagnosticReason === 'scope_disallowed'
              ? { cause: 'scope_disallowed' as const }
              : {}),
          },
        })
        return { unavailable: true }
      }
      if ('invalidInput' in prepared) {
        earlyDiagnostics.record({
          source: 'runtime',
          stage: 'credential',
          outcome: 'rejected',
          facts: { kind: 'decision' },
        })
        return prepared
      }
      if (closing) return { runtimeStopped: true }
      if ('credentialUnavailable' in prepared) {
        earlyDiagnostics.record({
          source: 'runtime',
          stage: 'credential',
          outcome: 'unavailable',
          facts: { kind: 'decision', cause: 'credential_unavailable', credentialPresent: false },
        })
        const first = 'absent' in history || history.known.dispatches.length === 0
        const appended = await appendControlRecord({
          trackTask: task => appends.track(task),
          binding: session.log,
          owner,
          concurrent: runtime.settlementContention.limits.concurrent,
          ...(local.request.run === undefined
            ? {}
            : { run: local.request.run, attempt: input.attempt }),
          record: first
            ? {
                kind: 'model_call_ended',
                call: key.callId,
                ending: 'undispatched',
                cause: 'credential_unavailable',
              }
            : {
                kind: 'model_call_ended',
                call: key.callId,
                ending: 'released',
                cause: 'credential_unavailable',
              },
          retainUnknown(registration, task) {
            unknownWrites.keep(key, session.log, owner, registration, task)
          },
        })
        if ('unavailable' in appended) return { unavailable: true }
        await retire(reservation)
        return first
          ? { callId: key.callId, state: 'handed_up', undispatched: 'credential_unavailable' }
          : {
              callId: key.callId,
              state: 'handed_up',
              released: { cause: 'credential_unavailable' },
            }
      }
      const { planInput, credential, credentialScope, policy } = prepared.prepared
      const parentDiagnostic = earlyDiagnostics.record({
        source: 'runtime',
        stage: 'credential',
        outcome: 'accepted',
        facts: {
          kind: 'decision',
          credentialPresent: true,
          credentialScope: credentialScope.layer,
        },
      })
      let observerLegacyEnabled = true
      const observerDiagnostic = (event: ObserverDiagnostic): void => {
        if (
          event.session !== key.session ||
          !tenantIdEquals(event.tenant, session.log.tenant) ||
          event.callId !== key.callId ||
          !isJsonNumber(event.dispatch) ||
          ExactDecimal.from(event.dispatch).compare(ExactDecimal.from(admission.dispatch)) !== 0
        ) {
          reportDiagnosticFailure('model_runtime.diagnostic_scope_mismatch')
          return
        }
        if (observerLegacyEnabled) {
          try {
            const returned: unknown = runtime.policy.diagnostic({
              kind: 'model_observer.delivery',
              detail: {
                session: event.session,
                tenant: { organization: event.tenant.organization, account: event.tenant.account },
                callId: event.callId,
                dispatch: event.dispatch,
                stage: event.stage,
                reason: event.reason,
                bufferedEvents: event.bufferedEvents,
                bufferedBytes: event.bufferedBytes,
                ...(event.position === undefined ? {} : { position: event.position }),
              },
            })
            if (drainDiagnosticThenable(returned)) {
              observerLegacyEnabled = false
              reportDiagnosticFailure()
            }
          } catch {
            observerLegacyEnabled = false
            reportDiagnosticFailure()
          }
        }
        const observer = operationDiagnostics(
          runtime.diagnosticCollector,
          session.log.tenant,
          {
            executionId,
            ...(parentDiagnostic === undefined ? {} : { causedBy: parentDiagnostic }),
            session: key.session,
            call: key.callId,
            dispatch: admission.dispatch,
          },
          reportDiagnosticFailure,
          rememberDiagnostic,
        )
        observer.record({
          source: 'observer',
          stage: 'observer',
          outcome:
            event.reason === 'consumer_failed'
              ? 'failed'
              : event.reason === 'unavailable'
                ? 'unavailable'
                : 'rejected',
          facts: {
            kind: 'observer',
            observerStage: event.stage,
            reason: event.reason,
            bufferedEvents: event.bufferedEvents,
            bufferedBytes: event.bufferedBytes,
            ...(event.position === undefined ? {} : { position: event.position }),
          },
        })
        observer.close()
      }
      if (local.observer !== undefined) {
        const observer = local.observer
        const target = planInput.target
        let checked: ReturnType<typeof observer.authorization.check>
        try {
          checked = observer.authorization.check(target)
        } catch {
          return { unavailable: true }
        }
        if (!('valid' in checked) || checked.valid !== true)
          return 'invalidInput' in checked ? checked : { unavailable: true }
        let opening:
          | Exclude<ReturnType<typeof observer.authorization.open>, { readonly receiver: object }>
          | undefined
        const replaced = await reservation.replaceObserverQueue(() => {
          let opened: ReturnType<typeof observer.authorization.open>
          try {
            opened = observer.authorization.open(target)
          } catch {
            opening = { unavailable: true }
            throw new Error('observer open unavailable')
          }
          if (!('receiver' in opened)) {
            opening = opened
            throw new Error('observer open rejected')
          }
          try {
            return createModelObserverQueue({
              scope: { session: key.session, tenant: session.log.tenant, target },
              authorization: observer.authorization,
              receiver: opened.receiver,
              maxBufferedEvents: observer.request.observer_max_buffered_events,
              maxBufferedBytes: observer.request.observer_max_buffered_bytes,
              diagnostic: observerDiagnostic,
            })
          } catch (error) {
            // An opened receiver is a physical owner even if queue construction fails.
            const container = runtime.calls.find(key)
            container?.retainStopped(
              opened.receiver.stopped instanceof Promise
                ? opened.receiver.stopped
                : Promise.reject(new TypeError('observer receiver has no stopped fact')),
            )
            try {
              opened.receiver.stop()
            } catch {
              // The retained stopped fact, not the stop request, gates physical release.
            }
            throw error
          }
        })
        if ('queue' in replaced) observerQueue = replaced.queue
        else if (opening !== undefined)
          return 'invalidInput' in opening ? opening : { unavailable: true }
        else if (observer.queue === undefined) return { unavailable: true }
        else
          observerDiagnostic({
            session: key.session,
            tenant: session.log.tenant,
            callId: key.callId,
            dispatch: admission.dispatch,
            stage: 'offer',
            reason: 'consumer_failed',
            bufferedEvents: 0,
            bufferedBytes: 0,
          })
      }
      if (closing || local.request.host.signal.aborted || local.request.host.stopping())
        return { runtimeStopped: true }
      if (owner.admission() !== 'open') return { runtimeStopped: true }
      if (reservation.view()?.operation.phase !== 'ready') return { unavailable: true }
      const deliveryQueue = observerQueue
      const scoped = scopes.acquire(session.log)
      if ('unavailable' in scoped) return { unavailable: true }
      const scopeLease = scoped.lease
      untransferredScope = scopeLease
      const create = () => {
        const responseId = runtime.identities.response()
        const collector = runtime.diagnosticCollector
        let legacySettlementEnabled = true
        const settlementDiagnostic = (event: SettlementDiagnostic): void => {
          if (legacySettlementEnabled) {
            try {
              const returned: unknown = runtime.diagnostic(event)
              if (drainDiagnosticThenable(returned)) {
                legacySettlementEnabled = false
                reportDiagnosticFailure()
              }
            } catch {
              legacySettlementEnabled = false
              reportDiagnosticFailure()
            }
          }
          if (collector === undefined) return
          try {
            if (
              !tenantIdEquals(event.tenant, session.log.tenant) ||
              event.session !== key.session ||
              event.call !== key.callId ||
              !isJsonNumber(event.dispatch) ||
              ExactDecimal.from(event.dispatch).compare(ExactDecimal.from(admission.dispatch)) !==
                0 ||
              event.response !== responseId
            ) {
              reportDiagnosticFailure('model_runtime.diagnostic_scope_mismatch')
              return
            }
            const projected = settlementEvent(event)
            if (projected === undefined) {
              reportDiagnosticFailure('model_runtime.diagnostic_unsupported')
              return
            }
            const prior =
              diagnosticOwner === undefined ? undefined : lastDiagnosticByCall.get(diagnosticOwner)
            const observer = operationDiagnostics(
              collector,
              session.log.tenant,
              {
                executionId,
                ...(prior === undefined ? {} : { causedBy: prior }),
                session: key.session,
                call: key.callId,
                dispatch: admission.dispatch,
                response: responseId,
              },
              reportDiagnosticFailure,
              rememberDiagnostic,
            )
            observer.record(projected)
            observer.close()
          } catch {
            reportDiagnosticFailure()
          }
        }
        const created = createAnchoredModelInvocation({
          ...(local.request.run === undefined
            ? {}
            : { run: local.request.run, attempt: input.attempt }),
          planInput,
          transport: local.binding.lease.transport,
          ...(scopeLease.reuseScope === undefined ? {} : { reuseScope: scopeLease.reuseScope }),
          trackPlan: completion => {
            try {
              return local.binding.lease.track(completion)
            } catch (error) {
              return completion.then(
                () => {
                  throw error
                },
                () => {
                  throw error
                },
              )
            }
          },
          credential,
          credentialScope,
          policy,
          signal: AbortSignal.any([local.binding.lease.signal, local.request.host.signal]),
          responseId,
          messageId: runtime.identities.message(),
          profile: local.binding.profile,
          selectedBy: local.binding.selectedBy,
          settlement: {
            binding: session.log,
            owner,
            run: runtime.history.run,
            settlementContention: runtime.settlementContention,
            settlementScheduler: runtime.settlementScheduler,
            diagnostic: settlementDiagnostic,
          },
          ...(collector === undefined
            ? {}
            : {
                diagnosticEmitterFactory: () => {
                  const emitter = collector.emitter(
                    { kind: 'tenant', tenant: session.log.tenant },
                    {
                      executionId,
                      ...(parentDiagnostic === undefined ? {} : { causedBy: parentDiagnostic }),
                      session: key.session,
                      call: key.callId,
                      dispatch: admission.dispatch,
                      response: responseId,
                    },
                  )
                  return Object.freeze({
                    record(event: DiagnosticEvent) {
                      const result = emitter.record(event)
                      if ('recorded' in result) rememberDiagnostic(result.recorded)
                      return result
                    },
                    close: () => emitter.close(),
                  })
                },
              }),
          onAccepted: (event, snapshot) => {
            deliveryQueue?.offer(event, snapshot)
            const original = runtime.calls.find(key)
            if (original?.view().invocation === created)
              offerReferenceConsumers(original, event, snapshot)
          },
        })
        untransferredScope = undefined
        invocations.add(created)
        const drained = () => {
          scopeLease.release()
          invocations.delete(created)
        }
        created.outcome.then(drained, drained)
        return created
      }
      if (local.invocation === undefined) {
        handle = create()
        reservation.attachInvocation(handle)
      } else {
        const replaced = await reservation.replaceInvocation(create)
        if ('unavailable' in replaced) return { unavailable: true }
        handle = replaced.attached
      }
      const attached = handle
      reservation.publish({
        phase: 'dispatching',
        target: prepared.prepared.planInput.target,
        ...(input.attempt === undefined ? {} : { attempt: input.attempt }),
        abort: attached.abort,
        interrupt: attached.interrupt,
      })
      observerQueue?.start(attached.snapshot())
      dispatchNumber = admission.dispatch
    } catch {
      return { unavailable: true }
    } finally {
      untransferredScope?.release()
      earlyDiagnostics?.close()
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
        const pending = outcome.replyPending
        const published = await publishModelCallContent({
          binding: session.log,
          owner: view.owner,
          concurrent: runtime.settlementContention.limits.concurrent,
          reads: retainedReads,
          contentStore: runtime.callFacts.content,
          content: { kind: 'reply_ready', value: pending },
          locator: pending.id,
          version: 'v1',
          at: runtime.policy.now(),
          trackTask: task => appends.track(task),
          retainUnknown(registration, task, permit) {
            unknownWrites.keep(key, session.log, view.owner, registration, task, permit)
          },
        })
        if (!('published' in published)) {
          finish.reservation.publish({ phase: 'reply_pending', pending })
          return { unavailable: true }
        }
        const closed = await handle.finishReady()
        if ('released' in closed) invocations.delete(handle)
        if ('unavailable' in closed) return { unavailable: true }
        const state = pending.outcome === 'interrupted' ? 'interrupted' : 'complete'
        finish.reservation.publish({ phase: state, pending })
        const container = runtime.calls.find(key)
        if (container === undefined || 'unavailable' in container.releaseExecutionLease())
          return { unavailable: true }
        return { replyPending: pending, state, disposition: 'disposition_pending' }
      }
      if ('settled' in outcome) {
        const judged = judgeModelResponse(outcome.settled.settled.response.value)
        if ('rejected' in judged) return { unavailable: true }
        // The shared MR7 judge validated the captured JSON value at this boundary.
        const response = outcome.settled.settled.response.value as unknown as ModelResponse
        const closed = await handle.close()
        if ('released' in closed) invocations.delete(handle)
        if ('unavailable' in closed) return { unavailable: true }
        finish.reservation.publish({ phase: 'ready' })
        if (response.outcome === 'failed') {
          let createdSource: ModelFailureSource | undefined
          const got = await withOwnedReads(
            view.owner,
            runtime.settlementContention.limits.concurrent,
            retainedReads,
            async registration => {
              const prefix = await readSettlementPrefix({ binding: session.log, registration })
              if ('unavailable' in prefix) return { unavailable: true } as const
              const history = rejectAcknowledgedHistory(
                runtime.history.call(prefix.prefix, key.callId),
              )
              if (!('known' in history)) return { unavailable: true } as const
              const latest = history.known.dispatches.at(-1)
              if (
                latest?.response === null ||
                latest?.response === undefined ||
                !modelLogJsonEqual(latest.response.value, response)
              )
                return { unavailable: true } as const
              const subject = readFailureSubject({
                prefix: prefix.prefix,
                callId: key.callId,
                dispatches: history.known.dispatches,
                source: runtime.history.failure,
              })
              if (!('subject' in subject)) return { unavailable: true } as const
              if (onFailure !== undefined) {
                const source = createModelFailureSource({
                  prefix: prefix.prefix,
                  callId: key.callId,
                  owner: view.owner,
                  subject: subject.subject,
                  usable: () =>
                    !closing && !view.request.host.stopping() && !view.request.host.signal.aborted,
                  retain: value => {
                    sources.add(value)
                  },
                  forget: value => {
                    sources.delete(value)
                  },
                })
                if (source === null) return { unavailable: true } as const
                createdSource = source
              }
              return { subject: subject.subject }
            },
          )
          if ('unavailable' in got || 'unavailable' in got.ok) {
            createdSource?.release()
            return { unavailable: true }
          }
          if (createdSource !== undefined) onFailure?.(createdSource)
          return { settled: response, failureSubject: createdSource?.subject ?? got.ok.subject }
        }
        if (response.outcome === 'interrupted' && !('reply' in response)) {
          await retire(finish.reservation)
          return { settled: response }
        }
        return { unavailable: true }
      }
      if ('rejected' in outcome) {
        const closed = await handle.close()
        if ('released' in closed) invocations.delete(handle)
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
          if (closing) return { runtimeStopped: true }
          const appended = await appendControlRecord({
            trackTask: task => appends.track(task),
            binding: session.log,
            owner: view.owner,
            concurrent: runtime.settlementContention.limits.concurrent,
            ...(view.request.run === undefined
              ? {}
              : { run: view.request.run, attempt: input.attempt }),
            record: {
              kind: 'model_call_ended',
              call: key.callId,
              ending: 'undispatched',
              cause: 'modality_mismatch',
            },
            retainUnknown(registration, task) {
              unknownWrites.keep(key, session.log, view.owner, registration, task)
            },
          })
          if ('appended' in appended) await retire(finish.reservation)
          return 'appended' in appended
            ? { callId: key.callId, state: 'handed_up', undispatched: 'modality_mismatch' }
            : { unavailable: true }
        }
        if (
          outcome.rejected === 'orphan_tool_call' ||
          outcome.rejected === 'tool_internal_in_request'
        )
          return { invalidInput: { reason: 'malformed' } }
        return { unavailable: true }
      }
      return { unavailable: true }
    } finally {
      finish.reservation.release()
    }
  }
  function dispatch(input: DispatchInput): Promise<DispatchResult>
  function dispatch(
    input: DispatchInput,
    options: { readonly consumeFailure: true },
  ): Promise<FailureConsumption<DispatchResult>>
  async function dispatch(
    input: DispatchInput,
    options?: { readonly consumeFailure: true },
  ): Promise<DispatchResult | FailureConsumption<DispatchResult>> {
    if (
      options !== undefined &&
      (options?.consumeFailure !== true || Object.keys(options).length !== 1)
    )
      return { invalidInput: { reason: 'malformed' } }
    let source: ModelFailureSource | undefined
    const result = await run(
      input,
      false,
      options?.consumeFailure === true
        ? value => {
            source = value
          }
        : undefined,
    )
    return options === undefined
      ? result
      : {
          result,
          consumption:
            source === undefined ? { kind: 'notApplicable' } : { kind: 'failure', source },
        }
  }
  function dispatchAgain(input: DispatchAgainInput): Promise<DispatchAgainResult>
  function dispatchAgain(
    input: DispatchAgainInput,
    options: { readonly consumeFailure: true },
  ): Promise<FailureConsumption<DispatchAgainResult>>
  async function dispatchAgain(
    input: DispatchAgainInput,
    options?: { readonly consumeFailure: true },
  ): Promise<DispatchAgainResult | FailureConsumption<DispatchAgainResult>> {
    if (
      options !== undefined &&
      (options?.consumeFailure !== true || Object.keys(options).length !== 1)
    )
      return { invalidInput: { reason: 'malformed' } }
    let source: ModelFailureSource | undefined
    const result = await run(
      input,
      true,
      options?.consumeFailure === true
        ? value => {
            source = value
          }
        : undefined,
    )
    return options === undefined
      ? result
      : {
          result,
          consumption:
            source === undefined ? { kind: 'notApplicable' } : { kind: 'failure', source },
        }
  }
  return Object.freeze({
    dispatch,
    dispatchAgain,
    close: async () => {
      closing = true
      for (const source of sources) source.release()
      for (const invocation of invocations) invocation.abort()
      const drained = await Promise.allSettled(
        [...invocations].map(async invocation => {
          const result = await invocation.close()
          if ('released' in result) invocations.delete(invocation)
          return result
        }),
      )
      const [reads, appendResult] = await Promise.all([retainedReads.close(), appends.close()])
      const writes = await unknownWrites.close({
        concurrent: runtime.settlementContention.limits.concurrent,
        call: runtime.history.call,
      })
      return drained.every(result => result.status === 'fulfilled' && 'released' in result.value) &&
        'released' in reads &&
        'released' in appendResult &&
        'released' in writes &&
        (borrowedScopes !== undefined || 'released' in scopes.close())
        ? ({ released: true } as const)
        : ({ unavailable: true } as const)
    },
  })
}
type PreparationResult =
  | { readonly prepared: PreparedSend }
  | { readonly credentialUnavailable: true }
  | { readonly invalidInput: { readonly reason: 'malformed' | 'unknownTool' } }
  | { readonly unavailable: true; readonly diagnosticReason?: 'scope_disallowed' }

/** Do not spend a dispatch number or write an anchor before these current provider facts. */
async function prepareSend<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
  session: SessionRuntimeBinding,
  key: CallKey,
  dispatch: number,
  provider: string,
  attempt: DispatchInput['attempt'],
  retained: OwnedReadTracker,
): Promise<PreparationResult> {
  const container = runtime.calls.find(key)
  if (container === undefined) return { unavailable: true }
  const view = container.view()
  if (view.request.run === undefined && attempt !== undefined)
    return { invalidInput: { reason: 'malformed' } }
  const calibrationTarget =
    view.request.run === undefined
      ? { callId: key.callId, dispatch }
      : attempt === undefined
        ? null
        : { callId: key.callId, dispatch, run: view.request.run, attempt }
  if (calibrationTarget === null) return { invalidInput: { reason: 'malformed' } }
  if (
    view.session !== session ||
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
    (view.binding.profile.origin === 'custom' && value.scope.layer === 'factory')
  )
    return { unavailable: true, diagnosticReason: 'scope_disallowed' }
  if (!(value.value instanceof Uint8Array)) return { unavailable: true }
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
  const calibration = await withOwnedReads(
    view.owner,
    runtime.settlementContention.limits.concurrent,
    retained,
    async registration => {
      const prefix = await readSettlementPrefix({ binding: session.log, registration })
      return 'unavailable' in prefix
        ? ({ unavailable: true } as const)
        : authorizedCalibration(
            prefix.prefix,
            view.request.messages,
            calibrationTarget,
            runtime.history.calibration,
          )
    },
  )
  if ('unavailable' in calibration || 'unavailable' in calibration.ok) return { unavailable: true }
  const planInput: PlanInput = Object.freeze({
    calibration: calibration.ok.calibration,
    outputHistory: calibration.ok.outputHistory,
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
