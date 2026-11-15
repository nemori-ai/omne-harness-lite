import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createObservationRecords,
  type ClaimInput,
  type LoginCheck,
  type RecordsEvent,
  type RecordsInput,
} from '../src/observation-hub/records.ts'
import type { SseStream } from '../src/observation-hub/sse.ts'

type Own = 'note-deleted'

const INTERVAL = 50
const RETENTION = 100

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

type FakeStream = {
  readonly stream: SseStream
  readonly events: string[]
  readonly calls: () => { event: number; end: number }
  closed: boolean
  throwOn: 'event' | 'end' | undefined
  readonly close: () => void
  readonly finish: () => void
}

function fakeStream(): FakeStream {
  const events: string[] = []
  const listeners: (() => void)[] = []
  const counts = { event: 0, end: 0 }
  let release: () => void = () => {}
  const finished = new Promise<void>(resolve => {
    release = resolve
  })
  const fake: FakeStream = {
    events,
    calls: () => ({ ...counts }),
    closed: false,
    throwOn: undefined,
    close() {
      fake.closed = true
      for (const listener of listeners.splice(0)) listener()
    },
    finish: () => release(),
    stream: {
      get closed() {
        return fake.closed
      },
      finished,
      event(text: string) {
        counts.event += 1
        if (fake.throwOn === 'event') throw new Error('write failed')
        events.push(text)
      },
      end() {
        counts.end += 1
        if (fake.throwOn === 'end') throw new Error('end failed')
      },
      onClose(listener: () => void) {
        if (fake.closed) listener()
        else listeners.push(listener)
      },
    } as unknown as SseStream,
  }
  return fake
}

function setup(
  limits: Partial<RecordsInput<Own>['limits']> = {},
  withReport = true,
  intervalMs = INTERVAL,
) {
  const reports: RecordsEvent<Own>[] = []
  const records = createObservationRecords<Own>({
    limits: { perLogin: 2, perInstance: 3, cancelRetentionMs: RETENTION, ...limits },
    loginCheckIntervalMs: intervalMs,
    ...(withReport ? { report: event => reports.push(event) } : {}),
  })
  return { records, reports }
}

type Claimed = {
  readonly ended: (string | undefined)[]
  readonly checkLogin: ReturnType<typeof vi.fn<() => Promise<LoginCheck>>>
}

function input(
  key: string,
  extra: Partial<ClaimInput<Own>> = {},
): [ClaimInput<Own>, Claimed['ended']] {
  const ended: Claimed['ended'] = []
  return [
    { key, endFrame: reason => `end:${reason}`, onEnded: reason => ended.push(reason), ...extra },
    ended,
  ]
}

function checks(...results: (LoginCheck | Error | Promise<LoginCheck>)[]) {
  let index = 0
  return vi.fn<() => Promise<LoginCheck>>(() => {
    const result = results[Math.min(index, results.length - 1)]!
    index += 1
    if (result instanceof Error) return Promise.reject(result)
    return Promise.resolve(result)
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('the login check of an attached observation', () => {
  it('starts only at the attach, and runs one interval later, not a tick earlier', async () => {
    const { records } = setup()
    const checkLogin = checks('valid')
    const [claimInput] = input('k', { loginKey: 'L', checkLogin })
    const claim = records.claim(claimInput)!
    await vi.advanceTimersByTimeAsync(10 * INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(0)
    claim.attach(fakeStream().stream)
    await vi.advanceTimersByTimeAsync(INTERVAL - 1)
    expect(checkLogin).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(checkLogin).toHaveBeenCalledTimes(1)
  })

  it('arms the next round after a valid answer, one interval after the answer', async () => {
    const { records } = setup()
    const checkLogin = checks('valid')
    const [claimInput] = input('k', { loginKey: 'L', checkLogin })
    records.claim(claimInput)!.attach(fakeStream().stream)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(INTERVAL - 1)
    expect(checkLogin).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(checkLogin).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(3)
  })

  it('does not start a second check while the first has not answered, and re-arms after it does', async () => {
    const { records } = setup()
    const pending = deferred<LoginCheck>()
    const checkLogin = vi.fn<() => Promise<LoginCheck>>(() => pending.promise)
    const [claimInput] = input('k', { loginKey: 'L', checkLogin })
    records.claim(claimInput)!.attach(fakeStream().stream)
    await vi.advanceTimersByTimeAsync(5 * INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(1)
    pending.resolve('valid')
    await vi.advanceTimersByTimeAsync(INTERVAL - 1)
    expect(checkLogin).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(checkLogin).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['denied', 'denied'],
    ['unavailable', 'unavailable'],
    ['a rejected check', 'unavailable'],
  ] as const)(
    'ends with the right reason on %s, once, and checks no more',
    async (label, reason) => {
      const { records, reports } = setup()
      const checkLogin = checks(label === 'a rejected check' ? new Error('identity down') : label)
      const [claimInput, ended] = input('k', { loginKey: 'L', checkLogin })
      const stream = fakeStream()
      records.claim(claimInput)!.attach(stream.stream)
      await vi.advanceTimersByTimeAsync(INTERVAL)
      expect(stream.events).toEqual([`end:${reason}`])
      expect(stream.calls()).toEqual({ event: 1, end: 1 })
      expect(ended).toEqual([reason])
      expect(reports).toEqual([{ kind: 'ended', reason }])
      await vi.advanceTimersByTimeAsync(10 * INTERVAL)
      expect(checkLogin).toHaveBeenCalledTimes(1)
    },
  )

  it('ignores the answer of a check that was in flight when the observation ended otherwise', async () => {
    const { records, reports } = setup({ cancelRetentionMs: 0 })
    const pending = deferred<LoginCheck>()
    const checkLogin = vi.fn<() => Promise<LoginCheck>>(() => pending.promise)
    const [claimInput, ended] = input('k', { loginKey: 'L', checkLogin })
    const stream = fakeStream()
    const claim = records.claim(claimInput)!
    claim.attach(stream.stream)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    claim.end('observer-cancelled')
    pending.resolve('valid')
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10 * INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(1)
    expect(stream.events).toEqual(['end:observer-cancelled'])
    expect(ended).toEqual(['observer-cancelled'])
    expect(reports).toEqual([{ kind: 'ended', reason: 'observer-cancelled' }])
  })

  it('keeps the first end when the in-flight check answers denied after a cancel', async () => {
    const { records, reports } = setup()
    const pending = deferred<LoginCheck>()
    const [claimInput, ended] = input('k', {
      loginKey: 'L',
      checkLogin: () => pending.promise,
    })
    const stream = fakeStream()
    const claim = records.claim(claimInput)!
    claim.attach(stream.stream)
    await vi.advanceTimersByTimeAsync(INTERVAL)
    claim.end('observer-cancelled')
    pending.resolve('denied')
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(stream.events).toEqual(['end:observer-cancelled'])
    expect(ended).toEqual(['observer-cancelled'])
    expect(reports).toHaveLength(1)
  })

  it('arms no timer for an observation without a check, nor for one that attaches already closed', async () => {
    const { records } = setup({ cancelRetentionMs: 0 })
    const [plain] = input('plain')
    records.claim(plain)!.attach(fakeStream().stream)
    expect(vi.getTimerCount()).toBe(0)
    const checkLogin = checks('valid')
    const [gone] = input('gone', { loginKey: 'L', checkLogin })
    const closed = fakeStream()
    closed.closed = true
    records.claim(gone)!.attach(closed.stream)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10 * INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(0)
  })

  it('stops the check when the connection closes', async () => {
    const { records } = setup({ cancelRetentionMs: 0 })
    const checkLogin = checks('valid')
    const [claimInput, ended] = input('k', { loginKey: 'L', checkLogin })
    const stream = fakeStream()
    records.claim(claimInput)!.attach(stream.stream)
    expect(vi.getTimerCount()).toBe(1)
    stream.close()
    expect(vi.getTimerCount()).toBe(0)
    expect(ended).toEqual(['connection-closed'])
    await vi.advanceTimersByTimeAsync(10 * INTERVAL)
    expect(checkLogin).toHaveBeenCalledTimes(0)
  })
})

describe('the slots', () => {
  it('lets the instance limit fill exactly, and not one more', () => {
    const { records } = setup({ perInstance: 2, perLogin: 9 })
    expect(records.claim(input('a')[0])).toBeDefined()
    expect(records.claim(input('b')[0])).toBeDefined()
    expect(records.claim(input('c')[0])).toBeUndefined()
  })

  it('counts a login against its own limit only, and an observation without a login against none', () => {
    const { records } = setup({ perInstance: 9, perLogin: 2 })
    expect(records.claim(input('a', { loginKey: 'L' })[0])).toBeDefined()
    expect(records.claim(input('b', { loginKey: 'L' })[0])).toBeDefined()
    expect(records.claim(input('c', { loginKey: 'L' })[0])).toBeUndefined()
    expect(records.claim(input('d', { loginKey: 'M' })[0])).toBeDefined()
    for (const key of ['e', 'f', 'g']) expect(records.claim(input(key)[0])).toBeDefined()
  })

  it.each([
    ['end', (claim: { end(reason: 'denied'): void }) => claim.end('denied')],
    ['discard', (claim: { discard(): void }) => claim.discard()],
  ] as const)(
    'gives the slot back on %s, and not twice when it is called twice',
    (_label, leave) => {
      const { records } = setup({ perInstance: 9, perLogin: 2 })
      const first = records.claim(input('a', { loginKey: 'L' })[0])!
      expect(records.claim(input('b', { loginKey: 'L' })[0])).toBeDefined()
      expect(records.claim(input('c', { loginKey: 'L' })[0])).toBeUndefined()
      leave(first as never)
      leave(first as never)
      expect(records.claim(input('c', { loginKey: 'L' })[0])).toBeDefined()
      expect(records.claim(input('d', { loginKey: 'L' })[0])).toBeUndefined()
    },
  )

  it('gives the slot back when the connection closes and when the login is ended', () => {
    const { records } = setup({ perInstance: 1, perLogin: 1 })
    const first = fakeStream()
    records.claim(input('a', { loginKey: 'L' })[0])!.attach(first.stream)
    expect(records.claim(input('b', { loginKey: 'L' })[0])).toBeUndefined()
    first.close()
    const second = records.claim(input('b', { loginKey: 'L' })[0])
    expect(second).toBeDefined()
    expect(records.claim(input('c', { loginKey: 'L' })[0])).toBeUndefined()
    records.endLogin('L', 'denied')
    expect(records.claim(input('c', { loginKey: 'L' })[0])).toBeDefined()
  })

  it('replaces the observation of the same key without taking a second slot, and ends the old one', () => {
    const { records } = setup({ perInstance: 1, perLogin: 1 })
    const [oldInput, oldEnded] = input('k', { loginKey: 'L' })
    const oldStream = fakeStream()
    records.claim(oldInput)!.attach(oldStream.stream)
    const [newInput, newEnded] = input('k', { loginKey: 'L' })
    const replacement = records.claim(newInput)
    expect(replacement).toBeDefined()
    expect(oldEnded).toEqual(['observer-replaced'])
    expect(oldStream.events).toEqual(['end:observer-replaced'])
    expect(newEnded).toEqual([])
    expect(records.claim(input('other', { loginKey: 'L' })[0])).toBeUndefined()
    const newStream = fakeStream()
    replacement!.attach(newStream.stream)
    expect(newStream.events).toEqual([])
    expect(records.cancel('k', 'observer-cancelled')).toBe('ended')
    expect(newStream.events).toEqual(['end:observer-cancelled'])
  })

  it('leaves the existing observation alone when a different key is refused', () => {
    const { records } = setup({ perInstance: 1 })
    const [firstInput, ended] = input('a')
    const stream = fakeStream()
    records.claim(firstInput)!.attach(stream.stream)
    expect(records.claim(input('b')[0])).toBeUndefined()
    expect(ended).toEqual([])
    expect(stream.events).toEqual([])
  })

  it('gives a replaced observation that attaches late its ended frame, and no slot', () => {
    const { records } = setup({ perInstance: 1 })
    const [oldInput, oldEnded] = input('k')
    const early = records.claim(oldInput)!
    records.claim(input('k')[0])
    expect(oldEnded).toEqual(['observer-replaced'])
    const stream = fakeStream()
    early.attach(stream.stream)
    expect(stream.events).toEqual(['end:observer-replaced'])
    expect(stream.calls()).toEqual({ event: 1, end: 1 })
    expect(records.claim(input('x')[0])).toBeUndefined()
  })
})

describe('the ended frame', () => {
  it.each([
    'observer-cancelled',
    'observer-replaced',
    'denied',
    'unavailable',
    'capacity',
    'note-deleted',
  ] as const)('is written once for %s, whatever ends the observation after it', reason => {
    const { records, reports } = setup()
    const [claimInput, ended] = input('k', { loginKey: 'L' })
    const stream = fakeStream()
    const claim = records.claim(claimInput)!
    claim.attach(stream.stream)
    claim.end(reason)
    claim.end('denied')
    records.cancel('k', 'unavailable')
    records.endLogin('L', 'capacity')
    stream.close()
    expect(stream.events).toEqual([`end:${reason}`])
    expect(stream.calls()).toEqual({ event: 1, end: 1 })
    expect(ended).toEqual([reason])
    expect(reports).toEqual([{ kind: 'ended', reason }])
  })

  it('hands the reason to the frame writer, and writes the frame before it ends the stream', () => {
    const { records } = setup()
    const order: string[] = []
    const frames: string[] = []
    const stream = fakeStream()
    const base = stream.stream
    const wrapped = {
      get closed() {
        return base.closed
      },
      finished: base.finished,
      event: (text: string) => {
        order.push('event')
        base.event(text)
      },
      end: () => {
        order.push('end')
        base.end()
      },
      onClose: (listener: () => void) => base.onClose(listener),
    } as unknown as SseStream
    const claim = records.claim({
      key: 'k',
      endFrame: reason => {
        frames.push(reason)
        return `frame:${reason}`
      },
    })!
    claim.attach(wrapped)
    claim.end('capacity')
    expect(frames).toEqual(['capacity'])
    expect(order).toEqual(['event', 'end'])
    expect(stream.events).toEqual(['frame:capacity'])
  })

  it('is held until the stream attaches when the observation ended first, then written once', () => {
    const { records, reports } = setup()
    const [claimInput, ended] = input('k')
    const claim = records.claim(claimInput)!
    claim.end('denied')
    expect(ended).toEqual(['denied'])
    expect(reports).toEqual([])
    const stream = fakeStream()
    claim.attach(stream.stream)
    expect(stream.events).toEqual(['end:denied'])
    expect(stream.calls()).toEqual({ event: 1, end: 1 })
    expect(reports).toEqual([{ kind: 'ended', reason: 'denied' }])
  })

  it('writes nothing to a stream that attaches after the connection was given up', () => {
    const { records, reports } = setup()
    const [claimInput, ended] = input('k')
    const claim = records.claim(claimInput)!
    claim.discard()
    claim.discard()
    expect(ended).toEqual(['connection-closed'])
    const stream = fakeStream()
    claim.attach(stream.stream)
    expect(stream.calls()).toEqual({ event: 0, end: 0 })
    expect(reports).toEqual([])
    claim.end('denied')
    expect(ended).toEqual(['connection-closed'])
  })

  it('writes nothing and does not end a stream that is already closed, but still reports the end', () => {
    const { records, reports } = setup()
    const stream = fakeStream()
    const claim = records.claim(input('k')[0])!
    claim.attach(stream.stream)
    stream.closed = true
    claim.end('denied')
    expect(stream.calls()).toEqual({ event: 0, end: 0 })
    expect(reports).toEqual([{ kind: 'ended', reason: 'denied' }])
  })

  it.each(['event', 'end'] as const)(
    'reports a failed cleanup, not an end, when the stream throws on %s, and still frees the slot',
    throwOn => {
      const { records, reports } = setup({ perInstance: 1 })
      const [claimInput, ended] = input('k')
      const stream = fakeStream()
      const claim = records.claim(claimInput)!
      claim.attach(stream.stream)
      stream.throwOn = throwOn
      claim.end('unavailable')
      expect(reports).toEqual([{ kind: 'cleanup-failed', reason: 'unavailable' }])
      expect(ended).toEqual(['unavailable'])
      expect(records.claim(input('next')[0])).toBeDefined()
    },
  )

  it('reports nothing wrong without a report function', () => {
    const { records } = setup({}, false)
    const stream = fakeStream()
    const claim = records.claim(input('k')[0])!
    claim.attach(stream.stream)
    expect(() => claim.end('denied')).not.toThrow()
    expect(stream.events).toEqual(['end:denied'])
  })

  it('refuses a second attach', () => {
    const { records } = setup()
    const claim = records.claim(input('k')[0])!
    claim.attach(fakeStream().stream)
    expect(() => claim.attach(fakeStream().stream)).toThrow(
      new TypeError('server-entry: observation attached twice'),
    )
  })

  it('records the closing of the connection without writing a frame, once', () => {
    const { records, reports } = setup()
    const [claimInput, ended] = input('k')
    const stream = fakeStream()
    records.claim(claimInput)!.attach(stream.stream)
    stream.close()
    expect(ended).toEqual(['connection-closed'])
    expect(stream.calls()).toEqual({ event: 0, end: 0 })
    expect(reports).toEqual([])
    expect(records.cancel('k', 'observer-cancelled')).toBe('ended')
    expect(ended).toEqual(['connection-closed'])
  })
})

describe('cancel and its retention', () => {
  it('answers not-found for a key it never saw, and ends a live one', () => {
    const { records } = setup()
    expect(records.cancel('nothing', 'observer-cancelled')).toBe('not-found')
    const stream = fakeStream()
    records.claim(input('k')[0])!.attach(stream.stream)
    expect(records.cancel('k', 'observer-cancelled')).toBe('ended')
    expect(stream.events).toEqual(['end:observer-cancelled'])
  })

  it('still answers ended for a cancelled key until the retention is over, to the tick', async () => {
    const { records } = setup()
    const stream = fakeStream()
    records.claim(input('k')[0])!.attach(stream.stream)
    records.cancel('k', 'observer-cancelled')
    await vi.advanceTimersByTimeAsync(RETENTION - 1)
    expect(records.cancel('k', 'observer-cancelled')).toBe('ended')
    expect(stream.events).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(records.cancel('k', 'observer-cancelled')).toBe('not-found')
  })

  it('retains no key at all when the retention is zero', () => {
    const { records } = setup({ cancelRetentionMs: 0 })
    records.claim(input('k')[0])!.attach(fakeStream().stream)
    records.cancel('k', 'observer-cancelled')
    expect(vi.getTimerCount()).toBe(0)
    expect(records.cancel('k', 'observer-cancelled')).toBe('not-found')
  })

  it('restarts the retention when the same key ends again', async () => {
    const { records } = setup()
    records.claim(input('k')[0])!.attach(fakeStream().stream)
    records.cancel('k', 'observer-cancelled')
    await vi.advanceTimersByTimeAsync(RETENTION / 2)
    records.claim(input('k')[0])!.attach(fakeStream().stream)
    records.cancel('k', 'observer-cancelled')
    await vi.advanceTimersByTimeAsync(RETENTION / 2 + 10)
    expect(records.cancel('k', 'observer-cancelled')).toBe('ended')
    await vi.advanceTimersByTimeAsync(RETENTION)
    expect(records.cancel('k', 'observer-cancelled')).toBe('not-found')
  })

  it('retains the key of an observation that was given up or whose connection closed', () => {
    const { records } = setup()
    records.claim(input('given-up')[0])!.discard()
    const stream = fakeStream()
    records.claim(input('closed')[0])!.attach(stream.stream)
    stream.close()
    expect(records.cancel('given-up', 'observer-cancelled')).toBe('ended')
    expect(records.cancel('closed', 'observer-cancelled')).toBe('ended')
  })
})

describe('ending by login and ending all', () => {
  it('ends the observations of one login, with the reason given, and no others', () => {
    const { records } = setup({ perInstance: 9, perLogin: 9 })
    const mine = [fakeStream(), fakeStream()]
    const theirs = fakeStream()
    const plain = fakeStream()
    records.claim(input('a', { loginKey: 'L' })[0])!.attach(mine[0]!.stream)
    records.claim(input('b', { loginKey: 'L' })[0])!.attach(mine[1]!.stream)
    records.claim(input('c', { loginKey: 'M' })[0])!.attach(theirs.stream)
    records.claim(input('d')[0])!.attach(plain.stream)
    records.endLogin('L', 'denied')
    expect(mine.map(stream => stream.events)).toEqual([['end:denied'], ['end:denied']])
    expect(theirs.events).toEqual([])
    expect(plain.events).toEqual([])
  })

  it('ends every observation, and resolves only when the attached streams have finished', async () => {
    const { records } = setup({ perInstance: 9, perLogin: 9 })
    const attached = [fakeStream(), fakeStream()]
    records.claim(input('a', { loginKey: 'L' })[0])!.attach(attached[0]!.stream)
    records.claim(input('b')[0])!.attach(attached[1]!.stream)
    const [loose, looseEnded] = input('c')
    records.claim(loose)
    let done = false
    const all = records.endAll('unavailable').then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(false)
    expect(attached.map(stream => stream.events)).toEqual([
      ['end:unavailable'],
      ['end:unavailable'],
    ])
    expect(looseEnded).toEqual(['unavailable'])
    attached[0]!.finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(false)
    attached[1]!.finish()
    await all
    expect(done).toBe(true)
  })

  it('does not wait for an observation that has no stream', async () => {
    const { records } = setup()
    records.claim(input('c')[0])
    await expect(records.endAll('unavailable')).resolves.toBeUndefined()
  })
})
