import type { AppendResult } from '@omne-harness-lite/session-log'
import type { CallKey } from '@omne-harness-lite/messages'
import type { CurrentHistoryReaders } from './service-types.ts'
import type { SessionModelRequestPreparation } from './session-request-preparation.ts'
import type { ModelCallPublishPermit } from './model-record-publication.ts'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from './settlement-types.ts'
import { requestStopAndWait } from './settlement-stop.ts'

interface UnknownAppend {
  readonly key: CallKey
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly registration: SettlementRegistration
  readonly task: SettlementTask<AppendResult>
  readonly readTasks: Set<SettlementTask<unknown>>
  readonly call: CurrentHistoryReaders['call']
  readonly readCall: SessionModelRequestPreparation['readCall']
  /** RT12 S-98: a content publish permit held until this original batch is recognized. */
  readonly permit?: ModelCallPublishPermit
}

function requestUnknownWriteStops(writes: readonly UnknownAppend[]): void {
  for (const write of writes) {
    try {
      write.task.requestStop()
    } catch {
      // The actual stopped promise remains authoritative.
    }
  }
}

function releaseUnknownWrite(write: UnknownAppend, retained: Set<UnknownAppend>): void {
  try {
    write.registration.release()
    retained.delete(write)
  } catch {
    // A failed writer release remains owned for a later close attempt.
  }
}

/** Unknown append receipts retain their original writer until it stops and Session confirms the original call. */
export class UnknownAppendTracker {
  readonly #writes = new Set<UnknownAppend>()
  #closing: Promise<{ readonly released: true } | { readonly unavailable: true }> | undefined

  keep(
    key: CallKey,
    binding: SettlementLogBinding,
    owner: SettlementOwner,
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
    call: CurrentHistoryReaders['call'],
    readCall: SessionModelRequestPreparation['readCall'],
    permit?: ModelCallPublishPermit,
  ): void {
    this.#writes.add({
      key,
      binding,
      owner,
      registration,
      task,
      call,
      readCall,
      readTasks: new Set(),
      ...(permit === undefined ? {} : { permit }),
    })
  }

  close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    if (this.#closing !== undefined) return this.#closing
    const attempt = this.#closeOnce()
    this.#closing = attempt
    const finish = () => {
      if (this.#closing === attempt) this.#closing = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  async #closeOnce(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    const writes = [...this.#writes]
    requestUnknownWriteStops(writes)
    for (const write of writes) {
      try {
        await write.task.stopped
      } catch {
        continue
      }
      // The original writer still owns the only registration when concurrent=1.
      // Reuse it for recognition instead of waiting for a second owner grant.
      const priorReads = await Promise.allSettled([...write.readTasks].map(requestStopAndWait))
      if (priorReads.some(result => result.status === 'rejected')) continue
      write.readTasks.clear()
      let read: Awaited<ReturnType<SessionModelRequestPreparation['readCall']>>
      try {
        read = await write.readCall({
          binding: write.binding,
          callId: write.key.callId,
          interpret: write.call,
          registration: {
            start(kind, operation) {
              const task = write.registration.start(kind, operation)
              write.readTasks.add(task)
              return task
            },
            release: write.registration.release,
          },
        })
      } catch {
        continue
      }
      const stopped = await Promise.allSettled([...write.readTasks].map(requestStopAndWait))
      if (stopped.some(result => result.status === 'rejected')) continue
      write.readTasks.clear()
      if ('unavailable' in read) continue
      // The original batch is now determined and its writer stopped: its content permit ends.
      if (write.permit !== undefined && !('released' in (await write.permit.release()))) continue
      releaseUnknownWrite(write, this.#writes)
    }
    return this.#writes.size === 0 ? { released: true } : { unavailable: true }
  }
}
