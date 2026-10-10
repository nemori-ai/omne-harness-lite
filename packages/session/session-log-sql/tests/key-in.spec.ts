import { afterEach, expect, test } from 'vitest'
import { StorageDefect } from '@omne-harness-lite/storage'
import { boot, request, scope } from './support.ts'
const opened: Awaited<ReturnType<typeof boot>>[] = []
afterEach(async () => {
  for (const value of opened.splice(0)) await value.close()
})
async function fixture() {
  const value = await boot()
  opened.push(value)
  return value
}
test('reads only the requested key at the fixed staged coordinate in the original unit', async () => {
  const f = await fixture()
  await f.storage.atomic(async unit => {
    await f.log.participant.appendIn(unit, f.access, request('first'))
    await f.log.participant.appendIn(unit, f.access, request('other'))
    const selected = await f.log.participant.sourceIn(unit, f.access, scope)
    if ('failure' in selected) throw new Error('actual source unavailable')
    const result = await f.log.participant.readByKeyIn(unit, f.access, selected.source, 'first')
    expect(result).toMatchObject({
      kind: 'keyed',
      source: selected.source,
      entries: [{ position: 1 }],
    })
    if ('failure' in result) throw new Error('actual key read unavailable')
    expect(result.entries).toHaveLength(1)
    await f.log.participant.appendIn(unit, f.access, request('later'))
    expect(
      await f.log.participant.readByKeyIn(unit, f.access, selected.source, 'all'),
    ).toMatchObject({ kind: 'keyed', entries: [{ position: 1 }, { position: 2 }] })
    expect(
      await f.log.participant.readByKeyIn(unit, f.access, selected.source, 'absent'),
    ).toMatchObject({ kind: 'keyed', entries: [] })
  })
})
test('key reads never commit the staged batch when a later participant fails', async () => {
  const f = await fixture()
  await expect(
    f.storage.atomic(async unit => {
      await f.log.participant.appendIn(unit, f.access, request())
      const selected = await f.log.participant.sourceIn(unit, f.access, scope)
      if ('failure' in selected) throw new Error('actual source unavailable')
      expect(
        await f.log.participant.readByKeyIn(unit, f.access, selected.source, 'key-a'),
      ).toHaveProperty('entries.0.position', 1)
      throw new Error('later participant failed')
    }),
  ).rejects.toThrow('later participant failed')
  expect(await f.log.readByKey(scope.session, 'key-a')).toEqual({ entries: [], tail: 0 })
})
test('key and source data do not grant copied, foreign, stale, or stopped access', async () => {
  const f = await fixture()
  await f.log.append(scope.session, request().entries, request().fence, request().condition)
  const selected = await f.log.participant.source(f.access, scope)
  if ('failure' in selected) throw new Error('actual source unavailable')
  await f.storage.atomic(async unit => {
    expect(
      await f.log.participant.readByKeyIn(unit, {} as typeof f.access, selected.source, 'key-a'),
    ).toEqual({ failure: 'denied' })
    expect(
      await f.log.participant.readByKeyIn(
        unit,
        f.access,
        { ...selected.source, session: 'foreign' as typeof scope.session },
        'key-a',
      ),
    ).toEqual({ failure: 'denied' })
    expect(
      await f.log.participant.readByKeyIn(
        unit,
        f.access,
        { ...selected.source, journalGeneration: 'wrong' },
        'key-a',
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(await f.log.participant.readByKeyIn(unit, f.access, selected.source, '')).toEqual({
      failure: 'invalidInput',
    })
  })
  await f.log.close()
  await f.storage.atomic(async unit =>
    expect(await f.log.participant.readByKeyIn(unit, f.access, selected.source, 'key-a')).toEqual({
      failure: 'unavailable',
    }),
  )
})
test('key reads reject a foreign storage unit without allowing that unit to commit', async () => {
  const f = await fixture(),
    other = await fixture()
  await f.log.append(scope.session, request().entries, request().fence, request().condition)
  const selected = await f.log.participant.source(f.access, scope)
  if ('failure' in selected) throw new Error('actual source unavailable')
  await expect(
    other.storage.atomic(async unit =>
      expect(await f.log.participant.readByKeyIn(unit, f.access, selected.source, 'key-a')).toEqual(
        { failure: 'invalidInput' },
      ),
    ),
  ).rejects.toBeInstanceOf(StorageDefect)
})

test('key positions use integer order across the decimal width boundary', async () => {
  const f = await fixture()
  await f.storage.atomic(async unit => {
    const batch = request('1')
    expect(
      await f.log.participant.appendIn(unit, f.access, {
        ...batch,
        entries: Array.from({ length: 12 }, (_, n) => request(String(n + 1)).entries[0]!),
      }),
    ).toHaveProperty('kind', 'staged')
    const selected = await f.log.participant.sourceIn(unit, f.access, scope)
    if ('failure' in selected) throw new Error('actual source unavailable')
    const result = await f.log.participant.readByKeyIn(unit, f.access, selected.source, 'all')
    if ('failure' in result) throw new Error('actual key read unavailable')
    expect(result.entries.map(entry => entry.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
  })
})
