import { describe, expect, it, vi } from 'vitest'
import { WaitingQueue, type Acquired, type Fit, type Resource } from '../src/waiting.ts'

type Need = Readonly<{ domain: string; bytes: number }>

function world(limits = { perDomain: 2, global: 2 }) {
  const held = new Map<string, number>()
  let count = 0
  let bytes = 0
  let peak = 0
  const resource: Resource<Need> = {
    fit: (need): Fit => {
      if ((held.get(need.domain) ?? 0) >= 1) return 'domain'
      return count < 2 && bytes + need.bytes <= 2 ? 'fits' : 'global'
    },
    take: need => {
      held.set(need.domain, (held.get(need.domain) ?? 0) + 1)
      count += 1
      bytes += need.bytes
      peak = Math.max(peak, count)
      return () => {
        held.set(need.domain, (held.get(need.domain) ?? 1) - 1)
        count -= 1
        bytes -= need.bytes
      }
    },
  }
  const queue = new WaitingQueue(resource, limits)
  const outcomes = new Map<string, Acquired['kind']>()
  const releases = new Map<string, () => void>()
  const arrive = (name: string, domain: string, size = 1, waitMs = 10_000, signal?: AbortSignal) =>
    Promise.resolve(queue.acquire({ domain, bytes: size }, waitMs, signal)).then(acquired => {
      outcomes.set(name, acquired.kind)
      if (acquired.kind === 'granted') releases.set(name, acquired.release)
      return acquired
    })
  const release = (name: string) => releases.get(name)?.()
  return { queue, arrive, release, outcomes, peak: () => peak }
}

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

describe('WaitingQueue', () => {
  it('grants what fits at once, and the rest in arrival order as room comes back', async () => {
    const w = world()
    await w.arrive('a', 'd1')
    await w.arrive('b', 'd2')
    void w.arrive('c', 'd3')
    void w.arrive('d', 'd4')
    await settle()
    expect([w.outcomes.get('c'), w.outcomes.get('d')]).toEqual([undefined, undefined])
    w.release('a')
    await settle()
    expect([w.outcomes.get('c'), w.outcomes.get('d')]).toEqual(['granted', undefined])
    w.release('b')
    await settle()
    expect(w.outcomes.get('d')).toBe('granted')
  })

  it('a release grants only what the returned room fits (WithinCapacity)', async () => {
    const w = world({ perDomain: 2, global: 3 })
    await w.arrive('a', 'd1')
    await w.arrive('b', 'd2')
    for (const name of ['c', 'd', 'e']) void w.arrive(name, `x-${name}`)
    await settle()
    w.release('a')
    await settle()
    expect(['c', 'd', 'e'].map(name => w.outcomes.get(name))).toEqual([
      'granted',
      undefined,
      undefined,
    ])
    expect(w.peak()).toBe(2)
  })

  it('a waiter that a global bound blocks stops the scan: a later arrival does not overtake it (NoOvertake)', async () => {
    const w = world()
    await w.arrive('a', 'd1', 1)
    void w.arrive('c', 'd2', 2)
    await settle()
    void w.arrive('d', 'd3', 1)
    await settle()
    expect([w.outcomes.get('c'), w.outcomes.get('d')]).toEqual([undefined, undefined])
    w.release('a')
    await settle()
    expect([w.outcomes.get('c'), w.outcomes.get('d')]).toEqual(['granted', undefined])
  })

  it('a waiter that only its own domain blocks is skipped, and a later one of another domain goes on', async () => {
    const w = world()
    await w.arrive('a', 'd1')
    void w.arrive('b', 'd1')
    await settle()
    await w.arrive('c', 'd2')
    expect([w.outcomes.get('b'), w.outcomes.get('c')]).toEqual([undefined, 'granted'])
    w.release('a')
    await settle()
    expect(w.outcomes.get('b')).toBe('granted')
  })

  it('when a waiter leaves, the next one that fits is granted at once (NoIdleFit)', async () => {
    const w = world()
    await w.arrive('a', 'd1', 1)
    const abort = new AbortController()
    void w.arrive('c', 'd2', 2, 10_000, abort.signal)
    void w.arrive('d', 'd3', 1)
    await settle()
    expect(w.outcomes.get('d')).toBeUndefined()
    abort.abort()
    await settle()
    expect([w.outcomes.get('c'), w.outcomes.get('d')]).toEqual(['aborted', 'granted'])
  })

  it('a waiter whose deadline passes leaves with expired, and the next one is scanned at once', async () => {
    const w = world()
    await w.arrive('a', 'd1', 1)
    const expired = w.arrive('c', 'd2', 2, 20)
    void w.arrive('d', 'd3', 1)
    expect((await expired).kind).toBe('expired')
    await settle()
    expect(w.outcomes.get('d')).toBe('granted')
  })

  it('waitMs 0 refuses what the first scan does not grant', async () => {
    const w = world()
    await w.arrive('a', 'd1')
    await w.arrive('b', 'd2')
    expect((await w.arrive('c', 'd3', 1, 0)).kind).toBe('expired')
    expect((await w.arrive('e', 'd1', 1, 0)).kind).toBe('expired')
  })

  it('the waiting list is bounded per domain and in all: one more is refused at once (Bounded)', async () => {
    const w = world({ perDomain: 1, global: 2 })
    await w.arrive('a', 'd1')
    await w.arrive('b', 'd2')
    void w.arrive('c', 'd1')
    await settle()
    expect((await w.arrive('e', 'd1')).kind).toBe('full')
    void w.arrive('f', 'd3')
    await settle()
    expect((await w.arrive('g', 'd4')).kind).toBe('full')
    expect([w.outcomes.get('c'), w.outcomes.get('f')]).toEqual([undefined, undefined])
  })

  it('a waiter that is granted leaves no timer and no abort listener behind', async () => {
    vi.useFakeTimers()
    try {
      const w = world()
      await w.arrive('a', 'd1')
      await w.arrive('b', 'd2')
      const abort = new AbortController()
      const removed = vi.spyOn(abort.signal, 'removeEventListener')
      void w.arrive('c', 'd3', 1, 10_000, abort.signal)
      await Promise.resolve()
      expect(vi.getTimerCount()).toBe(1)
      w.release('a')
      await Promise.resolve()
      expect(w.outcomes.get('c')).toBe('granted')
      expect(vi.getTimerCount()).toBe(0)
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function))
    } finally {
      vi.useRealTimers()
    }
  })

  it('an abort before the call is aborted, nothing taken', async () => {
    const abort = new AbortController()
    abort.abort()
    const w = world()
    expect((await w.arrive('a', 'd1', 1, 10_000, abort.signal)).kind).toBe('aborted')
    expect(w.peak()).toBe(0)
  })

  it('close ends every waiter with closing, and later arrivals too', async () => {
    const w = world()
    await w.arrive('a', 'd1')
    await w.arrive('b', 'd2')
    const waiting = w.arrive('c', 'd3')
    await settle()
    w.queue.close()
    expect((await waiting).kind).toBe('closing')
    expect((await w.arrive('d', 'd4')).kind).toBe('closing')
  })

  it('a release given twice returns the room once', async () => {
    const w = world()
    await w.arrive('a', 'd1')
    await w.arrive('b', 'd2')
    w.release('a')
    w.release('a')
    await w.arrive('c', 'd3')
    const fourth = w.arrive('d', 'd4', 1, 0)
    expect((await fourth).kind).toBe('expired')
  })
})
