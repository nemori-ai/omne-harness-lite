import { afterEach, describe, expect, it } from 'vitest'
import { createObservationRegistry, observationKey } from '../src/observation.ts'
import { SseStream } from '../src/observation-hub/sse.ts'
import { sleep } from './support/harness.ts'
import { holdResponse, type HeldResponse } from './support/held-response.ts'

const LIMITS = { perLogin: 1, perInstance: 8, cancelRetentionMs: 200 }
const SESSION = 'a'.repeat(64)

function claimFor(observationId: string) {
  return {
    key: observationKey('lgn', SESSION, observationId),
    loginText: 'lgn',
    messageId: 'm-1',
    observationId,
    checkLogin: () => Promise.resolve('valid' as const),
  }
}
const KEY = claimFor('obs-1').key

const responses: HeldResponse[] = []
afterEach(async () => {
  await Promise.all(responses.splice(0).map(held => held.dispose()))
})

function events(text: string): unknown[] {
  return text
    .split('\n\n')
    .filter(block => block.startsWith('data: '))
    .map(block => JSON.parse(block.slice('data: '.length)) as unknown)
}

describe('an end between the claim and the attach', () => {
  it('writes the confirmation first and then the ended frame of the earlier cancel', async () => {
    const registry = createObservationRegistry({
      limits: LIMITS,
      loginCheckIntervalMs: 60_000,
      diagnostics: undefined,
    })
    const claim = registry.claim(claimFor('obs-1'))
    expect(claim).toBeDefined()
    expect(registry.cancel(KEY)).toBe('ended')
    const held = await holdResponse()
    responses.push(held)
    const stream = new SseStream(held.res, 1000)
    stream.open(200, '{"confirmation":true}')
    claim?.attach(stream)
    await held.ended
    const seen = events(held.received())
    expect(seen[0]).toEqual({ confirmation: true })
    expect((seen[1] as { body: { frame: unknown } }).body.frame).toEqual({
      kind: 'ended',
      reason: 'observer-cancelled',
    })
    expect(seen.length).toBe(2)
    expect(registry.claim(claimFor('obs-2'))).toBeDefined()
  })

  it('frees the slot of a stream that attaches already closed, and endAll does not wait for an unattached claim', async () => {
    const registry = createObservationRegistry({
      limits: LIMITS,
      loginCheckIntervalMs: 60_000,
      diagnostics: undefined,
    })
    const first = registry.claim(claimFor('obs-1'))
    const gone = await holdResponse()
    responses.push(gone)
    await gone.disconnect()
    const closedStream = new SseStream(gone.res, 20)
    closedStream.open(200, '{"confirmation":true}')
    first?.attach(closedStream)
    const second = registry.claim(claimFor('obs-2'))
    expect(second).toBeDefined()
    const settled = await Promise.race([
      registry.endAll('unavailable').then(() => 'resolved' as const),
      sleep(500).then(() => 'hung' as const),
    ])
    expect(settled).toBe('resolved')
    const late = await holdResponse()
    responses.push(late)
    const lateStream = new SseStream(late.res, 1000)
    lateStream.open(200, '{"confirmation":true}')
    second?.attach(lateStream)
    await late.ended
    const seen = events(late.received())
    expect(seen[0]).toEqual({ confirmation: true })
    expect((seen[1] as { body: { frame: unknown } }).body.frame).toEqual({
      kind: 'ended',
      reason: 'unavailable',
    })
  })
})
