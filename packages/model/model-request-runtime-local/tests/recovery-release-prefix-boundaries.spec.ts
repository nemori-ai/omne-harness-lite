import { describe, expect, it, vi } from 'vitest'
import {
  constructAnchoredInterruption,
  type RuntimeRecoveryScope,
  type SettlementRegistration,
  type SettlementTask,
  type SettlementTaskKind,
} from '@omne-harness-lite/model-request-runtime'
import type { OwnedLogEntry, SessionLog } from '@omne-harness-lite/session-log'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createRuntimeReconcile } from '../src/service-reconcile.ts'
import { anchors, capture, dispatched, located, prepare, session } from './log-codec-fixture.ts'
import { batchV2, responseV5 } from './log-codec-v2-fixture.ts'
import { controlled, noWaitScheduler, policy, request } from './settlement-fixture.ts'
import { storeUnavailableCustody } from './reference-ports-fixture.ts'

type ControlledInput = Parameters<Parameters<typeof controlled>[1]>[0]
type Append = Parameters<SessionLog['append']>
type Component = ReturnType<typeof createRuntimeReconcile>

const endedAt = '2026-09-27T00:00:03Z'
const interrupted = { calls: [{ callId: 'call', state: 'interrupted' }] }
const completedAndInterrupted = {
  calls: [
    { callId: 'call', state: 'complete' },
    { callId: 'fresh-call', state: 'interrupted' },
  ],
}

function appendArguments(entries: readonly OwnedLogEntry[]): Append {
  return [session, entries, { kind: 'unfenced' }, { kind: 'unconditional' }]
}

function prefix(entries: readonly OwnedLogEntry[]) {
  return { entries: entries.map((entry, index) => located(entry, index + 1)), tail: entries.length }
}

function expectations() {
  const initial = anchors().entries.map(
    ({ session: _session, position: _position, ...entry }) => entry,
  )
  const d = capture('record', dispatched).record
  if (d?.kind !== 'model_call_dispatched') throw new Error('fixed dispatch reference')
  const response = constructAnchoredInterruption({
    dispatched: d,
    observed: null,
    sendState: 'send_unknown',
    firstTokenAt: '2026-09-27T00:00:01Z',
    endedAt,
    initiator: 'runtime_lost',
  })
  if ('rejected' in response) throw new Error('fixed interruption reference')
  const responseBatch = [prepare('response', response.response, { kind: 'response' })]
  const intent = prepare(
    'record',
    { kind: 'model_call_interrupt_intent', call: 'fresh-call', initiator: 'user' },
    { kind: 'record' },
  )
  const ending = prepare(
    'record',
    { kind: 'model_call_ended', call: 'fresh-call', ending: 'interrupted', initiator: 'user' },
    { kind: 'record' },
  )
  const completedBatch = batchV2(responseV5)
  return {
    initial: prefix(initial),
    responseAppends: [appendArguments(responseBatch)],
    responsePrefix: prefix([...initial, ...responseBatch]),
    intent,
    pendingAppends: [
      appendArguments(completedBatch),
      appendArguments([intent]),
      appendArguments([ending]),
    ],
    pendingPrefix: prefix([...initial, ...completedBatch, intent, ending]),
  }
}

function observeOwner(owner: ControlledInput['owner']) {
  const records: {
    registration: SettlementRegistration
    tasks: {
      kind: SettlementTaskKind
      task: SettlementTask<unknown>
      stopped: Promise<void>
      done: boolean
    }[]
    releases: number
    released: boolean
  }[] = []
  const events: { kind: string; registration: SettlementRegistration }[] = []
  const observers: Promise<void>[] = []
  const originalAcquire = owner.acquire
  let fault: 'none' | 'throw' | 'unavailable' = 'none'
  let failedReleases = 0
  let faultHits = 0
  const sentinel = new Error('recognition acquire sentinel')
  const acquire = vi.spyOn(owner, 'acquire').mockImplementation(limit => {
    if (fault !== 'none') {
      const current = fault
      fault = 'none'
      faultHits++
      expect(owner.active).toBe(0)
      if (current === 'throw') throw sentinel
      return { unavailable: true }
    }
    const admitted = originalAcquire(limit)
    if ('unavailable' in admitted) return admitted
    const registration = admitted.registration
    const record: (typeof records)[number] = {
      registration,
      tasks: [],
      releases: 0,
      released: false,
    }
    records.push(record)
    const originalStart = registration.start
    vi.spyOn(registration, 'start').mockImplementation(
      <T>(kind: SettlementTaskKind, operation: (signal: AbortSignal) => Promise<T>) => {
        const task = originalStart<T>(kind, operation)
        const observed = { kind, task, stopped: task.stopped, done: false }
        record.tasks.push(observed)
        const originalStop = task.requestStop
        vi.spyOn(task, 'requestStop').mockImplementation(() => {
          events.push({ kind: 'stop', registration })
          originalStop()
        })
        observers.push(
          task.stopped.then(() => {
            observed.done = true
            events.push({ kind: 'stopped', registration })
          }),
        )
        expect(task.stopped).toBe(observed.stopped)
        return task
      },
    )
    const originalRelease = registration.release
    vi.spyOn(registration, 'release').mockImplementation(() => {
      record.releases++
      events.push({ kind: 'release', registration })
      for (const observed of record.tasks) {
        expect(observed.done).toBe(true)
        expect(observed.task.stopped).toBe(observed.stopped)
      }
      if (record === records[0] && failedReleases > 0) {
        failedReleases--
        throw new Error('first read release sentinel')
      }
      originalRelease.call(registration)
      record.released = true
    })
    expect(admitted.registration).toBe(registration)
    return admitted
  })
  return {
    records,
    events,
    acquire,
    sentinel,
    get faultHits() {
      return faultHits
    },
    arm(next: 'throw' | 'unavailable') {
      fault = next
    },
    failFirstReadTwice() {
      failedReleases = 2
    },
    clear() {
      fault = 'none'
      failedReleases = 0
    },
    async stopped() {
      await Promise.all(observers)
    },
    checkReleased() {
      expect(owner.active).toBe(0)
      for (const record of records) {
        expect(record.released).toBe(true)
        for (const observed of record.tasks) {
          expect(observed.done).toBe(true)
          expect(observed.task.stopped).toBe(observed.stopped)
        }
      }
    },
  }
}

async function fixture(input: ControlledInput, expected: ReturnType<typeof expectations>) {
  expect(await input.binding.log.readSince(session, 0)).toEqual(expected.initial)
  expect(input.submissions).toEqual([
    { fence: { kind: 'unfenced' }, condition: { kind: 'unconditional' }, count: 2 },
  ])
  const appends: Append[] = []
  const snapshots: string[] = []
  const nativeAppend = input.binding.log.append
  vi.spyOn(input.binding.log, 'append').mockImplementation(async (...args) => {
    appends.push(args)
    snapshots.push(writeJsonLossless(args))
    return await nativeAppend(...args)
  })
  const owner = observeOwner(input.owner)
  const calls: Promise<unknown>[] = []
  let enters = 0,
    closes = 0,
    clock = 0
  function component(log: SessionLog) {
    return createRuntimeReconcile({
      custody: storeUnavailableCustody(),
      contention: { ...policy(), limits: { ...policy().limits, concurrent: 1 } },
      scheduler: noWaitScheduler,
      async now() {
        clock++
        return endedAt
      },
      diagnostic() {},
      recovery: {
        async authorize() {
          return { authorized: true }
        },
        async enter() {
          enters++
          return {
            scope: {
              binding: { log: input.wrap(log) },
              owner: input.owner,
              originalInvocation: () => ({ absent: true }),
              async close() {
                closes++
              },
            },
          }
        },
      },
    })
  }
  return {
    owner,
    appends,
    component,
    get enters() {
      return enters
    },
    get closes() {
      return closes
    },
    get clock() {
      return clock
    },
    run(component: Component) {
      const result = component.reconcile({ session })
      calls.push(result)
      return result
    },
    async checkAppends(wanted: Append[], wantedPrefix: ReturnType<typeof prefix>) {
      expect(appends).toEqual(wanted)
      expect(snapshots).toEqual(wanted.map(args => writeJsonLossless(args)))
      expect(await input.binding.log.readSince(session, 0)).toEqual(wantedPrefix)
    },
    async finish(component: Component) {
      owner.clear()
      await Promise.allSettled(calls)
      await owner.stopped()
      expect(await component.close()).toEqual({ released: true })
      await owner.stopped()
      owner.checkReleased()
    },
  }
}

describe('recovery release preserves original SQLite prefixes', () => {
  it('pending_recognition_acquire_throw', async () => {
    const expected = expectations()
    await controlled('f2-pending-acquire', async input => {
      const f = await fixture(input, expected)
      let endedWrites = 0
      const log: SessionLog = {
        ...input.binding.log,
        async append(...args) {
          const actual = await input.binding.log.append(...args)
          if ('failure' in actual) return actual
          endedWrites++
          return { failure: 'unavailable' }
        },
      }
      const component = f.component(log)
      try {
        const settled = input.coordinator.settle(request)
        expect(await settled.completion).toHaveProperty('settled')
        await settled.stopped
        const intent = await input.binding.log.append(...appendArguments([expected.intent]))
        expect(intent).not.toHaveProperty('failure')
        expect(await f.run(component)).toEqual({ unavailable: true })
        expect([f.enters, f.closes, f.clock, endedWrites, input.owner.active]).toEqual([
          1, 0, 0, 1, 1,
        ])
        const held = f.owner.records.find(record =>
          record.tasks.some(task => task.kind === 'controlAppend'),
        )
        expect(held?.released).toBe(false)
        const originalBatch = f.appends[2]?.[1]
        f.owner.arm('throw')
        await expect(f.run(component)).rejects.toBe(f.owner.sentinel)
        expect(f.owner.faultHits).toBe(1)
        expect(held?.released).toBe(true)
        expect([f.enters, f.closes, f.clock, endedWrites]).toEqual([1, 0, 0, 1])
        await f.checkAppends(expected.pendingAppends, expected.pendingPrefix)
        expect(await f.run(component)).toEqual(completedAndInterrupted)
        expect([f.enters, f.closes, f.clock, endedWrites, input.owner.active]).toEqual([
          1, 1, 0, 1, 0,
        ])
        expect(f.appends[2]?.[1]).toBe(originalBatch)
        expect(input.submissions.map(item => item.count)).toEqual([2, 2, 1, 1])
        await f.checkAppends(expected.pendingAppends, expected.pendingPrefix)
      } finally {
        await f.finish(component)
      }
    })
  })

  for (const fault of ['throw', 'unavailable'] as const) {
    it(
      fault === 'throw'
        ? 'settlement_recognition_acquire_throw'
        : 'settlement_recognition_admission_unavailable_once',
      async () => {
        const expected = expectations()
        await controlled(`f2-settlement-${fault}`, async input => {
          const f = await fixture(input, expected)
          let readable = true,
            responseWrites = 0
          const log: SessionLog = {
            ...input.binding.log,
            async readSince(...args) {
              return readable ? input.binding.log.readSince(...args) : { failure: 'unavailable' }
            },
            async append(...args) {
              const actual = await input.binding.log.append(...args)
              if ('failure' in actual) return actual
              responseWrites++
              readable = false
              return { failure: 'unavailable' }
            },
          }
          const component = f.component(log)
          try {
            expect(await f.run(component)).toEqual({ unavailable: true })
            expect([f.enters, f.closes, f.clock, responseWrites, input.owner.active]).toEqual([
              1, 0, 1, 1, 1,
            ])
            const held = f.owner.records.find(record =>
              record.tasks.some(task => task.kind === 'append'),
            )
            expect(held?.released).toBe(false)
            const originalBatch = f.appends[0]?.[1]
            await f.checkAppends(expected.responseAppends, expected.responsePrefix)
            readable = true
            f.owner.arm(fault)
            if (fault === 'throw') await expect(f.run(component)).rejects.toBe(f.owner.sentinel)
            else expect(await f.run(component)).toEqual({ unavailable: true })
            expect(f.owner.faultHits).toBe(1)
            expect(held?.released).toBe(true)
            expect([f.enters, f.closes, f.clock, responseWrites, input.owner.active]).toEqual([
              1, 0, 1, 1, 0,
            ])
            await f.checkAppends(expected.responseAppends, expected.responsePrefix)
            expect(await f.run(component)).toEqual(interrupted)
            expect([f.enters, f.closes, f.clock, responseWrites, input.owner.active]).toEqual([
              1, 1, 1, 1, 0,
            ])
            expect(f.appends[0]?.[1]).toBe(originalBatch)
            expect(input.submissions.map(item => item.count)).toEqual([2, 1])
            await f.checkAppends(expected.responseAppends, expected.responsePrefix)
          } finally {
            readable = true
            await f.finish(component)
          }
        })
      },
    )
  }

  it('retained_read_release_fails_twice', async () => {
    const expected = expectations()
    await controlled('f2-read-release', async input => {
      const f = await fixture(input, expected)
      f.owner.failFirstReadTwice()
      const component = f.component(input.binding.log)
      try {
        expect(await f.run(component)).toEqual({ unavailable: true })
        const first = f.owner.records[0]
        expect(first?.releases).toBe(1)
        expect(first?.tasks.map(task => task.kind)).toEqual(['read'])
        expect([f.enters, f.closes, f.clock, input.owner.active]).toEqual([1, 0, 0, 1])
        await f.checkAppends([], expected.initial)
        expect(await f.run(component)).toEqual({ unavailable: true })
        expect(f.owner.records).toHaveLength(1)
        expect(first?.releases).toBe(2)
        expect(first?.released).toBe(false)
        expect([f.enters, f.closes, f.clock, input.owner.active]).toEqual([1, 0, 0, 1])
        await f.checkAppends([], expected.initial)
        expect(await f.run(component)).toEqual(interrupted)
        expect(first?.releases).toBe(3)
        expect(first?.released).toBe(true)
        expect(
          f.owner.events
            .filter(event => event.registration === first?.registration)
            .map(event => event.kind),
        ).toEqual(['stop', 'stopped', 'release', 'stop', 'release', 'stop', 'release'])
        expect([f.enters, f.closes, f.clock, input.owner.active]).toEqual([1, 1, 1, 0])
        expect(input.submissions.map(item => item.count)).toEqual([2, 1])
        await f.checkAppends(expected.responseAppends, expected.responsePrefix)
      } finally {
        await f.finish(component)
      }
    })
  })

  it('entered_promise_rejects', async () => {
    const expected = expectations()
    await controlled('f2-enter-rejects', async input => {
      const f = await fixture(input, expected)
      const sentinel = new Error('original entered rejection')
      const entered = Promise.reject<{ scope: RuntimeRecoveryScope }>(sentinel)
      const observed = entered.catch(error => expect(error).toBe(sentinel))
      const enter = vi.fn(() => entered)
      const now = vi.fn(async () => endedAt)
      const component = createRuntimeReconcile({
        custody: storeUnavailableCustody(),
        contention: policy(),
        scheduler: noWaitScheduler,
        now,
        diagnostic() {},
        recovery: {
          async authorize() {
            return { authorized: true }
          },
          enter,
        },
      })
      try {
        expect(await f.run(component)).toEqual({ unavailable: true })
        expect(await component.close()).toEqual({ released: true })
        expect(await component.close()).toEqual({ released: true })
        expect(enter).toHaveBeenCalledTimes(1)
        expect(enter.mock.results[0]?.value).toBe(entered)
        expect(now).not.toHaveBeenCalled()
        expect(f.closes).toBe(0)
        expect(input.owner.active).toBe(0)
        expect(f.owner.records).toEqual([])
        expect(input.submissions.map(item => item.count)).toEqual([2])
        await f.checkAppends([], expected.initial)
      } finally {
        await observed
        await f.finish(component)
      }
    })
  })
})
