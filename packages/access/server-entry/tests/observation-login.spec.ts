import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createObservationRecords,
  type ClaimInput,
  type LoginCheck,
  type RecordsEvent,
} from '../src/observation-hub/records.ts'
import type { SseStream } from '../src/observation-hub/sse.ts'

const INTERVAL = 50

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

type FakeStream = {
  readonly stream: SseStream
  readonly events: string[]
  readonly calls: () => { event: number; end: number }
  readonly close: () => void
}

function fakeStream(): FakeStream {
  const events: string[] = []
  const listeners: (() => void)[] = []
  const counts = { event: 0, end: 0 }
  let closed = false
  return {
    events,
    calls: () => ({ ...counts }),
    close() {
      closed = true
      for (const listener of listeners.splice(0)) listener()
    },
    stream: {
      get closed() {
        return closed
      },
      finished: new Promise<void>(() => {}),
      event(text: string) {
        counts.event += 1
        events.push(text)
      },
      end() {
        counts.end += 1
      },
      onClose(listener: () => void) {
        if (closed) listener()
        else listeners.push(listener)
      },
    } as unknown as SseStream,
  }
}

function setup(limits: { perLogin?: number; perInstance?: number } = {}) {
  const reports: RecordsEvent[] = []
  const records = createObservationRecords({
    limits: { perLogin: 2, perInstance: 4, cancelRetentionMs: 0, ...limits },
    loginCheckIntervalMs: INTERVAL,
    report: event => reports.push(event),
  })
  return { records, reports }
}

function observation(key: string, checkLogin: () => Promise<LoginCheck>) {
  const ended: string[] = []
  const input: ClaimInput = {
    key,
    loginKey: 'L',
    checkLogin,
    endFrame: reason => `end:${reason}`,
    onEnded: reason => ended.push(reason),
  }
  return { input, ended }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('the login check holds nothing the process waits for', () => {
  it('does not keep the process alive between two rounds, whatever the answers were', async () => {
    const timers: NodeJS.Timeout[] = []
    const real = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((...args: Parameters<typeof real>) => {
      const timer = real(...args)
      timers.push(timer)
      return timer
    }) as typeof setTimeout)
    const { records } = setup()
    const checkLogin = vi.fn<() => Promise<LoginCheck>>(() => Promise.resolve('valid'))
    records.claim(observation('k', checkLogin).input)!.attach(fakeStream().stream)
    await vi.advanceTimersByTimeAsync(2 * INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(2)
    expect(timers).toHaveLength(3)
    expect(timers.map(timer => timer.hasRef())).toEqual([false, false, false])
  })
})

describe('a check that cannot answer', () => {
  it.each([
    [
      'throws before it returns a promise',
      (): Promise<LoginCheck> => {
        throw new Error('identity down')
      },
    ],
    [
      'rejects with a value that is not an error',
      (): Promise<LoginCheck> => Promise.reject('identity down'),
    ],
    ['rejects with nothing', (): Promise<LoginCheck> => Promise.reject(undefined)],
  ] as const)('ends with unavailable, once, when it %s', async (_label, checkLogin) => {
    const { records, reports } = setup()
    const { input, ended } = observation('k', checkLogin)
    const stream = fakeStream()
    records.claim(input)!.attach(stream.stream)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(stream.events).toEqual(['end:unavailable'])
    expect(ended).toEqual(['unavailable'])
    expect(reports).toEqual([{ kind: 'ended', reason: 'unavailable' }])
  })
})

describe('a revoked login is over at once', () => {
  it('writes the ended frame and nothing after it, however long the stream stays open, and leaves no timer', async () => {
    const { records, reports } = setup()
    const { input, ended } = observation(
      'k',
      vi.fn<() => Promise<LoginCheck>>(() => Promise.resolve('denied')),
    )
    const stream = fakeStream()
    records.claim(input)!.attach(stream.stream)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(20 * INTERVAL)
    expect(stream.events).toEqual(['end:denied'])
    expect(stream.calls()).toEqual({ event: 1, end: 1 })
    expect(ended).toEqual(['denied'])
    expect(reports).toEqual([{ kind: 'ended', reason: 'denied' }])
  })

  it('checks each observation of the login on its own: one denied ends only that one, and gives its slot back', async () => {
    const { records } = setup({ perLogin: 2 })
    const revoked = observation(
      'a',
      vi.fn<() => Promise<LoginCheck>>(() => Promise.resolve('denied')),
    )
    const kept = observation(
      'b',
      vi.fn<() => Promise<LoginCheck>>(() => Promise.resolve('valid')),
    )
    const revokedStream = fakeStream()
    const keptStream = fakeStream()
    records.claim(revoked.input)!.attach(revokedStream.stream)
    records.claim(kept.input)!.attach(keptStream.stream)
    expect(records.claim(observation('c', () => Promise.resolve('valid')).input)).toBeUndefined()
    await vi.advanceTimersByTimeAsync(3 * INTERVAL)
    expect(revokedStream.events).toEqual(['end:denied'])
    expect(keptStream.events).toEqual([])
    expect(kept.ended).toEqual([])
    expect(kept.input.checkLogin).toHaveBeenCalledTimes(3)
    expect(records.claim(observation('c', () => Promise.resolve('valid')).input)).toBeDefined()
  })
})

describe('an answer that arrives after the observation was over', () => {
  it.each([
    ['the connection closed', (_records: unknown, stream: FakeStream) => stream.close(), []],
    [
      'the login was ended',
      (records: { endLogin(key: string, reason: 'unavailable'): void }) =>
        records.endLogin('L', 'unavailable'),
      ['end:unavailable'],
    ],
    [
      'every observation was ended',
      (records: { endAll(reason: 'unavailable'): Promise<void> }) =>
        void records.endAll('unavailable'),
      ['end:unavailable'],
    ],
    [
      'a newer observation took its place',
      (records: { claim(input: ClaimInput): unknown }) =>
        records.claim(observation('k', () => Promise.resolve('valid')).input),
      ['end:observer-replaced'],
    ],
  ] as const)(
    'changes nothing, writes nothing more and arms no timer, when %s while the check was out, whether it then answers valid or denied',
    async (_label, over, frames) => {
      for (const answer of ['valid', 'denied'] as const) {
        const { records, reports } = setup({ perLogin: 9, perInstance: 9 })
        const pending = deferred<LoginCheck>()
        const checkLogin = vi.fn<() => Promise<LoginCheck>>(() => pending.promise)
        const { input, ended } = observation('k', checkLogin)
        const stream = fakeStream()
        records.claim(input)!.attach(stream.stream)
        await vi.advanceTimersByTimeAsync(INTERVAL)
        expect(checkLogin).toHaveBeenCalledTimes(1)
        ;(over as (records: unknown, stream: FakeStream) => void)(records, stream)
        const first = { events: [...stream.events], ended: [...ended], reports: [...reports] }
        pending.resolve(answer)
        await vi.advanceTimersByTimeAsync(0)
        expect(vi.getTimerCount()).toBe(0)
        await vi.advanceTimersByTimeAsync(10 * INTERVAL)
        expect(stream.events).toEqual(frames)
        expect(stream.events).toEqual(first.events)
        expect(ended).toEqual(first.ended)
        expect(ended).toHaveLength(1)
        expect(reports).toEqual(first.reports)
        expect(checkLogin).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
        vi.clearAllTimers()
      }
    },
  )
})
