import { describe, expect, it } from 'vitest'
import { createDispatcher } from '../../src/dispatch/dispatcher.ts'

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

/** A dispatcher over a store with nothing pending, whose reads the test lets through one at a time. */
function world() {
  const gates: (() => void)[] = []
  let rounds = 0
  const dispatcher = createDispatcher({
    owner: { kind: 'tenant', tenantId: 't', ownerId: 'o' },
    store: {
      async pending() {
        rounds += 1
        await new Promise<void>(resolve => gates.push(resolve))
        const value = { stale: [], due: [], active: false, watch: null, earliest: null, jobs: [] }
        return { kind: 'ok', value }
      },
      commit: async () => ({ kind: 'committed' }),
      job: async () => ({ kind: 'ok', value: null }),
    },
    time: { now: () => 0, after: () => () => {}, at: () => () => {} },
    policy: { intervalMs: 1000, gapMs: 1000, roundLimit: 5, classifyPages: 1 },
  } as never)
  const release = async () => {
    gates.shift()?.()
    await settle()
  }
  return { dispatcher, release, rounds: () => rounds }
}

describe('waking the dispatcher', () => {
  it('starts a round when none is in flight', async () => {
    const w = world()
    w.dispatcher.wake()
    await settle()
    expect(w.rounds()).toBe(1)
    await w.release()
    expect(w.rounds()).toBe(1)
  })

  it('during a round it asks for one more after it, however often it is woken', async () => {
    const w = world()
    const first = w.dispatcher.round()
    await settle()
    w.dispatcher.wake()
    w.dispatcher.wake()
    await settle()
    expect(w.rounds()).toBe(1)
    await w.release()
    await first
    await settle()
    expect(w.rounds()).toBe(2)
    await w.release()
    expect(w.rounds()).toBe(2)
  })

  it('reports a woken round that fails: nobody awaits a wake', async () => {
    const reported: unknown[] = []
    const down = new Error('the store is down')
    const dispatcher = createDispatcher({
      owner: { kind: 'tenant', tenantId: 't', ownerId: 'o' },
      store: {
        pending: async () => {
          throw down
        },
        commit: async () => ({ kind: 'committed' }),
        job: async () => ({ kind: 'ok', value: null }),
      },
      time: { now: () => 0, after: () => () => {}, at: () => () => {} },
      policy: { intervalMs: 1000, gapMs: 1000, roundLimit: 5, classifyPages: 1 },
      report: (error: unknown) => void reported.push(error),
    } as never)
    dispatcher.wake()
    await settle()
    await settle()
    expect(reported).toEqual([down])
  })

  it('does nothing once the dispatcher is closed', async () => {
    const w = world()
    await w.dispatcher.close()
    w.dispatcher.wake()
    await settle()
    expect(w.rounds()).toBe(0)
  })
})
