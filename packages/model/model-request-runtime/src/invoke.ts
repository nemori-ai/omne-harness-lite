import {
  start,
  snapshot,
  accept,
  closeOut,
  type AssemblyState,
} from '@omne-harness-lite/stream-assembly'
import type { ArrivalEvent, ArrivalError } from '@omne-harness-lite/arrival-events'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { Failure, RawHeaders } from '@omne-harness-lite/model-response/v5'
import type {
  InvocationInput,
  ModelInvocationHandle,
  InvocationOutcome,
  ModelInvocationResult,
  PlannedSemantics,
  StreamEnd,
  TransportFailure,
  InvocationPolicy,
} from './types.ts'
import { ownPlanInput } from './input.ts'
import {
  createCredentialRedactionPolicy,
  CredentialRedactionConfigurationError,
} from './credential-redaction.ts'
import { ownedHeaders, processFailure } from './invoke-policy.ts'
import type { BoundCredentialRedaction } from './credential-redaction-types.ts'

export function classifyCause(
  fact: TransportFailure,
  hasContent: boolean,
  table: InvocationPolicy['statusCauseTable'],
): Failure['cause'] {
  if (hasContent) return 'interrupted_mid_reply'
  if (fact.source === 'connect' || fact.source === 'stream_broken') return 'upstream_unavailable'
  if (fact.source === 'http_status' || fact.source === 'in_band') {
    if (fact.statusCode === undefined) return 'unrecognized'
    const status = ExactDecimal.from(fact.statusCode)
    for (const [key, cause] of Object.entries(table))
      if (status.compare(ExactDecimal.from(new LosslessNumber(key))) === 0) return cause
  }
  return 'unrecognized'
}
function policyValid(policy: InvocationPolicy): boolean {
  return (
    policy !== undefined &&
    policy !== null &&
    typeof policy === 'object' &&
    typeof policy.now === 'function' &&
    typeof policy.schedule === 'function' &&
    typeof policy.diagnostic === 'function' &&
    policy.statusCauseTable !== undefined &&
    policy.statusCauseTable !== null &&
    typeof policy.statusCauseTable === 'object' &&
    Object.entries(policy.statusCauseTable).every(
      ([key, value]) =>
        /^[1-5][0-9]{2}$/.test(key) &&
        ['credential_unavailable', 'request_rejected', 'upstream_unavailable'].includes(value),
    ) &&
    [policy.firstContentTimeoutMs, policy.idleContentTimeoutMs].every(
      v => Number.isSafeInteger(v) && v > 0,
    )
  )
}
function rejectionHandle(reason: 'invalidInput' | 'unavailable'): ModelInvocationHandle {
  return Object.freeze({
    outcome: Promise.resolve({ rejected: reason }),
    snapshot: () => ({ blocks: [], position: 0 }),
    abort: () => {},
  })
}
/** A single stateless send. No log, registry, credentials factory, retry or global context. */
export function invokeModel<P extends PlannedSemantics, R>(
  input: InvocationInput<P, R>,
): ModelInvocationHandle {
  const requested = input && ownPlanInput(input)
  if (
    !input ||
    !requested ||
    typeof input.credential !== 'string' ||
    !input.credential.trim() ||
    /[^\x20-\x7e]/.test(input.credential) ||
    !(input.signal instanceof AbortSignal) ||
    !policyValid(input.policy) ||
    (input.beforeFirstContent !== undefined && typeof input.beforeFirstContent !== 'function') ||
    (input.onAccepted !== undefined && typeof input.onAccepted !== 'function')
  )
    return rejectionHandle('invalidInput')
  let bound: BoundCredentialRedaction
  try {
    const policy = createCredentialRedactionPolicy(input.policy.credentialRedaction)
    const binding = policy.bind(input.credential)
    if ('rejected' in binding) return rejectionHandle('invalidInput')
    bound = binding.ok
  } catch (error) {
    if (error instanceof CredentialRedactionConfigurationError)
      return rejectionHandle('invalidInput')
    try {
      input.policy.diagnostic({ kind: 'model_invocation.policy_bind_defect' })
    } catch {
      /* isolated diagnostic sink */
    }
    return Object.freeze({
      outcome: Promise.reject(new Error('model_invocation.policy_bind_defect')),
      snapshot: () => ({ blocks: [], position: 0 }),
      abort: () => {},
    })
  }
  if (
    !input.transport ||
    typeof input.transport.plan !== 'function' ||
    typeof input.transport.send !== 'function' ||
    typeof input.transport.read !== 'function'
  )
    return rejectionHandle('unavailable')
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
      send: input.transport.send.bind(input.transport),
      read: input.transport.read.bind(input.transport),
    }),
  })
  const initial = start(input.target)
  if ('rejected' in initial) return rejectionHandle('invalidInput')
  let state: AssemblyState = initial.ok
  const controller = new AbortController()
  let terminal = false,
    explicitlyCancelled = false,
    timedOut = false,
    sentAt: string | undefined,
    firstTokenAt: string | undefined
  let disposeTimer: () => void = () => {}
  const diagnose = (kind: string) => {
    try {
      input.policy.diagnostic({ kind })
    } catch {
      /* Separate diagnostic subdomain; it never changes the invocation result. */
    }
  }
  const cancel = () => {
    if (!terminal) {
      explicitlyCancelled = true
      controller.abort()
      diagnose('model_invocation.cancel_requested')
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
    try {
      const result = await Promise.race([gate, cancelled])
      if (result === 'failed') {
        diagnose('model_invocation.gate_failed')
        return false
      }
      if (result !== 'accepted' || controller.signal.aborted) return false
      diagnose('model_invocation.gate_accepted')
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
    try {
      if (controller.signal.aborted) return { cancelledBeforeSend: true }
      const plan = input.transport.plan(input)
      if ('rejected' in plan) return plan
      planned = plan.planned
      if (controller.signal.aborted) return { cancelledBeforeSend: true }
      sentAt = input.policy.now()
      deadline(input.policy.firstContentTimeoutMs)
      const sent = await input.transport.send(planned, input.credential, controller.signal)
      if ('rejected' in sent) return { rejected: sent.rejected }
      if (sent.rawHeaders !== undefined) {
        if (ownedHeaders(sent.rawHeaders)) rawHeaders = sent.rawHeaders
        else {
          diagnose('model_invocation.response_headers_port_violation')
          headerFailure =
            'failed' in sent
              ? { ...sent.failed, localError: 'response_headers_port' }
              : { source: 'local', localError: 'response_headers_port' }
          controller.abort()
        }
      }
      if ('response' in sent) {
        const reader = input.transport.read(sent.response, planned, controller.signal)
        try {
          while (true) {
            const next = await reader.next()
            if (next.done) {
              end = next.value
              break
            }
            const event = next.value
            if (controller.signal.aborted) continue
            // Use the real assembler to determine whether the candidate first event has content.
            const candidate = accept(state, event)
            if ('rejected' in candidate)
              throw new Error(`transport arrival rejected: ${candidate.rejected}`)
            const becameContent =
              snapshot(state).firstContentAt === undefined &&
              snapshot(candidate.ok).firstContentAt !== undefined
            if (becameContent && firstTokenAt === undefined) {
              if (!(await firstGate())) {
                gateFailed = !controller.signal.aborted
                controller.abort()
                continue
              }
              firstTokenAt = input.policy.now()
              deadline(input.policy.idleContentTimeoutMs)
            } else if (firstTokenAt !== undefined && event.t === 'fill')
              deadline(input.policy.idleContentTimeoutMs)
            if (controller.signal.aborted) continue
            consume(event)
          }
        } finally {
          await reader.return({ aborted: true })
        }
      } else end = sent
      if (end === undefined) throw new Error('transport omitted terminal facts')
      if (headerFailure !== undefined) end = { failed: headerFailure }
      const visible = snapshot(state).firstContentAt !== undefined
      let failure: Failure | undefined, reason: 'end' | 'max_tokens' | 'interrupted' | 'lost'
      if (gateFailed) {
        failure = { cause: 'unrecognized', localError: 'before_first_content' }
        reason = 'lost'
      }
      // The transport may already have stopped normally while yielding its final close/account.
      // A later abort from such a callback cannot replace that established terminal fact.
      else if ('ended' in end && visible) {
        reason = end.ended
      } else if (explicitlyCancelled) {
        reason = 'interrupted'
      } else if (timedOut) {
        const queued = 'aborted' in end && end.queued === true
        failure = {
          cause: visible
            ? 'interrupted_mid_reply'
            : queued
              ? 'unrecognized'
              : 'upstream_unavailable',
          localError: visible
            ? 'content_timeout'
            : queued
              ? 'local_queue_timeout'
              : 'first_content_timeout',
        }
        reason = 'lost'
      } else if ('rejected' in end) {
        failure = { cause: 'unrecognized', localError: `transport_read_${end.rejected}` }
        reason = 'lost'
      } else if ('failed' in end) {
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
        failure = fact.inBand
          ? { ...base, inBand: true, statusCode: fact.statusCode }
          : { ...base, ...(fact.statusCode === undefined ? {} : { statusCode: fact.statusCode }) }
        reason = 'lost'
      } else if ('aborted' in end) {
        reason = 'interrupted'
      } else if (!visible) {
        failure = { cause: 'upstream_unavailable', localError: 'empty model response' }
        reason = 'lost'
      } else reason = end.ended
      const error: ArrivalError | undefined = failure
        ? {
            cause: failure.cause,
            ...(failure.inBand
              ? { statusCode: failure.statusCode, inBand: true }
              : failure.statusCode === undefined
                ? {}
                : { statusCode: failure.statusCode }),
          }
        : undefined
      consume(
        reason === 'lost'
          ? { t: 'finish', reason, ...(error ? { error } : {}) }
          : { t: 'finish', reason },
      )
      const settled = closeOut(state)
      if ('rejected' in settled || !('usage' in settled.ok.account))
        throw new Error('model assembler did not settle')
      const account = settled.ok.account
      const outcome =
        reason === 'end'
          ? 'complete'
          : reason === 'max_tokens'
            ? 'truncated'
            : reason === 'interrupted'
              ? 'interrupted'
              : 'failed'
      const value: ModelInvocationResult = {
        outcome,
        ...(rawHeaders === undefined ? {} : { rawHeaders }),
        blocks: settled.ok.blocks,
        ...(outcome === 'complete'
          ? { ending: 'complete' }
          : outcome === 'truncated'
            ? { ending: 'truncated_at_limit' }
            : outcome === 'interrupted' && visible
              ? { ending: 'interrupted_by_user' }
              : {}),
        ...(failure ? { failure } : {}),
        timing: {
          sentAt,
          ...(firstTokenAt === undefined ? {} : { firstTokenAt }),
          endedAt: input.policy.now(),
        },
        usage: account.usage,
        cost: account.cost,
        routeName: planned.input.routeName,
        provider: planned.input.provider,
        adaptation: planned.input.snapshot.adaptation,
        parameters: planned.parameters,
        ...(planned.parameterAdjustments
          ? { parameterAdjustments: planned.parameterAdjustments }
          : {}),
        ...(planned.droppedParameters ? { droppedParameters: planned.droppedParameters } : {}),
        ...(end.upstreamModel ? { upstreamModel: end.upstreamModel } : {}),
        ...(end.servingProvider ? { servingProvider: end.servingProvider } : {}),
        ...(end.upstreamRequestId ? { upstreamRequestId: end.upstreamRequestId } : {}),
        ...(end.stopReason ? { stopReason: end.stopReason } : {}),
        ...(ExactDecimal.from(account.trims.merged).compare(ExactDecimal.from(0)) !== 0 ||
        ExactDecimal.from(account.trims.cut).compare(ExactDecimal.from(0)) !== 0
          ? { trims: account.trims }
          : {}),
      }
      return Object.freeze(value)
    } finally {
      terminal = true
      disposeTimer()
      input.signal.removeEventListener('abort', cancel)
      diagnose('model_invocation.stopped')
    }
  }
  const outcome = run()
  return Object.freeze({ outcome, snapshot: () => snapshot(state), abort: cancel })
}
