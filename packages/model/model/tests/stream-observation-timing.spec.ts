import { expect, it } from 'vitest'
import type { ModelStreamSnapshot } from '@omne-harness/model-contract'
import type { StreamCursor, StreamRef } from '@omne-harness/stream-arrival'
import type { Outcome } from '@omne-harness/operation-result'
import {
  createStreamObservation,
  type StreamCheckFailure,
  type StreamTarget,
} from '../src/stream-observation.ts'
import type { ModelObservationLimits } from '../src/stream-types.ts'

// The FIFO's own timing, with a clock and waits that only the test moves: a due timer rechecks and
// re-arms, a cancelled or superseded one does nothing, and a delivery rechecks residence first.

type Wait = { deadline: number; resolve(value: 'elapsed' | 'cancelled'): void }

function harness(limits: Partial<ModelObservationLimits> = {}) {
  let now = 0
  const waits: Wait[] = []
  let checked: Outcome<StreamTarget, StreamCheckFailure>
  let admitted = 0
  const cursor = (n: number) => `cursor-${n}` as unknown as StreamCursor
  const target: StreamTarget = {
    snapshot: {
      ref: 'ref',
      dispatch: 'mdisp_one',
      value: { n: 0 },
    } as unknown as ModelStreamSnapshot,
    cursor: cursor(0),
    watchers: new Set(),
  }
  checked = { ok: target }
  const observation = createStreamObservation<object>({
    limits: {
      maxSnapshotBytes: 100000,
      maxDeltaBytes: 100000,
      maxQueuedFrames: 8,
      maxQueuedBytes: 400000,
      maxObserversPerTenant: 8,
      maxObservers: 8,
      maxPendingSourceOperations: 4,
      maxRetainedCalls: 8,
      maxRetainedBytes: 1000000,
      maxTotalBytes: 4000000,
      maxQueueResidenceMs: 100,
      checkIntervalMs: 10,
      ...limits,
    },
    timing: {
      nowMs: () => now,
      waitUntil: deadline => new Promise(resolve => waits.push({ deadline, resolve })),
    },
    check: () => checked,
    refresh: async () => null,
    reserve: () => () => {},
    admit: () => {
      admitted += 1
      return () => {
        admitted -= 1
      }
    },
    track: () => () => {},
  })
  const iterator = observation
    .observe({
      ref: 'ref' as StreamRef,
      access: { tenant: {} as never, principal: {} },
      signal: new AbortController().signal,
    })
    [Symbol.asyncIterator]()
  let serial = 0
  return {
    iterator,
    waits,
    admitted: () => admitted,
    setNow: (value: number) => {
      now = value
    },
    fail: (failure: StreamCheckFailure) => {
      checked = { failure }
    },
    push() {
      serial += 1
      for (const watcher of target.watchers)
        watcher.push({
          kind: 'delta',
          from: cursor(serial - 1),
          cursor: cursor(serial),
          value: { n: serial },
        } as never)
    },
  }
}

/** Resolves with the settled value, or `pending` when the promise is still open after the queue drains. */
async function settled<T>(promise: Promise<T>): Promise<T | 'pending'> {
  const marker = Symbol('pending')
  const result = await Promise.race([
    promise,
    new Promise<typeof marker>(resolve => setTimeout(() => resolve(marker), 20)),
  ])
  return result === marker ? 'pending' : (result as T)
}

it('a due timer ends an observer whose qualification is gone and releases its admission at once', async () => {
  const h = harness()
  expect((await h.iterator.next()).value).toMatchObject({ kind: 'snapshot' })
  expect(h.admitted()).toBe(1)
  h.fail('source-closed')
  h.waits.at(-1)?.resolve('elapsed')
  await settled(Promise.resolve())
  expect(h.admitted()).toBe(0)
  expect((await h.iterator.next()).value).toEqual({ kind: 'ended', reason: 'source-closed' })
})

it('a cancelled wait does not recheck', async () => {
  const h = harness()
  await h.iterator.next()
  const next = h.iterator.next()
  h.fail('denied')
  h.waits.at(-1)?.resolve('cancelled')
  expect(await settled(next)).toBe('pending')
  await h.iterator.return?.()
})

it('a due timer with nothing wrong arms the next check', async () => {
  const h = harness()
  await h.iterator.next()
  const next = h.iterator.next()
  const armed = h.waits.length
  h.waits.at(-1)?.resolve('elapsed')
  expect(await settled(next)).toBe('pending')
  expect(h.waits.length).toBe(armed + 1)
  h.fail('stale-stream')
  h.waits.at(-1)?.resolve('elapsed')
  expect(await settled(next)).toEqual({
    done: false,
    value: { kind: 'ended', reason: 'stale-stream' },
  })
})

it('a timer replaced by an earlier deadline does nothing when it resolves late', async () => {
  const h = harness({ maxQueueResidenceMs: 5, checkIntervalMs: 10 })
  await h.iterator.next()
  const first = h.waits.at(-1)
  h.push()
  expect(h.waits.length).toBe(2)
  first?.resolve('elapsed')
  await settled(Promise.resolve())
  expect(h.waits.length).toBe(2)
  expect((await h.iterator.next()).value).toMatchObject({ kind: 'delta' })
})

it('a due timer turns an expired queue into a buffer gap after the last delivered frame', async () => {
  const h = harness({ maxQueueResidenceMs: 100, checkIntervalMs: 1000 })
  const snapshot = (await h.iterator.next()).value
  h.push()
  h.setNow(150)
  h.waits.at(-1)?.resolve('elapsed')
  await settled(Promise.resolve())
  expect(h.admitted()).toBe(0)
  expect((await h.iterator.next()).value).toEqual({
    kind: 'gap',
    after: snapshot && 'cursor' in snapshot ? snapshot.cursor : null,
    reason: 'buffer',
  })
})

it('a delivery rechecks residence before handing out an expired frame', async () => {
  const h = harness({ maxQueueResidenceMs: 100, checkIntervalMs: 1000 })
  const snapshot = (await h.iterator.next()).value
  h.push()
  h.setNow(150)
  expect(await settled(h.iterator.next())).toEqual({
    done: false,
    value: {
      kind: 'gap',
      after: snapshot && 'cursor' in snapshot ? snapshot.cursor : null,
      reason: 'buffer',
    },
  })
})

it('a delivery rechecks qualification when new content arrives for a waiting observer', async () => {
  const h = harness()
  await h.iterator.next()
  const next = h.iterator.next()
  h.fail('source-closed')
  h.push()
  expect(await settled(next)).toEqual({
    done: false,
    value: { kind: 'ended', reason: 'source-closed' },
  })
})
