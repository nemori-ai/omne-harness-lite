import { describe, expect, it } from 'vitest'
import { invokeModel } from '../src/invoke.ts'
import { adapter, deferred, fixtureReadFacts, policy, request } from './invoke-policy-fixture.ts'

describe('public invocation deadline facts and actual reader stopping', () => {
  it.each([
    { phase: 'first_content', cause: 'upstream_unavailable', error: 'first_content_timeout' },
    { phase: 'queued', cause: 'unrecognized', error: 'local_queue_timeout' },
    { phase: 'idle_content', cause: 'interrupted_mid_reply', error: 'content_timeout' },
  ] as const)('retains $phase timeout facts without reporting an early stop', async scenario => {
    const sendEntered = deferred()
    const sendReleased = deferred()
    const stopReleased = deferred()
    const deadlines: { milliseconds: number; callback: () => void }[] = []
    let stopping = false
    let outcomeFinished = false
    let disposed = 0
    const wire = adapter({
      sent: scenario.phase === 'queued' ? { aborted: true, queued: true } : { response: {} },
      readFacts: fixtureReadFacts([]),
      pause: async () => {
        sendEntered.resolve()
        await sendReleased.promise
      },
      stopped: () => {
        stopping = true
        return stopReleased.promise
      },
    })
    const handle = invokeModel({
      ...request(),
      transport: wire.transport,
      credential: 'controlled-key',
      signal: new AbortController().signal,
      policy: {
        ...policy(),
        firstContentTimeoutMs: 321,
        idleContentTimeoutMs: 654,
        schedule(milliseconds, callback) {
          deadlines.push({ milliseconds, callback })
          return () => {
            disposed++
          }
        },
      },
      onAccepted(event) {
        if (scenario.phase === 'idle_content' && event.t === 'fill') {
          const idle = deadlines[1]
          if (idle === undefined) throw new Error('idle deadline not scheduled')
          idle.callback()
        }
      },
    })
    const completion = handle.outcome.then(value => {
      outcomeFinished = true
      return value
    })
    await sendEntered.promise
    expect(wire.sends()).toBe(1)
    expect(deadlines.map(value => value.milliseconds)).toEqual([321])
    if (scenario.phase !== 'idle_content') {
      const first = deadlines[0]
      if (first === undefined) throw new Error('first-content deadline not scheduled')
      first.callback()
    }
    sendReleased.resolve()
    if (scenario.phase !== 'queued') {
      await expect.poll(() => stopping).toBe(true)
      expect(wire.signal()?.aborted).toBe(true)
      expect(wire.stopped()).toBe(0)
      expect(outcomeFinished).toBe(false)
      expect(handle.observedFacts()).toEqual({ unavailable: true })
      if (scenario.phase === 'idle_content') expect(handle.snapshot().firstContentAt).toBeDefined()
      else expect(handle.snapshot().firstContentAt).toBeUndefined()
      stopReleased.resolve()
    }
    const result = await completion
    if (!('outcome' in result)) throw new Error('sent invocation result missing')
    expect(result).toMatchObject({
      outcome: 'failed',
      failure: { cause: scenario.cause, localError: scenario.error },
      usage: { input_tokens: 'unknown', output_tokens: 'unknown', source: 'none' },
      cost: { cost_usd: 'unknown', source: 'none' },
    })
    expect(result.ending).toBeUndefined()
    expect(result.timing.sentAt).toBe('2026-09-28T00:00:00Z')
    expect(wire.sends()).toBe(1)
    expect(wire.reads()).toBe(scenario.phase === 'queued' ? 0 : 1)
    expect(wire.stopped()).toBe(scenario.phase === 'queued' ? 0 : 1)
    expect(handle.observedFacts()).toHaveProperty('facts')
    if (scenario.phase === 'idle_content') {
      expect(result.timing.firstTokenAt).toBeDefined()
      expect(result.blocks).toMatchObject([{ kind: 'text', text: 'visible' }])
      expect(deadlines.map(value => value.milliseconds)).toEqual([321, 654])
      expect(disposed).toBe(2)
    } else {
      expect(result.timing.firstTokenAt).toBeUndefined()
      expect(result.blocks).toEqual([])
      expect(disposed).toBe(1)
    }
  })
})
