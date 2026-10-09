import { describe, expect, it } from 'vitest'
import { createAnchoredModelInvocation } from '../src/anchored-invocation.ts'
import { deferred, harness, payload, transport } from './anchored-invocation-fixture.ts'

const at = '2026-09-28T00:00:00Z'

describe('an asynchronous opened timestamp keeps current admission and actual writer custody', () => {
  it('cancellation during the timestamp never lands an opened anchor or releases its pending writer', async () => {
    await harness(async h => {
      const entered = deferred<void>()
      const clock = deferred<string>()
      const wire = transport()
      let calls = 0
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: wire.adapter,
        policy: {
          ...h.input.policy,
          async now() {
            if (++calls === 2) {
              entered.resolve()
              return clock.promise
            }
            return at
          },
        },
      })
      let completed = false
      void handle.outcome.then(() => {
        completed = true
      })
      try {
        await entered.promise
        h.controller.abort()
        await Promise.resolve()
        await Promise.resolve()
        expect(completed).toBe(false)
        expect(h.owner.active).toBe(1)
        expect(h.released()).toBe(0)
        clock.resolve(at)
        const result = await handle.outcome
        if (!('settled' in result)) throw new Error('durable unopened interruption missing')
        expect(result.settled.settled.response.value).toMatchObject({
          outcome: 'interrupted',
          initiator: 'run_cancelled',
        })
        expect(result.settled.settled.response.value).not.toHaveProperty('timing.firstTokenAt')
        expect(result.settled.settled.response.value).not.toHaveProperty('reply')
        const read = await h.log.readSince(h.input.settlement.binding.session, 0)
        if (!('entries' in read)) throw new Error('actual SQL journal read unavailable')
        expect(read.entries.map(payload).map(value => value.kind)).toEqual([
          'model_call_dispatched',
          undefined,
        ])
        expect(wire.sends()).toBe(1)
        expect(wire.stopped()).toBe(1)
        expect(await handle.close()).toEqual({ released: true })
        expect(h.owner.active).toBe(0)
        expect(h.released()).toBe(1)
      } finally {
        clock.resolve(at)
        await handle.close()
      }
    })
  })

  it('a closed original admission during the timestamp writes no opened anchor and retains borrowed custody for retry', async () => {
    await harness(async h => {
      const entered = deferred<void>()
      const clock = deferred<string>()
      const wire = transport()
      let calls = 0
      const handle = createAnchoredModelInvocation({
        ...h.input,
        transport: wire.adapter,
        policy: {
          ...h.input.policy,
          async now() {
            if (++calls === 2) {
              entered.resolve()
              return clock.promise
            }
            return at
          },
        },
      })
      try {
        await entered.promise
        h.owner.state = 'closed'
        expect(h.released()).toBe(0)
        clock.resolve(at)
        expect(await handle.outcome).toEqual({ unavailable: true })
        expect(await handle.close()).toEqual({ unavailable: true })
        expect(h.released()).toBe(0)
        const read = await h.log.readSince(h.input.settlement.binding.session, 0)
        if (!('entries' in read)) throw new Error('actual SQL journal read unavailable')
        expect(read.entries.map(payload).map(value => value.kind)).toEqual([
          'model_call_dispatched',
        ])
        expect(wire.sends()).toBe(1)
        expect(wire.stopped()).toBe(1)
        h.owner.state = 'open'
        expect(await handle.close()).toEqual({ released: true })
        expect(h.owner.active).toBe(0)
        expect(h.released()).toBe(1)
      } finally {
        clock.resolve(at)
        h.owner.state = 'open'
        await handle.close()
      }
    })
  })
})
