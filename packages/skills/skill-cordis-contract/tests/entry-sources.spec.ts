import { Context } from '@deepseek-ai/cordis'
import { standingOf } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { SKILL_ENTRY_SOURCES_POINT, type SkillEntrySource } from '@omne-harness/skill-contract'
import {
  skillEntrySourcesKey,
  skillEntrySourcesPlugin,
  type SkillEntrySourcesService,
} from '@omne-harness/skill-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

type Source = SkillEntrySource<string>
type Sources = SkillEntrySourcesService<string>

const source = (prefix: string): Source => ({
  prefix,
  list: () => Promise.resolve({ ok: [] }),
  read: () => Promise.resolve({ failure: 'not-found' }),
  readFile: () => Promise.resolve({ failure: 'not-found' }),
  listFiles: () => Promise.resolve({ failure: 'not-found' }),
})

const bringing = (name: string, given: Source) => ({
  name,
  inject: [skillEntrySourcesKey],
  apply(ctx: Context) {
    ;(ctx.get(skillEntrySourcesKey) as Sources).contribute(given)
  },
})

async function tree() {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(skillEntrySourcesPlugin)
  return { root, service: root.get(skillEntrySourcesKey) as Sources }
}

describe('the point skill.entry-sources (C401, C405)', () => {
  it('declares the point, keyed by the prefix, on the server tree', async () => {
    const { root } = await tree()
    const standing = standingOf(root.dynamis.registry(), SKILL_ENTRY_SOURCES_POINT, [])
    expect(standing.kind).not.toBe('undeclared')
  })

  it('has a source while the plugin that brings it lives, and not after', async () => {
    const { root, service } = await tree()
    const probe = source('mcp__')
    expect(service.sources([])).toEqual([])
    const fiber = root.plugin(bringing('brings', probe))
    await fiber.await()
    expect(service.sources([])).toEqual([probe])
    await fiber.dispose()
    expect(service.sources([])).toEqual([])
  })

  it('has neither of two sources that own one prefix, and the other prefixes as usual', async () => {
    const { root, service } = await tree()
    const other = source('web__')
    const fibers = [
      root.plugin(bringing('one', source('mcp__'))),
      root.plugin(bringing('two', source('mcp__'))),
      root.plugin(bringing('other', other)),
    ]
    await Promise.all(fibers.map(fiber => fiber.await()))
    expect(service.sources([])).toEqual([other])
  })

  it('gives no item whose prefix is not its key, as a plugin could put one', async () => {
    const { root, service } = await tree()
    const put = (key: string, item: unknown) =>
      root.dynamis.put([
        { point: SKILL_ENTRY_SOURCES_POINT, key, id: '', scope: [], rank: 0, digest: key, item },
      ])
    put('x__', source('mcp__'))
    put('y__', { ...source('y__'), prefix: 'not a prefix' })
    const kept = source('web__')
    put('web__', kept)
    expect(service.sources([])).toEqual([kept])
  })

  it('refuses a source whose prefix is not one', async () => {
    const { service } = await tree()
    expect(() => service.contribute(source('mcp'))).toThrow(TypeError)
  })
})
