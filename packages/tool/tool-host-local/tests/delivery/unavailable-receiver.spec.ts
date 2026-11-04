// The receiver is registered but answers `unavailable` to the push (R2-D282; the measured case is
// a journal commit the storage refuses, pushed 714 times). The delivery stays owed, each push that
// fails writes one named warning, and the next push waits a backoff that doubles up to its cap. A
// receiver that answers without `unavailable` clears the backoff. The worker runs on the memory
// ledger and a scripted receiver; the clock of the pacing is a test reading.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it, vi } from 'vitest'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { fixture, ok } from './fixture.ts'

type Mode = 'unavailable' | 'denied' | 'saved'

async function scripted() {
  const f = await fixture()
  let now = 0
  let mode: Mode = 'unavailable'
  const warnings: string[] = []
  const push = vi.fn(async (args: Parameters<typeof f.receiver.push>[0]) =>
    mode === 'unavailable'
      ? fail({
          kind: 'unavailable',
          dependency: 'agent-journal',
          diagnostic: 'storage rejected the commit: command_limit',
        } as const)
      : mode === 'denied'
        ? fail({ kind: 'denied', action: 'recover' } as const)
        : f.receive(args),
  )
  const worker = createLocalToolResultDelivery({
    ...f.input,
    position: { ...f.input.position, receiver: async () => succeed({ push }) },
    pacing: { initialMs: 1000, maxMs: 3000 },
    warn: message => warnings.push(message),
    now: () => now,
  })
  return {
    f,
    push,
    warnings,
    worker,
    drive: () => f.drive(worker),
    at: (value: number) => {
      now = value
    },
    answer: (next: Mode) => {
      mode = next
    },
  }
}

describe('a delivery whose receiver answers unavailable to the push', () => {
  it('stays owed, warns by name per push, and pushes again only after a doubling backoff', async () => {
    const t = await scripted()

    expect(ok(await t.drive())).toEqual({ pending: 1 })
    expect(t.push).toHaveBeenCalledTimes(1)
    expect(t.warnings).toHaveLength(1)
    expect(t.warnings[0]).toContain('original-call')
    expect(t.warnings[0]).toContain('agent-journal: storage rejected the commit: command_limit')
    expect(t.warnings[0]).toContain('stays owed')
    expect(t.warnings[0]).toContain('in 1000 ms')

    // Inside the wait the worker does not push again and writes nothing: the hot loop is gone.
    for (let i = 0; i < 20; i += 1) expect(ok(await t.drive())).toEqual({ pending: 1 })
    expect(t.push).toHaveBeenCalledTimes(1)
    expect(t.warnings).toHaveLength(1)

    t.at(999)
    await t.drive()
    expect(t.push).toHaveBeenCalledTimes(1)
    t.at(1000)
    await t.drive()
    expect(t.push).toHaveBeenCalledTimes(2)
    expect(t.warnings[1]).toContain('in 2000 ms')
    t.at(3000)
    await t.drive()
    expect(t.warnings[2]).toContain('in 3000 ms')
    t.at(6000)
    await t.drive()
    // The cap holds.
    expect(t.warnings[3]).toContain('in 3000 ms')
    expect(t.push).toHaveBeenCalledTimes(4)
    expect(t.f.pushes).toHaveLength(0)

    // A receiver that recovers takes the delivery once the wait is over.
    t.answer('saved')
    t.at(9000)
    expect(ok(await t.drive())).toEqual({ pending: 0 })
    expect(t.f.pushes).toHaveLength(1)
    expect(t.warnings).toHaveLength(4)
  })

  it('starts again at the first wait after the receiver answered without unavailable', async () => {
    const t = await scripted()
    await t.drive()
    t.at(1000)
    await t.drive()
    expect(t.warnings[1]).toContain('in 2000 ms')

    // The receiver answers, not with unavailable: the backoff is cleared, the delivery stays owed.
    t.answer('denied')
    t.at(3000)
    expect(ok(await t.drive())).toEqual({ pending: 1 })
    expect(t.warnings).toHaveLength(2)
    // Cleared: the next push is not paced away.
    t.answer('unavailable')
    expect(ok(await t.drive())).toEqual({ pending: 1 })
    expect(t.push).toHaveBeenCalledTimes(4)
    expect(t.warnings[2]).toContain('in 1000 ms')
  })
})
