import { Context } from '@deepseek-ai/cordis'
import { standingOf } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { fail } from '@omne-harness/operation-result'
import { ENTRY_SOURCES_POINT, type EntrySource } from '@omne-harness/slash-command-contract'
import {
  commandEntrySourcesKey,
  commandEntrySourcesPlugin,
  type CommandEntrySourcesService,
} from '@omne-harness/slash-command-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'

type Sources = CommandEntrySourcesService<string>

const source = (name: string, space = name): EntrySource<string> => ({
  name,
  space,
  list: async () => fail('unavailable'),
  take: async () => fail('not-listed'),
})

const bringing = (name: string, given: EntrySource<string>, official = false) => ({
  name,
  inject: [commandEntrySourcesKey],
  apply(ctx: Context) {
    ;(ctx.get(commandEntrySourcesKey) as Sources).contribute(given, { official })
  },
})

async function tree() {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(commandEntrySourcesPlugin)
  return { root, service: root.get(commandEntrySourcesKey) as Sources }
}

const names = (service: Sources) => service.sources().map(slot => [slot.source.name, slot.official])
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5))

describe('the command entry sources on a real Cordis root', () => {
  it('declares the point, keyed by the source name, on the server tree', async () => {
    const { root } = await tree()
    expect(standingOf(root.dynamis.registry(), ENTRY_SOURCES_POINT, [])).toMatchObject({
      kind: 'declared',
      contract: {
        name: 'slash-command.entry-sources',
        tree: 'server',
        arity: 'keyed-one',
        resolve: 'conflict',
        binding: 'run',
        item: { kind: 'effect' },
      },
    })
  })

  it('has a source while the plugin that brings it lives, with whether the assembly marked it official', async () => {
    const { root, service } = await tree()
    const fiber = root.plugin(bringing('system', source('system', 'omne-official'), true))
    await fiber.await()
    expect(names(service)).toEqual([['system', true]])
    await fiber.dispose()
    expect(names(service)).toEqual([])
  })

  it('has neither of two sources under one name, and the others as usual', async () => {
    const { root, service } = await tree()
    const fibers = [
      root.plugin(bringing('a', source('skill'))),
      root.plugin(bringing('b', source('skill'))),
      root.plugin(bringing('c', source('prompt'))),
    ]
    await Promise.all(fibers.map(fiber => fiber.await()))
    expect(names(service)).toEqual([['prompt', false]])
    await fibers[1]?.dispose()
    expect(names(service).sort()).toEqual([
      ['prompt', false],
      ['skill', false],
    ])
  })

  it('refuses a source whose name or namespace is not a name', async () => {
    const { root, service } = await tree()
    await root
      .plugin(bringing('bad', source('Skill')))
      .await()
      .catch(() => undefined)
    await root
      .plugin(bringing('bad-space', source('skill', 'a b')))
      .await()
      .catch(() => undefined)
    expect(names(service)).toEqual([])
  })

  it('keeps a leaving source out of service at once, and takes it off when its takings in flight end', async () => {
    const { root, service } = await tree()
    const fiber = root.plugin(bringing('skill', source('skill')))
    await fiber.await()
    const done = service.hold('skill')
    service.hold('other')()
    let left = false
    const leaving = Promise.resolve(fiber.dispose()).then(() => {
      left = true
    })
    await tick()
    expect(names(service)).toEqual([])
    expect(left).toBe(false)
    done()
    await leaving
    expect(root.dynamis.registry().retiring).toEqual([])
  })
})
