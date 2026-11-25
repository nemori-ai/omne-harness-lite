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

const named = (name: string, args = '') => ({ name, args, request: 'req-1' })

describe('taking an entry', () => {
  const text = {
    kind: 'text',
    text: '正文',
    origin: { name: 'skill:review', layer: 'tenant', version: '1', digest: 'd' },
  } as const

  it('goes to the one source of the namespace, with the bare name, the arguments and the request', async () => {
    const seen: unknown[] = []
    const catalog = catalogOf([
      slot(
        source('skill', 'skill', listing(), async (_who, naming) => {
          seen.push(naming)
          return succeed(text)
        }),
      ),
    ])
    expect(await catalog.take(asker, named('skill:review', 'a b'))).toEqual({ ok: text })
    expect(seen).toEqual([{ name: 'review', args: 'a b', request: 'req-1' }])
  })

  it('answers unavailable when no single source owns the namespace, or the source throws or hangs', async () => {
    const throws = slot(
      source('skill', 'skill', listing(), async () => {
        throw new Error('x')
      }),
    )
    expect(await catalogOf([throws]).take(asker, named('skill:review'))).toEqual({
      failure: 'unavailable',
    })
    expect(
      await catalogOf([slot(source('skill', 'skill', listing(), () => never))]).take(
        asker,
        named('skill:review'),
      ),
    ).toEqual({ failure: 'unavailable' })
    expect(await catalogOf([]).take(asker, named('skill:review'))).toEqual({
      failure: 'unavailable',
    })
    expect(await catalogOf([throws, throws]).take(asker, named('skill:review'))).toEqual({
      failure: 'unavailable',
    })
    expect(await catalogOf([throws]).take(asker, named('review'))).toEqual({
      failure: 'unavailable',
    })
  })
})

describe('asking the candidates of an argument', () => {
  const candidates = [
    { value: 'a', current: true },
    { value: 'b', title: 'B' },
  ] as const

  it('goes to the one source of the namespace, with the bare name and the argument', async () => {
    const seen: unknown[] = []
    const answering: EntrySource<string> = {
      ...source('omne', 'omne', listing()),
      async candidates(_who, name, param) {
        seen.push([name, param])
        return succeed(candidates)
      },
    }
    expect(await catalogOf([slot(answering)]).candidates(asker, 'omne:model', 0)).toEqual({
      ok: candidates,
    })
    expect(seen).toEqual([['model', 0]])
  })

  it('answers not listed when the source keeps no candidates, and unavailable when none owns the space or it throws', async () => {
    expect(
      await catalogOf([slot(source('omne', 'omne', listing()))]).candidates(asker, 'omne:model', 0),
    ).toEqual({ failure: 'not-listed' })
    expect(await catalogOf([]).candidates(asker, 'omne:model', 0)).toEqual({
      failure: 'unavailable',
    })
    const throwing: EntrySource<string> = {
      ...source('omne', 'omne', listing()),
      candidates: async () => {
        throw new Error('x')
      },
    }
    expect(await catalogOf([slot(throwing)]).candidates(asker, 'omne:model', 0)).toEqual({
      failure: 'unavailable',
    })
  })
})
