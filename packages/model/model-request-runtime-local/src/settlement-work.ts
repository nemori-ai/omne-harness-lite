import type { AckPendingReason } from '@omne-harness-lite/model-request-runtime'
import { randomUUID } from 'node:crypto'
import type { CallKey } from '@omne-harness-lite/messages'
import type { AcknowledgementCustody } from './acknowledgement-custody.ts'
import type { ModelCallSettlementWorkStore } from './reference-types.ts'
import { createSettlementCoordinator } from './settlement-coordinator.ts'
import {
  interpretSettlementPrefix,
  readSettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import { requestStopAndWait } from '@omne-harness-lite/model-request-runtime'
import type {
  RunHistoryReader,
  SettlementComplete,
  SettlementContention,
  SettlementDiagnostic,
  SettlementLogBinding,
  SettlementOwner,
  SettlementResult,
  SettlementScheduler,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementRequest, SettlementStagedBatch } from './settlement-types.ts'

/**
 * What one post-ACK write responsibility concluded. `ended`: every writer of this work actually
 * stopped and a complete authoritative prefix proved its batch absent, so the responsibility
 * ended and its row was retired. `retained`: an unknown receipt, an unproven stop, a residual
 * batch or an unreadable source keeps the row and, where one exists, the original writer.
 */
export type SettlementWorkOutcome =
  | { readonly settled: SettlementComplete; readonly origin: 'appended' | 'recognized' }
  | { readonly ended: true }
  | { readonly retained: true }

export interface SettlementWork {
  readonly workId: string
  readonly ref: CallKey
  readonly request: SettlementRequest
  /** Settle (or resolve the retained original), then conclude from actual stop and the log. */
  readonly advance: () => Promise<SettlementWorkOutcome>
  /** Stop admission for this work; true only when no writer of it remains owned. */
  readonly close: () => Promise<boolean>
}

/**
 * RT12 S-99⑧ and seam R1/R3/R4 for one started post-ACK settlement of a caller-held original.
 * Before each append the complete batch is durable in its work row (first staged, after a
 * proven zero write replaced); while a receipt is unknown the coordinator never asks again, so
 * the row can only hold the batch that may have been written. A confirmed final, or an ended
 * responsibility after actual stop and proven absence, retires the row through the ACK
 * custody's one pending mechanism. This function is usable outside the runtime service.
 */
export function createSettlementWork(input: {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly store: ModelCallSettlementWorkStore
  readonly custody: Pick<AcknowledgementCustody, 'retireWork'>
  /** The runtime instance that owns this work; recorded on the row for recovery. */
  readonly instance: string
  readonly ref: CallKey
  /** Target, current and the complete final; this function adds the staging. */
  readonly request: Omit<SettlementRequest, 'staging'>
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly run?: RunHistoryReader
  readonly diagnostic: (event: SettlementDiagnostic) => void
  /** Other writers of the same call that must actually stop before the row is deleted. */
  readonly obstacles?: () => readonly AckPendingReason[]
}): SettlementWork {
  const workId = randomUUID()
  const { binding, store, ref } = input
  const response = input.request.target.response
  const workKey = { binding, call: ref.callId, response }
  /** The generation last confirmed durable; undefined before the first stage. */
  let generation: number | undefined
  /** A stage or replace whose outcome could not be read back; the row must be re-read. */
  let unsure = false
  let coordinatorClosed = false

  function emit(kind: string, submissions = 0): void {
    try {
      input.diagnostic({
        kind,
        tenant: binding.tenant,
        session: binding.session,
        call: ref.callId,
        dispatch: input.request.target.dispatch,
        response,
        owner: input.owner.name,
        policy: input.contention.name,
        submissions,
        tailConflicts: 0,
      })
    } catch {
      // A diagnostic failure is not a settlement fact.
    }
  }

  async function hold(
    staged: SettlementStagedBatch,
  ): Promise<{ readonly held: true } | { readonly unavailable: true }> {
    if (unsure) return { unavailable: true }
    const result =
      generation === undefined
        ? await store.stage({ ...workKey, workId, owner: input.instance, staged })
        : await store.replace({ ...workKey, workId, generation, staged })
    if ('staged' in result) {
      generation = result.staged.generation
      emit(result.staged.generation === 1 ? 'settlement_work.staged' : 'settlement_work.replaced')
      return { held: true }
    }
    // Occupied by another work or rejected: this work never appends over it.
    if ('unavailable' in result) unsure = true
    emit('occupied' in result ? 'settlement_work.occupied' : 'settlement_work.hold_refused')
    return { unavailable: true }
  }

  const request: SettlementRequest = Object.freeze({ ...input.request, staging: { hold } })
  const coordinator = createSettlementCoordinator({
    binding,
    owner: input.owner,
    ...(input.run === undefined ? {} : { run: input.run }),
    settlementContention: input.contention,
    settlementScheduler: input.scheduler,
    diagnostic: input.diagnostic,
  })

  async function closeCoordinator(): Promise<boolean> {
    coordinatorClosed = true
    try {
      await coordinator.close()
      return true
    } catch {
      return false
    }
  }

  /** The row's current generation of this work, or `absent`/`unknown`. */
  async function currentGeneration(): Promise<number | 'absent' | 'unknown'> {
    if (!unsure) return generation ?? 'absent'
    const read = await store.read(workKey)
    if ('unavailable' in read) return 'unknown'
    if ('absent' in read || read.work.workId !== workId) return 'absent'
    unsure = false
    generation = read.work.generation
    return generation
  }

  async function retire(): Promise<void> {
    const current = await currentGeneration()
    if (typeof current !== 'number') return
    const retired = await input.custody.retireWork({
      binding,
      ref,
      response,
      workId,
      generation: current,
      ...(input.obstacles === undefined ? {} : { obstacles: input.obstacles }),
    })
    emit(
      retired.cleanup === 'released' ? 'settlement_work.retired' : 'settlement_work.retire_pending',
    )
  }

  /** After every writer of this work actually stopped: the complete prefix decides. */
  async function decide(): Promise<
    | { readonly settled: SettlementComplete }
    | { readonly absent: true }
    | { readonly unknown: true }
  > {
    const grant = input.owner.acquire(input.contention.limits.concurrent)
    if (!('registration' in grant)) return { unknown: true }
    const tasks: SettlementTask<unknown>[] = []
    try {
      const read = await readSettlementPrefix({
        binding,
        registration: {
          start(kind, operation) {
            const task = grant.registration.start(kind, operation)
            tasks.push(task)
            return task
          },
          release: grant.registration.release,
        },
      })
      if ('unavailable' in read) return { unknown: true }
      const interpreted = interpretSettlementPrefix({
        prefix: read.prefix,
        target: input.request.target,
        current: input.request.current,
      })
      if ('unavailable' in interpreted) return { unknown: true }
      const members = interpreted.facts.members
      if ('completeMembers' in members) return { settled: members.completeMembers }
      // Only a whole absence proves nothing was written; a residual batch stays owned (S-70③).
      return 'absent' in members ? { absent: true } : { unknown: true }
    } catch {
      return { unknown: true }
    } finally {
      await Promise.allSettled(tasks.map(requestStopAndWait))
      try {
        grant.registration.release()
      } catch {
        // An unproven read stop keeps the registration; the decision above stays unknown.
      }
    }
  }

  async function advance(): Promise<SettlementWorkOutcome> {
    let result: SettlementResult | undefined
    if (!coordinatorClosed) {
      const task = coordinator.settle(request)
      result = await task.completion
      try {
        await requestStopAndWait(task)
      } catch {
        return { retained: true }
      }
    }
    if (result !== undefined && 'settled' in result) {
      if (!(await closeCoordinator())) return { retained: true }
      await retire()
      return result
    }
    // Not settled: close resolves any retained unknown original only after its actual stop.
    if (!(await closeCoordinator())) {
      emit('settlement_work.writer_retained')
      return { retained: true }
    }
    const current = await currentGeneration()
    if (current === 'unknown') return { retained: true }
    if (current === 'absent') {
      // Nothing was held, so nothing was appended by this work.
      emit('settlement_work.ended')
      return { ended: true }
    }
    const decided = await decide()
    if ('settled' in decided) {
      await retire()
      return { settled: decided.settled, origin: 'recognized' }
    }
    if ('absent' in decided) {
      // Seam R4 default: end this physical write responsibility; the consumer re-applies.
      await retire()
      emit('settlement_work.ended')
      return { ended: true }
    }
    emit('settlement_work.retained')
    return { retained: true }
  }

  return Object.freeze({
    workId,
    ref,
    request,
    advance,
    close: closeCoordinator,
  })
}
