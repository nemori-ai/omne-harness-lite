import { afterEach, expect, test } from 'vitest'
import { boot, request, scope } from './support.ts'

const opened: Awaited<ReturnType<typeof boot>>[] = []
afterEach(async () => {
  for (const f of opened.splice(0)) await f.close()
})
async function fixture() {
  const f = await boot()
  opened.push(f)
  return f
}

test('reads only the fixed suffix and never decodes older rows', async () => {
  const f = await fixture()
  for (const key of ['first', 'second']) {
    const input = request(key)
    await f.log.append(input.session, input.entries, input.fence, input.condition)
  }
  const source = await f.log.participant.source(f.access, scope)
  if ('failure' in source) throw new Error('source unavailable')
  await f.storage.write(tx =>
    tx.db
      .updateTable('sl_entry')
      .set({ value: 'corrupt old row' })
      .where('session', '=', scope.session)
      .where('position', '=', '1')
      .execute(),
  )
  await f.storage.atomic(async unit => {
    const suffix = await f.log.participant.readSinceIn(unit, f.access, source.source, 1)
    expect(suffix).toMatchObject({
      kind: 'suffix',
      source: source.source,
      entries: [{ position: 2 }],
    })
    if ('failure' in suffix) throw new Error('suffix unavailable')
    expect(suffix.entries).toHaveLength(1)
    expect(await f.log.participant.readSinceIn(unit, f.access, source.source, 2)).toMatchObject({
      kind: 'suffix',
      entries: [],
    })
  })
  await expect(f.log.participant.readPrefix(f.access, source.source)).rejects.toThrow(
    'corrupt journal entry',
  )
})

test('suffixes use staged data and current authorization, including an empty suffix', async () => {
  const f = await fixture()
  await f.storage.atomic(async unit => {
    await f.log.participant.appendIn(unit, f.access, request())
    const source = await f.log.participant.sourceIn(unit, f.access, scope)
    if ('failure' in source) throw new Error('source unavailable')
    expect(await f.log.participant.readSinceIn(unit, f.access, source.source, 0)).toMatchObject({
      kind: 'suffix',
      entries: [{ position: 1 }],
    })
    expect(
      await f.log.participant.readSinceIn(unit, {} as typeof f.access, source.source, 1),
    ).toEqual({ failure: 'denied' })
    expect(
      await f.log.participant.readSinceIn(
        unit,
        f.access,
        { ...source.source, journalGeneration: 'other' },
        1,
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(await f.log.participant.readSinceIn(unit, f.access, source.source, 2)).toEqual({
      failure: 'invalidInput',
    })
  })
})
