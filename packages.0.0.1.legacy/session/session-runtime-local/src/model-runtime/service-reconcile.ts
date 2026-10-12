import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  AnchoredInvocationHandle,
  CallAccess,
  CallKey,
  PlannedSemantics,
  RunHistoryReader,
  RuntimeSessionAccess,
  SessionModelSettlement,
  SessionRuntimeBinding,
  SettlementContention,
  SettlementCoordinator,
  SettlementDiagnostic,
  SettlementRequest,
  SettlementScheduler,
  SettlementWork,
  SettleReplyInput,
  SettleReplyResult,
} from '@omne-harness-lite/model-request-runtime'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import type { PendingModelResponse, ReplyDisposition } from '@omne-harness-lite/model-response'
import {
  judgePendingModelResponse,
  judgeResponseFinalization,
  validate as validateModelResponse,
} from '@omne-harness-lite/model-response'
import { judgeAcknowledgedSettlement } from './acknowledged-settlement.ts'
import type { AcknowledgementCustody } from './acknowledgement-custody.ts'
import { drainDiagnosticThenable } from '@omne-harness-lite/model-request-runtime'
import type { CallFacts } from '@omne-harness-lite/model-request-runtime'
import { retainRuntimeProjection, type ProjectedComponent } from './runtime-projection.ts'
import type { CallContainerStore, ReservationWaitPolicy } from './service-types.ts'

/** A cold ready reply whose original final batch may have been written. */
interface DurableReplySettlement {
  readonly key: string
  /** The exact original request; later callers never replace it with another disposition. */
  readonly settlement: SettlementRequest
  readonly disposition: SettleReplyInput['disposition']
  /** The runtime's authoritative original; a caller's retainedResult must equal it (S-99③). */
  readonly pending: PendingModelResponse
  readonly state: 'complete' | 'interrupted'
  readonly coordinator: SettlementCoordinator
  processing: boolean
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
  const requestMalformed = (): boolean => {
    return (
      !isServiceDisposition(request.disposition) ||
      request.session.length === 0 ||
      request.callId.length === 0 ||
      'rejected' in judgePendingModelResponse(pending) ||
      // RT12 S-99③: before ACK a caller's value may only equal the authoritative original.
      (request.retainedResult !== undefined && !modelLogJsonEqual(request.retainedResult, pending))
    )
  }
  if (requestMalformed()) return { invalidInput: { reason: 'malformed' } }
  if (pending.call.callId !== request.callId) return { callNotFound: true }
  try {
    const result = await invocation.settleReply(request.disposition)
    const settledReceipt = (): SettleReplyResult => {
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
    }
    return settledReceipt()
  } catch {
    // The original invocation retains any unresolved writer after this return.
    return { unavailable: true }
  }
}

/** A cold ready reply has its own runtime-owned writer until its original batch is resolved. */
interface SettleReplyConstruction<P extends PlannedSemantics, R> {
  readonly settlementFactory: SessionModelSettlement
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
}

interface SettleReplyOwner {
  readonly settleReply: (request: SettleReplyInput) => Promise<SettleReplyResult>
  /** Whether this component currently owns a started post-ACK work of the call. */
  readonly ownsWork: (ref: CallKey) => boolean
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}

export function createRuntimeSettleReply<P extends PlannedSemantics, R>(
  input: SettleReplyConstruction<P, R>,
): ProjectedComponent<SettleReplyOwner, SettleReplyConstruction<P, R>> {
  return buildRuntimeSettleReply(input)
}

class RuntimeSettleReplyState {
  readonly entries = new Map<string, DurableReplySettlement>()
  readonly works = new Map<string, SettlementWork>()
  closed = false
}

function buildRuntimeSettleReply<P extends PlannedSemantics, R>(
  input: SettleReplyConstruction<P, R>,
  physical: RuntimeSettleReplyState = new RuntimeSettleReplyState(),
): ProjectedComponent<SettleReplyOwner, SettleReplyConstruction<P, R>> {
  /** RT12 S-99⑧: started post-ACK write responsibilities, one per CallKey. */

  const keyOf = (request: SettleReplyInput): string =>
    JSON.stringify([request.session, request.callId])

  async function settleReply(request: SettleReplyInput): Promise<SettleReplyResult> {
    const requestMalformed = (): boolean => {
      return (
        !isServiceDisposition(request.disposition) ||
        typeof request.session !== 'string' ||
        request.session.length === 0 ||
        typeof request.callId !== 'string' ||
        request.callId.length === 0
      )
    }
    const retainCallerResult = ():
      | {
          readonly retainedResult: PendingModelResponse | undefined
        }
      | {
          readonly rejected: SettleReplyResult
        } => {
      if (requestMalformed()) return { rejected: { invalidInput: { reason: 'malformed' } } }
      // RT12 S-99①⑥: an optional caller-held original, owned before the first await.
      let retainedResult: PendingModelResponse | undefined
      if (request.retainedResult !== undefined) {
        const copied = copyJsonValue(request.retainedResult)
        if (!('ok' in copied) || !isPendingResponse(copied.ok))
          return { rejected: { invalidInput: { reason: 'malformed' } } }
        retainedResult = copied.ok
      }
      if (physical.closed) return { rejected: { unavailable: true } }
      return { retainedResult }
    }
    const retained = retainCallerResult()
    if ('rejected' in retained) return retained.rejected
    const retainedResult = retained.retainedResult
    const authorizedResult = (
      result: Awaited<ReturnType<typeof input.callAccess.check<SettleReplyResult>>>,
    ): SettleReplyResult => {
      return 'allowed' in result
        ? result.allowed
        : 'invalidInput' in result
          ? result
          : { unavailable: true }
    }
    const admitted = await input.calls.waitReserve(request, {
      policy: input.reservationWaitPolicy,
      scheduler: input.scheduler,
      signal: new AbortController().signal,
    })
    if ('unavailable' in admitted) return { unavailable: true }
    const { reservation } = admitted
    try {
      const bound = await input.sessions.bind(request.session)
      const currentSession = ():
        | {
            readonly session: SessionRuntimeBinding
          }
        | {
            readonly unavailable: true
          } => {
        if ('failure' in bound) return { unavailable: true }
        const session = bound.binding
        if (
          session.log.session !== request.session ||
          session.selection.binding.generation !== session.log.generation ||
          !tenantIdEquals(session.selection.binding.tenant, session.log.tenant)
        )
          return { unavailable: true }
        return { session }
      }
      const binding = currentSession()
      if ('unavailable' in binding) return binding
      const session = binding.session
      const fact = await input.callFacts.lookup({ binding: session.log, ref: request })
      const container = input.calls.find(request)
      const local = container?.view()
      const authorizeWarmPending = ():
        ReturnType<typeof input.callAccess.check<SettleReplyResult>> | undefined => {
        if (
          !physical.entries.has(keyOf(request)) &&
          container !== undefined &&
          local?.operation.phase === 'reply_pending' &&
          local.invocation !== undefined &&
          'view' in fact &&
          fact.view.result !== undefined &&
          (fact.view.result.disposition === 'disposition_pending'
            ? modelLogJsonEqual(fact.view.result.pending, local.operation.pending)
            : 'ok' in
              judgeResponseFinalization(local.operation.pending, fact.view.result.response)) &&
          local.session.log === session.log
        ) {
          const pending = local.operation.pending
          const invocation = local.invocation
          const settleWarmAuthorized = async (
            evidence: Parameters<Parameters<CallAccess['check']>[1]>[0],
          ): Promise<SettleReplyResult> => {
            const evidenceRejected = (): boolean => {
              return (
                evidence.action !== 'settle' ||
                evidence.ref.session !== request.session ||
                evidence.ref.callId !== request.callId ||
                evidence.source.generation !== session.log.generation ||
                ExactDecimal.from(evidence.source.progress).compare(
                  ExactDecimal.from(fact.view.source.progress),
                ) !== 0 ||
                evidence.revoked.aborted ||
                physical.closed ||
                session.log.currentGeneration() !== session.log.generation
              )
            }
            if (evidenceRejected()) return { unavailable: true } as const
            reservation.publish({ phase: 'settling' })
            const result = await settlePendingReply({
              request,
              pending,
              invocation,
            })
            if ('callId' in result || 'alreadyEnded' in result) {
              reservation.publish({ phase: 'ready' })
              const stopped = await container.close()
              if ('released' in stopped && stopped.released === true)
                input.calls.remove(reservation)
            } else {
              reservation.publish(local.operation)
            }
            return result
          }
          return input.callAccess.check(
            { binding: session.log, ref: request, action: 'settle', origin: fact.view.origin },
            settleWarmAuthorized,
          )
        }
        return undefined
      }
      const authorizedWarm = authorizeWarmPending()
      if (authorizedWarm !== undefined) {
        const authorized = await authorizedWarm
        return authorizedResult(authorized)
      }
      if ('acknowledged' in fact) {
        // RT12 S-99②: the current settle authority first; ACK grants no disposition right.
        const facts = fact.acknowledged
        const settleAcknowledgedAuthorized = async (
          evidence: Parameters<Parameters<CallAccess['check']>[1]>[0],
        ): Promise<SettleReplyResult> => {
          const evidenceRejected = (): boolean => {
            return (
              evidence.action !== 'settle' ||
              evidence.ref.session !== request.session ||
              evidence.ref.callId !== request.callId ||
              evidence.source.generation !== session.log.generation ||
              evidence.revoked.aborted
            )
          }
          if (evidenceRejected()) return { unavailable: true }
          const judged = judgeAcknowledgedSettlement(request, retainedResult, facts)
          if (!('validated' in judged)) return judged
          return await settleAcknowledged(request, judged.validated, session)
        }
        const admittedAck = await input.callAccess.check(
          { binding: session.log, ref: request, action: 'settle', origin: facts.origin },
          settleAcknowledgedAuthorized,
        )
        return authorizedResult(admittedAck)
      }
      const authorizeColdReady = ():
        ReturnType<typeof input.callAccess.check<SettleReplyResult>> | undefined => {
        if (
          'view' in fact &&
          (fact.view.result !== undefined || physical.entries.has(keyOf(request)))
        ) {
          const settleColdAuthorized = async (
            evidence: Parameters<Parameters<CallAccess['check']>[1]>[0],
          ): Promise<SettleReplyResult> => {
            const evidenceRejected = (): boolean => {
              return (
                evidence.action !== 'settle' ||
                evidence.ref.session !== request.session ||
                evidence.ref.callId !== request.callId ||
                evidence.source.generation !== session.log.generation ||
                ExactDecimal.from(evidence.source.progress).compare(
                  ExactDecimal.from(fact.view.source.progress),
                ) !== 0 ||
                evidence.revoked.aborted
              )
            }
            if (evidenceRejected()) return { unavailable: true } as const
            const key = keyOf(request)
            const selectOriginalEntry = ():
              | {
                  readonly entry: DurableReplySettlement
                }
              | {
                  readonly recognize: true
                }
              | {
                  readonly unavailable: true
                }
              | {
                  readonly invalidInput: {
                    readonly reason: 'malformed'
                  }
                } => {
              let entry = physical.entries.get(key)
              if (entry === undefined) {
                // RT12 S-99④⑦/S-86: a committed final decides by itself, after the current settle
                // authority: the same disposition recognizes it, another is alreadyEnded. No value
                // is needed or consulted and nothing is written.
                if (fact.view.result?.disposition === 'final') return { recognize: true }
                if (fact.view.result?.disposition !== 'disposition_pending')
                  return { unavailable: true } as const
                const constructOriginalEntry = (
                  pending: PendingModelResponse,
                ):
                  | {
                      readonly entry: DurableReplySettlement
                    }
                  | {
                      readonly unavailable: true
                    }
                  | {
                      readonly invalidInput: {
                        readonly reason: 'malformed'
                      }
                    } => {
                  // RT12 S-99③: before ACK a caller's value may only equal the authority.
                  if (retainedResult !== undefined && !modelLogJsonEqual(retainedResult, pending))
                    return { invalidInput: { reason: 'malformed' } } as const
                  const final = { ...pending, replyDisposition: request.disposition }
                  if ('rejected' in judgeResponseFinalization(pending, final))
                    return { unavailable: true } as const
                  const entry: DurableReplySettlement = {
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
                    coordinator: input.settlementFactory.create({
                      binding: session.log,
                      owner: session.selection.owner,
                      ...(input.run === undefined ? {} : { run: input.run }),
                      settlementContention: input.contention,
                      settlementScheduler: input.scheduler,
                      diagnostic: input.diagnostic,
                    }),
                    processing: false,
                  }
                  physical.entries.set(key, entry)
                  return { entry }
                }
                const constructed = constructOriginalEntry(fact.view.result.pending)
                if (!('entry' in constructed)) return constructed
                entry = constructed.entry
              } else if (
                retainedResult !== undefined &&
                !modelLogJsonEqual(retainedResult, entry.pending)
              )
                return { invalidInput: { reason: 'malformed' } } as const
              if (entry.processing) return { unavailable: true } as const
              return { entry }
            }
            const selected = selectOriginalEntry()
            if ('recognize' in selected)
              return await input.settlementFactory.recognizeReply(request, input, session)
            if (!('entry' in selected)) return selected
            const entry = selected.entry
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
                  physical.entries.delete(key)
                return { unavailable: true } as const
              }
              if (!(await closeEntry(entry))) return { unavailable: true } as const
              physical.entries.delete(key)
              const settledOriginalResult = (): SettleReplyResult => {
                if (
                  result.settled.disposition === 'firstWinner' ||
                  !modelLogJsonEqual(entry.disposition, request.disposition)
                )
                  return { alreadyEnded: true } as const
                return { callId: request.callId, state: entry.state } as const
              }
              return settledOriginalResult()
            } catch {
              return { unavailable: true } as const
            } finally {
              entry.processing = false
            }
          }
          return input.callAccess.check(
            { binding: session.log, ref: request, action: 'settle', origin: fact.view.origin },
            settleColdAuthorized,
          )
        }
        return undefined
      }
      const authorizedCold = authorizeColdReady()
      if (authorizedCold !== undefined) {
        const admittedSettle = await authorizedCold
        return 'allowed' in admittedSettle ? admittedSettle.allowed : { unavailable: true }
      }
      if (container === undefined)
        return await input.settlementFactory.recognizeReply(request, input, session)
      if (local?.operation.phase === 'ready')
        return await input.settlementFactory.recognizeReply(request, input, session)
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
    let work = physical.works.get(key)
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
      work = input.settlementFactory.createWork({
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
        obstacles: () => (physical.entries.has(key) ? ['writer_in_flight'] : []),
      })
      physical.works.set(key, work)
    }
    const outcome = await work.advance()
    const applyWorkOutcome = (): SettleReplyResult => {
      if ('retained' in outcome) return { unavailable: true }
      physical.works.delete(key)
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
    }
    return applyWorkOutcome()
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
    physical.closed = true
    const outcomes = await Promise.all(
      [...physical.entries.values()].map(async entry => {
        if (entry.processing || !(await closeEntry(entry))) return false
        physical.entries.delete(entry.key)
        return true
      }),
    )
    // A work whose writer stopped keeps only its durable row; the recovery owner concludes it.
    const workOutcomes = await Promise.all(
      [...physical.works.entries()].map(async ([key, work]) => {
        if (!(await work.close())) return false
        physical.works.delete(key)
        return true
      }),
    )
    return outcomes.every(Boolean) && workOutcomes.every(Boolean) && physical.entries.size === 0
      ? { released: true }
      : { unavailable: true }
  }

  return retainRuntimeProjection(
    Object.freeze({
      settleReply,
      ownsWork: (ref: CallKey) => physical.works.has(JSON.stringify([ref.session, ref.callId])),
      close,
    }),
    (next: SettleReplyConstruction<P, R>) => buildRuntimeSettleReply(next, physical),
  )
}
