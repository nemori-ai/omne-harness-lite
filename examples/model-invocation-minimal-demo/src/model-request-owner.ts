import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import type {SettlementOwner, SettlementTask, SettlementRegistration, SettlementTaskKind} from '@omne-harness-lite/model-request-runtime-local'
import type { AppendResult } from '@omne-harness-lite/session-log'

function appendReceipt(value: unknown): AppendResult {
  if (value !== null && typeof value === 'object') {
    if (
      'positions' in value &&
      Array.isArray(value.positions) &&
      value.positions.every(isJsonNumber) &&
      'tail' in value &&
      isJsonNumber(value.tail)
    )
      return { positions: value.positions, tail: value.tail }
    if ('failure' in value) {
      const failure = value.failure
      if (
        failure === 'invalidInput' ||
        failure === 'unavailable' ||
        failure === 'tenantMismatch' ||
        failure === 'attemptSuperseded'
      )
        return { failure }
      if (failure === 'tailChanged' && 'tail' in value && isJsonNumber(value.tail))
        return { failure, tail: value.tail }
      if (
        failure === 'alreadyRecorded' &&
        'keys' in value &&
        Array.isArray(value.keys) &&
        value.keys.every((key: unknown) => typeof key === 'string')
      )
        return { failure, keys: value.keys }
    }
  }
  return { failure: 'unavailable' }
}
/** Owned by one authenticated session borrow. Admission outlives app shutdown until tail settlement. */
export function createRequestOwner(name: string) {
  let released = false,
    registrations = 0
  const tasks = new Set<SettlementTask<unknown>>()
  const writers = new Set<SettlementTask<AppendResult>>()
  const owner: SettlementOwner = {
    name,
    admission: () => (released ? 'closed' : 'open'),
    acquire(limit: JsonNumber) {
      if (released || ExactDecimal.from(registrations).compare(ExactDecimal.from(limit)) >= 0)
        return { unavailable: true }
      registrations++
      let done = false,
        unknownWrite = false
      const owned = new Set<SettlementTask<unknown>>()
      const ownWriters = new Set<SettlementTask<AppendResult>>()
      const registration: SettlementRegistration = {
        start<T>(
          kind: SettlementTaskKind,
          operation: (signal: AbortSignal) => Promise<T>,
        ): SettlementTask<T> {
          if (done || released) throw new Error('request owner closed')
          const controller = new AbortController()
          // The effect starts in a later microtask, after both registries contain the actual task.
          const completion = Promise.resolve().then(() => operation(controller.signal))
          const stopped = completion.then(
            () => undefined,
            () => undefined,
          )
          const task = { completion, stopped, requestStop: () => controller.abort() }
          tasks.add(task)
          owned.add(task)
          // The runtime's control tracker owns uncertain intent/ending writes through
          // recognition. This host fence is only for unresolved response writers.
          if (kind === 'append') {
            const writer: SettlementTask<AppendResult> = {
              completion: completion.then(appendReceipt, () => ({ failure: 'unavailable' })),
              stopped,
              requestStop: task.requestStop,
            }
            writer.completion.then(
              result => {
                if ('failure' in result && result.failure === 'unavailable') {
                  unknownWrite = true
                  writers.add(writer)
                  ownWriters.add(writer)
                }
              },
              () => undefined,
            )
          }
          stopped.then(
            () => {
              tasks.delete(task)
              owned.delete(task)
            },
            () => undefined,
          )
          return task
        },
        release() {
          if (done) throw new Error('request registration released twice')
          if (owned.size !== 0) throw new Error('request registration still active')
          done = true
          // Runtime releases an uncertain registration only after actual stop and
          // same-source full-prefix recognition; clear precisely this registration.
          if (unknownWrite) {
            for (const writer of ownWriters) writers.delete(writer)
            ownWriters.clear()
          }
          registrations--
        },
      }
      return { registration }
    },
    // This host has no older opened writer outside the tracked A1b owner. A1b supplies its actual opened receipt.
    opened: () => ({ confirmed: true }),
    unresolvedWrites: () => [...writers],
  }
  return {
    owner,
    async drain() {
      await Promise.all([...tasks].map(task => task.stopped))
    },
    release() {
      if (tasks.size || writers.size || registrations) throw new Error('request owner retained')
      released = true
    },
    retained: () => writers.size !== 0 || registrations !== 0,
  }
}
