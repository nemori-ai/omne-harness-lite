import { fail, succeed } from '@omne-harness/operation-result'
import type {
  CommandEntry,
  EntrySource,
  EntrySourceSlot,
} from '@omne-harness/slash-command-contract'
import { createCommandCatalog } from '@omne-harness/slash-command'
import type { TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'

const asker = { principal: 'p', tenant: 't' as unknown as TenantId, session: 's' }
const entry = (space: string, name: string): CommandEntry => ({
  space,
  name,
  kind: space === 'omne-official' ? 'system' : 'reference',
  title: name,
})
const never = new Promise<never>(() => {})

function source(
  name: string,
  space: string,
  list: EntrySource<string>['list'],
  take?: EntrySource<string>['take'],
): EntrySource<string> {
  return { name, space, list, take: take ?? (async () => fail('not-listed')) }
}
const listing =
  (...entries: CommandEntry[]) =>
  async () =>
    succeed(entries)
const slot = (s: EntrySource<string>, official = false): EntrySourceSlot<string> => ({
  source: s,
  official,
})
const catalogOf = (slots: EntrySourceSlot<string>[], declared: string[] = []) =>
  createCommandCatalog<string>({ sources: () => slots, declared, timeoutMs: 50 })

describe('reading the list', () => {
  it('asks every source and keeps nothing between reads', async () => {
    let skills = [entry('skill', 'review')]
    const catalog = catalogOf([
      slot(source('skill', 'skill', async () => succeed(skills))),
      slot(source('system', 'omne-official', listing(entry('omne-official', 'model'))), true),
    ])
    expect((await catalog.read(asker)).catalog).toEqual({
      entries: [entry('omne-official', 'model'), entry('skill', 'review')],
      missing: [],
    })
    skills = []
    expect((await catalog.read(asker)).catalog.entries.map(one => one.name)).toEqual(['model'])
  })

  it('marks only the source that failed as missing, whatever way it failed', async () => {
    const read = await catalogOf(
      [
        slot(source('ok', 'prompt', listing(entry('prompt', 'commit')))),
        slot(
          source('throws', 'a', async () => {
            throw new Error('x')
          }),
        ),
        slot(source('down', 'b', async () => fail('unavailable'))),
        slot(source('slow', 'c', () => never)),
        slot(source('wanders', 'd', listing(entry('e', 'x')))),
        slot(source('claims', 'omne-official', listing(entry('omne-official', 'model')))),
      ],
      ['absent', 'ok'],
    ).read(asker)
    expect(read.catalog).toEqual({
      entries: [entry('prompt', 'commit')],
      missing: ['absent', 'claims', 'down', 'slow', 'throws', 'wanders'],
    })
    expect(read.errors).toHaveLength(5)
  })

  it('drops both entries when two sources of one namespace offer the same name', async () => {
    const read = await catalogOf([
      slot(source('one', 'skill', listing(entry('skill', 'review'), entry('skill', 'tmp')))),
      slot(source('two', 'skill', listing(entry('skill', 'review')))),
    ]).read(asker)
    expect(read.catalog.entries.map(one => one.name)).toEqual(['tmp'])
    expect(read.errors).toEqual(['skill:review: offered by 2 sources; none of them counts'])
  })
})

describe('taking an entry', () => {
  const text = {
    kind: 'text',
    text: '正文',
    origin: { name: 'skill:review', layer: 'tenant', version: '1', digest: 'd' },
  } as const

  it('goes to the one source of the namespace, with the bare name', async () => {
    const seen: string[] = []
    const catalog = catalogOf([
      slot(
        source('skill', 'skill', listing(), async (_who, name) => {
          seen.push(name)
          return succeed(text)
        }),
      ),
    ])
    expect(await catalog.take(asker, 'skill:review')).toEqual({ ok: text })
    expect(seen).toEqual(['review'])
  })

  it('answers unavailable when no single source owns the namespace, or the source throws or hangs', async () => {
    const throws = slot(
      source('skill', 'skill', listing(), async () => {
        throw new Error('x')
      }),
    )
    expect(await catalogOf([throws]).take(asker, 'skill:review')).toEqual({
      failure: 'unavailable',
    })
    expect(
      await catalogOf([slot(source('skill', 'skill', listing(), () => never))]).take(
        asker,
        'skill:review',
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(await catalogOf([]).take(asker, 'skill:review')).toEqual({ failure: 'unavailable' })
    expect(await catalogOf([throws, throws]).take(asker, 'skill:review')).toEqual({
      failure: 'unavailable',
    })
    expect(await catalogOf([throws]).take(asker, 'review')).toEqual({ failure: 'unavailable' })
  })
})
