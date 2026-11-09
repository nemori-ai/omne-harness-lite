import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { fixture } from './fixture.ts'

it('delivers and recovers a lost release reply without any complete read of a delivery domain', async () => {
  const f = await fixture()
  const read = f.store.read.bind(f.store)
  vi.spyOn(f.store, 'read').mockImplementation(async domain =>
    domain.kind === 'host' && domain.key.startsWith('delivery@')
      ? { kind: 'unavailable', diagnostic: 'complete delivery domain reads are not used' }
      : read(domain),
  )
  vi.mocked(f.input.commands.releaseDelivery).mockImplementationOnce(async input => {
    expect(await f.ledger.commands.releaseDelivery(input)).toHaveProperty('ok')
    return fail({ kind: 'commit-unknown', operation: input.operation })
  })

  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.receiver.push).toHaveBeenCalledTimes(1)
  expect(f.pushes[0]).toMatchObject({ value: f.value })
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.receiver.push).toHaveBeenCalledTimes(1)
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
})

it.each([
  [1, 'unavailable'],
  [2, 'unavailable'],
  [1, 'wrong-record'],
  [2, 'wrong-record'],
] as const)(
  'retains responsibility when delivery read %s returns %s',
  async (failedRead, failure) => {
    const f = await fixture()
    const readRecord = f.store.readRecord.bind(f.store)
    let deliveryReads = 0
    const fault = vi.spyOn(f.store, 'readRecord').mockImplementation(async (domain, key) => {
      const read = await readRecord(domain, key)
      if (
        domain.kind !== 'host' ||
        !domain.key.startsWith('delivery@') ||
        ++deliveryReads !== failedRead ||
        read.kind !== 'complete'
      )
        return read
      return failure === 'unavailable'
        ? { kind: 'unavailable', diagnostic: 'delivery record unavailable' }
        : { ...read, record: { kind: 'call', call: f.call } }
    })

    expect(await f.drive()).toEqual(succeed({ pending: 1 }))
    expect(f.receiver.push).not.toHaveBeenCalled()
    expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
    fault.mockRestore()
    expect(await f.drive()).toEqual(succeed({ pending: 0 }))
    expect(f.receiver.push).toHaveBeenCalledTimes(1)
  },
)
