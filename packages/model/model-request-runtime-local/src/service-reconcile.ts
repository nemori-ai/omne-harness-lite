import type {
  DispatchGuardPhase,
  ReconcileInput,
  ReconcileResult,
  SettleReplyInput,
  SettleReplyResult,
} from '@omne-harness-lite/model-request-runtime'
import { randomUUID } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { RunHistoryReader } from '@omne-harness-lite/model-request-runtime'
import { copyJsonValue, type JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  judgePendingModelResponse,
  judgeResponseFinalization,
  validate as validateModelResponse,
} from '@omne-harness-lite/model-response'
import type { PendingModelResponse, ReplyDisposition } from '@omne-harness-lite/model-response'
import type { AppendResult } from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { CallContainerStore, ReservationWaitPolicy } from './service-types.ts'
import type {
  RuntimeRecoveryAccess,
  RuntimeRecoveryScope,
  RuntimeSessionAccess,
  SessionRuntimeBinding,
  CallKey,
} from '@omne-harness-lite/model-request-runtime'
import type { CallFacts } from './reference-types.ts'
import type { CallAccess } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationHandle } from '@omne-harness-lite/model-request-runtime'
import {
  inspectCurrentModelLogPrefix,
  type ModelLogSettlementTarget,
} from '@omne-harness-lite/model-request-runtime'
import {
  interpretCallHistory,
  rejectAcknowledgedHistory,
} from '@omne-harness-lite/model-request-runtime'
import { acknowledgedFactsFromHistory } from '@omne-harness-lite/model-request-runtime'
import { judgeAcknowledgedSettlement } from './acknowledged-settlement.ts'
import type { AcknowledgementCustody } from './acknowledgement-custody.ts'
import { createSettlementWork, type SettlementWork } from './settlement-work.ts'
import type { ModelCallSettlementWorkStore } from './reference-types.ts'
import {
  interpretSettlementPrefix,
  readSettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import { constructAnchoredInterruption } from '@omne-harness-lite/model-request-runtime'
import { appendControlRecord } from './service-control.ts'
import { UnknownAppendTracker } from './service-calls.ts'
import { operationDiagnostics } from './service-diagnostics.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import type { DiagnosticCollector } from './diagnostics-types.ts'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementContention,
  SettlementDiagnostic,
  SettlementRegistration,
  SettlementScheduler,
  SettlementTask,
  SettlementLogBinding,
  SettlementOwner,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementRequest } from './settlement-types.ts'
import { requestStopAndWait } from './settlement-stop.ts'

interface RecoveryRead {
  readonly registration: SettlementRegistration
  readonly tasks: Set<SettlementTask<unknown>>
}

/** A cold ready reply whose original final batch may have been written. */
interface DurableReplySettlement {
  readonly key: string
  /** The exact original request; later callers never replace it with another disposition. */
  readonly settlement: SettlementRequest
  readonly disposition: SettleReplyInput['disposition']
  /** The runtime's authoritative original; a caller's retainedResult must equal it (S-99③). */
  readonly pending: PendingModelResponse
  readonly state: 'complete' | 'interrupted'
  readonly coordinator: ReturnType<typeof createSettlementCoordinator>
  processing: boolean
}

interface RecoverySettlement {
  readonly coordinator: ReturnType<typeof createSettlementCoordinator>
  task: ReturnType<ReturnType<typeof createSettlementCoordinator>['settle']> | undefined
  readonly target: ModelLogSettlementTarget
}

interface RecoveryEntry {
  readonly session: ReconcileInput['session']
  readonly reads: Set<RecoveryRead>
  readonly settlements: Set<RecoverySettlement>
  readonly unknownControl: UnknownAppendTracker
  readonly pendingControl: Set<CallKey['callId']>
  readonly controlTasks: Set<SettlementTask<AppendResult>>
  /**
   * S-86: a recovery batch whose append may have been written. A later reconcile settles this
   * exact request again instead of constructing another interruption with a new end time.
   */
  readonly originals: Map<string, SettlementRequest>
  entered?: Promise<Awaited<ReturnType<RuntimeRecoveryAccess['enter']>>>
  scope?: RuntimeRecoveryScope
  active: Promise<ReconcileResult> | undefined
  releasing: { readonly finalize: boolean; readonly promise: Promise<boolean> } | undefined
  exitAttempted: boolean
}

function isPendingResponse(value: unknown): value is PendingModelResponse {
  return 'ok' in judgePendingModelResponse(value)
}

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
    'rejected' in judgePendingModelResponse(pending) ||
    // RT12 S-99③: before ACK a caller's value may only equal the authoritative original.
    (request.retainedResult !== undefined && !modelLogJsonEqual(request.retainedResult, pending))
  )
    return { invalidInput: { reason: 'malformed' } }
  if (pending.call.callId !== request.callId) return { callNotFound: true }
  try {
    const result = await invocation.settleReply(request.disposition)
    if ('unavailable' in result) return { unavailable: true }
    if (result.settled.disposition === 'firstWinner') return { alreadyEnded: true }
    const original = result.settled.response.response
    if (original === null) return { unavailable: true }
    if (!modelLogJsonEqual(original.replyDisposition, request.disposition))
      return { alreadyEnded: true }
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

/** A cold ready reply has its own runtime-owned writer until its original batch is resolved. */
export function createRuntimeSettleReply<P extends PlannedSemantics, R>(input: {
  readonly calls: CallContainerStore<P, R>
  readonly sessions: RuntimeSessionAccess
  readonly callAccess: CallAccess
  readonly callFacts: CallFacts
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly reservationWaitPolicy: ReservationWaitPolicy
  readonly run?: RunHistoryReader
  readonly diagnostic: (event: SettlementDiagnostic) => void
  /** RT12 S-99⑧: retires ended post-ACK work rows on the ACK cleanup's one pending mechanism. */
  readonly custody: AcknowledgementCustody
  /** This runtime instance; recorded on each work row it starts. */
  readonly instance: string
}): {
  readonly settleReply: (request: SettleReplyInput) => Promise<SettleReplyResult>
  /** Whether this component currently owns a started post-ACK work of the call. */
  readonly ownsWork: (ref: CallKey) => boolean
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
} {
  const entries = new Map<string, DurableReplySettlement>()
  /** RT12 S-99⑧: started post-ACK write responsibilities, one per CallKey. */
  const works = new Map<string, SettlementWork>()
  let closed = false
  const keyOf = (request: SettleReplyInput): string =>
    JSON.stringify([request.session, request.callId])

  async function settleReply(request: SettleReplyInput): Promise<SettleReplyResult> {
    if (
      !isServiceDisposition(request.disposition) ||
      typeof request.session !== 'string' ||
      request.session.length === 0 ||
      typeof request.callId !== 'string' ||
      request.callId.length === 0
    )
      return { invalidInput: { reason: 'malformed' } }
    // RT12 S-99①⑥: an optional caller-held original, owned before the first await.
    let retainedResult: PendingModelResponse | undefined
    if (request.retainedResult !== undefined) {
      const copied = copyJsonValue(request.retainedResult)
      if (!('ok' in copied) || !isPendingResponse(copied.ok))
        return { invalidInput: { reason: 'malformed' } }
      retainedResult = copied.ok
    }
    if (closed) return { unavailable: true }
    const admitted = await input.calls.waitReserve(request, {
      policy: input.reservationWaitPolicy,
      scheduler: input.scheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in admitted) return { unavailable: true }
    const { reservation } = admitted
    try {
      const container = input.calls.find(request)
      const local = container?.view()
      if (
        !entries.has(keyOf(request)) &&
        container !== undefined &&
        local?.operation.phase === 'reply_pending' &&
        local.invocation !== undefined
      ) {
        reservation.publish({ phase: 'settling' })
        const result = await settlePendingReply({
          request,
          pending: local.operation.pending,
          invocation: local.invocation,
        })
        if ('callId' in result || 'alreadyEnded' in result) {
          reservation.publish({ phase: 'ready' })
          const stopped = await container.close()
          if ('released' in stopped && stopped.released === true) input.calls.remove(reservation)
        } else {
          reservation.publish(local.operation)
        }
        return result
      }
      const bound = await input.sessions.bind(request.session)
      if ('failure' in bound) return { unavailable: true }
      const session = bound.binding
      if (
        session.log.session !== request.session ||
        session.selection.binding.generation !== session.log.generation ||
        !tenantIdEquals(session.selection.binding.tenant, session.log.tenant)
      )
        return { unavailable: true }
      const fact = await input.callFacts.lookup({ binding: session.log, ref: request })
      if ('acknowledged' in fact) {
        // RT12 S-99②: the current settle authority first; ACK grants no disposition right.
        const facts = fact.acknowledged
        const admittedAck = await input.callAccess.check(
          { binding: session.log, ref: request, action: 'settle', origin: facts.origin },
          async (evidence): Promise<SettleReplyResult> => {
            if (
              evidence.action !== 'settle' ||
              evidence.ref.session !== request.session ||
              evidence.ref.callId !== request.callId ||
              evidence.source.generation !== session.log.generation ||
              evidence.revoked.aborted
            )
              return { unavailable: true }
            const judged = judgeAcknowledgedSettlement(request, retainedResult, facts)
            if (!('validated' in judged)) return judged
            return await settleAcknowledged(request, judged.validated, session)
          },
        )
        if ('allowed' in admittedAck) return admittedAck.allowed
        return 'invalidInput' in admittedAck ? admittedAck : { unavailable: true }
      }
      if ('view' in fact && (fact.view.result !== undefined || entries.has(keyOf(request)))) {
        const admittedSettle = await input.callAccess.check(
          { binding: session.log, ref: request, action: 'settle', origin: fact.view.origin },
          async evidence => {
            if (
              evidence.action !== 'settle' ||
              evidence.ref.session !== request.session ||
              evidence.ref.callId !== request.callId ||
              evidence.source.generation !== session.log.generation ||
              ExactDecimal.from(evidence.source.progress).compare(
                ExactDecimal.from(fact.view.source.progress),
              ) !== 0 ||
              evidence.revoked.aborted
            )
              return { unavailable: true } as const
            const key = keyOf(request)
            let entry = entries.get(key)
            if (entry === undefined) {
              // RT12 S-99④⑦/S-86: a committed final decides by itself, after the current settle
              // authority: the same disposition recognizes it, another is alreadyEnded. No value
              // is needed or consulted and nothing is written.
              if (fact.view.result?.disposition === 'final')
                return await recognizeSettledReply(request, input, session)
              if (fact.view.result?.disposition !== 'disposition_pending')
                return { unavailable: true } as const
              const pending = fact.view.result.pending
              // RT12 S-99③: before ACK a caller's value may only equal the authority.
              if (retainedResult !== undefined && !modelLogJsonEqual(retainedResult, pending))
                return { invalidInput: { reason: 'malformed' } } as const
              const final = { ...pending, replyDisposition: request.disposition }
              if ('rejected' in judgeResponseFinalization(pending, final))
                return { unavailable: true } as const
              entry = {
                key,
                settlement: {
                  target: {
                    call: request.callId,
                    dispatch: pending.dispatch,
                    response: pending.id,
                  },
                  current: { messageId: pending.reply.id, disposition: request.disposition },
                  response: final,
                },
                disposition: request.disposition,
                pending,
                state: pending.outcome === 'interrupted' ? 'interrupted' : 'complete',
                coordinator: createSettlementCoordinator({
                  binding: session.log,
                  owner: session.selection.owner,
                  ...(input.run === undefined ? {} : { run: input.run }),
                  settlementContention: input.contention,
                  settlementScheduler: input.scheduler,
                  diagnostic: input.diagnostic,
                }),
                processing: false,
              }
              entries.set(key, entry)
            } else if (
              retainedResult !== undefined &&
              !modelLogJsonEqual(retainedResult, entry.pending)
            )
              return { invalidInput: { reason: 'malformed' } } as const
            if (entry.processing) return { unavailable: true } as const
            entry.processing = true
            try {
              // The same coordinator resolves a retained original before any new submission.
              const task = entry.coordinator.settle(entry.settlement)
              const result = await task.completion
              task.requestStop()
              try {
                await task.stopped
              } catch {
                return { unavailable: true } as const
              }
              if (!('settled' in result)) {
                // Keep the owner while an original batch may exist; otherwise nothing is owned.
                if (result.reason !== 'write_unknown' && (await closeEntry(entry)))
                  entries.delete(key)
                return { unavailable: true } as const
              }
              if (!(await closeEntry(entry))) return { unavailable: true } as const
              entries.delete(key)
              if (
                result.settled.disposition === 'firstWinner' ||
                !modelLogJsonEqual(entry.disposition, request.disposition)
              )
                return { alreadyEnded: true } as const
              return { callId: request.callId, state: entry.state } as const
            } catch {
              return { unavailable: true } as const
            } finally {
              entry.processing = false
            }
          },
        )
        return 'allowed' in admittedSettle ? admittedSettle.allowed : { unavailable: true }
      }
      if (container === undefined) return await recognizeSettledReply(request, input, session)
      if (local?.operation.phase === 'ready')
        return await recognizeSettledReply(request, input, session)
      return { unavailable: true }
    } catch {
      return { unavailable: true }
    } finally {
      reservation.release()
    }
  }

  /**
   * RT12 S-99⑧: a validated caller-held original after ACK starts (or continues) exactly one
   * write responsibility whose batch is durable before each append. A row this component does
   * not own belongs to another instance: only the recovery owner may conclude it (seam R4).
   */
  async function settleAcknowledged(
    request: SettleReplyInput,
    pending: PendingModelResponse,
    session: SessionRuntimeBinding,
  ): Promise<SettleReplyResult> {
    const key = keyOf(request)
    const ref = { session: request.session, callId: request.callId }
    let work = works.get(key)
    if (work === undefined) {
      const existing = await input.callFacts.content.work.read({
        binding: session.log,
        call: request.callId,
        response: pending.id,
      })
      if (!('absent' in existing)) {
        emitWork('work' in existing ? 'settlement_work.foreign' : 'settlement_work.unreadable')
        return { unavailable: true }
      }
      const final = { ...pending, replyDisposition: request.disposition }
      if ('rejected' in judgeResponseFinalization(pending, final)) return { unavailable: true }
      work = createSettlementWork({
        binding: session.log,
        owner: session.selection.owner,
        store: input.callFacts.content.work,
        custody: input.custody,
        instance: input.instance,
        ref,
        request: {
          target: { call: request.callId, dispatch: pending.dispatch, response: pending.id },
          current: { messageId: pending.reply.id, disposition: request.disposition },
          response: final,
        },
        contention: input.contention,
        scheduler: input.scheduler,
        ...(input.run === undefined ? {} : { run: input.run }),
        diagnostic: input.diagnostic,
        // A pre-ACK writer of this call still owned here must actually stop first.
        obstacles: () => (entries.has(key) ? ['writer_in_flight'] : []),
      })
      works.set(key, work)
    }
    const outcome = await work.advance()
    if ('retained' in outcome) return { unavailable: true }
    works.delete(key)
    // Ended: nothing of this work was written; the consumer may apply again with its value.
    if ('ended' in outcome) return { unavailable: true }
    const original = outcome.settled.response.response
    if (
      outcome.settled.disposition === 'firstWinner' ||
      original === null ||
      !modelLogJsonEqual(original.replyDisposition, request.disposition)
    )
      return { alreadyEnded: true }
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

    function emitWork(kind: string): void {
      try {
        drainDiagnosticThenable(
          input.diagnostic({
            kind,
            tenant: session.log.tenant,
            session: request.session,
            call: request.callId,
            dispatch: pending.dispatch,
            response: pending.id,
            owner: 'settleReply',
            policy: input.contention.name,
            submissions: 0,
            tailConflicts: 0,
          }),
        )
      } catch {
        // A diagnostic failure is not a settlement fact.
      }
    }
  }

  async function closeEntry(entry: DurableReplySettlement): Promise<boolean> {
    try {
      await entry.coordinator.close()
      return true
    } catch {
      return false
    }
  }

  /** Actively stops and resolves each retained original; unresolved work keeps close unavailable. */
  async function close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    closed = true
    const outcomes = await Promise.all(
      [...entries.values()].map(async entry => {
        if (entry.processing || !(await closeEntry(entry))) return false
        entries.delete(entry.key)
        return true
      }),
    )
    // A work whose writer stopped keeps only its durable row; the recovery owner concludes it.
    const workOutcomes = await Promise.all(
      [...works.entries()].map(async ([key, work]) => {
        if (!(await work.close())) return false
        works.delete(key)
        return true
      }),
    )
    return outcomes.every(Boolean) && workOutcomes.every(Boolean) && entries.size === 0
      ? { released: true }
      : { unavailable: true }
  }

  return Object.freeze({
    settleReply,
    ownsWork: (ref: CallKey) => works.has(JSON.stringify([ref.session, ref.callId])),
    close,
  })
}

async function recognizeSettledReply(
  request: SettleReplyInput,
  input: {
    readonly sessions: RuntimeSessionAccess
    readonly contention: SettlementContention
  },
  boundSession?: SessionRuntimeBinding,
): Promise<SettleReplyResult> {
  try {
    // S-49 repeats only read an authoritative completed batch. They neither stop
    // the session nor acquire the S-33 authority to reconstruct missing results.
    let session: SessionRuntimeBinding
    if (boundSession === undefined) {
      const bound = await input.sessions.bind(request.session)
      if ('failure' in bound) return { unavailable: true }
      session = bound.binding
    } else {
      session = boundSession
    }
    const { log, selection } = session
    if (
      log.session !== request.session ||
      selection.binding.session !== request.session ||
      log.log !== selection.binding.log ||
      log.generation !== selection.binding.generation ||
      !tenantIdEquals(log.tenant, selection.binding.tenant)
    )
      return { unavailable: true }
    return await readSettledReply(request, log, selection.owner, input.contention)
  } catch {
    return { unavailable: true }
  }
}

async function readSettledReply(
  request: SettleReplyInput,
  log: SettlementLogBinding,
  owner: SettlementOwner,
  contention: SettlementContention,
): Promise<SettleReplyResult> {
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
    const history = rejectAcknowledgedHistory(
      interpretCallHistory({ prefix: read.prefix, callId: request.callId }),
    )
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
    await Promise.all(tasks.map(requestStopAndWait))
    admitted.registration.release()
  }
}

/** A runtime's view of the post-ACK work rows it may conclude as the recovery owner. */
export interface SettlementWorkRecovery {
  readonly store: ModelCallSettlementWorkStore
  /** A live component of this runtime still owns the work; recovery leaves it alone. */
  readonly owns: (ref: CallKey) => boolean
}

/**
 * Seam R4 default path for one post-ACK work row left by a writer this runtime does not own:
 * the host's recovery scope must confirm the original execution absent (actual stop, not a
 * signal or fence); then the complete prefix decides. A complete batch (this one, or a first
 * winner that excludes it) or a whole absence ends the responsibility and retires the row; the
 * consumer re-applies with its own value. Anything unreadable or residual keeps the row.
 */
async function recoverSettlementWork(input: {
  readonly key: CallKey
  readonly response: string
  readonly prefix: SettlementPrefix
  readonly scope: RuntimeRecoveryScope
  readonly binding: SettlementLogBinding
  readonly work: SettlementWorkRecovery
  readonly custody: AcknowledgementCustody
  readonly diagnostic: (event: SettlementDiagnostic) => void
}): Promise<void> {
  const { key, binding } = input
  const emit = (kind: string, dispatch: JsonNumber = 0) => {
    try {
      drainDiagnosticThenable(
        input.diagnostic({
          kind,
          tenant: binding.tenant,
          session: key.session,
          call: key.callId,
          dispatch,
          response: input.response,
          owner: input.scope.owner.name,
          policy: 'recovery',
          submissions: 0,
          tailConflicts: 0,
        }),
      )
    } catch {
      // A diagnostic failure is not a recovery fact.
    }
  }
  if (input.work.owns(key)) return
  const read = await input.work.store.read({ binding, call: key.callId, response: input.response })
  if ('absent' in read) return
  // An unreadable row is never evidence of absence: the pending item stays.
  if ('unavailable' in read) return emit('settlement_work.recovery_unreadable')
  const { staged, workId, generation } = read.work
  const original = input.scope.originalInvocation(key, staged.target)
  if (!('absent' in original))
    return emit('settlement_work.recovery_writer_unproven', staged.target.dispatch)
  const interpreted = interpretSettlementPrefix({
    prefix: input.prefix,
    target: staged.target,
    current: staged.current,
  })
  if ('unavailable' in interpreted)
    return emit('settlement_work.recovery_retained', staged.target.dispatch)
  const members = interpreted.facts.members
  if (!('completeMembers' in members) && !('absent' in members))
    return emit('settlement_work.recovery_retained', staged.target.dispatch)
  emit(
    'completeMembers' in members
      ? 'settlement_work.recovery_recognized'
      : 'settlement_work.recovery_ended',
    staged.target.dispatch,
  )
  await input.custody.retireWork({
    binding,
    ref: key,
    response: input.response,
    workId,
    generation,
  })
}

/** S-33 recovery owns every entered scope until its original work and full-prefix read are settled. */
export function createRuntimeReconcile(input: {
  readonly recovery: RuntimeRecoveryAccess
  readonly run?: RunHistoryReader
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly now: () => string
  readonly diagnostic: (event: SettlementDiagnostic) => void
  readonly diagnosticCollector?: Pick<DiagnosticCollector, 'emitter'>
  readonly onDiagnosticFailure?: () => void
  /**
   * RT12 S-100: an acknowledged call answers its S-97 branch with the current cleanup progress,
   * so reconcile needs the owning runtime's ACK custody; one ACK never blocks the session.
   */
  readonly custody: AcknowledgementCustody
  /**
   * RT12 S-99⑧ seam R4: the recovery owner concludes post-ACK work rows that no live component
   * of this runtime owns. Without it such rows are only kept, never judged.
   */
  readonly settlementWork?: SettlementWorkRecovery
}): {
  readonly reconcile: (request: ReconcileInput) => Promise<ReconcileResult>
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
} {
  const entries = new Map<ReconcileInput['session'], RecoveryEntry>()
  let closed = false
  let closing: Promise<{ readonly released: true } | { readonly unavailable: true }> | undefined

  async function releaseRead(entry: RecoveryEntry, owned: RecoveryRead): Promise<boolean> {
    const tasks = [...owned.tasks]
    for (const task of tasks) {
      try {
        task.requestStop()
      } catch {
        // Actual stopped remains authoritative.
      }
    }
    const stopped = await Promise.allSettled(tasks.map(task => task.stopped))
    if (stopped.some(result => result.status === 'rejected')) return false
    try {
      owned.registration.release()
      entry.reads.delete(owned)
      return true
    } catch {
      return false
    }
  }

  async function releaseEntryOnce(entry: RecoveryEntry, finalize: boolean): Promise<boolean> {
    if (entry.entered !== undefined && entry.scope === undefined) {
      try {
        const entered = await entry.entered
        if ('scope' in entered) entry.scope = entered.scope
      } catch {
        entries.delete(entry.session)
        return true
      }
    }
    const scope = entry.scope
    if (scope === undefined) {
      entries.delete(entry.session)
      return true
    }
    let safe = true
    for (const owned of [...entry.reads]) {
      if (!(await releaseRead(entry, owned))) safe = false
    }
    const control = await entry.unknownControl.close({
      concurrent: input.contention.limits.concurrent,
      // Recognition of an original stopped writer's batch reads no payload and no phase-derived
      // action, so a later acknowledgement neither hides nor replaces that durable fact.
      call: (prefix, callId) => interpretCallHistory({ prefix, callId }),
    })
    if ('unavailable' in control) safe = false
    if (safe && entry.pendingControl.size !== 0) {
      const read = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in read) safe = false
      else {
        for (const callId of entry.pendingControl) {
          // Original control-batch recognition only; see the unknown control reader above.
          const history = interpretCallHistory({ prefix: read.prefix, callId })
          if (!('known' in history) || history.known.intent === null) safe = false
          else if (
            history.known.ending === null ||
            (history.known.ending.ending === 'interrupted' &&
              history.known.ending.initiator === history.known.intent.initiator)
          )
            entry.pendingControl.delete(callId)
          else safe = false
        }
      }
    }
    for (const settlement of [...entry.settlements]) {
      try {
        settlement.task?.requestStop()
        if (settlement.task !== undefined) await settlement.task.stopped
        // close actively resolves a retained unknown original or rejects while it stays owned.
        await settlement.coordinator.close()
      } catch {
        safe = false
        continue
      }
      const read = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in read) {
        safe = false
        continue
      }
      // Original settlement-batch recognition only; no acknowledged content view is consumed.
      const history = interpretCallHistory({ prefix: read.prefix, callId: settlement.target.call })
      const last = 'known' in history ? history.known.dispatches.at(-1) : undefined
      if (
        last === undefined ||
        !modelLogJsonEqual(last.record.dispatch, settlement.target.dispatch) ||
        last.record.response !== settlement.target.response
      ) {
        safe = false
        continue
      }
      // The original writer has stopped. Either the complete original batch or its
      // authoritative absence ends this physical responsibility; absence is not success.
      entry.settlements.delete(settlement)
    }
    if (!safe || entry.reads.size !== 0 || entry.settlements.size !== 0) return false
    if (!finalize) return true
    entry.exitAttempted = true
    try {
      await scope.close()
      entries.delete(entry.session)
      return true
    } catch {
      return false
    }
  }

  function releaseEntry(entry: RecoveryEntry, finalize: boolean): Promise<boolean> {
    if (entry.releasing !== undefined) {
      if (entry.releasing.finalize === finalize) return entry.releasing.promise
      return entry.releasing.promise.then(() => releaseEntry(entry, finalize))
    }
    const attempt = releaseEntryOnce(entry, finalize)
    entry.releasing = { finalize, promise: attempt }
    const finish = () => {
      if (entry.releasing?.promise === attempt) entry.releasing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  async function reconcile(request: ReconcileInput): Promise<ReconcileResult> {
    if (typeof request.session !== 'string' || request.session.length === 0)
      return { invalidInput: { reason: 'malformed' } }
    if (closed) return { unavailable: true }
    const previous = entries.get(request.session)
    let entry: RecoveryEntry
    if (previous !== undefined) {
      if (previous.active !== undefined) return { unavailable: true }
      const ready = await releaseEntry(previous, previous.exitAttempted)
      if (!ready) return { unavailable: true }
      if (closed) return { unavailable: true }
      if (previous.exitAttempted) {
        if (entries.has(request.session)) return { unavailable: true }
      } else if (previous.active !== undefined || entries.get(request.session) !== previous) {
        return { unavailable: true }
      }
    }
    entry =
      previous !== undefined && entries.get(request.session) === previous
        ? previous
        : {
            session: request.session,
            reads: new Set(),
            settlements: new Set(),
            unknownControl: new UnknownAppendTracker(),
            pendingControl: new Set(),
            controlTasks: new Set(),
            originals: new Map(),
            active: undefined,
            releasing: undefined,
            exitAttempted: false,
          }
    if (entries.get(request.session) !== entry) entries.set(request.session, entry)
    const entering = entry.entered ?? Promise.resolve().then(() => input.recovery.enter(request))
    entry.entered = entering
    const active = (async (): Promise<ReconcileResult> => {
      let observer: ReturnType<typeof operationDiagnostics> | undefined
      let terminalRecorded = false
      let diagnosticReportEnabled = true
      const reportDiagnosticFailure = (): void => {
        if (!diagnosticReportEnabled) return
        try {
          const result: unknown = input.onDiagnosticFailure?.()
          if (drainDiagnosticThenable(result)) diagnosticReportEnabled = false
        } catch {
          diagnosticReportEnabled = false
        }
      }
      try {
        const entered = await entering
        if ('unavailable' in entered) return { unavailable: true }
        entry.scope = entered.scope
        if (entered.scope.binding.log.session === request.session) {
          try {
            observer = operationDiagnostics(
              input.diagnosticCollector,
              entered.scope.binding.log.tenant,
              { executionId: randomUUID(), session: request.session },
              reportDiagnosticFailure,
            )
            observer.record({
              source: 'runtime',
              stage: 'recovery',
              outcome: 'started',
              facts: { kind: 'progress' },
            })
          } catch {
            reportDiagnosticFailure()
          }
        }
        if (closed) return { unavailable: true }
        const result = await readRecoveredCalls(
          request,
          entry,
          input,
          () => closed,
          anchor => {
            let recovered: ReturnType<typeof operationDiagnostics> | undefined
            try {
              recovered = operationDiagnostics(
                input.diagnosticCollector,
                entered.scope.binding.log.tenant,
                {
                  executionId: randomUUID(),
                  session: request.session,
                  call: anchor.call,
                  dispatch: anchor.dispatch,
                  response: anchor.response,
                },
                reportDiagnosticFailure,
              )
              for (const [kind, position] of [
                ['dispatched', anchor.dispatchedPosition],
                ['opened', anchor.openedPosition],
              ] as const) {
                if (position === undefined) continue
                recovered.record({
                  source: 'runtime',
                  stage: 'recovery',
                  outcome: 'started',
                  facts: {
                    kind: 'progress',
                    anchor: kind,
                    anchorId: ExactDecimal.from(position).toString(),
                  },
                })
              }
            } catch {
              reportDiagnosticFailure()
            } finally {
              try {
                recovered?.close()
              } catch {
                reportDiagnosticFailure()
              }
            }
          },
        )
        if (closed) return { unavailable: true }
        if ('unavailable' in result) {
          observer?.record({
            source: 'runtime',
            stage: 'recovery',
            outcome: 'unavailable',
            facts: { kind: 'progress' },
          })
          terminalRecorded = true
          return result
        }
        const released = await releaseEntry(entry, true)
        observer?.record({
          source: 'runtime',
          stage: 'recovery',
          outcome: released ? 'completed' : 'unavailable',
          facts: { kind: 'progress', ...(released ? { retry: 'without_resend' } : {}) },
        })
        terminalRecorded = true
        return released ? result : { unavailable: true }
      } catch {
        observer?.record({
          source: 'runtime',
          stage: 'recovery',
          outcome: 'unavailable',
          facts: { kind: 'progress' },
        })
        terminalRecorded = true
        return { unavailable: true }
      } finally {
        if (observer && !terminalRecorded)
          observer.record({
            source: 'runtime',
            stage: 'recovery',
            outcome: 'unavailable',
            facts: { kind: 'progress' },
          })
        try {
          observer?.close()
        } catch {
          reportDiagnosticFailure()
        }
      }
    })()
    entry.active = active
    const result = await active
    if (entry.active === active) entry.active = undefined
    return result
  }

  function close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    if (closing !== undefined) return closing
    closed = true
    const attempt = (async () => {
      for (const entry of entries.values()) {
        for (const read of entry.reads)
          for (const task of read.tasks) {
            try {
              task.requestStop()
            } catch {
              // Await stopped below.
            }
          }
        for (const settlement of entry.settlements) {
          try {
            settlement.task?.requestStop()
          } catch {
            // Actual stopped remains authoritative.
          }
        }
        for (const task of entry.controlTasks) {
          try {
            task.requestStop()
          } catch {
            // Actual stopped remains authoritative.
          }
        }
      }
      // A held task keeps its own scope, but does not prevent an independent
      // session's stopped scope from leaving recovery admission.
      const active = [...entries.values()].some(entry => entry.active !== undefined)
      const outcomes = await Promise.allSettled(
        [...entries.values()]
          .filter(entry => entry.active === undefined)
          .map(entry => releaseEntry(entry, true)),
      )
      return !active && outcomes.every(outcome => outcome.status === 'fulfilled' && outcome.value)
        ? ({ released: true } as const)
        : ({ unavailable: true } as const)
    })()
    closing = attempt
    const finish = () => {
      if (closing === attempt) closing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  return { reconcile, close }
}

async function readRecoveredCalls(
  request: ReconcileInput,
  entry: RecoveryEntry,
  input: {
    readonly contention: SettlementContention
    readonly scheduler: SettlementScheduler
    readonly now: () => string
    readonly diagnostic: (event: SettlementDiagnostic) => void
    readonly run?: RunHistoryReader
    readonly custody: AcknowledgementCustody
    readonly settlementWork?: SettlementWorkRecovery
  },
  closed: () => boolean,
  onAnchor: (anchor: {
    readonly call: CallKey['callId']
    readonly dispatch: ModelLogSettlementTarget['dispatch']
    readonly response: ModelLogSettlementTarget['response']
    readonly dispatchedPosition?: JsonNumber
    readonly openedPosition?: JsonNumber
  }) => void,
): Promise<ReconcileResult> {
  const scope = entry.scope
  if (scope === undefined || closed()) return { unavailable: true }
  const binding = scope.binding.log
  if (
    binding.session !== request.session ||
    scope.owner.admission() !== 'open' ||
    'unknown' in scope.owner.opened() ||
    scope.owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const firstRead = await readRecoveryPrefix(entry, input.contention)
  if ('unavailable' in firstRead) return { unavailable: true }
  const inspected = inspectCurrentModelLogPrefix({
    session: binding.session,
    tenant: binding.tenant,
    prefix: firstRead.prefix,
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
    if (closed()) return { unavailable: true }
    const read = await readRecoveryPrefix(entry, input.contention)
    if ('unavailable' in read) return { unavailable: true }
    const rowInspected = inspectCurrentModelLogPrefix({
      session: binding.session,
      tenant: binding.tenant,
      prefix: read.prefix,
    })
    if (!('ok' in rowInspected)) return { unavailable: true }
    const raw = interpretCallHistory({ prefix: read.prefix, callId })
    if ('known' in raw && raw.known.acknowledged !== null) {
      // RT12 S-100: an acknowledged call is reported by its S-97 branch; released content never
      // makes the whole session unavailable, and no ACK or disposition is triggered here.
      const facts = acknowledgedFactsFromHistory({ session: request.session, callId }, raw.known, {
        generation: binding.generation,
        progress: read.prefix.tail,
      })
      if (facts === undefined) return { unavailable: true }
      const small = await input.custody.view(binding, facts)
      // A contradicted ACK record is a broken source for this call, never a small answer.
      if ('unavailable' in small) return { unavailable: true }
      calls.push({ callId, acknowledged: small })
      if (facts.record.target.kind === 'response' && input.settlementWork !== undefined)
        await recoverSettlementWork({
          key: { session: request.session, callId },
          response: facts.record.target.response,
          prefix: read.prefix,
          scope,
          binding,
          work: input.settlementWork,
          custody: input.custody,
          diagnostic: input.diagnostic,
        })
      continue
    }
    const history = rejectAcknowledgedHistory(raw)
    if (!('known' in history)) return { unavailable: true }
    const previous = history.known.dispatches.slice(0, -1)
    if (previous.some(item => item.response === null)) return { unavailable: true }
    const last = history.known.dispatches.at(-1)
    if (last === undefined && history.known.intent !== null && history.known.ending === null) {
      const intentEntry = rowInspected.ok.find(
        item =>
          item.captured.record?.kind === 'model_call_interrupt_intent' &&
          item.captured.record.call === callId,
      )?.entry
      if (
        intentEntry === undefined ||
        (intentEntry.run === undefined) !== (request.attempt === undefined)
      )
        return { unavailable: true }
      if (closed()) return { unavailable: true }
      const appended = await appendControlRecord({
        binding,
        owner: scope.owner,
        concurrent: input.contention.limits.concurrent,
        ...(intentEntry.run === undefined
          ? {}
          : { run: intentEntry.run, attempt: request.attempt }),
        record: {
          kind: 'model_call_ended',
          call: callId,
          ending: 'interrupted',
          initiator: history.known.intent.initiator,
        },
        retainUnknown(registration, task) {
          entry.pendingControl.add(callId)
          entry.unknownControl.keep(
            { session: request.session, callId },
            binding,
            scope.owner,
            registration,
            task,
          )
        },
        trackTask(task) {
          entry.controlTasks.add(task)
          if (closed()) {
            try {
              task.requestStop()
            } catch {
              // The original task remains tracked until actual stop.
            }
          }
          return () => entry.controlTasks.delete(task)
        },
      })
      if ('unavailable' in appended) return { unavailable: true }
      const reread = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in reread) return { unavailable: true }
      const after = rejectAcknowledgedHistory(
        interpretCallHistory({ prefix: reread.prefix, callId }),
      )
      if (!('known' in after) || after.known.phase !== 'interrupted') return { unavailable: true }
      calls.push({ callId, state: 'interrupted' })
      continue
    }
    if (last !== undefined && last.response === null) {
      const target = {
        call: callId,
        dispatch: last.record.dispatch,
        response: last.record.response,
      }
      const association = scope.originalInvocation({ session: request.session, callId }, target)
      if ('unavailable' in association) return { unavailable: true }
      const observed = 'absent' in association ? null : association.original.observedFacts(target)
      if (observed !== null && 'unavailable' in observed) return { unavailable: true }
      const firstTokenAt =
        last.opened === null
          ? null
          : rowInspected.ok.find(item => modelLogJsonEqual(item.entry, last.opened))?.captured
              .record
      if (firstTokenAt !== null && firstTokenAt?.kind !== 'model_call_opened')
        return { unavailable: true }
      const dispatchedPosition = rowInspected.ok.find(item =>
        modelLogJsonEqual(item.captured.record, last.record),
      )?.entry.position
      const openedPosition =
        last.opened === null
          ? undefined
          : rowInspected.ok.find(item => modelLogJsonEqual(item.entry, last.opened))?.entry.position
      onAnchor({
        call: callId,
        dispatch: last.record.dispatch,
        response: last.record.response,
        ...(dispatchedPosition === undefined ? {} : { dispatchedPosition }),
        ...(openedPosition === undefined ? {} : { openedPosition }),
      })
      const originalKey = JSON.stringify([
        target.call,
        ExactDecimal.from(target.dispatch).toString(),
        target.response,
      ])
      let original = entry.originals.get(originalKey)
      if (original === undefined) {
        const originalFacts =
          observed === null
            ? ({ observed: null, sendState: 'send_unknown' } as const)
            : ({ observed: observed.facts } as const)
        const candidate = constructAnchoredInterruption({
          dispatched: last.record,
          ...(last.dispatched.run === undefined
            ? {}
            : { run: last.dispatched.run, attempt: last.dispatched.attempt }),
          ...originalFacts,
          firstTokenAt: firstTokenAt === null ? null : firstTokenAt.firstTokenAt,
          endedAt: input.now(),
          initiator: history.known.intent?.initiator ?? 'runtime_lost',
        })
        if ('rejected' in candidate) return { unavailable: true }
        original = {
          target,
          current: { messageId: null, disposition: null },
          response: candidate.response,
        }
      }
      const coordinator = createSettlementCoordinator({
        binding,
        owner: scope.owner,
        ...(input.run === undefined ? {} : { run: input.run }),
        settlementContention: input.contention,
        settlementScheduler: input.scheduler,
        diagnostic: input.diagnostic,
      })
      const held: RecoverySettlement = { coordinator, target, task: undefined }
      entry.settlements.add(held)
      try {
        if (closed()) return { unavailable: true }
        const task = coordinator.settle(original)
        held.task = task
        const settled = await task.completion
        if ('unavailable' in settled && settled.reason === 'write_unknown')
          entry.originals.set(originalKey, original)
        await requestStopAndWait(task)
        if (!('settled' in settled)) return { unavailable: true }
        entry.originals.delete(originalKey)
      } catch {
        return { unavailable: true }
      }
      // The entry retains the original coordinator until a stopped writer and full
      // same-binding prefix determine the whole batch or its absence.
      const reread = await readRecoveryPrefix(entry, input.contention)
      if ('unavailable' in reread) return { unavailable: true }
      const after = rejectAcknowledgedHistory(
        interpretCallHistory({ prefix: reread.prefix, callId }),
      )
      if (!('known' in after)) return { unavailable: true }
      const state = after.known.phase
      if (!recoveredState(state)) return { unavailable: true }
      calls.push({ callId, state })
      continue
    }
    const state = history.known.phase
    if (!recoveredState(state)) return { unavailable: true }
    calls.push({ callId, state })
  }
  return { calls: Object.freeze(calls) }
}

function recoveredState(
  state: DispatchGuardPhase | null,
): state is NonNullable<
  Extract<ReconcileResult, { readonly calls: unknown }>['calls'][number]['state']
> {
  return (
    state === 'resumable' ||
    state === 'awaiting_decision' ||
    state === 'interrupted' ||
    state === 'complete' ||
    state === 'handed_up'
  )
}

async function readRecoveryPrefix(
  entry: RecoveryEntry,
  contention: SettlementContention,
): Promise<{ readonly prefix: SettlementPrefix } | { readonly unavailable: true }> {
  const scope = entry.scope
  if (scope === undefined) return { unavailable: true }
  if (
    scope.owner.admission() !== 'open' ||
    'unknown' in scope.owner.opened() ||
    scope.owner.unresolvedWrites().length !== 0
  )
    return { unavailable: true }
  const admitted = scope.owner.acquire(contention.limits.concurrent)
  if ('unavailable' in admitted) return { unavailable: true }
  const owned: RecoveryRead = { registration: admitted.registration, tasks: new Set() }
  entry.reads.add(owned)
  const registration: SettlementRegistration = {
    start(kind, operation) {
      const task = admitted.registration.start(kind, operation)
      owned.tasks.add(task)
      return task
    },
    release: admitted.registration.release,
  }
  let read: Awaited<ReturnType<typeof readSettlementPrefix>>
  try {
    read = await readSettlementPrefix({ binding: scope.binding.log, registration })
  } catch {
    read = { unavailable: true, reason: 'log' }
  }
  for (const task of owned.tasks) {
    try {
      task.requestStop()
    } catch {
      // Actual stopped is checked below.
    }
  }
  const stopped = await Promise.allSettled([...owned.tasks].map(task => task.stopped))
  if (stopped.some(result => result.status === 'rejected')) return { unavailable: true }
  try {
    admitted.registration.release()
    entry.reads.delete(owned)
  } catch {
    return { unavailable: true }
  }
  return 'prefix' in read ? read : { unavailable: true }
}
