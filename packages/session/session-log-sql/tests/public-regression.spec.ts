import { afterEach, expect, test } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { StorageDefect } from '@omne-harness-lite/storage'
import { checkAppendInput } from '@omne-harness-lite/session-log'
import { boot, request, scope } from './support.ts'

const opened: Awaited<ReturnType<typeof boot>>[] = []
afterEach(async () => {
  for (const h of opened.splice(0).reverse()) await h.close()
})
async function harness() {
  const h = await boot()
  opened.push(h)
  return h
}

// SL3 S-8/S-14: the actual SQL decision and write share one serialization point.
test('concurrent duplicate keys grant exactly one commit; a different value cannot replace the original', async () => {
  const h = await harness()
  const first = request('shared', { text: 'original' })
  const second = request('shared', { text: 'different' })
  const outcomes = await Promise.all(
    [first, second].map(r => h.log.append(r.session, r.entries, r.fence, r.condition)),
  )
  expect(outcomes.filter(r => !('failure' in r))).toHaveLength(1)
  expect(outcomes.filter(r => 'failure' in r)).toEqual([
    { failure: 'alreadyRecorded', keys: ['shared'] },
  ])
  const read = await h.log.readSince(scope.session, 0)
  if ('failure' in read) throw new Error('read failed')
  expect(read.entries).toHaveLength(1)
  const winner = outcomes.findIndex(r => !('failure' in r))
  expect(read.entries[0]?.payload).toEqual([first, second][winner]?.entries[0]?.payload)
})

test('two actual tailEquals contenders cannot both commit against the same tail', async () => {
  const h = await harness()
  const outcomes = await Promise.all(
    ['a', 'b'].map(key => {
      const r = request(key)
      return h.log.append(r.session, r.entries, r.fence, { kind: 'tailEquals', tail: 0 })
    }),
  )
  expect(outcomes.filter(r => !('failure' in r))).toHaveLength(1)
  expect(outcomes.filter(r => 'failure' in r)).toEqual([{ failure: 'tailChanged', tail: 1 }])
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})

test('tenant and fence rejection precede duplicate and changed-tail rejection without partial inserts', async () => {
  const h = await harness()
  const r = request('first')
  const write = (entries: unknown, fence: unknown) => {
    const checked = checkAppendInput(scope.session, entries, fence, { kind: 'tailEquals', tail: 0 })
    if ('failure' in checked) throw new Error('invalid fixture')
    return h.log.append(
      checked.ok.session,
      checked.ok.entries,
      checked.ok.fence,
      checked.ok.condition,
    )
  }
  const entries = [{ ...r.entries[0], run: 'run', attempt: 2 }]
  expect(await write(entries, { kind: 'fenced', run: 'run', attempt: 2 })).toHaveProperty('tail', 1)
  const stale = [{ ...entries[0], attempt: 1 }]
  expect(await write(stale, { kind: 'fenced', run: 'run', attempt: 1 })).toEqual({
    failure: 'attemptSuperseded',
  })
  const foreign = [{ ...stale[0], tenant: { organization: 'other', account: 'other' } }]
  expect(await write(foreign, { kind: 'fenced', run: 'run', attempt: 1 })).toEqual({
    failure: 'tenantMismatch',
  })
  expect(await write(entries, { kind: 'fenced', run: 'run', attempt: 2 })).toEqual({
    failure: 'alreadyRecorded',
    keys: ['first'],
  })
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})

test('SQL persistence keeps exact nested JSON numbers, read-key order and independent returned values', async () => {
  const h = await harness()
  const text = '{"cost":0.0000000000000000117,"counter":9007199254740993,"nested":[1e400]}'
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error('invalid fixture')
  const original = request('a', parsed.ok)
  const checked = checkAppendInput(
    scope.session,
    [
      { ...original.entries[0], readKeys: ['z', 'a'] },
      { ...request('b', parsed.ok).entries[0], readKeys: ['a', 'z'] },
    ],
    original.fence,
    original.condition,
  )
  if ('failure' in checked) throw new Error('invalid fixture')
  expect(
    await h.log.append(
      checked.ok.session,
      checked.ok.entries,
      checked.ok.fence,
      checked.ok.condition,
    ),
  ).toEqual({ positions: [1, 2], tail: 2 })
  const read = await h.log.readByKey(scope.session, 'z')
  if ('failure' in read) throw new Error('read failed')
  expect(read.entries.map(e => e.position)).toEqual([1, 2])
  expect(read.entries.map(e => e.readKeys)).toEqual([
    ['z', 'a'],
    ['a', 'z'],
  ])
  expect(read.entries.map(e => writeJsonLossless(e.payload))).toEqual([text, text])
  expect(Object.isFrozen(read.entries)).toBe(true)
  const reread = await h.log.readByKey(scope.session, 'z')
  if ('failure' in reread) throw new Error('read failed')
  expect(reread.entries).not.toBe(read.entries)
  expect(writeJsonLossless(reread.entries[0]?.payload)).toBe(text)
})

test('adjacent large SQL positions stay distinct; a missing earlier prefix is never returned as complete', async () => {
  const h = await harness()
  const first = request('seed')
  await h.log.append(first.session, first.entries, first.fence, first.condition)
  // Provider-owned corruption fixture: the earlier prefix is intentionally incomplete.
  await h.storage.write(tx =>
    tx.db
      .updateTable('sl_journal')
      .set({ tail: '9007199254740992' })
      .where('session', '=', scope.session)
      .execute(),
  )
  const next = request('large')
  expect(await h.log.append(next.session, next.entries, next.fence, next.condition)).toEqual({
    positions: [new LosslessNumber('9007199254740993')],
    tail: new LosslessNumber('9007199254740993'),
  })
  const suffix = await h.log.readSince(scope.session, new LosslessNumber('9007199254740992'))
  if ('failure' in suffix) throw new Error('suffix failed')
  expect(writeJsonLossless(suffix.entries[0]?.position)).toBe('9007199254740993')
  expect(await h.log.readSince(scope.session, new LosslessNumber('9007199254740993'))).toEqual({
    entries: [],
    tail: new LosslessNumber('9007199254740993'),
  })
  const source = await h.log.participant.source(h.access, scope)
  if ('failure' in source) throw new Error('source failed')
  await expect(h.log.participant.readPrefix(h.access, source.source)).rejects.toBeInstanceOf(
    StorageDefect,
  )
})
