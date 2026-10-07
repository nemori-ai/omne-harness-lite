import { afterEach, expect, it, vi } from 'vitest'
import { createOriginalIssueOwner } from '@omne-harness-lite/model-request-runtime-local'
import {
  captureModelLogValue,
  prepareModelLogEntry,
  type OriginalIssueInput,
} from '@omne-harness-lite/model-request-runtime'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { boot, scope, tenant } from './original-issue-fixture.ts'
import { dispatched } from './log-codec-fixture.ts'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) await close()
})
async function setup() {
  const h = await boot()
  const borrow = await h.log.owner.borrow(h.access, scope)
  if (borrow.kind !== 'borrowed') throw Error('borrow fixture')
  const owner = createOriginalIssueOwner({
    storage: h.storage,
    log: h.log.participant,
    access: h.access,
    limit: 8,
    authority: {
      async authorizeIn(unit, identity) {
        const checked = await h.authority.authorize(unit, h.access, identity, 'write')
        return checked.kind === 'authorized' ? { kind: 'authorized' } : { kind: checked.kind }
      },
    },
  })
  cleanup.push(async () => {
    expect(await owner.close()).toEqual({ kind: 'released' })
    await borrow.release()
    await h.close()
  })
  const source = await h.log.participant.source(h.access, scope)
  if ('failure' in source) throw Error('source fixture')
  const captured = captureModelLogValue({
    category: 'record',
    input: { kind: 'value', value: dispatched },
  })
  if ('invalidValue' in captured) throw Error('dispatch fixture')
  const entry = prepareModelLogEntry({
    session: scope.session,
    shell: { tenant },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in entry) throw Error('entry fixture')
  const input: OriginalIssueInput = {
    source: source.source,
    originalPosition: 'original-call-position',
    entry: entry.ok,
  }
  return { h, owner, input }
}
it('the model claim and dispatched fact roll back together and no launch can precede outer commit', async () => {
  const { h, owner, input } = await setup()
  const ticket = owner.prepareOriginal(input)
  if (!('ticket' in ticket)) throw Error('ticket')
  let claim: import('@omne-harness-lite/model-request-runtime').OriginalIssueClaim | undefined
  await expect(
    h.storage.atomic(async unit => {
      const staged = await owner.participant.stageOriginalIn(unit, ticket.ticket)
      if (staged.kind !== 'staged') throw Error('not staged')
      claim = staged.claim
      throw Error('later participant failure')
    }),
  ).rejects.toThrow('later participant failure')
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 0)
  expect(
    await h.storage.read(tx => tx.db.selectFrom('mr_original_issue').selectAll().execute()),
  ).toEqual([])
  expect(await owner.consumeOriginal(claim!)).toEqual({ kind: 'unavailable' })
})
it('one real committed claim grants one local consumption; repeats never grant another launch', async () => {
  const { h, owner, input } = await setup()
  const admitted = await owner.admitOriginal(input)
  if (!('confirmed' in admitted)) throw Error('not confirmed')
  const consumption = await Promise.all([
    owner.consumeOriginal(admitted.claim),
    owner.consumeOriginal(admitted.claim),
  ])
  expect(consumption.filter(value => value.kind === 'launch')).toHaveLength(1)
  expect(consumption.filter(value => value.kind === 'unavailable')).toHaveLength(1)
  const ticket = owner.prepareOriginal(input)
  if (!('ticket' in ticket)) throw Error('ticket')
  const repeat = await h.storage.atomic(unit =>
    owner.participant.stageOriginalIn(unit, ticket.ticket),
  )
  expect(repeat).toHaveProperty('kind', 'alreadyIssued')
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})
it('a copied ticket and replaced journal generation cannot authorize a claim', async () => {
  const { h, owner, input } = await setup()
  expect(
    await h.storage.atomic(unit => owner.participant.stageOriginalIn(unit, {} as never)),
  ).toEqual({ kind: 'invalidInput' })
  expect(
    await owner.admitOriginal({
      ...input,
      source: { ...input.source, journalGeneration: 'replaced-generation' },
    }),
  ).toEqual({ kind: 'unavailable' })
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 0)
})
it('lost acknowledgment does not grant launch and close needs both the exact claim and original log batch', async () => {
  const { h, owner, input } = await setup()
  const write = h.storage.write.bind(h.storage)
  const lost = vi.spyOn(h.storage, 'write').mockImplementation(async callback => {
    await write(callback)
    throw new StorageUnavailable('lost acknowledgment')
  })
  expect(await owner.admitOriginal(input)).toEqual({ kind: 'unavailable' })
  lost.mockRestore()
  const hidden = vi
    .spyOn(h.storage, 'read')
    .mockRejectedValue(new StorageUnavailable('cannot recognize'))
  expect(await owner.close()).toEqual({ kind: 'pending' })
  hidden.mockRestore()
  expect(await owner.close()).toEqual({ kind: 'released' })
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})
it('consumption stays pending while the actual outer transaction is uncommitted', async () => {
  const { h, owner, input } = await setup()
  const ticket = owner.prepareOriginal(input)
  if (!('ticket' in ticket)) throw Error('ticket')
  const staged =
    Promise.withResolvers<import('@omne-harness-lite/model-request-runtime').OriginalIssueClaim>()
  const proceed = Promise.withResolvers<void>()
  const transaction = h.storage.atomic(async unit => {
    const result = await owner.participant.stageOriginalIn(unit, ticket.ticket)
    if (result.kind !== 'staged') throw Error('staging failed')
    staged.resolve(result.claim)
    await proceed.promise
  })
  void transaction.catch(staged.reject)
  const claim = await staged.promise
  let ended = false
  const consumption = owner.consumeOriginal(claim).then(result => {
    ended = true
    return result
  })
  await Promise.resolve()
  expect(ended).toBe(false)
  proceed.resolve()
  await transaction
  expect(await consumption).toEqual({ kind: 'launch' })
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})
