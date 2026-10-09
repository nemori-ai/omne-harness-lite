import { classifyCause } from '@omne-harness-lite/model-request-runtime'
import {
  start,
  snapshot,
  accept,
  abandon,
  closeOut,
  type AssemblyState,
  type ModelAssemblyAccount,
} from '@omne-harness-lite/stream-assembly'
import type { ArrivalEvent, ArrivalError } from '@omne-harness-lite/arrival-events'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { TrimSummary } from '@omne-harness-lite/call-accounts'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type {
  Failure,
  RawHeaders,
  InputCalibration,
  OutputGroupEvidence,
} from '@omne-harness-lite/model-response'
import type {
  InvocationInput,
  ModelInvocationHandle,
  InvocationOutcome,
  ModelInvocationResult,
  InvocationObservedFacts,
  PlannedSemantics,
  StreamEnd,
  TransportFailure,
  InvocationPolicy,
  PlanFailure,
  PlanResult,
  SendResult,
} from '@omne-harness-lite/model-request-runtime'
import { ownPlanInput, preflightMissingInputLimits } from './input.ts'
import {
  createCredentialRedactionPolicy,
  CredentialRedactionConfigurationError,
} from '@omne-harness-lite/model-request-runtime'
import { ownedHeaders, processFailure } from './invoke-policy.ts'
import type { BoundCredentialRedaction } from '@omne-harness-lite/model-request-runtime'
import { createInvocationDiagnostics, drainDiagnosticThenable } from './invocation-diagnostics.ts'
import { projectCalibrationDiagnostic } from './calibration-diagnostic.ts'

const noReadFacts = Object.freeze({
  usage: Object.freeze({
    input_tokens: 'unknown',
    output_tokens: 'unknown',
    cache_read_tokens: 'unknown',
    cache_write_tokens: 'unknown',
    source: 'none',
  }),
  cost: Object.freeze({ cost_usd: 'unknown', source: 'none' }),
  observedInput: Object.freeze({ kind: 'unavailable', reason: 'send_unknown' }),
} as const)
function hasTrims(value: TrimSummary): boolean {
  return (
    ExactDecimal.from(value.merged).compare(ExactDecimal.from(0)) !== 0 ||
    ExactDecimal.from(value.cut).compare(ExactDecimal.from(0)) !== 0 ||
    ExactDecimal.from(value.omittedBytes).compare(ExactDecimal.from(0)) !== 0 ||
    Object.values(value.byReason).some(
      count => ExactDecimal.from(count).compare(ExactDecimal.from(0)) !== 0,
    )
  )
}
function validStatusCauseTable(policy: InvocationPolicy): boolean {
  return (
    policy.statusCauseTable !== undefined &&
    policy.statusCauseTable !== null &&
    typeof policy.statusCauseTable === 'object' &&
    Object.entries(policy.statusCauseTable).every(
      ([key, value]) =>
        /^[1-5][0-9]{2}$/.test(key) &&
        ['credential_unavailable', 'request_rejected', 'upstream_unavailable'].includes(value),
    )
  )
}
function policyValid(policy: InvocationPolicy): boolean {
  return (
    policy !== undefined &&
    policy !== null &&
    typeof policy === 'object' &&
    typeof policy.now === 'function' &&
    typeof policy.schedule === 'function' &&
    typeof policy.diagnostic === 'function' &&
    validStatusCauseTable(policy) &&
    [policy.firstContentTimeoutMs, policy.idleContentTimeoutMs].every(
      v => Number.isFinite(v) && v > 0,
    )
  )
}
function rejectionHandle(failure: PlanFailure): ModelInvocationHandle {
  return Object.freeze({
    outcome: Promise.resolve(failure),
    snapshot: () => ({ blocks: [], position: 0 }),
    observedFacts: () => ({ unavailable: true }) as const,
    abort: () => {},
  })
}
function prepareInvocationInput<P extends PlannedSemantics, R>(input: InvocationInput<P, R>) {
  const owned = input && ownPlanInput(input)
  const missing = input && !owned ? preflightMissingInputLimits(input) : null
  const requested = owned ?? missing?.input
  return { requested, missing }
}
function credentialValid<P extends PlannedSemantics, R>(input: InvocationInput<P, R>): boolean {
  return (
    typeof input.credential === 'string' &&
    !!input.credential.trim() &&
    !/[^\x20-\x7e]/.test(input.credential)
  )
}
function callbacksValid<P extends PlannedSemantics, R>(input: InvocationInput<P, R>): boolean {
  return !(
    (input.beforeSend !== undefined && typeof input.beforeSend !== 'function') ||
    (input.beforeFirstContent !== undefined && typeof input.beforeFirstContent !== 'function') ||
    (input.onAccepted !== undefined && typeof input.onAccepted !== 'function')
  )
}
function invocationInputValid<P extends PlannedSemantics, R>(
  input: InvocationInput<P, R>,
): boolean {
  return (
    credentialValid(input) &&
    input.signal instanceof AbortSignal &&
    policyValid(input.policy) &&
    callbacksValid(input)
  )
}
function transportAvailable<P extends PlannedSemantics, R>(input: InvocationInput<P, R>): boolean {
  return !(
    !input.transport ||
    typeof input.transport.plan !== 'function' ||
    typeof input.transport.projectOutput !== 'function' ||
    typeof input.transport.send !== 'function' ||
    typeof input.transport.read !== 'function'
  )
}
function bindInvocationCredential<P extends PlannedSemantics, R>(
  input: InvocationInput<P, R>,
): { bound: BoundCredentialRedaction } | { failureHandle: ModelInvocationHandle } {
  try {
    const policy = createCredentialRedactionPolicy(input.policy.credentialRedaction)
    const binding = policy.bind(input.credential)
    if ('rejected' in binding)
      return { failureHandle: rejectionHandle({ rejected: 'invalidInput', reason: 'malformed' }) }
    return { bound: binding.ok }
  } catch (error) {
    if (error instanceof CredentialRedactionConfigurationError)
      return { failureHandle: rejectionHandle({ rejected: 'invalidInput', reason: 'malformed' }) }
    try {
      const returned: unknown = input.policy.diagnostic({
        kind: 'model_invocation.policy_bind_defect',
      })
      drainDiagnosticThenable(returned)
    } catch {
      /* isolated diagnostic sink */
    }
    return {
      failureHandle: Object.freeze({
        outcome: Promise.reject(new Error('model_invocation.policy_bind_defect')),
        snapshot: () => ({ blocks: [], position: 0 }),
        observedFacts: () => ({ unavailable: true }) as const,
        abort: () => {},
      }),
    }
  }
}
/** A single stateless send. No log, registry, credentials factory, retry or global context. */
export function invokeModel<P extends PlannedSemantics, R>(
  input: InvocationInput<P, R>,
): ModelInvocationHandle {
  const { requested, missing } = prepareInvocationInput(input)
  if (!input || (!requested && !missing) || !invocationInputValid(input))
    return rejectionHandle({ rejected: 'invalidInput', reason: 'malformed' })
  const binding = bindInvocationCredential(input)
  if ('failureHandle' in binding) return binding.failureHandle
  const bound = binding.bound
  let legacyDiagnosticEnabled = true
  const diagnose = (kind: string) => {
    if (!legacyDiagnosticEnabled) return
    try {
      const returned: unknown = input.policy.diagnostic({ kind })
      if (drainDiagnosticThenable(returned)) legacyDiagnosticEnabled = false
    } catch {
      legacyDiagnosticEnabled = false
    }
  }
  const diagnostics = createInvocationDiagnostics(input, bound, diagnose)
  diagnostics.record({
    source: 'invocation',
    stage: 'admission',
    outcome: 'started',
    facts: { kind: 'decision' },
  })
  diagnostics.record({
    source: 'invocation',
    stage: 'credential',
    outcome: 'accepted',
    facts: { kind: 'decision', credentialPresent: true },
  })
  if (!transportAvailable(input)) {
    diagnostics.record({
      source: 'invocation',
      stage: 'admission',
      outcome: 'unavailable',
      facts: { kind: 'decision' },
    })
    diagnostics.close()
    return rejectionHandle({ rejected: 'unavailable' })
  }
  // Capture this invocation's values and borrowed ports before any asynchronous work.
  // The caller still owns the lifetime of each function/resource it supplied.
  input = Object.freeze({
    ...input,
    ...requested,
    policy: Object.freeze({
      ...input.policy,
      statusCauseTable: Object.freeze({ ...input.policy.statusCauseTable }),
    }),
    transport: Object.freeze({
      plan: input.transport.plan.bind(input.transport),
      projectOutput: input.transport.projectOutput.bind(input.transport),
      send: input.transport.send.bind(input.transport),
      read: input.transport.read.bind(input.transport),
    }),
  })
  const initial = start(input.target)
  if ('rejected' in initial) {
    diagnostics.close()
    return rejectionHandle({ rejected: 'invalidInput', reason: 'malformed' })
  }
  diagnostics.record({
    source: 'invocation',
    stage: 'admission',
    outcome: 'accepted',
    facts: { kind: 'decision' },
  })
  let state: AssemblyState = initial.ok
  const controller = new AbortController()
  let terminal = false,
    explicitlyCancelled = false,
    timedOut = false,
    sentAt: string | undefined,
    firstTokenAt: string | undefined
  let runStopped = false
  let readerStopped = true
  let retainedAccount: ModelAssemblyAccount | undefined
  let retainedHeaders: RawHeaders | undefined
  let retainedServing: StreamEnd | undefined
  let retainedCalibration: InputCalibration | undefined
  let completed: ModelInvocationResult | undefined
  const gates = new Set<Promise<'accepted' | 'failed'>>()
  let disposeTimer: () => void = () => {}
  const cancel = () => {
    if (!terminal) {
      explicitlyCancelled = true
      controller.abort()
      diagnose('model_invocation.cancel_requested')
      diagnostics.record({
        source: 'invocation',
        stage: 'stream_end',
        outcome: 'cancel_requested',
        facts: { kind: 'transport' },
      })
    }
  }
  input.signal.addEventListener('abort', cancel, { once: true })
  if (input.signal.aborted) cancel()
  function deadline(milliseconds: number) {
    disposeTimer()
    disposeTimer = input.policy.schedule(milliseconds, () => {
      if (!terminal) {
        timedOut = true
        controller.abort()
        diagnose('model_invocation.deadline')
        diagnostics.record({
          source: 'invocation',
          stage: 'stream_end',
          outcome: 'cancel_requested',
          facts: { kind: 'transport' },
        })
      }
    })
  }
  function consume(event: ArrivalEvent): void {
    const next = accept(state, event)
    if ('rejected' in next) throw new Error(`transport arrival rejected: ${next.rejected}`)
    state = next.ok
    if (input.onAccepted) {
      try {
        input.onAccepted(event, snapshot(state))
      } catch {
        diagnose('model_invocation.observer_failed')
      }
    }
  }
  async function firstGate(): Promise<boolean> {
    if (!input.beforeFirstContent) return !controller.signal.aborted
    diagnose('model_invocation.gate_waiting')
    diagnostics.record({
      source: 'invocation',
      stage: 'content_gate',
      outcome: 'waiting',
      facts: { kind: 'transport', gate: 'waiting' },
    })
    let remove = () => {}
    const cancelled = new Promise<'cancelled'>(resolve => {
      const abort = () => resolve('cancelled')
      remove = () => controller.signal.removeEventListener('abort', abort)
      controller.signal.addEventListener('abort', abort, { once: true })
      if (controller.signal.aborted) abort()
    })
    // The caller owns an external durable append. Ending our wait does not claim it stopped.
    const before = input.beforeFirstContent
    const gate = Promise.resolve()
      .then(before)
      .then(
        () => 'accepted' as const,
        () => 'failed' as const,
      )
    gates.add(gate)
    gate.then(() => gates.delete(gate))
    try {
      const result = await Promise.race([gate, cancelled])
      if (result === 'failed') {
        diagnose('model_invocation.gate_failed')
        diagnostics.record({
          source: 'invocation',
          stage: 'content_gate',
          outcome: 'failed',
          facts: { kind: 'transport', gate: 'failed' },
        })
        return false
      }
      if (result !== 'accepted' || controller.signal.aborted) return false
      diagnose('model_invocation.gate_accepted')
      diagnostics.record({
        source: 'invocation',
        stage: 'content_gate',
        outcome: 'accepted',
        facts: { kind: 'transport', gate: 'accepted' },
      })
      return true
    } finally {
      remove()
    }
  }
  const run = async (): Promise<InvocationOutcome> => {
    let planned: P | undefined,
      end: StreamEnd | undefined,
      gateFailed = false,
      rawHeaders: RawHeaders | undefined,
      headerFailure: TransportFailure | undefined
    let arrivalFailure = false
    function planningDecision(
      plan: PlanResult<P>,
    ): { planned: P } | { stopped: Exclude<InvocationOutcome, ModelInvocationResult> } {
      if (controller.signal.aborted) return { stopped: { cancelledBeforeSend: true } }
      if (missing) {
        if (
          'rejected' in plan &&
          ((plan.rejected === 'invalidInput' && plan.reason === 'malformed') ||
            plan.rejected === 'modality_not_carried' ||
            plan.rejected === 'orphan_tool_call' ||
            plan.rejected === 'tool_internal_in_request')
        )
          return { stopped: plan }
        return {
          stopped: {
            rejected: 'invalidInput',
            reason: 'input_limit_missing',
            metrics: missing.metrics,
          },
        }
      }
      if ('rejected' in plan) {
        diagnostics.record({
          source: 'invocation',
          stage: 'planning',
          outcome: 'rejected',
          facts: { kind: 'decision' },
        })
        return { stopped: plan }
      }
      return { planned: plan.planned }
    }
    function requestPlan(): Promise<PlanResult<P>> {
      diagnostics.record({
        source: 'invocation',
        stage: 'planning',
        outcome: 'started',
        facts: { kind: 'decision' },
      })
      return input.transport.plan(missing ? missing.original : input, {
        signal: controller.signal,
        ...(input.reuseScope === undefined ? {} : { reuseScope: input.reuseScope }),
      })
    }
    function recordPlanned(planned: P): void {
      const measurementDiagnostic = projectCalibrationDiagnostic(planned, bound)
      if (measurementDiagnostic) {
        diagnostics.record({
          source: 'invocation',
          stage: 'binding',
          outcome: 'accepted',
          binding: measurementDiagnostic.binding,
          facts: { kind: 'decision' },
        })
      } else diagnose('model_invocation.diagnostic_projection_failed')
      diagnostics.record({
        source: 'invocation',
        stage: 'planning',
        outcome: 'accepted',
        ...(measurementDiagnostic ? { binding: measurementDiagnostic.binding } : {}),
        facts: measurementDiagnostic?.facts ?? { kind: 'decision' },
      })
      try {
        for (const parameter of planned.droppedParameters ?? []) {
          const checked = bound.text(parameter)
          if ('ok' in checked && checked.ok === parameter)
            diagnostics.record({
              source: 'invocation',
              stage: 'planning',
              outcome: 'accepted',
              facts: { kind: 'decision', adjustment: 'omitted', parameter },
            })
        }
      } catch {
        diagnose('model_invocation.diagnostic_projection_failed')
      }
    }
    function sendAdmission(
      actualAt: string,
    ): { sentAt: string } | { stopped: Exclude<InvocationOutcome, ModelInvocationResult> } {
      let admitted: unknown = true
      try {
        if (input.beforeSend !== undefined) admitted = input.beforeSend()
      } catch {
        return { stopped: { rejected: 'unavailable' } }
      }
      if (admitted !== true && admitted !== false) return { stopped: { rejected: 'unavailable' } }
      if (!admitted || controller.signal.aborted) return { stopped: { cancelledBeforeSend: true } }
      sentAt = actualAt
      return { sentAt: actualAt }
    }
    function retainSendHeaders(sent: Exclude<SendResult<R>, { readonly rejected: unknown }>): void {
      if (sent.rawHeaders !== undefined) {
        if (ownedHeaders(sent.rawHeaders)) {
          rawHeaders = sent.rawHeaders
          retainedHeaders = sent.rawHeaders
        } else {
          diagnose('model_invocation.response_headers_port_violation')
          headerFailure =
            'failed' in sent
              ? { ...sent.failed, localError: 'response_headers_port' }
              : { source: 'local', localError: 'response_headers_port' }
          controller.abort()
        }
      }
    }
    function receiveSend(
      sent: SendResult<R>,
      planned: P,
    ):
      | { failure: PlanFailure }
      | { reader: AsyncGenerator<ArrivalEvent, StreamEnd> }
      | { terminal: true } {
      diagnostics.record({
        source: 'invocation',
        stage: 'send',
        outcome: 'response' in sent ? 'accepted' : 'failed',
        facts: { kind: 'transport', requestedProvider: input.provider },
      })
      if ('rejected' in sent)
        return {
          failure:
            sent.rejected === 'invalidInput'
              ? { rejected: 'invalidInput', reason: 'malformed' }
              : { rejected: 'unavailable' },
        }
      retainSendHeaders(sent)
      if ('response' in sent) {
        const reader = input.transport.read(
          sent.response,
          planned,
          controller.signal,
          diagnostics.transport,
        )
        readerStopped = false
        return { reader }
      } else if ('failed' in sent) end = { failed: sent.failed, readFacts: noReadFacts }
      else if ('aborted' in sent)
        end = { aborted: true, ...(sent.queued ? { queued: true } : {}), readFacts: noReadFacts }
      return { terminal: true }
    }
    function prepareArrival(
      event: ArrivalEvent,
    ): { event: ArrivalEvent; becameContent: boolean } | undefined {
      if (controller.signal.aborted || arrivalFailure) return undefined
      // Use the real assembler to determine whether the candidate first event has content.
      const candidate = accept(state, event)
      if ('rejected' in candidate) {
        arrivalFailure = true
        controller.abort()
        diagnose('model_invocation.arrival_rejected')
        return undefined
      }
      const becameContent =
        snapshot(state).firstContentAt === undefined &&
        snapshot(candidate.ok).firstContentAt !== undefined
      return { event, becameContent }
    }
    function prepareStreamArrival(
      event: ArrivalEvent,
    ):
      | { arrival: { event: ArrivalEvent; becameContent: boolean }; gate: Promise<boolean> }
      | undefined {
      const arrival = prepareArrival(event)
      if (arrival === undefined) return undefined
      if (arrival.becameContent && firstTokenAt === undefined) return { arrival, gate: firstGate() }
      consumeArrival(arrival, false)
      return undefined
    }
    function rejectArrivalGate(): void {
      gateFailed = !controller.signal.aborted
      controller.abort()
    }
    function consumeArrival(
      arrival: { event: ArrivalEvent; becameContent: boolean },
      gated: boolean,
    ): void {
      const { event, becameContent } = arrival
      if (gated) {
        deadline(input.policy.idleContentTimeoutMs)
      } else if (firstTokenAt !== undefined && event.t === 'fill')
        deadline(input.policy.idleContentTimeoutMs)
      if (controller.signal.aborted) return
      try {
        consume(event)
      } catch {
        arrivalFailure = true
        controller.abort()
        diagnose('model_invocation.arrival_rejected')
        return
      }
      if (becameContent && snapshot(state).firstContentAt !== undefined)
        diagnostics.record({
          source: 'invocation',
          stage: 'first_content',
          outcome: 'accepted',
          facts: { kind: 'transport', stream: 'first_content' },
        })
    }
    function retainStreamEnd(end: StreamEnd): void {
      retainedServing = end
      diagnostics.record({
        source: 'invocation',
        stage: 'stream_end',
        outcome: 'ended' in end ? 'completed' : 'failed',
        facts: {
          kind: 'transport',
          stream: 'ended' in end ? 'ended' : 'lost',
          ...('servingProvider' in end && typeof end.servingProvider === 'string'
            ? { servingProvider: end.servingProvider }
            : {}),
        },
      })
    }
    function acceptedStreamEnd(end: StreamEnd): StreamEnd {
      if (headerFailure !== undefined || arrivalFailure) {
        const stopped = end
        return {
          readFacts: stopped.readFacts,
          ...(stopped.upstreamModel === undefined ? {} : { upstreamModel: stopped.upstreamModel }),
          ...(stopped.servingProvider === undefined
            ? {}
            : { servingProvider: stopped.servingProvider }),
          ...(stopped.upstreamRequestId === undefined
            ? {}
            : { upstreamRequestId: stopped.upstreamRequestId }),
          ...(stopped.stopReason === undefined ? {} : { stopReason: stopped.stopReason }),
          failed: headerFailure ?? { source: 'local', localError: 'arrival_rejected' },
        }
      }
      return end
    }
    function timeoutFailure(end: StreamEnd, visible: boolean): Failure {
      const queued = 'aborted' in end && end.queued === true
      return {
        cause: visible ? 'interrupted_mid_reply' : queued ? 'unrecognized' : 'upstream_unavailable',
        localError: visible
          ? 'content_timeout'
          : queued
            ? 'local_queue_timeout'
            : 'first_content_timeout',
      }
    }
    function streamFailure(
      end: Extract<StreamEnd, { readonly failed: unknown }>,
      visible: boolean,
    ): Failure {
      const { localError: _generatedStage, ...headerFact } = end.failed
      const processed = processFailure(
        headerFailure === undefined ? end.failed : headerFact,
        bound,
        diagnose,
      )
      if (processed.processingFailed) controller.abort()
      const fact = processed.fact
      const base = {
        cause: classifyCause(fact, visible, input.policy.statusCauseTable),
        ...(fact.upstreamError ? { upstreamError: fact.upstreamError } : {}),
        ...(headerFailure !== undefined
          ? { localError: 'response_headers_port' }
          : fact.localError
            ? { localError: fact.localError }
            : {}),
      }
      return fact.inBand
        ? { ...base, inBand: true, statusCode: fact.statusCode }
        : { ...base, ...(fact.statusCode === undefined ? {} : { statusCode: fact.statusCode }) }
    }
    function terminalDecision(
      end: StreamEnd,
      visible: boolean,
    ): { reason: 'end' | 'max_tokens' | 'interrupted' | 'lost'; failure?: Failure } {
      if (gateFailed) {
        return {
          failure: { cause: 'unrecognized', localError: 'before_first_content' },
          reason: 'lost',
        }
      }
      // The transport may already have stopped normally while yielding its final close/account.
      // A later abort from such a callback cannot replace that established terminal fact.
      else if ('ended' in end && visible) {
        return { reason: end.ended }
      } else if (explicitlyCancelled) {
        return { reason: 'interrupted' }
      } else if (timedOut) {
        return { failure: timeoutFailure(end, visible), reason: 'lost' }
      } else if ('rejected' in end) {
        return {
          failure: { cause: 'unrecognized', localError: `transport_read_${end.rejected}` },
          reason: 'lost',
        }
      } else if ('failed' in end) {
        return { failure: streamFailure(end, visible), reason: 'lost' }
      } else if ('aborted' in end) {
        return { reason: 'interrupted' }
      } else if (!visible) {
        return {
          failure: { cause: 'upstream_unavailable', localError: 'empty model response' },
          reason: 'lost',
        }
      } else return { reason: end.ended }
    }
    function arrivalError(failure: Failure | undefined): ArrivalError | undefined {
      return failure
        ? {
            cause: failure.cause,
            ...(failure.inBand
              ? { statusCode: failure.statusCode, inBand: true }
              : failure.statusCode === undefined
                ? {}
                : { statusCode: failure.statusCode }),
          }
        : undefined
    }
    function responseOutcome(
      reason: 'end' | 'max_tokens' | 'interrupted' | 'lost',
    ): ModelInvocationResult['outcome'] {
      return reason === 'end'
        ? 'complete'
        : reason === 'max_tokens'
          ? 'truncated'
          : reason === 'interrupted'
            ? 'interrupted'
            : 'failed'
    }
    function outputSource(
      settled: Extract<ReturnType<typeof closeOut>, { readonly ok: unknown }>,
      outcome: ModelInvocationResult['outcome'],
      visible: boolean,
    ): 'none' | 'reply' | 'delivered' {
      return settled.ok.blocks.length === 0
        ? 'none'
        : outcome === 'complete' ||
            outcome === 'truncated' ||
            (outcome === 'interrupted' && visible)
          ? 'reply'
          : 'delivered'
    }
    function projectOutputGroup(
      planned: P,
      settled: Extract<ReturnType<typeof closeOut>, { readonly ok: unknown }>,
      source: 'none' | 'reply' | 'delivered',
      end: StreamEnd,
    ): OutputGroupEvidence {
      let outputGroup: OutputGroupEvidence = { kind: 'unavailable', reason: 'not_retained' }
      try {
        const projected = input.transport.projectOutput(planned, {
          blocks: settled.ok.blocks,
          source,
          completeness: 'ended' in end ? 'complete' : 'partial',
        })
        if ('projected' in projected) outputGroup = projected.projected
        else diagnose('model_invocation.output_projection_unavailable')
      } catch {
        diagnose('model_invocation.output_projection_failed')
      }
      return outputGroup
    }
    function responseEnding(
      outcome: ModelInvocationResult['outcome'],
      visible: boolean,
    ): Pick<ModelInvocationResult, 'ending'> {
      return outcome === 'complete'
        ? { ending: 'complete' }
        : outcome === 'truncated'
          ? { ending: 'truncated_at_limit' }
          : outcome === 'interrupted' && visible
            ? { ending: 'interrupted_by_user' }
            : {}
    }
    function plannedResultFields(
      planned: P,
    ): Pick<
      ModelInvocationResult,
      | 'routeName'
      | 'provider'
      | 'adaptation'
      | 'parameters'
      | 'parameterAdjustments'
      | 'droppedParameters'
    > {
      return {
        routeName: planned.input.routeName,
        provider: planned.input.provider,
        adaptation: planned.input.snapshot.adaptation,
        parameters: planned.parameters,
        ...(planned.parameterAdjustments
          ? { parameterAdjustments: planned.parameterAdjustments }
          : {}),
        ...(planned.droppedParameters ? { droppedParameters: planned.droppedParameters } : {}),
      }
    }
    function servingResultFields(
      end: StreamEnd,
    ): Pick<
      ModelInvocationResult,
      'upstreamModel' | 'servingProvider' | 'upstreamRequestId' | 'stopReason'
    > {
      return {
        ...(end.upstreamModel ? { upstreamModel: end.upstreamModel } : {}),
        ...(end.servingProvider ? { servingProvider: end.servingProvider } : {}),
        ...(end.upstreamRequestId ? { upstreamRequestId: end.upstreamRequestId } : {}),
        ...(end.stopReason ? { stopReason: end.stopReason } : {}),
      }
    }
    function accountTrims(account: ModelAssemblyAccount): Pick<ModelInvocationResult, 'trims'> {
      return hasTrims(account.trims) ? { trims: account.trims } : {}
    }
    function handoffMeasurements(end: StreamEnd) {
      return {
        ...(end.readFacts.usage.input_tokens === 'unknown'
          ? {}
          : { inputTokens: end.readFacts.usage.input_tokens }),
        ...(end.readFacts.usage.output_tokens === 'unknown'
          ? {}
          : { outputTokens: end.readFacts.usage.output_tokens }),
        ...(end.readFacts.usage.cache_read_tokens === 'unknown'
          ? {}
          : { cacheReadTokens: end.readFacts.usage.cache_read_tokens }),
        ...(end.readFacts.usage.cache_write_tokens === 'unknown'
          ? {}
          : { cacheWriteTokens: end.readFacts.usage.cache_write_tokens }),
        ...(end.readFacts.cost.cost_usd === 'unknown'
          ? {}
          : { costUsd: end.readFacts.cost.cost_usd }),
      }
    }
    function retainStoppedAccount(): void {
      // The original assembler owns accepted account and trim facts. A stopped stream
      // without a finish is abandoned only inside this terminated invocation owner.
      if (readerStopped && retainedAccount === undefined) {
        try {
          const closed = closeOut(state)
          const settled = 'ok' in closed ? closed : abandon(state)
          if ('ok' in settled && 'usage' in settled.ok.account) retainedAccount = settled.ok.account
        } catch {
          // Without an actual assembler settlement, facts remain unavailable.
        }
      }
    }
    function retainMissingCalibration(planned: P | undefined): void {
      if (retainedCalibration === undefined) {
        retainedCalibration =
          sentAt === undefined
            ? {
                requestInput: { kind: 'unavailable', reason: 'not_sent' },
                observedInput: { kind: 'unavailable', reason: 'not_sent' },
                outputGroup: { kind: 'unavailable', reason: 'not_sent' },
              }
            : {
                requestInput: planned?.requestInput ?? {
                  kind: 'unavailable',
                  reason: 'send_unknown',
                },
                observedInput: { kind: 'unavailable', reason: 'send_unknown' },
                outputGroup: { kind: 'unavailable', reason: 'not_retained' },
              }
      }
    }
    function stopInvocation(): void {
      terminal = true
      disposeTimer()
      input.signal.removeEventListener('abort', cancel)
      runStopped = readerStopped
      diagnose('model_invocation.stopped')
      if (runStopped)
        diagnostics.record({
          source: 'invocation',
          stage: 'stream_end',
          outcome: 'stopped',
          facts: { kind: 'transport' },
        })
      diagnostics.close()
    }
    async function settleResult(
      planned: P,
      receivedEnd: StreamEnd | undefined,
      startedAt: string,
    ): Promise<ModelInvocationResult> {
      if (receivedEnd === undefined) throw new Error('transport omitted terminal facts')
      let end = receivedEnd
      retainStreamEnd(end)
      end = acceptedStreamEnd(end)
      const visible = snapshot(state).firstContentAt !== undefined
      const { failure, reason } = terminalDecision(end, visible)
      const error = arrivalError(failure)
      consume(
        reason === 'lost'
          ? { t: 'finish', reason, ...(error ? { error } : {}) }
          : { t: 'finish', reason },
      )
      const settled = closeOut(state)
      if ('rejected' in settled || !('usage' in settled.ok.account))
        throw new Error('model assembler did not settle')
      const account = settled.ok.account
      retainedAccount = account
      const outcome = responseOutcome(reason)
      const source = outputSource(settled, outcome, visible)
      const outputGroup = projectOutputGroup(planned, settled, source, end)
      const inputCalibration: InputCalibration = Object.freeze({
        requestInput: planned.requestInput,
        observedInput: end.readFacts.observedInput,
        outputGroup,
      })
      retainedCalibration = inputCalibration
      terminal = true // The assembler result is fixed before asynchronous timestamp acquisition.
      const value: ModelInvocationResult = {
        inputCalibration,
        outcome,
        ...(rawHeaders === undefined ? {} : { rawHeaders }),
        blocks: settled.ok.blocks,
        ...responseEnding(outcome, visible),
        ...(failure ? { failure } : {}),
        timing: {
          sentAt: startedAt,
          ...(firstTokenAt === undefined ? {} : { firstTokenAt }),
          endedAt: await input.policy.now(),
        },
        usage: end.readFacts.usage,
        cost: end.readFacts.cost,
        ...plannedResultFields(planned),
        ...servingResultFields(end),
        ...accountTrims(account),
      }
      completed = Object.freeze(value)
      diagnostics.record({
        source: 'invocation',
        stage: 'reply_handoff',
        outcome: 'completed',
        facts: {
          kind: 'progress',
          responseOutcome: outcome,
          ...handoffMeasurements(end),
        },
      })
      return completed
    }
    try {
      if (controller.signal.aborted) return { cancelledBeforeSend: true }
      const plan = await requestPlan()
      const decision = planningDecision(plan)
      if ('stopped' in decision) return decision.stopped
      planned = decision.planned
      recordPlanned(planned)
      if (controller.signal.aborted) return { cancelledBeforeSend: true }
      deadline(input.policy.firstContentTimeoutMs)
      const actualAt = await input.policy.now()
      if (controller.signal.aborted) return { cancelledBeforeSend: true }
      const sendDecision = sendAdmission(actualAt)
      if ('stopped' in sendDecision) return sendDecision.stopped
      diagnostics.record({
        source: 'invocation',
        stage: 'send',
        outcome: 'started',
        facts: { kind: 'transport', requestedProvider: input.provider },
      })
      const sent = await input.transport.send(
        planned,
        input.credential,
        controller.signal,
        diagnostics.transport,
      )
      const received = receiveSend(sent, planned)
      if ('failure' in received) return received.failure
      if ('reader' in received) {
        const reader = received.reader
        try {
          while (true) {
            const next = await reader.next()
            if (next.done) {
              end = next.value
              readerStopped = true
              break
            }
            const gated = prepareStreamArrival(next.value)
            if (gated === undefined) continue
            if (!(await gated.gate)) {
              rejectArrivalGate()
              continue
            }
            const at = await input.policy.now()
            if (controller.signal.aborted) continue
            firstTokenAt = at
            consumeArrival(gated.arrival, true)
          }
        } finally {
          // Ordinary abort and rejection drive next() to the reader's owned final facts.
          // This closes only a provider that threw instead of handing those facts over.
          if (!readerStopped) {
            controller.abort()
            await reader.return({ aborted: true, readFacts: noReadFacts })
          }
          readerStopped = true
        }
      }
      return await settleResult(planned, end, sendDecision.sentAt)
    } finally {
      retainStoppedAccount()
      retainMissingCalibration(planned)
      stopInvocation()
    }
  }
  const outcome = run()
  function observedFacts():
    { readonly facts: InvocationObservedFacts } | { readonly unavailable: true } {
    if (
      !runStopped ||
      gates.size !== 0 ||
      retainedAccount === undefined ||
      retainedCalibration === undefined
    )
      return { unavailable: true }
    const account = completed ?? retainedServing?.readFacts ?? retainedAccount
    const end = completed ?? retainedServing
    const trims = completed?.trims ?? retainedAccount.trims
    const facts: InvocationObservedFacts = Object.freeze({
      ...(sentAt === undefined ? {} : { sentAt }),
      ...(retainedHeaders === undefined ? {} : { rawHeaders: retainedHeaders }),
      inputCalibration: retainedCalibration,
      usage: account.usage,
      cost: account.cost,
      ...(hasTrims(trims) ? { trims } : {}),
      ...(end?.upstreamModel === undefined ? {} : { upstreamModel: end.upstreamModel }),
      ...(end?.servingProvider === undefined ? {} : { servingProvider: end.servingProvider }),
      ...(end?.upstreamRequestId === undefined ? {} : { upstreamRequestId: end.upstreamRequestId }),
      ...(end?.stopReason === undefined ? {} : { stopReason: end.stopReason }),
    })
    return { facts }
  }
  return Object.freeze({ outcome, snapshot: () => snapshot(state), observedFacts, abort: cancel })
}
