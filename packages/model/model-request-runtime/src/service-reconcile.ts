import {
  judgePendingModelResponse,
  validate as validateModelResponse,
} from '@omne-harness-lite/model-response'
import type { PendingModelResponse, ReplyDisposition } from '@omne-harness-lite/model-response'
import type {
  CallContainerStore,
  ReconcileInput,
  ReconcileResult,
  RuntimeRecoveryAccess,
  RuntimeRecoveryScope,
  SettleReplyInput,
  SettleReplyResult,
  ReservationWaitPolicy,
} from './service-types.ts'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'
import { inspectCurrentModelLogPrefix } from './log-codec-settlement.ts'
import { interpretCallHistory } from './call-history.ts'
import { readSettlementPrefix } from './settlement-prefix.ts'
import { modelLogJsonEqual } from './log-codec.ts'
import type { PlannedSemantics } from './types.ts'
import type {
  SettlementContention,
  SettlementRegistration,
  SettlementScheduler,
  SettlementTask,
} from './settlement-types.ts'

function isServiceDisposition(value: unknown): value is Exclude<ReplyDisposition, 'persisted'> {
  if (value === 'persisted') return false
  try {
    return validateModelResponse('ReplyDisposition', value).valid
  } catch {
    return false
  }
}

/** S-49/S-75: a caller's explicit veto/consumption completes the already fixed reply. */
export async function settlePendingReply(input: {
  readonly request: SettleReplyInput
  readonly pending: PendingModelResponse
  readonly invocation: Pick<AnchoredInvocationHandle, 'settleReply'>
}): Promise<SettleReplyResult> {
  const { request, pending, invocation } = input
  if (
    !isServiceDisposition(request.disposition) ||
    request.session.length === 0 ||
    request.callId.length === 0 ||
    'rejected' in judgePendingModelResponse(pending)
  )
    return { invalidInput: { reason: 'malformed' } }
  if (pending.call.callId !== request.callId) return { callNotFound: true }
  // G-28: a Run's late predicate still requires its real owner and one full prefix.
  if (pending.call.runId !== undefined) return { unavailable: true }
  try {
    const result = await invocation.settleReply(request.disposition)
    if ('unavailable' in result) return { unavailable: true }
    if (result.settled.disposition === 'firstWinner') return { alreadyEnded: true }
    const original = result.settled.response.response
    if (original === null) return { unavailable: true }
    if (
      original.outcome !== 'interrupted' &&
      original.outcome !== 'complete' &&
      original.outcome !== 'truncated'
    )
      return { unavailable: true }
    return {
      callId: request.callId,
      state: original.outcome === 'interrupted' ? 'interrupted' : 'complete',
    }
  } catch {
    // The original invocation retains any unresolved writer after this return.
    return { unavailable: true }
  }
}

/** The original invocation is the only owner that can submit this handed-off reply. */
export function createRuntimeSettleReply<P extends PlannedSemantics, R>(input: {
  readonly calls: CallContainerStore<P, R>
  readonly recovery: RuntimeRecoveryAccess
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly reservationWaitPolicy: ReservationWaitPolicy
}): (request: SettleReplyInput) => Promise<SettleReplyResult> {
  return async request => {
    if (
      !isServiceDisposition(request.disposition) ||
      typeof request.session !== 'string' ||
      request.session.length === 0 ||
      typeof request.callId !== 'string' ||
      request.callId.length === 0
    )
      return { invalidInput: { reason: 'malformed' } }
    const admitted = await input.calls.waitReserve(request, {
      policy: input.reservationWaitPolicy,
      scheduler: input.scheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in admitted) return { unavailable: true }
    const { reservation } = admitted
    try {
      const container = input.calls.find(request)
      if (container === undefined) return await recognizeSettledReply(request, input)
      const view = container.view()
      if (view.operation.phase !== 'reply_pending' || view.invocation === undefined) {
        if (view.operation.phase === 'ready') return await recognizeSettledReply(request, input)
        return { unavailable: true }
      }
      reservation.publish({ phase: 'settling' })
      const result = await settlePendingReply({
        request,
        pending: view.operation.pending,
        invocation: view.invocation,
      })
      if ('callId' in result || 'alreadyEnded' in result) {
        reservation.publish({ phase: 'ready' })
        // Durable success does not depend on whether optional resource cleanup completes now.
        if ('released' in (await container.close())) input.calls.remove(reservation)
      } else {
        reservation.publish(view.operation)
      }
      return result
    } catch {
      return { unavailable: true }
    } finally {
      reservation.release()
    }
  }
}

async function recognizeSettledReply(
  request: SettleReplyInput,
  input: {
    readonly recovery: RuntimeRecoveryAccess
    readonly contention: SettlementContention
  },
): Promise<SettleReplyResult> {
  let entered: Awaited<ReturnType<RuntimeRecoveryAccess['enter']>>
  try {
    entered = await input.recovery.enter({ session: request.session })
  } catch {
    return { unavailable: true }
  }
  if ('unavailable' in entered) return { unavailable: true }
  let result: SettleReplyResult
  try {
    result = await readSettledReply(request, entered.scope, input.contention)
  } catch {
    result = { unavailable: true }
  }
  try {
    await entered.scope.close()
  } catch {
    return { unavailable: true }
  }
  return result
}

async function readSettledReply(
  request: SettleReplyInput,
  scope: RuntimeRecoveryScope,
  contention: SettlementContention,
): Promise<SettleReplyResult> {
  const log = scope.binding.log
  const owner = scope.owner
  if (log.session !== request.session) return { unavailable: true }
  if (
    owner.admission() !== 'open' ||
    'unknown' in owner.opened() ||
    owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const admitted = owner.acquire(contention.limits.concurrent)
  if ('unavailable' in admitted) return { unavailable: true }
  const tasks: SettlementTask<unknown>[] = []
  const registration: SettlementRegistration = {
    start(kind, operation) {
      const task = admitted.registration.start(kind, operation)
      tasks.push(task)
      return task
    },
    release: admitted.registration.release,
  }
  try {
    const read = await readSettlementPrefix({ binding: log, registration })
    if ('unavailable' in read) return { unavailable: true }
    const history = interpretCallHistory({ prefix: read.prefix, callId: request.callId })
    if ('absent' in history) return { callNotFound: true }
    if (!('known' in history)) return { unavailable: true }
    const response = history.known.dispatches.at(-1)?.response?.projection
    if (response === undefined) {
      const phase = history.known.phase
      return phase === null ? { unavailable: true } : { wrongPhase: { phase } }
    }
    if (!modelLogJsonEqual(response.replyDisposition, request.disposition))
      return { alreadyEnded: true }
    if (
      response.outcome !== 'interrupted' &&
      response.outcome !== 'complete' &&
      response.outcome !== 'truncated'
    )
      return { unavailable: true }
    return {
      callId: request.callId,
      state: response.outcome === 'interrupted' ? 'interrupted' : 'complete',
    }
  } finally {
    await Promise.all(tasks.map(task => task.stopped))
    admitted.registration.release()
  }
}

/**
 * The already-settled noRun rows of S-33 need no fabricated timing or write.
 * The host's action-shaped recovery scope establishes the old-writer barrier.
 * Missing-response rows remain unavailable until the original sentAt is durably sourced.
 */
export function createRuntimeReconcile(input: {
  readonly recovery: RuntimeRecoveryAccess
  readonly contention: SettlementContention
}): (request: ReconcileInput) => Promise<ReconcileResult> {
  return async request => {
    if (typeof request.session !== 'string' || request.session.length === 0)
      return { invalidInput: { reason: 'malformed' } }
    let entered: Awaited<ReturnType<RuntimeRecoveryAccess['enter']>>
    try {
      entered = await input.recovery.enter(request)
    } catch {
      return { unavailable: true }
    }
    if ('unavailable' in entered) return { unavailable: true }
    const { scope } = entered
    let result: ReconcileResult = { unavailable: true }
    try {
      result = await readRecoveredCalls(request, scope, input.contention)
    } catch {
      result = { unavailable: true }
    }
    try {
      await scope.close()
    } catch {
      return { unavailable: true }
    }
    return result
  }
}

async function readRecoveredCalls(
  request: ReconcileInput,
  scope: RuntimeRecoveryScope,
  contention: SettlementContention,
): Promise<ReconcileResult> {
  const binding = scope.binding.log
  if (
    binding.session !== request.session ||
    scope.owner.admission() !== 'open' ||
    'unknown' in scope.owner.opened() ||
    scope.owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const admitted = scope.owner.acquire(contention.limits.concurrent)
  if ('unavailable' in admitted) return { unavailable: true }
  const tasks: SettlementTask<unknown>[] = []
  const registration: SettlementRegistration = {
    start(kind, operation) {
      const task = admitted.registration.start(kind, operation)
      tasks.push(task)
      return task
    },
    release: admitted.registration.release,
  }
  try {
    const read = await readSettlementPrefix({ binding, registration })
    if ('unavailable' in read) return { unavailable: true }
    const inspected = inspectCurrentModelLogPrefix({
      session: binding.session,
      tenant: binding.tenant,
      prefix: read.prefix,
    })
    if (!('ok' in inspected)) return { unavailable: true }
    const callIds = new Set<string>()
    for (const item of inspected.ok) {
      const record = item.captured.record
      if (record !== null && 'call' in record) callIds.add(record.call)
      if (item.captured.response !== null) callIds.add(item.captured.response.call.callId)
    }
    const calls: Extract<ReconcileResult, { readonly calls: unknown }>['calls'][number][] = []
    for (const callId of callIds) {
      const history = interpretCallHistory({ prefix: read.prefix, callId })
      if (!('known' in history)) return { unavailable: true }
      const state = history.known.phase
      if (
        state !== 'resumable' &&
        state !== 'awaiting_decision' &&
        state !== 'interrupted' &&
        state !== 'complete' &&
        state !== 'handed_up'
      )
        return { unavailable: true }
      calls.push({ callId, state })
    }
    return { calls: Object.freeze(calls) }
  } finally {
    await Promise.all(tasks.map(task => task.stopped))
    admitted.registration.release()
  }
}
