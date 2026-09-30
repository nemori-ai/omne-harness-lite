import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger, type JsonValue } from '@omne-harness-lite/content-blocks'
import type { CallKey, ModelCallAcknowledgedRecord } from '@omne-harness-lite/messages'
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
} from './service-types.ts'
import type {
  SettlementLogBinding,
  SettlementScheduler,
  SettlementTask,
} from './settlement-types.ts'
import type { PlannedSemantics } from './types.ts'

/**
 * RT12 S-98 runtime custody of acknowledged calls. After a confirmed ACK the runtime, not the
 * consumer, owns cleanup: it records the confirmation on the retention row, releases the
 * model-side in-memory copy (the call container and its pending reply), then deletes the
 * releasable contents in one Storage commit. Obstacles are reported as closed reasons and
 * retried on the explicit policy; nothing here waits on a consumer, Run or handle.
 */
export interface AcknowledgementCustody {
  readonly cleanup: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
    readonly record: ModelCallAcknowledgedRecord
  }) => Promise<ModelCallCleanupResult>
  /** Complete durable S-97 facts with the current progress (attempting cleanup first). */
  readonly view: (
    binding: SettlementLogBinding,
    facts: AcknowledgedCallFacts,
  ) => Promise<AcknowledgedCallView>
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
    typeof input.content?.releaseAcknowledged !== 'function'
  )
    throw new TypeError('explicit ACK cleanup policy, scheduler and retention store required')
  const running = new Map<string, Promise<ModelCallCleanupResult>>()
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
        // The pending reply is the model-side copy; later reads use the S-97 branch.
        if (local.operation.phase !== 'ready') reservation.publish({ phase: 'ready' })
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
  ): Promise<ModelCallCleanupResult> {
    const confirmed = await input.content.confirmAcknowledgement({
      binding,
      call: ref.callId,
      record,
    })
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

  function schedule(
    binding: SettlementLogBinding,
    ref: CallKey,
    record: ModelCallAcknowledgedRecord,
    result: ModelCallCleanupResult,
  ): void {
    const key = keyOf(ref)
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
      // The durable acknowledged row remains; a later read, ACK repeat or restart resumes it.
      report('retry_stopped', ref, { attempts: entry.attempts })
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
        await cleanup({ binding, ref, record })
      })
      .catch(() => {
        entry.task = undefined
      })
  }

  function cleanup(request: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
    readonly record: ModelCallAcknowledgedRecord
  }): Promise<ModelCallCleanupResult> {
    const key = keyOf(request.ref)
    const existing = running.get(key)
    if (existing !== undefined) return existing
    const task = attempt(request.binding, request.ref, request.record)
      .catch((): ModelCallCleanupResult => ({
        cleanup: 'pending',
        pendingReasons: ['storage_unavailable'],
      }))
      .then(result => {
        report('attempt', request.ref, {
          cleanup: result.cleanup,
          ...(result.cleanup === 'pending' ? { reasons: [...result.pendingReasons] } : {}),
        })
        schedule(request.binding, request.ref, request.record, result)
        return result
      })
      .finally(() => {
        if (running.get(key) === task) running.delete(key)
      })
    running.set(key, task)
    return task
  }

  return Object.freeze<AcknowledgementCustody>({
    cleanup,
    async view(binding, facts) {
      const result = await cleanup({ binding, ref: facts.ref, record: facts.record })
      return completeAcknowledgedView(facts, result)
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
