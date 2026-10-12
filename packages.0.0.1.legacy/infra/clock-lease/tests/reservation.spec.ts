import { describe, expect, it } from 'vitest'
import { LeaseClockPolicy } from '../src/lease-policy.ts'
import type { LeasePersistence } from '../src/lease-persistence.ts'
import { fakeSources } from './support.ts'

function harness() {
  const time = fakeSources(100_000)
  const calls: number[] = []
  let advance: LeasePersistence['advance'] = async () => true
  let retracted: number | undefined
  let retractReceipt: number | undefined
  const clock = new LeaseClockPolicy({
    persistence: {
      initialize: async (at, until) => ({
        fresh: true,
        row: { written_at: at, lease_until: until },
      }),
      advance: async (at, until) => {
        calls.push(until)
        return advance(at, until)
      },
      retract: async (expected, at) => {
        retractReceipt = expected
        retracted = at
      },
    },
    sources: time.sources,
    logger: undefined,
    onRenewFailure: undefined,
  })
  return {
    clock,
    ...time,
    calls,
    setAdvance(fn: LeasePersistence['advance']) {
      advance = fn
    },
    get retracted() {
      return retracted
    },
    get retractReceipt() {
      return retractReceipt
    },
  }
}

describe('on-demand durable reservations', () => {
  it('coalesces concurrent misses and publishes no time before the durable receipt', async () => {
    const h = harness()
    await h.clock.start()
    const gate = Promise.withResolvers<boolean>()
    h.setAdvance(() => gate.promise)
    h.state.wall = 120_000
    let completed = 0
    const requests = Array.from({ length: 20 }, () =>
      h.clock.now().then(value => {
        completed++
        return value
      }),
    )
    await Promise.resolve()
    expect(h.calls).toEqual([130_000])
    expect(completed).toBe(0)
    gate.resolve(true)
    expect(await Promise.all(requests)).toEqual(Array(20).fill(120_000))
    await h.clock.close()
  })

  it('resamples after an await and reserves again when the receipt is already expired', async () => {
    const h = harness()
    await h.clock.start()
    h.state.wall = 120_000
    h.setAdvance(async () => {
      h.state.wall = 135_000
      return true
    })
    expect(await h.clock.now()).toBe(135_000)
    expect(h.calls).toEqual([130_000, 145_000])
    await h.clock.close()
  })

  it('bounds repeated expired receipts without returning an uncovered wall time', async () => {
    const h = harness()
    await h.clock.start()
    h.state.wall = 120_000
    h.setAdvance(async (_at, until) => {
      h.state.wall = until + 1
      return true
    })
    expect(await h.clock.now()).toBe('unavailable')
    expect(h.calls).toHaveLength(2)
    await h.clock.close()
  })

  it('observes rollback after the durable await', async () => {
    const h = harness()
    await h.clock.start()
    expect(await h.clock.now()).toBe(100_000)
    h.state.wall = 120_000
    h.setAdvance(async () => {
      h.state.wall = 99_999
      return true
    })
    expect(await h.clock.now()).toBe('unavailable')
    await h.clock.close()
    expect(h.retracted).toBe(100_000)
  })

  it('stops waiting requests before reclaim and drains the reservation before close', async () => {
    const h = harness()
    await h.clock.start()
    h.state.wall = 120_000
    const gate = Promise.withResolvers<boolean>()
    h.setAdvance(() => gate.promise)
    const request = h.clock.now()
    const closing = h.clock.close()
    expect(await h.clock.now()).toBe('unavailable')
    expect(h.retracted).toBeUndefined()
    gate.resolve(true)
    expect(await request).toBe('unavailable')
    await closing
    expect(h.retracted).toBe(120_000)
  })

  it('accepts the confirmed upper boundary without another reservation', async () => {
    const h = harness()
    await h.clock.start()
    h.state.wall = 110_000
    expect(await h.clock.now()).toBe(110_000)
    expect(h.calls).toEqual([])
    await h.clock.close()
  })

  it.each([NaN, Infinity, -1, 100_000.5, Number.MAX_SAFE_INTEGER + 1])(
    'refuses an invalid wall reading %s without persisting it',
    async value => {
      const h = harness()
      await h.clock.start()
      h.state.wall = value
      expect(await h.clock.now()).toBe('unavailable')
      expect(h.calls).toEqual([])
      h.state.wall = 100_000
      expect(await h.clock.now()).toBe(100_000)
      await h.clock.close()
    },
  )

  it('does not reclaim a reservation already confirmed by another writer', async () => {
    const h = harness()
    await h.clock.start()
    h.state.wall = 120_000
    h.setAdvance(async () => false)
    expect(await h.clock.now()).toBe(120_000)
    expect(h.calls).toEqual([130_000])
    await h.clock.close()
    // The conditional retract must still compare against this instance's own old receipt.
    expect(h.retracted).toBe(120_000)
    expect(h.retractReceipt).toBe(110_000)
  })
})
