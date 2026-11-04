// No receiver is registered for the frozen consumer owner (R2-D273): the delivery stays owed, each
// look that finds none, or an unavailable one, writes one named warning, and the next look waits a backoff that doubles up
// to its cap. The worker runs on the memory ledger and a scripted position; the clock of the pacing
// is a test reading. Nothing here proves the Cordis registration; tool-cordis-contract tests it.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it, vi } from 'vitest'
import { ABSENT_RECEIVER, createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { fixture, ok } from './fixture.ts'

const absent = () =>
  fail({
    kind: 'unavailable',
    dependency: ABSENT_RECEIVER,
    diagnostic: 'The original consumer is absent.',
  } as const)

describe('a delivery whose consumer owner has no registered receiver', () => {
  it('stays owed, warns by name once per look, and looks again only after a doubling backoff', async () => {
    const f = await fixture()
    let now = 0
    const warnings: string[] = []
    let registered = false
    const lookup = vi.fn(async () => (registered ? succeed(f.receiver) : absent()))
    const worker = createLocalToolResultDelivery({
      ...f.input,
      position: { ...f.input.position, receiver: lookup },
      pacing: { initialMs: 1000, maxMs: 3000 },
      warn: message => warnings.push(message),
      now: () => now,
    })
    const drive = () => f.drive(worker)

    expect(ok(await drive())).toEqual({ pending: 1 })
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(ABSENT_RECEIVER)
    expect(warnings[0]).toContain('stays owed')
    expect(warnings[0]).toContain('in 1000 ms')

    // Inside the wait the worker does not look again and writes nothing.
    for (let i = 0; i < 5; i += 1) expect(ok(await drive())).toEqual({ pending: 1 })
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(warnings).toHaveLength(1)

    now = 1000
    expect(ok(await drive())).toEqual({ pending: 1 })
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(warnings[1]).toContain('in 2000 ms')
    now = 3000
    await drive()
    expect(warnings[2]).toContain('in 3000 ms')
    now = 6000
    await drive()
    // The cap holds.
    expect(warnings[3]).toContain('in 3000 ms')
    expect(f.pushes).toHaveLength(0)

    // Once a receiver is there and the wait is over, the delivery goes and no warning follows.
    registered = true
    now = 9000
    expect(ok(await drive())).toEqual({ pending: 0 })
    expect(f.pushes).toHaveLength(1)
    expect(warnings).toHaveLength(4)
  })

  it('paces any other unavailable answer of the lookup the same way', async () => {
    const f = await fixture()
    let now = 0
    const warnings: string[] = []
    const lookup = vi.fn(async () =>
      fail({ kind: 'unavailable', dependency: 'toolRuntime', diagnostic: 'retired' } as const),
    )
    const worker = createLocalToolResultDelivery({
      ...f.input,
      position: { ...f.input.position, receiver: lookup },
      warn: message => warnings.push(message),
      now: () => now,
    })
    await f.drive(worker)
    await f.drive(worker)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('toolRuntime: retired')
    now = 1000
    await f.drive(worker)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(warnings[1]).toContain('in 2000 ms')
  })

  it('does not pace a denied lookup', async () => {
    const f = await fixture()
    const warnings: string[] = []
    const lookup = vi.fn(async () => fail({ kind: 'denied', action: 'recover' } as const))
    const worker = createLocalToolResultDelivery({
      ...f.input,
      position: { ...f.input.position, receiver: lookup },
      warn: message => warnings.push(message),
      now: () => 0,
    })
    await f.drive(worker)
    await f.drive(worker)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(warnings).toEqual([])
  })

  it('refuses a pacing whose cap is below its first wait', async () => {
    const f = await fixture()
    expect(() =>
      createLocalToolResultDelivery({ ...f.input, pacing: { initialMs: 10, maxMs: 5 } }),
    ).toThrow(TypeError)
  })
})
