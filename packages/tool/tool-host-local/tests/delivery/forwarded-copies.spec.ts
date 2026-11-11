// C6: the received copies of a forwarding parent go with the parent's own result delivery. The
// worker releases them after the delivery is released and before it is done; a release that does
// not land leaves the delivery short of done, so the next run tries again.
import { expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { fixture } from './fixture.ts'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { callHostDomain } from '../../src/host-domains.ts'

it('releases the forwarded copies once the delivery is released, and only then marks it done', async () => {
  const f = await fixture()
  const phases: string[] = []
  const forwardedCopies = vi.fn(async () => {
    const host = await f.store.read(callHostDomain(f.access.tenant, 'delivery', f.access.call))
    if (host.kind !== 'complete') throw new Error('delivery domain unreadable')
    for (const row of host.records)
      if (row.kind === 'host' && typeof row.host.value === 'object' && row.host.value !== null)
        phases.push(String(Reflect.get(Reflect.get(row.host.value, 'phase') ?? {}, 'kind')))
    return 'released' as const
  })
  expect(await f.drive(createLocalToolResultDelivery({ ...f.input, forwardedCopies }))).toEqual(
    succeed({ pending: 0 }),
  )
  expect(forwardedCopies).toHaveBeenCalledTimes(1)
  expect(forwardedCopies).toHaveBeenCalledWith({
    tenant: f.access.tenant,
    call: f.access.call,
    request: f.call.request,
  })
  // The copies were released while the delivery stood at `released`, before `done`.
  expect(phases).toEqual(['released'])
})

it('a release that does not land keeps the delivery short of done; the next run releases and finishes', async () => {
  const f = await fixture()
  const answers: ('released' | 'unavailable')[] = ['unavailable', 'released']
  const forwardedCopies = vi.fn(async () => answers.shift() ?? ('released' as const))
  const worker = createLocalToolResultDelivery({ ...f.input, forwardedCopies })
  expect(await f.drive(worker)).toEqual(succeed({ pending: 1 }))
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
  expect(await f.drive(worker)).toEqual(succeed({ pending: 0 }))
  // The second run found the delivery released: it released the copies and finished, no second release.
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
  expect(forwardedCopies).toHaveBeenCalledTimes(2)
})
