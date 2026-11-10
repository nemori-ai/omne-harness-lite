// The steps of one delivery run after the receiver saved it: a lost release is recalled by its
// operation only when the result record shows it released, a stop while the release is being
// marked or sent sends nothing, a release answer for another delivery or consumer is not taken,
// a run that cannot read a delivery keeps its pacing, and a done delivery is not finished twice.
import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { LedgerCommitInput } from '@omne-harness/tool'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { evidence } from '../coordinator-values.ts'
import { fixture, ok } from './fixture.ts'
import { decodeToolDeliveryId, decodeToolRevision } from '@omne-harness/tool-contract/provider'

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Runs `onWrite` before the store commits a delivery record that enters `phase`. */
function onPhaseWrite(f: Fixture, phase: string, onWrite: () => Promise<unknown> | unknown) {
  const commit = f.store.commit.bind(f.store)
  return vi.spyOn(f.store, 'commit').mockImplementation(async (input: LedgerCommitInput) => {
    const entering = input.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'host' &&
        (write.record.host.value as { phase?: { kind?: string } }).phase?.kind === phase,
    )
    if (entering) {
      const answer = await onWrite()
      if (answer !== undefined) return answer as Awaited<ReturnType<typeof commit>>
    }
    return commit(input)
  })
}

const committed = () =>
  succeed({
    kind: 'committed' as const,
    revision: ok(decodeToolRevision('1')),
    receipt: evidence('release'),
  })

it('recalls a lost release that committed once the result record shows it released', async () => {
  const f = await fixture()
  vi.mocked(f.input.commands.releaseDelivery).mockImplementationOnce(async input => {
    expect(await f.ledger.commands.releaseDelivery(input)).toHaveProperty('ok')
    return fail({ kind: 'commit-unknown', operation: input.operation })
  })
  vi.mocked(f.input.reads.operation).mockImplementation(async input => committed())
  const forwardedCopies = vi.fn(async () => 'released' as const)
  const worker = createLocalToolResultDelivery({ ...f.input, forwardedCopies })
  expect(await f.drive(worker)).toEqual(succeed({ pending: 1 }))
  expect(await f.drive(worker)).toEqual(succeed({ pending: 0 }))
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
  expect(f.input.reads.operation).toHaveBeenCalledTimes(1)
  // Recalled as released, the delivery releases its copies and is done.
  expect(forwardedCopies).toHaveBeenCalledTimes(1)
})

it('does not take a committed release query while the result record is not released', async () => {
  const f = await fixture()
  vi.mocked(f.input.commands.releaseDelivery).mockImplementation(async input =>
    fail({ kind: 'commit-unknown', operation: input.operation }),
  )
  vi.mocked(f.input.reads.operation).mockImplementation(async input => committed())
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
})

it('a worker closed before the release marks nothing: the next worker sends it directly', async () => {
  const f = await fixture()
  const worker = createLocalToolResultDelivery(f.input)
  const recover = vi.mocked(f.input.position.access).getMockImplementation()
  if (recover === undefined) throw new Error('fixture recovers positions')
  let calls = 0
  vi.mocked(f.input.position.access).mockImplementation(async input => {
    calls += 1
    // The run, the push and its recheck, then the release: the worker closes at the release.
    if (calls === 4) void worker.close()
    return recover(input)
  })
  await f.drive(worker)
  expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
  vi.mocked(f.input.position.access).mockImplementation(recover)
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.input.reads.operation).not.toHaveBeenCalled()
})

it('a worker closed while it marks the release unknown does not send it', async () => {
  const f = await fixture()
  const worker = createLocalToolResultDelivery(f.input)
  onPhaseWrite(f, 'release-unknown', () => void worker.close())
  await f.drive(worker)
  expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
})

it('a release whose unknown mark does not land is not sent', async () => {
  const f = await fixture()
  onPhaseWrite(f, 'release-unknown', () => ({ kind: 'unavailable', diagnostic: 'fixture' }))
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
})

it.each(['delivery', 'consumer'] as const)(
  'does not take a release answer for another %s',
  async field => {
    const f = await fixture()
    vi.mocked(f.input.commands.releaseDelivery).mockImplementationOnce(async input => {
      const answer = ok(await f.ledger.commands.releaseDelivery(input))
      return succeed(
        field === 'delivery'
          ? { ...answer, delivery: ok(decodeToolDeliveryId('other-delivery')) }
          : { ...answer, consumer: { ...answer.consumer, owner: 'other-owner' } },
      )
    })
    const forwardedCopies = vi.fn(async () => 'released' as const)
    expect(await f.drive(createLocalToolResultDelivery({ ...f.input, forwardedCopies }))).toEqual(
      succeed({ pending: 1 }),
    )
    expect(forwardedCopies).not.toHaveBeenCalled()
  },
)

it('a run that cannot read a paced delivery keeps its pacing', async () => {
  const f = await fixture()
  vi.mocked(f.input.position.receiver).mockResolvedValue(
    fail({ kind: 'unavailable', dependency: 'fixture-receiver', diagnostic: 'fixture' }),
  )
  const worker = createLocalToolResultDelivery(f.input)
  expect(await f.drive(worker)).toEqual(succeed({ pending: 1 }))
  expect(worker.pacedEntries()).toBe(1)
  const read = f.store.readRecord.bind(f.store)
  vi.spyOn(f.store, 'readRecord').mockImplementation(async (domain, key) =>
    domain.kind === 'host' ? { kind: 'unavailable', diagnostic: 'fixture' } : read(domain, key),
  )
  expect(await f.drive(worker)).toEqual(succeed({ pending: 1 }))
  expect(worker.pacedEntries()).toBe(1)
})

it('a done delivery is not finished again', async () => {
  const f = await fixture()
  const forwardedCopies = vi.fn(async () => 'released' as const)
  const worker = createLocalToolResultDelivery({ ...f.input, forwardedCopies })
  expect(await f.drive(worker)).toEqual(succeed({ pending: 0 }))
  expect(await f.drive(worker)).toEqual(succeed({ pending: 0 }))
  expect(forwardedCopies).toHaveBeenCalledTimes(1)
})

it('a delivery whose done mark does not land is not done', async () => {
  const f = await fixture()
  onPhaseWrite(f, 'done', () => ({ kind: 'unavailable', diagnostic: 'fixture' }))
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
})
