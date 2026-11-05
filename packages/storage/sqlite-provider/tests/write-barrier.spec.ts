// The write barrier (SQL contract SPEC 9.3): writes and domain-serial barriers of one domain share
// one arrival order, so neither side can starve the other, and every wait is bounded by its caller.
// Each case names the defect that turns it red.
import { describe, expect, it } from 'vitest'
import { WriteBarrier, type BarrierOutcome } from '../src/write-barrier.ts'

const DOMAIN = 'd'

/** Lets every settled promise run its continuation. */
const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** A request in the order: what it got, in the log, and how to release it. */
type Tracked = Readonly<{
  outcome: Promise<BarrierOutcome>
  release(): void
}>

function track(log: string[], name: string, pending: Promise<BarrierOutcome>): Tracked {
  let granted: (() => void) | null = null
  const outcome = pending.then(result => {
    log.push(`${name}:${result.kind}`)
    if (result.kind === 'granted') granted = result.release
    return result
  })
  return { outcome, release: () => granted?.() }
}

/** `pending` within `ms`, else the outcome. */
async function within(ms: number, outcome: Promise<BarrierOutcome>): Promise<string> {
  const result = await Promise.race([
    outcome.then(item => item.kind),
    delay(ms).then(() => 'pending'),
  ])
  return result
}

describe('one arrival order for writes and barriers', () => {
  it('grants a barrier after the writes ahead of it, and a later write only after that barrier', async () => {
    // Defect: the barrier counts "queued" and a write waits while any barrier is queued (the old
    // implementation): b2 would be granted before w2.
    const barrier = new WriteBarrier()
    const log: string[] = []
    const w1 = track(log, 'w1', barrier.enterWrite(DOMAIN, {}))
    const b1 = track(log, 'b1', barrier.acquire(DOMAIN, {}))
    const w2 = track(log, 'w2', barrier.enterWrite(DOMAIN, {}))
    await flush()
    expect(log).toEqual(['w1:granted'])
    w1.release()
    await flush()
    expect(log).toEqual(['w1:granted', 'b1:granted'])
    const b2 = track(log, 'b2', barrier.acquire(DOMAIN, {}))
    await flush()
    expect(log).toEqual(['w1:granted', 'b1:granted'])
    b1.release()
    await flush()
    expect(log).toEqual(['w1:granted', 'b1:granted', 'w2:granted'])
    w2.release()
    await flush()
    expect(log).toEqual(['w1:granted', 'b1:granted', 'w2:granted', 'b2:granted'])
    b2.release()
  })

  it('barriers that keep arriving do not starve a write: it enters at its turn', async () => {
    // Defect: a write waits while any barrier is queued (the old implementation), so with
    // barriers queued behind it the write never enters: b1 would be granted instead of w.
    const barrier = new WriteBarrier()
    const log: string[] = []
    const held = track(log, 'b0', barrier.acquire(DOMAIN, {}))
    await flush()
    const write = track(log, 'w', barrier.enterWrite(DOMAIN, {}))
    // Three more barriers queue behind the write while b0 is still held.
    const later = [1, 2, 3].map(round =>
      track(log, `b${String(round)}`, barrier.acquire(DOMAIN, {})),
    )
    held.release()
    await flush()
    expect(log).toEqual(['b0:granted', 'w:granted'])
    write.release()
    await flush()
    expect(log).toEqual(['b0:granted', 'w:granted', 'b1:granted'])
    for (const item of later) {
      item.release()
      await flush()
    }
    expect(log).toEqual(['b0:granted', 'w:granted', 'b1:granted', 'b2:granted', 'b3:granted'])
  })

  it('writes that keep arriving do not starve a barrier: later writes wait behind it', async () => {
    // Defect: a write enters whenever no barrier is held, ignoring a barrier that waits ahead of
    // it (`advance` not stopping at the first barrier): w3 would enter at once and b would wait
    // for ever while writes keep coming.
    const barrier = new WriteBarrier()
    const log: string[] = []
    const w1 = track(log, 'w1', barrier.enterWrite(DOMAIN, {}))
    const w2 = track(log, 'w2', barrier.enterWrite(DOMAIN, {}))
    const b = track(log, 'b', barrier.acquire(DOMAIN, {}))
    const w3 = track(log, 'w3', barrier.enterWrite(DOMAIN, {}))
    await flush()
    expect(log).toEqual(['w1:granted', 'w2:granted'])
    w1.release()
    await flush()
    expect(log).toEqual(['w1:granted', 'w2:granted'])
    w2.release()
    await flush()
    expect(log).toEqual(['w1:granted', 'w2:granted', 'b:granted'])
    b.release()
    await flush()
    expect(log).toEqual(['w1:granted', 'w2:granted', 'b:granted', 'w3:granted'])
    w3.release()
  })

  it('keeps the orders of two domains apart', async () => {
    const barrier = new WriteBarrier()
    const log: string[] = []
    const held = track(log, 'b-d', barrier.acquire(DOMAIN, {}))
    await flush()
    const other = track(log, 'w-e', barrier.enterWrite('e', {}))
    await flush()
    expect(log).toEqual(['b-d:granted', 'w-e:granted'])
    held.release()
    other.release()
  })
})

describe('bounded waits', () => {
  it('withdraws a write that waited longer than its time limit, and keeps no place for it', async () => {
    // Defect: no time limit (the wait never ends while the barrier is held), or the expired entry
    // stays in the order (b2 would wait behind it for ever).
    const barrier = new WriteBarrier()
    const log: string[] = []
    const b1 = track(log, 'b1', barrier.acquire(DOMAIN, {}))
    await flush()
    const write = track(log, 'w', barrier.enterWrite(DOMAIN, { timeoutMs: 20 }))
    expect(await within(300, write.outcome)).toBe('withdrawn')
    const b2 = track(log, 'b2', barrier.acquire(DOMAIN, {}))
    b1.release()
    expect(await within(300, b2.outcome)).toBe('granted')
    b2.release()
    const later = track(log, 'w2', barrier.enterWrite(DOMAIN, {}))
    expect(await within(300, later.outcome)).toBe('granted')
    later.release()
    expect(log).toEqual(['b1:granted', 'w:withdrawn', 'b2:granted', 'w2:granted'])
  })

  it('withdraws a barrier that is aborted while it waits, so the writes behind it enter', async () => {
    // Defect: an abort is ignored (the barrier waits on), or the aborted entry stays in the order
    // (w2 would never enter).
    const barrier = new WriteBarrier()
    const log: string[] = []
    const w1 = track(log, 'w1', barrier.enterWrite(DOMAIN, {}))
    const abort = new AbortController()
    const b = track(log, 'b', barrier.acquire(DOMAIN, { signal: abort.signal }))
    const w2 = track(log, 'w2', barrier.enterWrite(DOMAIN, {}))
    await flush()
    expect(log).toEqual(['w1:granted'])
    abort.abort()
    expect(await within(300, b.outcome)).toBe('withdrawn')
    expect(await within(300, w2.outcome)).toBe('granted')
    w1.release()
    w2.release()
  })

  it('does not queue a request whose signal is already aborted', async () => {
    const barrier = new WriteBarrier()
    const log: string[] = []
    const held = track(log, 'b', barrier.acquire(DOMAIN, {}))
    await flush()
    const write = track(
      log,
      'w',
      barrier.enterWrite(DOMAIN, { signal: AbortSignal.abort(), timeoutMs: 1000 }),
    )
    expect(await within(100, write.outcome)).toBe('withdrawn')
    const next = track(log, 'b2', barrier.acquire(DOMAIN, {}))
    held.release()
    expect(await within(300, next.outcome)).toBe('granted')
    next.release()
  })

  it('ignores the time limit and the signal once the request was granted', async () => {
    // Defect: the timer or the abort listener survives the grant and withdraws an active entry,
    // which would release what the caller still holds.
    const barrier = new WriteBarrier()
    const log: string[] = []
    const abort = new AbortController()
    const held = track(log, 'b', barrier.acquire(DOMAIN, { signal: abort.signal, timeoutMs: 10 }))
    await flush()
    await delay(40)
    abort.abort()
    const write = track(log, 'w', barrier.enterWrite(DOMAIN, {}))
    expect(await within(100, write.outcome)).toBe('pending')
    held.release()
    expect(await within(300, write.outcome)).toBe('granted')
    write.release()
  })

  it('releases once: a second release does not move the order twice', async () => {
    const barrier = new WriteBarrier()
    const log: string[] = []
    const b1 = track(log, 'b1', barrier.acquire(DOMAIN, {}))
    const b2 = track(log, 'b2', barrier.acquire(DOMAIN, {}))
    const b3 = track(log, 'b3', barrier.acquire(DOMAIN, {}))
    await flush()
    b1.release()
    b1.release()
    await flush()
    expect(log).toEqual(['b1:granted', 'b2:granted'])
    expect(await within(100, b3.outcome)).toBe('pending')
    b2.release()
    expect(await within(300, b3.outcome)).toBe('granted')
    b3.release()
  })
})
