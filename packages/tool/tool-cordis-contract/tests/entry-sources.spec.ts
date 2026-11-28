import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { standingOf } from '@omne-harness/dynamis'
import { DynamisService, dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import {
  TOOL_ENTRY_SOURCES_POINT,
  type ToolEntrySource,
} from '@omne-harness/tool-contract/provider'
import {
  toolEntrySourcesKey,
  toolEntrySourcesPlugin,
  type ToolEntrySourcesService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

type Source = ToolEntrySource<string, ContentBlock>
type Sources = ToolEntrySourcesService<string, ContentBlock>

const source = (prefix: string): Source => ({
  prefix,
  list: () => Promise.resolve({ ok: { entries: [], withheld: [] } }),
  select: () => undefined,
  execute: () => Promise.reject(new Error('unused')),
})

const bringing = (name: string, given: Source) => ({
  name,
  inject: [toolEntrySourcesKey],
  apply(ctx: Context) {
    ;(ctx.get(toolEntrySourcesKey) as Sources).contribute(given)
  },
})

async function tree() {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(toolEntrySourcesPlugin)
  return { root, service: root.get(toolEntrySourcesKey) as Sources }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5))

const ALICE = ['tenant', 'alice'] as const
const BOB = ['tenant', 'bob'] as const

/** A source a tenant puts, the way the plugin loader puts the members of a tenant's plugin. */
const putBy = (name: string, scope: readonly string[], given: Source) => ({
  name,
  inject: [dynamisKey],
  apply(ctx: Context) {
    const tree = ctx.get(dynamisKey) as DynamisService
    ctx.effect(() =>
      tree.put(by => [
        {
          point: TOOL_ENTRY_SOURCES_POINT,
          key: given.prefix,
          id: '',
          scope,
          rank: 0,
          digest: `${given.prefix}@${by.fiber}#${by.generation}`,
          item: given,
        },
      ]),
    )
  },
})

describe('the tool entry sources on a real Cordis root', () => {
  it('declares the point, keyed by the prefix, on the server tree', async () => {
    const { root } = await tree()
    const standing = standingOf(root.dynamis.registry(), TOOL_ENTRY_SOURCES_POINT, [])
    expect(standing).toMatchObject({
      kind: 'declared',
      contract: {
        name: 'tool.entry-sources',
        tree: 'server',
        arity: 'keyed-one',
        resolve: 'conflict',
        binding: 'run',
        item: { kind: 'effect' },
      },
    })
  })

  it('has a source while the plugin that brings it lives, and not after', async () => {
    const { root, service } = await tree()
    const probe = source('probe__')
    expect(service.sources([])).toEqual([])
    const fiber = root.plugin(bringing('probe', probe))
    await fiber.await()
    expect(service.sources([])).toEqual([probe])
    await fiber.dispose()
    expect(service.sources([])).toEqual([])
  })

  it('has neither of two sources that own one prefix, and the other prefixes as usual', async () => {
    const { root, service } = await tree()
    const [first, second, other] = [source('probe__'), source('probe__'), source('other__')]
    const fibers = [
      root.plugin(bringing('first', first)),
      root.plugin(bringing('second', second)),
      root.plugin(bringing('other', other)),
    ]
    await Promise.all(fibers.map(fiber => fiber.await()))
    expect(service.sources([])).toEqual([other])
    await fibers[1]?.dispose()
    expect(service.sources([]).toSorted((a, b) => a.prefix.localeCompare(b.prefix))).toEqual([
      other,
      first,
    ])
  })

  it('refuses a source whose prefix is not one', async () => {
    const { root } = await tree()
    const fiber = root.plugin(bringing('bad', source('probe')))
    await fiber.await().catch(() => undefined)
    expect((root.get(toolEntrySourcesKey) as Sources).sources([])).toEqual([])
  })

  it('keeps a leaving source out of service at once, and takes it off when its calls in flight end', async () => {
    const { root, service } = await tree()
    const fiber = root.plugin(bringing('probe', source('probe__')))
    await fiber.await()
    const [first, second] = [service.hold('probe__'), service.hold('probe__')]
    service.hold('other__')()
    let left = false
    const leaving = Promise.resolve(fiber.dispose()).then(() => {
      left = true
    })
    await tick()
    expect(service.sources([])).toEqual([])
    expect(root.dynamis.registry().retiring).toHaveLength(1)
    first()
    first()
    await tick()
    expect(left).toBe(false)
    second()
    await leaving
    expect(root.dynamis.registry().retiring).toEqual([])
  })

  it('takes a source with no call in flight off at once', async () => {
    const { root, service } = await tree()
    const fiber = root.plugin(bringing('probe', source('probe__')))
    await fiber.await()
    service.hold('probe__')()
    await fiber.dispose()
    expect(root.dynamis.registry().retiring).toEqual([])
    expect(service.sources([])).toEqual([])
  })

  it('is read as the tenant who asks: a source of the deployment for all, a source a tenant put for that tenant alone (TL-76)', async () => {
    const { root, service } = await tree()
    const [shared, own] = [source('shared__'), source('notes__')]
    await root.plugin(bringing('shared', shared)).await()
    await root.plugin(putBy('alice-notes', ALICE, own)).await()
    const prefixes = (asker: readonly string[]) =>
      service
        .sources(asker)
        .map(each => each.prefix)
        .toSorted()
    expect(prefixes(ALICE)).toEqual(['notes__', 'shared__'])
    expect(prefixes(BOB)).toEqual(['shared__'])
    expect(prefixes([])).toEqual(['shared__'])
  })

  it('keeps a source of the deployment for every tenant: a tenant that puts its prefix does not replace it (TL-76)', async () => {
    const { root, service } = await tree()
    const [official, posing] = [source('mcp__'), source('mcp__')]
    await root.plugin(bringing('official', official)).await()
    await root
      .plugin(putBy('alice-mcp', ALICE, posing))
      .await()
      .catch(() => undefined)
    expect(service.sources(ALICE)).toEqual([official])
    expect(service.sources(BOB)).toEqual([official])
  })
})
