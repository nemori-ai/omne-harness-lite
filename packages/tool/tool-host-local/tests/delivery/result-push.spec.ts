import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { fixture, ok } from './fixture.ts'
import { canonicalDigest, encodeToolCanonical } from '@omne-harness/tool'
import { createDeliveryState } from '../../src/delivery-state.ts'
import { callHostDomain } from '../../src/host-domains.ts'

it('freezes before push and releases through the real ledger without recordTask', async () => {
  const f = await fixture()
  vi.mocked(f.receiver.push).mockImplementationOnce(async input => {
    const host = await f.store.read(callHostDomain(f.access.tenant, 'delivery', f.access.call))
    expect(host.kind === 'complete' && host.records.some(row => row.kind === 'host')).toBe(true)
    return f.receive(input)
  })
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.input.commands.releaseDelivery).toHaveBeenCalledWith(
    expect.objectContaining({
      result: f.result.result,
      consumer: f.call.request.consumer,
      evidence: {
        kind: 'retained',
        custody: expect.objectContaining({ owner: f.call.request.consumer.owner }),
      },
    }),
  )
  expect(f.input.commands.recordTask).not.toHaveBeenCalled()
  expect(f.pushes[0]).toMatchObject({
    consumer: f.call.request.consumer,
    delivery: f.result.delivery.delivery,
    relation: f.result.relation,
    terminal: f.result.terminal,
    actualTerminal: f.result.actual,
    source: f.result.source,
    value: f.value,
    account: null,
  })
  const saved = await f.store.read(f.domain)
  expect(
    saved.kind === 'complete' &&
      saved.records.some(row => row.kind === 'task' && row.task.kind === 'deliver'),
  ).toBe(false)
  expect(saved.kind === 'complete' && saved.records.some(row => row.kind === 'result')).toBe(true)
})

it.each(['backpressured', 'missing', 'throw'] as const)(
  'retains responsibility after receiver %s',
  async failure => {
    const f = await fixture()
    if (failure === 'missing')
      vi.mocked(f.input.position.receiver).mockImplementation(async () =>
        fail({ kind: 'unavailable', dependency: 'receiver', diagnostic: 'SECRET' }),
      )
    else
      vi.mocked(f.receiver.push).mockImplementation(async () => {
        if (failure === 'throw') throw new Error('SECRET')
        return fail({ kind: 'backpressured', resource: 'records' })
      })
    const answer = await f.drive()
    expect(JSON.stringify(answer)).not.toContain('SECRET')
    expect(f.input.position.receiver).toHaveBeenCalledTimes(1)
    if (failure !== 'missing') expect(f.receiver.push).toHaveBeenCalledTimes(1)
    expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
    expect(f.input.commands.recordTask).not.toHaveBeenCalled()
    const snapshot = await f.store.read(f.domain)
    expect(
      snapshot.kind === 'complete' &&
        snapshot.records.some(row => row.kind === 'task' && row.task.kind === 'deliver'),
    ).toBe(true)
  },
)

it('retries identical frozen payload after an unknown push without rereading account', async () => {
  const f = await fixture()
  vi.mocked(f.receiver.push).mockImplementationOnce(async ({ delivery }) => {
    f.pushes.push(structuredClone(delivery))
    return fail({ kind: 'outcome-unknown' })
  })
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.input.commands.recordTask).not.toHaveBeenCalled()
  vi.mocked(f.input.accountAtFreeze).mockImplementation(async () =>
    fail({ kind: 'unavailable', dependency: 'account', diagnostic: 'changed' }),
  )
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.pushes[1]).toEqual(f.pushes[0])
  expect(f.input.accountAtFreeze).toHaveBeenCalledTimes(1)
})

it('rejects a same-key payload change without replacing the original freeze', async () => {
  const f = await fixture()
  vi.mocked(f.receiver.push).mockImplementationOnce(async ({ delivery }) => {
    f.pushes.push(structuredClone(delivery))
    return fail({ kind: 'outcome-unknown' })
  })
  await f.drive()
  const payload = f.pushes[0]
  if (payload?.kind !== 'result') throw new Error('expected result payload')
  const state = createDeliveryState(f.store)
  const descriptor = {
    ...payload,
    value: {
      fingerprint: ok(encodeToolCanonical(payload.value)).fingerprint,
      original: { kind: 'none' as const },
    },
  }
  const original = ok(await state.load(f.access, descriptor))
  if (original === null) throw new Error('expected frozen record')
  const changed = {
    ...descriptor,
    account: {
      subject: { kind: 'tool_execution', id: f.access.call },
      usage: [],
      cost: [],
      trimmed: { state: 'unknown', unit: 'tokens' },
      place: 'test',
      duration: { state: 'unknown' },
      receipt: 'late',
      revision: '1',
    },
  } as const
  expect(
    await state.save(
      f.access,
      { ...original, payload: changed, digest: canonicalDigest(changed) },
      null,
    ),
  ).toHaveProperty('failure.kind', 'conflict')
  expect(await state.load(f.access, descriptor)).toEqual(succeed(original))
})

it.each(['version', 'owner', 'account', 'evidence'] as const)(
  'keeps custody for a mismatched saved %s',
  async fault => {
    const f = await fixture()
    vi.mocked(f.receiver.push).mockImplementation(async ({ delivery }) => {
      if (delivery.kind !== 'result') throw new Error('result expected')
      const key =
        fault === 'version'
          ? { ...delivery.key, result: ok(decodeToolResultVersion('different')) }
          : fault === 'account'
            ? ({
                kind: 'account',
                producer: 'tool',
                reference: delivery.key.reference,
                event: 'account',
                revision: '1',
              } as const)
            : delivery.key
      return succeed({
        key,
        evidence: {
          owner: fault === 'owner' ? 'wrong' : delivery.consumer.owner,
          record: fault === 'evidence' ? '' : 'saved',
          revision: '1',
          digest: 'saved',
        },
      })
    })
    expect(await f.drive()).toEqual(succeed({ pending: 1 }))
    expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
  },
)

it('freezes delivery metadata without storing another complete result', async () => {
  const f = await fixture()
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.pushes[0]).toMatchObject({ value: f.value })
  const stored = await f.store.read(callHostDomain(f.access.tenant, 'delivery', f.access.call))
  expect(stored.kind).toBe('complete')
  expect(JSON.stringify(stored)).not.toContain('unchanged payload')
})

it('keeps a frozen delivery owed while its result materials are unavailable', async () => {
  const f = await fixture()
  vi.mocked(f.input.resultDelivery.read).mockResolvedValueOnce(
    fail({ kind: 'unavailable', dependency: 'materials', diagnostic: 'offline' }),
  )
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.receiver.push).not.toHaveBeenCalled()
  expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
  expect(await f.drive()).toEqual(succeed({ pending: 0 }))
  expect(f.pushes[0]).toMatchObject({ value: f.value })
  expect(f.input.accountAtFreeze).toHaveBeenCalledTimes(1)
})

it('rechecks current qualification after restoring a delivery value', async () => {
  const f = await fixture()
  vi.mocked(f.input.resultDelivery.read).mockImplementationOnce(async input => {
    const value = await f.ledger.delivery.read(input)
    f.revoke()
    return value
  })
  expect(await f.drive()).toEqual(succeed({ pending: 1 }))
  expect(f.receiver.push).not.toHaveBeenCalled()
  expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
})
