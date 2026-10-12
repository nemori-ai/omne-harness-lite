import {
  settlementAppendReceipt,
  type RuntimeCloseResult,
  type SettlementOwner,
  type SettlementRegistration,
  type SettlementTask,
  type SettlementTaskKind,
} from '@omne-harness-lite/model-request-runtime'
import type { AppendResult } from '@omne-harness-lite/session-log'
import { jsonNumberSource } from '@omne-harness-lite/content-blocks'

interface Registration {
  readonly tasks: Set<SettlementTask<unknown>>
  readonly writes: Set<SettlementTask<AppendResult>>
  released: boolean
}

/** Track actual task lifetimes. Session's original writers own receipt recognition and release. */
export function createSessionModelTaskOwner(name: string): SettlementOwner & {
  readonly close: () => Promise<RuntimeCloseResult>
} {
  if (!name) throw new TypeError('model task owner name required')
  let admitting = true
  const registrations = new Set<Registration>()
  const unknown = new Set<SettlementTask<AppendResult>>()
  const owner: SettlementOwner = {
    name,
    admission: () => (admitting ? 'open' : 'closed'),
    opened: () => ({ confirmed: true }),
    unresolvedWrites: () => [...unknown],
    acquire(limit) {
      const maximum = Number(jsonNumberSource(limit))
      if (!Number.isSafeInteger(maximum) || maximum < 1)
        throw new TypeError('positive model task concurrency required')
      if (!admitting || unknown.size || registrations.size >= maximum) return { unavailable: true }
      const state: Registration = { tasks: new Set(), writes: new Set(), released: false }
      registrations.add(state)
      const registration: SettlementRegistration = {
        start<T>(
          kind: SettlementTaskKind,
          operation: (signal: AbortSignal) => Promise<T>,
        ): SettlementTask<T> {
          if (state.released || !admitting) throw new Error('model task registration closed')
          const abort = new AbortController()
          const completion = Promise.resolve()
            .then(() => operation(abort.signal))
            .then(
              value => {
                if (kind === 'append' || kind === 'controlAppend')
                  retainWrite(value, task, state.writes, unknown)
                return value
              },
              error => {
                if (kind === 'append' || kind === 'controlAppend')
                  retainWrite(undefined, task, state.writes, unknown)
                throw error
              },
            )
          const stopped = completion.then(
            () => undefined,
            () => undefined,
          )
          const task: SettlementTask<T> = Object.freeze({
            completion,
            stopped,
            requestStop: () => abort.abort(),
          })
          state.tasks.add(task)
          void stopped.then(() => state.tasks.delete(task))
          return task
        },
        release() {
          if (state.released || state.tasks.size) throw new Error('model task work has not stopped')
          state.released = true
          for (const write of state.writes) unknown.delete(write)
          registrations.delete(state)
        },
      }
      return { registration }
    },
  }
  return Object.freeze({
    ...owner,
    async close(): Promise<RuntimeCloseResult> {
      admitting = false
      const tasks = [...registrations].flatMap(registration => [...registration.tasks])
      for (const task of tasks) task.requestStop()
      await Promise.all(tasks.map(task => task.stopped))
      return registrations.size || unknown.size ? { unavailable: true } : { released: true }
    },
  })
}

function retainWrite(
  value: unknown,
  task: SettlementTask<unknown>,
  retained: Set<SettlementTask<AppendResult>>,
  unknown: Set<SettlementTask<AppendResult>>,
): void {
  const count =
    typeof value === 'object' &&
    value !== null &&
    'positions' in value &&
    Array.isArray(value.positions)
      ? value.positions.length
      : 1
  const result = settlementAppendReceipt(value, count)
  if (result !== null && !('failure' in result && result.failure === 'unavailable')) return
  const write = Object.freeze({
    ...task,
    completion: Promise.resolve<AppendResult>({ failure: 'unavailable' }),
  })
  retained.add(write)
  unknown.add(write)
}
