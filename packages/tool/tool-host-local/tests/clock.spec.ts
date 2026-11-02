// Rules of the host clock that the contract suite does not pin down: what a marker accepts, why a
// foreign marker is refused, how `waitUntil` follows the wall time, and the default sources.
import { describe, expect, it } from 'vitest'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { createLocalToolClock } from '@omne-harness/tool-host-local'
import { manualSources } from './clock-values.ts'

const unwrap = <T>(outcome: { ok: T } | { failure: unknown }, what: string): T => {
  if (!('ok' in outcome)) throw new Error(what)
  return outcome.ok
}
const operation = unwrap(decodeToolOperationId('segment-1'), 'operation')
const execution = {
  tenant: testingTenant(`org_${'a'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
  call: unwrap(decodeToolCallId('call-1'), 'call'),
  instance: unwrap(decodeToolInstanceId('instance-1'), 'instance'),
  generation: '1',
}

describe('G4 host clock', () => {
  it('G4 a marker of another run is refused as an epoch that cannot be compared', async () => {
    const time = manualSources()
    const first = createLocalToolClock({ ...time.sources, epoch: 'run-1' })
    const second = createLocalToolClock({ ...time.sources, epoch: 'run-2' })
    const segment = unwrap(await first.begin({ operation, execution }), 'begin')
    expect(await second.elapsed(segment.marker)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'clock',
        diagnostic: 'the epoch of the marker cannot be compared',
      },
    })
  })

  it('G4 a marker whose digest was changed is not a marker of this clock', async () => {
    const clock = createLocalToolClock({ ...manualSources().sources, epoch: 'run-1' })
    const { marker } = unwrap(await clock.begin({ operation, execution }), 'begin')
    const answer = await clock.elapsed({ ...marker, digest: `${marker.digest}0` })
    expect(answer).toMatchObject({
      failure: { diagnostic: 'the evidence is not a marker of this clock' },
    })
  })

  it('G4 a record rewritten to an earlier start does not buy budget', async () => {
    const time = manualSources()
    const clock = createLocalToolClock({ ...time.sources, epoch: 'run-1' })
    const { marker } = unwrap(await clock.begin({ operation, execution }), 'begin')
    time.advance(500)
    const parts = marker.record.split('/')
    parts[2] = '0'
    expect(await clock.elapsed({ ...marker, record: parts.join('/') })).toHaveProperty('failure')
  })

  it('G4 evidence of another owner and an elapsed measurement are not markers', async () => {
    const clock = createLocalToolClock({ ...manualSources().sources, epoch: 'run-1' })
    const { marker } = unwrap(await clock.begin({ operation, execution }), 'begin')
    expect(await clock.elapsed({ ...marker, owner: 'someone-else' })).toHaveProperty('failure')
    const measured = unwrap(await clock.elapsed(marker), 'elapsed')
    expect(await clock.elapsed(measured.evidence)).toHaveProperty('failure')
  })

  it('G4 two begins of one operation give two markers that each measure from their own begin', async () => {
    const time = manualSources()
    const clock = createLocalToolClock({ ...time.sources, epoch: 'run-1' })
    const first = unwrap(await clock.begin({ operation, execution }), 'first')
    time.advance(40)
    const second = unwrap(await clock.begin({ operation, execution }), 'second')
    time.advance(10)
    expect(first.marker.digest).not.toBe(second.marker.digest)
    expect(unwrap(await clock.elapsed(first.marker), 'a').milliseconds).toBe('50')
    expect(unwrap(await clock.elapsed(second.marker), 'b').milliseconds).toBe('10')
  })

  it('G4 waitUntil follows the wall time: a sleep that ended early does not answer elapsed', async () => {
    const time = manualSources()
    const clock = createLocalToolClock({ ...time.sources, epoch: 'run-1' })
    const waiting = clock.waitUntil(time.instantAfter(200), new AbortController().signal)
    time.setBack(100)
    // The sleep of 200 ms ends, but the wall time stands 100 ms short of the instant.
    time.advance(200)
    const early = await Promise.race([
      waiting,
      new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 25)),
    ])
    expect(early).toBe('pending')
    time.advance(100)
    expect(await waiting).toBe('elapsed')
  })

  it('G4 an instant that is not a date is a TypeError, not an elapsed wait', async () => {
    const clock = createLocalToolClock({ ...manualSources().sources, epoch: 'run-1' })
    await expect(clock.waitUntil('tomorrow-ish', new AbortController().signal)).rejects.toThrow(
      TypeError,
    )
  })

  it('G4 an epoch that is empty or holds a slash is refused when the clock is built', () => {
    expect(() => createLocalToolClock({ epoch: '' })).toThrow(TypeError)
    expect(() => createLocalToolClock({ epoch: 'a/b' })).toThrow(TypeError)
  })

  it('G4 the default sources read the process: ISO now, whole-millisecond elapsed, real waits', async () => {
    const clock = createLocalToolClock()
    expect(clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
    const { marker } = unwrap(await clock.begin({ operation, execution }), 'begin')
    await new Promise(resolve => setTimeout(resolve, 20))
    const { milliseconds } = unwrap(await clock.elapsed(marker), 'elapsed')
    expect(milliseconds).toMatch(/^\d+$/u)
    expect(Number(milliseconds)).toBeGreaterThanOrEqual(15)
    expect(
      await clock.waitUntil(new Date(Date.now() - 1).toISOString(), new AbortController().signal),
    ).toBe('elapsed')
    const controller = new AbortController()
    const waiting = clock.waitUntil(new Date(Date.now() + 60_000).toISOString(), controller.signal)
    controller.abort()
    expect(await waiting).toBe('cancelled')
  })
})
