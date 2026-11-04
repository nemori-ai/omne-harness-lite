// The receiver fails definitively (R2-D327), and the pacing table follows the delivery.
//
// O1: a receiver that answers denied or invalid, or that throws, leaves the delivery owed, writes
//     one named warning with the tenant, the call, the delivery and the reason, and does not back
//     off. An exception does not stop the other deliveries of the run.
// O2: an entry of the pacing table lives as long as its delivery is owed. It goes when the
//     delivery is saved, no longer owed, revoked, or let go by the executor.
// The worker runs on the memory ledger and a scripted receiver; the clock is a test reading.
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, it, vi } from 'vitest'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { fixture, ok } from './fixture.ts'

type Mode = 'unavailable' | 'denied' | 'invalid' | 'throws' | 'saved'

async function scripted(initial: Mode) {
  const f = await fixture()
  let now = 0
  let mode: Mode = initial
  let positionDenied = false
  const warnings: string[] = []
  const push = vi.fn(async (args: Parameters<typeof f.receiver.push>[0]) => {
    if (mode === 'throws') throw new Error('receiver exploded: code 7')
    if (mode === 'unavailable')
      return fail({
        kind: 'unavailable',
        dependency: 'agent-journal',
        diagnostic: 'refused',
      } as const)
    if (mode === 'denied') return fail({ kind: 'denied', action: 'recover' } as const)
    if (mode === 'invalid')
      return fail({ kind: 'invalid', field: 'delivery', reason: 'too-large' } as never)
    return f.receive(args)
  })
  const worker = createLocalToolResultDelivery({
    ...f.input,
    position: {
      access: async () =>
        positionDenied ? fail({ kind: 'denied', action: 'recover' } as const) : succeed(f.access),
      receiver: async () => succeed({ push }),
    },
    pacing: { initialMs: 1000, maxMs: 8000 },
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
    denyPosition: () => {
      positionDenied = true
    },
  }
}

describe('a receiver that fails definitively (O1)', () => {
  it.each<[Mode, string]>([
    ['denied', 'denied (action recover)'],
    ['invalid', 'invalid (field delivery, reason too-large)'],
    ['throws', 'Error: receiver exploded: code 7'],
  ])(
    '%s: warns once per push with tenant, call, delivery and reason, and stays owed',
    async (mode, reason) => {
      const t = await scripted(mode)

      expect(ok(await t.drive())).toEqual({ pending: 1 })
      expect(t.warnings).toHaveLength(1)
      const [warning] = t.warnings as [string]
      expect(warning).toContain('original-call')
      expect(warning).toContain('delivery-1')
      expect(warning).toContain('tenant')
      expect(warning).toContain('stays owed')
      expect(warning).toContain(reason)

      // A definite failure is not paced: the next drive pushes again at once, and warns again.
      expect(ok(await t.drive())).toEqual({ pending: 1 })
      expect(t.push).toHaveBeenCalledTimes(2)
      expect(t.warnings).toHaveLength(2)
      expect(t.worker.pacedEntries()).toBe(0)

      // The delivery was not lost: a receiver that recovers takes it.
      t.answer('saved')
      expect(ok(await t.drive())).toEqual({ pending: 0 })
      expect(t.f.pushes).toHaveLength(1)
      expect(t.warnings).toHaveLength(2)
    },
  )

  it('an exception of the lookup is a definite failure too', async () => {
    const f = await fixture()
    const warnings: string[] = []
    const worker = createLocalToolResultDelivery({
      ...f.input,
      position: {
        ...f.input.position,
        receiver: async () => {
          throw new Error('registry broke')
        },
      },
      warn: message => warnings.push(message),
    })
    expect(ok(await f.drive(worker))).toEqual({ pending: 1 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('the lookup threw Error: registry broke')
  })

  it('a failure that clears the backoff leaves the first wait for the next unavailable answer', async () => {
    const t = await scripted('unavailable')
    await t.drive()
    t.at(1000)
    await t.drive()
    expect(t.worker.pacedEntries()).toBe(1)
    t.answer('throws')
    t.at(3000)
    await t.drive()
    expect(t.worker.pacedEntries()).toBe(0)
    t.answer('unavailable')
    await t.drive()
    expect(t.warnings.at(-1)).toContain('in 1000 ms')
  })

  it('a warning that cannot be written does not change the delivery', async () => {
    const t = await scripted('throws')
    const worker = createLocalToolResultDelivery({
      ...t.f.input,
      position: { ...t.f.input.position, receiver: async () => succeed({ push: t.push }) },
      warn: () => {
        throw new Error('log is closed')
      },
    })
    expect(ok(await t.f.drive(worker))).toEqual({ pending: 1 })
  })
})

describe('the pacing table follows the delivery (O2)', () => {
  it('holds an entry only while the delivery is owed: saved releases it', async () => {
    const t = await scripted('unavailable')
    await t.drive()
    expect(t.worker.pacedEntries()).toBe(1)
    t.answer('saved')
    t.at(1000)
    expect(ok(await t.drive())).toEqual({ pending: 0 })
    expect(t.worker.pacedEntries()).toBe(0)
  })

  it('releases the entry when the call is revoked', async () => {
    const t = await scripted('unavailable')
    await t.drive()
    expect(t.worker.pacedEntries()).toBe(1)

    t.f.revoke()
    const refused = await t.drive()
    expect('failure' in refused && refused.failure.kind).toBe('denied')
    expect(t.worker.pacedEntries()).toBe(0)
  })

  it('releases the entry when the revocation is seen inside the run', async () => {
    const t = await scripted('unavailable')
    await t.drive()
    expect(t.worker.pacedEntries()).toBe(1)
    // The gate of `drive` still lets the call in; the position of the run denies it.
    t.denyPosition()
    const refused = await t.drive()
    expect('failure' in refused && refused.failure.kind).toBe('denied')
    expect(t.worker.pacedEntries()).toBe(0)
  })

  it('releases the entry when the delivery is no longer owed', async () => {
    const t = await scripted('unavailable')
    await t.drive()
    expect(t.worker.pacedEntries()).toBe(1)

    // Another worker over the same ledger delivers and releases it meanwhile.
    const other = createLocalToolResultDelivery(t.f.input)
    expect(ok(await t.f.drive(other))).toEqual({ pending: 0 })
    expect(t.f.pushes).toHaveLength(1)

    // The paced worker finds the delivery done: its entry goes although it did not push.
    expect(ok(await t.drive())).toEqual({ pending: 0 })
    expect(t.worker.pacedEntries()).toBe(0)
  })

  it('releases the entry when the executor lets the call go', async () => {
    const t = await scripted('unavailable')
    await t.drive()
    expect(t.worker.pacedEntries()).toBe(1)
    t.worker.release(t.f.access)
    expect(t.worker.pacedEntries()).toBe(0)
  })

  it('empties the table when the worker closes', async () => {
    const t = await scripted('unavailable')
    await t.drive()
    await t.worker.close()
    expect(t.worker.pacedEntries()).toBe(0)
  })
})
