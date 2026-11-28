import { DEFAULT_MODE } from '@omne-harness/interface-protocol'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { afterEach, describe, expect, it } from 'vitest'
import { createInspections } from '../src/inspections.ts'

const ACME = 'tenant-acme'
const ASKED = { page: 'notes', mode: DEFAULT_MODE }
const IMAGE = { kind: 'image', bytes: new Uint8Array([1, 2]), width: 1280, height: 800 } as const
const tick = () => new Promise(resolve => setImmediate(resolve))

const stops: AbortController[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop.abort()
})

function world() {
  const time = simulatedTime()
  let ids = 0
  const inspections = createInspections({
    time: time.source,
    policy: { dueMs: 30_000, perTenant: 4 },
    newId: () => `r-${String((ids += 1))}`,
  })
  const observe = (tenant: string, client: string) => {
    const stop = new AbortController()
    stops.push(stop)
    const frames = inspections.watch(tenant, client, 'look', 1, stop.signal)
    const seen: string[] = []
    void (async () => {
      for await (const frame of frames) seen.push(frame.request)
    })()
    return { stop, seen }
  }
  return { time, inspections, observe }
}

describe('the inspections, run on a ledger', () => {
  it('no client observing: answered at once that the client is not there (IV-2)', async () => {
    const t = world()
    expect(await t.inspections.inspect(ACME, ASKED)).toEqual({ kind: 'client-absent' })
  })

  it('the observing client gets the request as a frame; its image answers the caller and a second delivery is not found', async () => {
    const t = world()
    const client = t.observe(ACME, 'c-1')
    await tick()
    const answer = t.inspections.inspect(ACME, ASKED)
    await tick()
    expect(client.seen).toEqual(['r-1'])
    expect(t.inspections.deliver(ACME, 'c-1', 'r-1', IMAGE)).toBe('succeeded')
    expect(await answer).toEqual({ kind: 'image', image: IMAGE })
    expect(t.inspections.deliver(ACME, 'c-1', 'r-1', IMAGE)).toBe('not-found')
  })

  it('due before the client answers: unavailable, and the late image is not found', async () => {
    const t = world()
    t.observe(ACME, 'c-1')
    await tick()
    const answer = t.inspections.inspect(ACME, ASKED)
    await tick()
    t.time.advance(30_000)
    expect(await answer).toEqual({ kind: 'unavailable', why: 'expired' })
    expect(t.inspections.deliver(ACME, 'c-1', 'r-1', IMAGE)).toBe('not-found')
  })

  it('the client stops observing while a request waits: unavailable', async () => {
    const t = world()
    const client = t.observe(ACME, 'c-1')
    await tick()
    const answer = t.inspections.inspect(ACME, ASKED)
    await tick()
    client.stop.abort()
    expect(await answer).toEqual({ kind: 'unavailable', why: 'client-left' })
  })

  it("the caller gives up: it is told cancelled, the due time no longer fires, and the client's delivery is not found", async () => {
    const t = world()
    t.observe(ACME, 'c-1')
    await tick()
    const stop = new AbortController()
    const answer = t.inspections.inspect(ACME, ASKED, stop.signal)
    await tick()
    stop.abort()
    expect(await answer).toEqual({ kind: 'cancelled' })
    expect(t.time.pending()).toBe(0)
    expect(t.inspections.deliver(ACME, 'c-1', 'r-1', IMAGE)).toBe('not-found')
  })
})
