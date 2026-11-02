import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { fixture } from './fixture.ts'
import { tenantB } from '../coordinator-values.ts'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { ok } from './fixture.ts'

it('recalls the original release after its committed reply was lost', async () => {
  const f = await fixture()
  vi.mocked(f.input.commands.releaseDelivery).mockImplementationOnce(async input => {
    const answer = await f.ledger.commands.releaseDelivery(input)
    expect(answer).toHaveProperty('ok')
    return fail({ kind: 'commit-unknown', operation: input.operation })
  })
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.input.identities.newOperation).toHaveBeenCalledTimes(3)
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
  expect(f.input.reads.operation).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'worker-2' }),
  )
})

it('does not push an uncertain freeze until its original record is readable', async () => {
  const f = await fixture()
  f.store.injectCommit('unknown-delayed')
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.receiver.push).not.toHaveBeenCalled()
  await f.store.landDelayed()
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.input.identities.newOperation).toHaveBeenCalledTimes(3)
})

it('retries the same release operation only after a reliable negative query', async () => {
  const f = await fixture()
  vi.mocked(f.input.commands.releaseDelivery).mockImplementationOnce(async input =>
    fail({ kind: 'commit-unknown', operation: input.operation }),
  )
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.input.reads.operation).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'worker-2' }),
  )
  expect(
    vi.mocked(f.input.commands.releaseDelivery).mock.calls.map(([input]) => input.operation),
  ).toEqual(['worker-2', 'worker-2'])
  expect(f.input.identities.newOperation).toHaveBeenCalledTimes(3)
})

it.each(['denied', 'unknown'] as const)(
  'keeps an unknown release when its query is %s',
  async kind => {
    const f = await fixture()
    vi.mocked(f.input.commands.releaseDelivery).mockImplementation(async input =>
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
    await f.drive()
    vi.mocked(f.input.reads.operation).mockImplementation(async () =>
      kind === 'denied'
        ? fail({ kind: 'denied', action: 'query-operation' })
        : succeed({ kind: 'unknown' }),
    )
    expect(await f.drive()).toEqual(succeed({ pending: 1 }))
    expect(f.input.commands.releaseDelivery).toHaveBeenCalledTimes(1)
    expect(f.input.identities.newOperation).toHaveBeenCalledTimes(3)
  },
)

it('revocation prevents release after a receiver saved the payload', async () => {
  const f = await fixture()
  vi.mocked(f.receiver.push).mockImplementation(async ({ delivery }) => {
    f.revoke()
    return succeed({
      key: delivery.key,
      evidence: { owner: delivery.consumer.owner, record: 'saved', revision: '1', digest: 'saved' },
    })
  })
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
})

it('close ends a hung push wait and preserves its durable task', async () => {
  const f = await fixture()
  let started: () => void = () => undefined
  const ready = new Promise<void>(resolve => {
    started = resolve
  })
  vi.mocked(f.receiver.push).mockImplementation(() => {
    started()
    return new Promise(() => undefined)
  })
  const worker = createLocalToolResultDelivery(f.input)
  const running = f.drive(worker)
  await ready
  await worker.close()
  expect(await running).toHaveProperty('failure.kind', 'unavailable')
  expect(f.input.commands.recordTask).not.toHaveBeenCalled()
  expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
})

it('shares one drive for one call while refusing a caller revoked during that flight', async () => {
  const f = await fixture()
  let started: () => void = () => undefined
  const ready = new Promise<void>(resolve => {
    started = resolve
  })
  vi.mocked(f.receiver.push).mockImplementation(() => {
    started()
    return new Promise(() => undefined)
  })
  const worker = createLocalToolResultDelivery(f.input)
  const first = f.drive(worker)
  await ready
  const second = f.drive(worker)
  await Promise.resolve()
  expect(f.receiver.push).toHaveBeenCalledTimes(1)
  f.revoke()
  expect(await f.drive(worker)).toHaveProperty('failure.kind', 'denied')
  await worker.close()
  await Promise.all([first, second])
})

it('lets another tenant finish while the first receiver remains unknown', async () => {
  const f = await fixture()
  const other = { ...f.access, tenant: tenantB }
  await f.store.commit({
    domain: { ...f.domain, tenant: tenantB },
    expected: ok(decodeToolRevision('0')),
    revision: ok(decodeToolRevision('1')),
    writes: [
      { kind: 'put', record: { kind: 'call', call: { ...f.call, tenant: tenantB } } },
      { kind: 'put', record: { kind: 'result', result: { ...f.result, tenant: tenantB } } },
      { kind: 'put', record: { kind: 'task', task: f.task } },
    ],
  })
  vi.mocked(f.input.position.access).mockImplementation(async ({ tenant }) =>
    succeed({ ...f.access, tenant }),
  )
  let started: () => void = () => undefined
  const ready = new Promise<void>(resolve => {
    started = resolve
  })
  vi.mocked(f.receiver.push).mockImplementation(input => {
    if (input.access.tenant === f.access.tenant) {
      started()
      return new Promise(() => undefined)
    }
    return f.receive(input)
  })
  const worker = createLocalToolResultDelivery(f.input)
  const first = f.drive(worker)
  await ready
  expect(await worker.drive({ ...other, signal: new AbortController().signal })).toEqual(
    succeed({ pending: 0 }),
  )
  await worker.close()
  await first
})

it('refuses a recovered position of another tenant before sending', async () => {
  const f = await fixture()
  vi.mocked(f.input.position.access).mockImplementation(async () =>
    succeed({ ...f.access, tenant: tenantB }),
  )
  expect(await f.drive()).toHaveProperty('failure.kind', 'denied')
  expect(f.receiver.push).not.toHaveBeenCalled()
})

it('does not expose a failed original-position recovery diagnostic', async () => {
  const f = await fixture()
  vi.mocked(f.input.position.access).mockImplementation(async () =>
    fail({ kind: 'unavailable', dependency: 'SECRET endpoint', diagnostic: 'SECRET credential' }),
  )
  const answer = await f.drive()
  expect(answer).toHaveProperty('failure.kind', 'unavailable')
  expect(JSON.stringify(answer)).not.toContain('SECRET')
  expect(f.receiver.push).not.toHaveBeenCalled()
})
