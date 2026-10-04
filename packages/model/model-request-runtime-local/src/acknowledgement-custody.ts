import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { CallKey, ModelCallAcknowledgedRecord } from '@omne-harness-lite/messages'
import type { ResponseId } from '@omne-harness-lite/model-response'
import { completeAcknowledgedView } from './acknowledged-view.ts'
import { drainDiagnosticThenable } from './invocation-diagnostics.ts'
import type {
  AckPendingReason,
  AcknowledgedCallFacts,
  AcknowledgedCallView,
  ModelCallCleanupResult,
  ModelCallContentStore,
} from './reference-types.ts'
import type {
  AcknowledgementCleanupPolicy,
  CallContainerStore,
  RuntimeCloseResult,
  RuntimeConstruction,
  ServiceUnavailable,
} from './service-types.ts'
import type {
  SettlementLogBinding,
  SettlementScheduler,
  SettlementTask,
} from './settlement-types.ts'
import type {PlannedSemantics} from '@omne-harness-lite/model-request-runtime'

/**
 * RT12 S-98 runtime custody of acknowledged calls. After a confirmed ACK the runtime, not the
 * consumer, owns cleanup: it records the confirmation on the retention row, releases the
 * model-side in-memory copy (the call container and its pending reply), then deletes the
 * releasable contents in one Storage commit. Obstacles are reported as closed reasons and
 * retried on the explicit policy; nothing here waits on a consumer, Run or handle.
 */
/**
 * A durable ACK record that contradicts the retained originals it names (RT12 S-98, S-101): it
 * authorizes no release, and reads that would rest on it fail instead of answering small.
 */
export type AcknowledgementContradicted = { readonly contradicted: true }

export interface AcknowledgementCustody {
  readonly cleanup: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
    readonly record: ModelCallAcknowledgedRecord
  }) => Promise<ModelCallCleanupResult | AcknowledgementContradicted>
  /** Complete durable S-97 facts with the current progress (attempting cleanup first). */
  readonly view: (
    binding: SettlementLogBinding,
    facts: AcknowledgedCallFacts,
  ) => Promise<AcknowledgedCallView | ServiceUnavailable>
  /**
   * RT12 S-99⑧ with seam R3: delete one ended settlement work row. A failed or unknown delete
   * keeps the row as a durable pending item of this same custody: the same policy object, the
   * same scheduler and the same wake-up entries retry it; no second queue or timer exists.
   * `obstacles` names other writers that must actually stop first; each keeps the row.
   */
  readonly retireWork: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
    readonly response: ResponseId
    readonly workId: string
    readonly generation: number
    readonly obstacles?: () => readonly AckPendingReason[]
  }) => Promise<ModelCallCleanupResult>
  readonly close: () => Promise<RuntimeCloseResult>
}

interface Scheduled {
  readonly abort: AbortController
  task: SettlementTask<'elapsed' | 'cancelled'> | undefined
  attempts: number
}

/**
 * The custody of a standalone component built from its construction. Without the explicit
 * cleanup policy there is no custody: acknowledged paths are then unavailable, never faked.
 */
export function runtimeCustody<P extends PlannedSemantics, R>(
  runtime: RuntimeConstruction<P, R>,
): AcknowledgementCustody | undefined {
  if (typeof runtime.acknowledgementCleanup?.next !== 'function') return undefined
  return createAcknowledgementCustody({
    calls: runtime.calls,
    content: runtime.callFacts.content,
    scheduler: runtime.settlementScheduler,
    policy: runtime.acknowledgementCleanup,
    diagnostic: event => runtime.policy.diagnostic(event),
  })
}

export function createAcknowledgementCustody<P extends PlannedSemantics, R>(input: {
  readonly calls: CallContainerStore<P, R>
  readonly content: ModelCallContentStore
  readonly scheduler: SettlementScheduler
  readonly policy: AcknowledgementCleanupPolicy
  readonly diagnostic: (event: { readonly kind: string; readonly detail?: JsonValue }) => void
}): AcknowledgementCustody {
  if (
    typeof input.policy?.next !== 'function' ||
    typeof input.scheduler?.wait !== 'function' ||
    typeof input.content?.releaseAcknowledged !== 'function' ||
    typeof input.content.work?.remove !== 'function'
  )
    throw new TypeError('explicit ACK cleanup policy, scheduler and retention store required')
  const running = new Map<string, Promise<ModelCallCleanupResult | AcknowledgementContradicted>>()
  const scheduled = new Map<string, Scheduled>()
  let closed = false
  const keyOf = (ref: CallKey): string => JSON.stringify([ref.session, ref.callId])

  function report(stage: string, ref: CallKey, detail: Record<string, JsonValue>): void {
    try {
      drainDiagnosticThenable(
        input.diagnostic({
          kind: 'model_ack.cleanup',
          detail: { stage, session: ref.session, call: ref.callId, ...detail },
        }),
      )
    } catch {
      // A diagnostic failure is not a cleanup fact.
    }
  }

  /** RT12 S-98: release the runtime's in-memory copy before any durable `released`. */
  async function releaseInMemory(ref: CallKey): Promise<readonly AckPendingReason[]> {
    const container = input.calls.find(ref)
    if (container === undefined) return []
    const reserved = input.calls.reserve(ref)
    if (!('reservation' in reserved)) {
      const phase = input.calls.find(ref)?.view().operation.phase
      // A running operation owns the call's in-memory state right now.
      return [
        phase === 'settling' || phase === 'dispatching' ? 'writer_in_flight' : 'read_in_flight',
      ]
    }
    const reservation = reserved.reservation
    try {
      const local = reservation.view()
      if (local === undefined) return []
      try {
        // The pending reply is the model-side copy; later reads use the S-97 branch. A local
        // reply_pending (ready publication unknown) is left for the original stop, which
        // finishes it as ready from the durable log and never closes it into another final.
        if (local.operation.phase !== 'ready' && local.operation.phase !== 'reply_pending')
          reservation.publish({ phase: 'ready' })
      } catch {
        return ['writer_in_flight']
      }
      const current = input.calls.find(ref)
      if (current === undefined) return []
      const stopped = await current.close()
      // An unconfirmed original writer keeps the container: its work has not actually ended.
      if (!('released' in stopped)) return ['writer_in_flight']
      input.calls.remove(reservation)
      return []
    } finally {
      reservation.release()
    }
  }

  async function attempt(
    binding: SettlementLogBinding,
    ref: CallKey,
    record: ModelCallAcknowledgedRecord,
  ): Promise<ModelCallCleanupResult | AcknowledgementContradicted> {
    const confirmed = await input.content.confirmAcknowledgement({
      binding,
      call: ref.callId,
      record,
    })
    if ('contradicted' in confirmed) {
      report('confirm', ref, { result: 'contradicted' })
      return confirmed
    }
    if (!('phase' in confirmed)) {
      report('confirm', ref, { result: 'unavailable' })
      return { cleanup: 'pending', pendingReasons: ['storage_unavailable'] }
    }
    if (confirmed.phase === 'released') return { cleanup: 'released' }
    let inMemory: readonly AckPendingReason[]
    try {
      inMemory = await releaseInMemory(ref)
    } catch {
      inMemory = ['writer_in_flight']
    }
    if (inMemory.length !== 0) return { cleanup: 'pending', pendingReasons: inMemory }
    return await input.content.releaseAcknowledged({ binding, call: ref.callId })
  }

  /**
   * One durable pending item per key (an ACK cleanup or a settlement work row), retried by the
   * one explicit policy and scheduler of this custody. Stopping a round keeps the durable item.
   */
  function schedule(
    key: string,
    ref: CallKey,
    result: ModelCallCleanupResult,
    retry: () => Promise<unknown>,
  ): void {
    if (closed || result.cleanup === 'released') {
      const existing = scheduled.get(key)
      if (existing !== undefined && result.cleanup === 'released') {
        existing.abort.abort()
        scheduled.delete(key)
      }
      return
    }
    const entry = scheduled.get(key) ?? {
      abort: new AbortController(),
      task: undefined,
      attempts: 0,
    }
    if (entry.task !== undefined) return
    scheduled.set(key, entry)
    entry.attempts++
    let decision: ReturnType<AcknowledgementCleanupPolicy['next']>
    try {
      decision = input.policy.next({
        attempts: entry.attempts,
        pendingReasons: result.pendingReasons,
      })
    } catch {
      decision = { stop: true }
    }
    if (
      'stop' in decision ||
      !isNonNegativeJsonInteger(decision.waitMs) ||
      ExactDecimal.from(decision.waitMs).compare(ExactDecimal.from(0)) < 0
    ) {
      // The durable row remains; a later read, repeat or restart resumes it.
      report('retry_stopped', ref, { item: key, attempts: entry.attempts })
      scheduled.delete(key)
      return
    }
    let task: SettlementTask<'elapsed' | 'cancelled'>
    try {
      task = input.scheduler.wait(decision.waitMs, entry.abort.signal)
    } catch {
      scheduled.delete(key)
      return
    }
    entry.task = task
    void task.completion
      .then(async elapsed => {
        entry.task = undefined
        if (elapsed !== 'elapsed' || closed) return
        await retry()
      })
      .catch(() => {
        entry.task = undefined
      })
  }

  /** Single flight per pending item; every outcome is reported and rescheduled if pending. */
  function run(
    key: string,
    ref: CallKey,
    stage: string,
    work: () => Promise<ModelCallCleanupResult | AcknowledgementContradicted>,
    retry: () => Promise<unknown>,
  ): Promise<ModelCallCleanupResult | AcknowledgementContradicted> {
    const existing = running.get(key)
    if (existing !== undefined) return existing
    const task = work()
      .catch((): ModelCallCleanupResult | AcknowledgementContradicted => ({
        cleanup: 'pending',
        pendingReasons: ['storage_unavailable'],
      }))
      .then(result => {
        // A contradicted record is not a pending item: nothing retries its release.
        if (!('cleanup' in result)) return result
        report(stage, ref, {
          item: key,
          cleanup: result.cleanup,
          ...(result.cleanup === 'pending' ? { reasons: [...result.pendingReasons] } : {}),
        })
        schedule(key, ref, result, retry)
        return result
      })
      .finally(() => {
        if (running.get(key) === task) running.delete(key)
      })
    running.set(key, task)
    return task
  }

  function cleanup(request: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
    readonly record: ModelCallAcknowledgedRecord
  }): Promise<ModelCallCleanupResult | AcknowledgementContradicted> {
    return run(
      `ack:${keyOf(request.ref)}`,
      request.ref,
      'attempt',
      () => attempt(request.binding, request.ref, request.record),
      () => cleanup(request),
    )
  }

  async function removeWork(
    request: Parameters<AcknowledgementCustody['retireWork']>[0],
  ): Promise<ModelCallCleanupResult> {
    let obstacles: readonly AckPendingReason[]
    try {
      obstacles = request.obstacles?.() ?? []
    } catch {
      obstacles = ['writer_in_flight']
    }
    if (obstacles.length !== 0) return { cleanup: 'pending', pendingReasons: obstacles }
    const removed = await input.content.work.remove({
      binding: request.binding,
      call: request.ref.callId,
      response: request.response,
      workId: request.workId,
      generation: request.generation,
    })
    // `rejected`: the row now belongs to another work or generation; this work has no row.
    if ('removed' in removed || 'rejected' in removed) return { cleanup: 'released' }
    return { cleanup: 'pending', pendingReasons: [removed.pending] }
  }

  function retireWork(
    request: Parameters<AcknowledgementCustody['retireWork']>[0],
  ): Promise<ModelCallCleanupResult> {
    return run(
      `work:${JSON.stringify([request.ref.session, request.ref.callId, request.response, request.workId])}`,
      request.ref,
      'work_retire',
      () => removeWork(request),
      () => retireWork(request),
    ).then(result =>
      // A work row is never judged against ACK originals; this branch cannot occur.
      'cleanup' in result
        ? result
        : { cleanup: 'pending', pendingReasons: ['storage_unavailable'] },
    )
  }

  return Object.freeze<AcknowledgementCustody>({
    cleanup,
    retireWork,
    async view(binding, facts) {
      const result = await cleanup({ binding, ref: facts.ref, record: facts.record })
      return 'cleanup' in result ? completeAcknowledgedView(facts, result) : { unavailable: true }
    },
    async close() {
      closed = true
      for (const entry of scheduled.values()) entry.abort.abort()
      const waits = [...scheduled.values()].flatMap(entry =>
        entry.task === undefined ? [] : [entry.task.stopped.catch(() => undefined)],
      )
      await Promise.allSettled([...waits, ...running.values()])
      scheduled.clear()
      return running.size === 0 ? { released: true } : { unavailable: true }
    },
  })
}
