// The admission point on the public Model stream (`src/model/observation.ts`, #1214): the source asks
// the synchronous authority at every check, so a capture must be held while `current` runs and
// while an observation runs, taken anew at the check interval, and released when it ends. The
// inner source is a stand-in that records which captures were held when it was asked. Each case
// names the defect that turns it red.
import { describe, expect, it } from 'vitest'
import type { ModelObservationSource } from '@omne-harness/model/commands'
import type { ModelStreamObservation } from '@omne-harness/model-contract'
import { fixtureTenant } from '../entry/support.ts'
import { qualifyingObservation, type ObservationQualify } from '../../src/model/observation.ts'

const TENANT = fixtureTenant('a')
const ACCESS = { principal: { login: 'one' }, tenant: TENANT }

/** A qualify that counts the captures it hands out and which of them are still held. */
function capturing(delayMs = 0) {
  let taken = 0
  const held = new Set<number>()
  const qualify: ObservationQualify = async access => {
    expect(access).toBe(ACCESS)
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
    taken += 1
    const id = taken
    held.add(id)
    return () => {
      held.delete(id)
    }
  }
  return { qualify, taken: () => taken, held: () => [...held] }
}

type Frame =
  ReturnType<ModelStreamObservation<unknown>['observe']> extends AsyncIterable<infer F> ? F : never

/** An inner source whose observation yields `frames` one by one, each when `step` is called. */
function inner(
  frames: readonly Frame[],
  seen: { current?: readonly number[]; frames: (readonly number[])[] },
  held: () => readonly number[],
  currentThrows = false,
) {
  const waiting: (() => void)[] = []
  const source: ModelObservationSource<unknown> = {
    close: () => {},
    openHost: () => ({
      ok: {
        attach: () => {},
        retire: () => {},
        close: () => {},
        references: {
          async current() {
            seen.current = held()
            if (currentThrows) throw new Error('inner current threw')
            return { ok: { state: {} as never, current: null } }
          },
        },
        observation: {
          async *observe() {
            for (const frame of frames) {
              await new Promise<void>(resolve => waiting.push(resolve))
              seen.frames.push(held())
              yield frame
            }
          },
        },
      },
    }),
  }
  const step = () => waiting.shift()?.()
  return { source, step }
}

const SNAPSHOT = { kind: 'snapshot', cursor: '1', value: {} } as unknown as Frame
const DELTA = { kind: 'delta', from: '1', cursor: '2', value: {} } as unknown as Frame

function hostOf(source: ModelObservationSource<unknown>) {
  const opened = source.openHost()
  if ('failure' in opened) throw new Error('openHost failed')
  return opened.ok
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('current under the admission point', () => {
  it('runs inside one capture and releases it after (defect: current asks the authority unqualified)', async () => {
    const q = capturing()
    const seen: { current?: readonly number[]; frames: (readonly number[])[] } = { frames: [] }
    const { source } = inner([], seen, q.held)
    const host = hostOf(qualifyingObservation(source, q.qualify, 1000))
    await host.references.current({ access: ACCESS, reference: 'ref' as never })
    expect(seen.current).toEqual([1])
    expect(q.held()).toEqual([])
  })

  it('releases the capture when the inner current throws (defect: a leaked capture keeps the principal admitted)', async () => {
    const q = capturing()
    const seen: { current?: readonly number[]; frames: (readonly number[])[] } = { frames: [] }
    const { source } = inner([], seen, q.held, true)
    const host = hostOf(qualifyingObservation(source, q.qualify, 1000))
    await expect(
      host.references.current({ access: ACCESS, reference: 'ref' as never }),
    ).rejects.toThrow('inner current threw')
    expect(q.held()).toEqual([])
  })
})

describe('observe under the admission point', () => {
  it('holds a capture for every frame, takes it anew at the interval and releases all at the end (defect: one capture for the whole observation)', async () => {
    const q = capturing()
    const seen: { current?: readonly number[]; frames: (readonly number[])[] } = { frames: [] }
    const { source, step } = inner([SNAPSHOT, DELTA], seen, q.held)
    const host = hostOf(qualifyingObservation(source, q.qualify, 20))
    const iterator = host.observation
      .observe({ ref: 'ref' as never, access: ACCESS, signal: new AbortController().signal })
      [Symbol.asyncIterator]()
    const first = iterator.next()
    await sleep(5)
    step()
    expect((await first).value).toBe(SNAPSHOT)
    expect(seen.frames[0]).toEqual([1])
    await sleep(70)
    expect(q.taken()).toBeGreaterThanOrEqual(3)
    expect(q.held()).toHaveLength(1)
    const second = iterator.next()
    step()
    expect((await second).value).toBe(DELTA)
    expect(seen.frames[1]).toHaveLength(1)
    expect(seen.frames[1]).not.toEqual([1])
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
    expect(q.held()).toEqual([])
    const after = q.taken()
    await sleep(50)
    expect(q.taken()).toBe(after)
  })

  it('a return of the observer releases its captures and stops the rechecks (defect: an abandoned observation stays admitted)', async () => {
    const q = capturing()
    const seen: { current?: readonly number[]; frames: (readonly number[])[] } = { frames: [] }
    const { source, step } = inner([SNAPSHOT, DELTA], seen, q.held)
    const host = hostOf(qualifyingObservation(source, q.qualify, 20))
    const iterator = host.observation
      .observe({ ref: 'ref' as never, access: ACCESS, signal: new AbortController().signal })
      [Symbol.asyncIterator]()
    const first = iterator.next()
    await sleep(5)
    step()
    await first
    await iterator.return?.()
    expect(q.held()).toEqual([])
    const after = q.taken()
    await sleep(60)
    expect(q.taken()).toBe(after)
  })

  it('a recheck that lands after the end is released at once (defect: a late capture outlives the observation)', async () => {
    const q = capturing(30)
    const seen: { current?: readonly number[]; frames: (readonly number[])[] } = { frames: [] }
    const { source, step } = inner([SNAPSHOT], seen, q.held)
    const host = hostOf(qualifyingObservation(source, q.qualify, 10))
    const iterator = host.observation
      .observe({ ref: 'ref' as never, access: ACCESS, signal: new AbortController().signal })
      [Symbol.asyncIterator]()
    const first = iterator.next()
    await sleep(45)
    step()
    await first
    await iterator.return?.()
    await sleep(60)
    expect(q.held()).toEqual([])
  })
})

describe('a recheck that fails', () => {
  it('leaves no capture, so the source ends the observation at its next check (defect: the old capture goes on)', async () => {
    let taken = 0
    const held = new Set<number>()
    const qualify: ObservationQualify = async () => {
      taken += 1
      if (taken > 1) throw new Error('qualification threw')
      held.add(taken)
      const id = taken
      return () => {
        held.delete(id)
      }
    }
    const seen: { current?: readonly number[]; frames: (readonly number[])[] } = { frames: [] }
    const { source, step } = inner([SNAPSHOT, DELTA], seen, () => [...held])
    const host = hostOf(qualifyingObservation(source, qualify, 10))
    const iterator = host.observation
      .observe({ ref: 'ref' as never, access: ACCESS, signal: new AbortController().signal })
      [Symbol.asyncIterator]()
    const first = iterator.next()
    await sleep(5)
    step()
    await first
    await sleep(40)
    const second = iterator.next()
    step()
    await second
    expect(seen.frames[1]).toEqual([])
    await iterator.return?.()
  })
})
