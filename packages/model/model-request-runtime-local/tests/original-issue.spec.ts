import { afterEach, expect, it, vi } from 'vitest'
import { createOriginalIssueOwner } from '@omne-harness-lite/model-request-runtime-local'
import {
  captureModelLogValue,
  prepareModelLogEntry,
  type OriginalIssueInput,
  type ModelExecutionRecords,
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
  const log = { ...h.log.participant }
  const owner = createOriginalIssueOwner({
    storage: h.storage,
    log: {
      appendIn: (...args) => log.appendIn(...args),
      readByKeyIn: (...args) => log.readByKeyIn(...args),
    },
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
  return { h, owner, input, log }
}
it('issues one model execution job recognized by the records participant in the caller Unit', async () => {
  const { h, owner, input } = await setup()
  const prepared = owner.prepareOriginal(input)
  expect(prepared).toHaveProperty('job')
  if (!('job' in prepared)) throw new Error('model execution job unavailable')
  expect(owner.stageOriginalIn).toBe(owner.participant.stageOriginalIn)
  const records: Pick<ModelExecutionRecords, 'stageOriginalIn'> = owner
  const staged = await h.storage.atomic(unit => records.stageOriginalIn(unit, prepared.job))
  expect(staged).toHaveProperty('kind', 'staged')
  if (staged.kind !== 'staged') throw new Error('original not staged')
  expect(await owner.consumeOriginal(staged.claim)).toEqual({ kind: 'launch' })
  expect(await h.storage.atomic(unit => owner.stageOriginalIn(unit, { ...prepared.job }))).toEqual({
    kind: 'invalidInput',
  })
})

it('rejects jobs from another original owner and units from another storage', async () => {
  const first = await setup()
  const second = await setup()
  const prepared = first.owner.prepareOriginal(first.input)
  if (!('job' in prepared)) throw new Error('model execution job unavailable')
  expect(
    await second.h.storage.atomic(unit => second.owner.stageOriginalIn(unit, prepared.job)),
  ).toEqual({ kind: 'invalidInput' })
  await expect(
    second.h.storage.atomic(unit => first.owner.stageOriginalIn(unit, prepared.job)),
  ).rejects.toThrow('storage unit belongs to a different instance')
  expect(await first.h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 0)
  expect(await second.h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 0)
  expect(await first.owner.close()).toEqual({ kind: 'released' })
  expect(
    await first.h.storage.atomic(unit => first.owner.stageOriginalIn(unit, prepared.job)),
  ).toEqual({ kind: 'unavailable' })
})

it('the model claim and dispatched fact roll back together and no launch can precede outer commit', async () => {
  const { h, owner, input } = await setup()
  const job = owner.prepareOriginal(input)
  if (!('job' in job)) throw Error('job')
  let claim: import('@omne-harness-lite/model-request-runtime').OriginalIssueClaim | undefined
  await expect(
    h.storage.atomic(async unit => {
      const staged = await owner.participant.stageOriginalIn(unit, job.job)
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
  const job = owner.prepareOriginal(input)
  if (!('job' in job)) throw Error('job')
  const repeat = await h.storage.atomic(unit => owner.participant.stageOriginalIn(unit, job.job))
  expect(repeat).toHaveProperty('kind', 'alreadyIssued')
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})

it('stages original consumption in the caller Unit and rolls it back with that Unit', async () => {
  const { h, owner, input } = await setup()
  const job = owner.prepareOriginal(input)
  if (!('job' in job)) throw Error('job')
  await expect(
    h.storage.atomic(async unit => {
      const original = await owner.participant.stageOriginalIn(unit, job.job)
      if (original.kind !== 'staged') throw Error('original not staged')
      expect(await owner.stageConsumeIn(unit, original.claim)).toEqual({
        kind: 'staged',
        identity: original.identity,
      })
      throw new Error('later participant fails')
    }),
  ).rejects.toThrow('later participant fails')
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 0)
})

it('recognizes one committed consumption without issuing a second launch', async () => {
  const { h, owner, input } = await setup()
  const admitted = await owner.admitOriginal(input)
  if (!('confirmed' in admitted)) throw Error('not confirmed')
  const staged = await h.storage.atomic(unit => owner.stageConsumeIn(unit, admitted.claim))
  expect(staged).toHaveProperty('kind', 'staged')
  expect(await h.storage.atomic(unit => owner.stageConsumeIn(unit, admitted.claim))).toEqual({
    ...staged,
    kind: 'alreadyConsumed',
  })
  expect(await owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'unavailable' })
})

it('allows the same original claim after a consumption Unit rolls back', async () => {
  const { h, owner, input } = await setup()
  const admitted = await owner.admitOriginal(input)
  if (!('confirmed' in admitted)) throw Error('not confirmed')
  await expect(
    h.storage.atomic(async unit => {
      expect(await owner.stageConsumeIn(unit, admitted.claim)).toHaveProperty('kind', 'staged')
      throw new Error('consumption rollback')
    }),
  ).rejects.toThrow('consumption rollback')
  expect(await owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
})

it('does not return launch when the consumption commit reply is lost', async () => {
  const { h, owner, input } = await setup()
  const admitted = await owner.admitOriginal(input)
  if (!('confirmed' in admitted)) throw Error('not confirmed')
  const write = h.storage.write.bind(h.storage)
  const lost = vi.spyOn(h.storage, 'write').mockImplementation(async callback => {
    await write(callback)
    throw new StorageUnavailable('lost consumption commit')
  })
  expect(await owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'unavailable' })
  lost.mockRestore()
  expect(await h.storage.atomic(unit => owner.stageConsumeIn(unit, admitted.claim))).toHaveProperty(
    'kind',
    'alreadyConsumed',
  )
  expect(await owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'unavailable' })
})

it('serializes concurrent consumption of one original claim in the actual database', async () => {
  const { h, owner, input } = await setup()
  const admitted = await owner.admitOriginal(input)
  if (!('confirmed' in admitted)) throw Error('not confirmed')
  const results = await Promise.all([
    h.storage.atomic(unit => owner.stageConsumeIn(unit, admitted.claim)),
    h.storage.atomic(unit => owner.stageConsumeIn(unit, admitted.claim)),
  ])
  expect(results.map(result => result.kind).sort()).toEqual(['alreadyConsumed', 'staged'])
  expect(await owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'unavailable' })
})

it('rejects copied claims and another storage Unit without consuming the original', async () => {
  const { h, owner, input } = await setup()
  const other = await boot()
  cleanup.push(() => other.close())
  const admitted = await owner.admitOriginal(input)
  if (!('confirmed' in admitted)) throw Error('not confirmed')
  expect(await h.storage.atomic(unit => owner.stageConsumeIn(unit, { ...admitted.claim }))).toEqual(
    {
      kind: 'invalidInput',
    },
  )
  await expect(
    other.storage.atomic(unit => owner.stageConsumeIn(unit, admitted.claim)),
  ).rejects.toThrow('storage unit belongs to a different instance')
  expect(await owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
})

it('rechecks current authority before staging consumption and leaves denial retryable', async () => {
  const { h, owner, input } = await setup()
  const admitted = await owner.admitOriginal(input)
  if (!('confirmed' in admitted)) throw Error('not confirmed')
  const denied = vi.spyOn(h.authority, 'authorize').mockResolvedValue({ kind: 'denied' })
  expect(await h.storage.atomic(unit => owner.stageConsumeIn(unit, admitted.claim))).toEqual({
    kind: 'denied',
  })
  denied.mockRestore()
  expect(await owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
})
it('a copied job and replaced journal generation cannot authorize a claim', async () => {
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
  const { h, owner, input, log } = await setup()
  const write = h.storage.write.bind(h.storage)
  const lost = vi.spyOn(h.storage, 'write').mockImplementation(async callback => {
    await write(callback)
    throw new StorageUnavailable('lost acknowledgment')
  })
  expect(await owner.admitOriginal(input)).toEqual({ kind: 'unavailable' })
  lost.mockRestore()
  const hidden = vi.spyOn(log, 'readByKeyIn').mockResolvedValue({ failure: 'unavailable' })
  expect(await owner.close()).toEqual({ kind: 'pending' })
  hidden.mockRestore()
  expect(await owner.close()).toEqual({ kind: 'released' })
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})
it('recognizes a lost original commit through its dispatch key without reading the Session prefix', async () => {
  const { h, owner, input, log } = await setup()
  const write = h.storage.write.bind(h.storage)
  const lost = vi.spyOn(h.storage, 'write').mockImplementation(async callback => {
    await write(callback)
    throw new StorageUnavailable('lost acknowledgment')
  })
  expect(await owner.admitOriginal(input)).toEqual({ kind: 'unavailable' })
  lost.mockRestore()
  const wholeSession = vi.spyOn(log, 'readPrefix').mockImplementation(async () => {
    throw new Error('Model original owner cannot read a full Session prefix')
  })
  const key = input.entry.dedupeKey
  if (key === undefined) throw Error('dispatch key')
  const read = vi.spyOn(log, 'readByKeyIn')
  expect(await owner.close()).toEqual({ kind: 'released' })
  expect(wholeSession).not.toHaveBeenCalled()
  expect(read).toHaveBeenCalledTimes(1)
  expect(read.mock.calls[0]?.[3]).toBe(key)
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})

it('retains a lost original commit when its keyed entry has another position', async () => {
  const { h, owner, input, log } = await setup()
  const write = h.storage.write.bind(h.storage)
  const lost = vi.spyOn(h.storage, 'write').mockImplementation(async callback => {
    await write(callback)
    throw new StorageUnavailable('lost acknowledgment')
  })
  expect(await owner.admitOriginal(input)).toEqual({ kind: 'unavailable' })
  lost.mockRestore()
  const read = h.log.participant.readByKeyIn.bind(h.log.participant)
  const changed = vi.spyOn(log, 'readByKeyIn').mockImplementation(async (...args) => {
    const result = await read(...args)
    return 'failure' in result
      ? result
      : {
          ...result,
          entries: result.entries.map(entry => ({ ...entry, position: 2 })),
        }
  })
  expect(await owner.close()).toEqual({ kind: 'pending' })
  expect(await owner.consumeOriginal({} as never)).toEqual({ kind: 'invalidInput' })
  changed.mockRestore()
  expect(await owner.close()).toEqual({ kind: 'released' })
})
it('consumption stays pending while the actual outer transaction is uncommitted', async () => {
  const { h, owner, input } = await setup()
  const job = owner.prepareOriginal(input)
  if (!('job' in job)) throw Error('job')
  const staged =
    Promise.withResolvers<import('@omne-harness-lite/model-request-runtime').OriginalIssueClaim>()
  const proceed = Promise.withResolvers<void>()
  const transaction = h.storage.atomic(async unit => {
    const result = await owner.participant.stageOriginalIn(unit, job.job)
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

it('close retains the original execution owner while a same-unit stage is awaiting current authorization', async () => {
  const { h, owner, input } = await setup()
  const entered = Promise.withResolvers<void>()
  const proceed = Promise.withResolvers<void>()
  const authorize = h.authority.authorize.bind(h.authority)
  vi.spyOn(h.authority, 'authorize').mockImplementation(async (...args) => {
    entered.resolve()
    await proceed.promise
    return authorize(...args)
  })
  const job = owner.prepareOriginal(input)
  if (!('job' in job)) throw Error('job')
  const transaction = h.storage.atomic(unit => owner.participant.stageOriginalIn(unit, job.job))
  await entered.promise
  let released = false
  const closing = owner.close().then(result => {
    released = true
    return result
  })
  try {
    // Yield to close's original empty-active-set continuation. No wall-clock wait is needed.
    await Promise.resolve()
    await Promise.resolve()
    expect(released).toBe(false)
    expect(() =>
      createOriginalIssueOwner({
        storage: h.storage,
        log: h.log.participant,
        access: h.access,
        limit: 8,
        authority: {
          async authorizeIn() {
            return { kind: 'authorized' }
          },
        },
      }),
    ).toThrow('duplicate original model execution owner')
  } finally {
    proceed.resolve()
    await transaction
    await closing
  }
  expect(await closing).toEqual({ kind: 'released' })
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})
