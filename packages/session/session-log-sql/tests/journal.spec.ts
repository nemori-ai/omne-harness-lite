import { afterEach, expect, test } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { checkAppendInput, sourceTokenEquals } from '@omne-harness-lite/session-log'
import { StorageDefect } from '@omne-harness-lite/storage'
import { openSqlSessionLog } from '@omne-harness-lite/session-log-sql'
import { administrator, boot, request, scope, tenant } from './support.ts'

const opened: Awaited<ReturnType<typeof boot>>[] = []
afterEach(async () => {
  for (const h of opened.splice(0).reverse()) await h.close()
})
async function harness() {
  const h = await boot()
  opened.push(h)
  return h
}
test('ordinary append is all-or-nothing, deduplicated and indexed by read key', async () => {
  const h = await harness(),
    r = request()
  expect(await h.log.append(r.session, r.entries, r.fence, r.condition)).toEqual({
    positions: [1],
    tail: 1,
  })
  expect(await h.log.append(r.session, r.entries, r.fence, r.condition)).toEqual({
    failure: 'alreadyRecorded',
    keys: ['key-a'],
  })
  const read = await h.log.readByKey(r.session, 'key-a')
  expect(read).toHaveProperty('tail', 1)
  if ('failure' in read) throw new Error('unexpected read failure')
  expect(read.entries.map(entry => entry.payload)).toEqual(r.entries.map(entry => entry.payload))
  expect(await h.log.readByKey(r.session, 'absent')).toEqual({ entries: [], tail: 1 })
  expect(await h.log.readSince(r.session, 1)).toEqual({ entries: [], tail: 1 })
})
test('a fixed prefix remains fixed after append and journal generation survives owner reload', async () => {
  const h = await harness(),
    r = request()
  await h.log.append(r.session, r.entries, r.fence, r.condition)
  const fixed = await h.log.participant.source(h.access, scope)
  if ('failure' in fixed) throw new Error('source unavailable')
  const second = request('key-b')
  await h.log.append(second.session, second.entries, second.fence, second.condition)
  const prefix = await h.log.participant.readPrefix(h.access, fixed.source)
  expect(prefix).toHaveProperty('entries.length', 1)
  const generation = h.log.backing.ownerGeneration
  await h.log.close()
  const reloaded = openSqlSessionLog({
    storage: h.storage,
    authority: h.authority,
    operationLimit: 8,
  })
  try {
    expect(reloaded.backing.ownerGeneration).not.toBe(generation)
    const next = await reloaded.participant.source(h.access, scope)
    if ('failure' in next) throw new Error('source unavailable')
    expect(next.source.journalGeneration).toBe(fixed.source.journalGeneration)
    expect(next.source.tail).toBe(2)
    expect(sourceTokenEquals({ ...next.source, tail: 1 }, fixed.source)).toBe(true)
    expect(await reloaded.participant.readPrefix(h.access, { ...fixed.source, tail: 3 })).toEqual({
      failure: 'unavailable',
    })
    expect(
      await reloaded.participant.readPrefix(h.access, {
        ...fixed.source,
        journalGeneration: 'other',
      }),
    ).toEqual({ failure: 'unavailable' })
  } finally {
    await reloaded.close()
  }
})
test('later participant failure rolls back the entire original log batch', async () => {
  const h = await harness()
  await expect(
    h.storage.atomic(async unit => {
      expect(await h.log.participant.appendIn(unit, h.access, request())).toHaveProperty(
        'kind',
        'staged',
      )
      throw new Error('later owner failed')
    }),
  ).rejects.toThrow('later owner failed')
  expect(await h.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
})
test('genuine governance removal staged earlier in the same unit denies log staging and survives only if committed', async () => {
  const h = await harness()
  await h.storage.atomic(async unit => {
    expect(await h.governance.memberships.participate(unit).remove(administrator, tenant)).toBe(
      'ok',
    )
    expect(await h.log.participant.appendIn(unit, h.access, request())).toEqual({
      failure: 'denied',
    })
  })
  expect(await h.governance.memberships.standing(tenant)).toEqual({ standing: 'ineffective' })
  expect(await h.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
})
test('a copied public brand is not authority, and current revocation blocks an already borrowed handle', async () => {
  const h = await harness()
  const held = await h.log.owner.borrow(h.access, scope)
  if (held.kind !== 'borrowed') throw new Error('borrow failed')
  try {
    const r = request()
    expect(await held.log.append(r.session, r.entries, r.fence, r.condition)).toHaveProperty(
      'tail',
      1,
    )
    expect(await h.log.participant.source({} as typeof h.access, scope)).toEqual({
      failure: 'denied',
    })
    expect(await h.governance.memberships.remove(administrator, tenant)).toBe('ok')
    expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
  } finally {
    await held.release()
  }
})
test('tail and latest-attempt conditions are decided under the original Session storage lock', async () => {
  const h = await harness(),
    r = request()
  const newer = checkAppendInput(
    scope.session,
    [{ ...r.entries[0], run: 'run-a', attempt: 2 }],
    { kind: 'fenced', run: 'run-a', attempt: 2 },
    { kind: 'tailEquals', tail: 0 },
  )
  if ('failure' in newer) throw new Error('bad test request')
  expect(
    await h.log.append(newer.ok.session, newer.ok.entries, newer.ok.fence, newer.ok.condition),
  ).toHaveProperty('tail', 1)
  const old = checkAppendInput(
    scope.session,
    [{ ...r.entries[0], dedupeKey: 'key-b', run: 'run-a', attempt: 1 }],
    { kind: 'fenced', run: 'run-a', attempt: 1 },
    { kind: 'unconditional' },
  )
  if ('failure' in old) throw new Error('bad test request')
  expect(
    await h.log.append(old.ok.session, old.ok.entries, old.ok.fence, old.ok.condition),
  ).toEqual({ failure: 'attemptSuperseded' })
  const fresh = request('key-c')
  expect(
    await h.log.append(fresh.session, fresh.entries, fresh.fence, { kind: 'tailEquals', tail: 0 }),
  ).toEqual({ failure: 'tailChanged', tail: 1 })
})
test('foreign units and expired units fail closed; malformed requests do not execute accessors', async () => {
  const h = await harness(),
    other = await harness()
  await expect(
    other.storage.atomic(async unit => {
      await h.log.participant.appendIn(unit, h.access, request())
    }),
  ).rejects.toBeInstanceOf(StorageDefect)
  const expired = await h.storage.atomic(async unit => unit)
  expect(await h.log.participant.appendIn(expired, h.access, request())).toEqual({
    failure: 'invalidInput',
  })
  let reads = 0
  const malformed = {
    get session() {
      reads++
      return scope.session
    },
  } as ReturnType<typeof request>
  await h.storage.atomic(async unit => {
    expect(await h.log.participant.appendIn(unit, h.access, malformed)).toEqual({
      failure: 'invalidInput',
    })
  })
  expect(reads).toBe(0)
})
test('close revokes cached borrows and retains the owner until borrowers release', async () => {
  const h = await harness()
  const held = h.log.backing.borrow()
  await expect(h.log.close()).rejects.toThrow('borrow is still held')
  expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
  await held.release()
  await h.log.close()
})
test('close waits a successfully staged original outer unit, rather than only the append function', async () => {
  const h = await harness()
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  const write = h.storage.atomic(async unit => {
    expect(await h.log.participant.appendIn(unit, h.access, request())).toHaveProperty(
      'kind',
      'staged',
    )
    entered.resolve()
    await proceed.promise
  })
  void write.catch(entered.reject)
  await entered.promise
  let ended = false
  const close = h.log.close().then(() => {
    ended = true
  })
  await Promise.resolve()
  expect(ended).toBe(false)
  proceed.resolve()
  await write
  await close
  const rows = await h.storage.read(tx => tx.db.selectFrom('sl_entry').select('value').execute())
  expect(rows.map(row => row.value)).toEqual([writeJsonLossless(request().entries[0])])
})

test('source and owner APIs reject extra scope members rather than overwrite caller values', async () => {
  const h = await harness()
  const extra = { ...scope, journalGeneration: 'forged-generation', tail: 99 }
  expect(await h.log.participant.source(h.access, extra)).toEqual({ failure: 'invalidInput' })
  expect(await h.log.owner.borrow(h.access, extra)).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
})
