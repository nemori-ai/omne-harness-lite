import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createCommandCatalog,
  createResolver,
  createSystemCommandSource,
} from '@omne-harness/slash-command'
import type { EntrySource } from '@omne-harness/slash-command-contract'
import { describe, expect, it } from 'vitest'

const asker = { principal: 'p', tenant: 't' as unknown as TenantId, session: 's' }
const ORIGIN = { name: 'goal:goal', layer: 'official', version: '1', digest: 'd-goal' }

/** An official source in a namespace of its own, handing over one prompt command. */
function promptSource(space: string): EntrySource<string> {
  return {
    name: 'goal-command',
    space,
    list: async () =>
      succeed([{ space, name: 'goal', kind: 'prompt', title: '给这段会话设一个目标' }]),
    take: async (_asker, name) =>
      name === 'goal'
        ? succeed({ kind: 'text', text: '人想给这段会话设一个目标。', origin: ORIGIN })
        : fail('not-listed'),
  }
}

function catalogWith(space: string) {
  const sources = [
    { source: createSystemCommandSource<string>(), official: true },
    { source: promptSource(space), official: true },
  ]
  return createCommandCatalog<string>({ sources: () => sources, declared: [], timeoutMs: 1000 })
}

describe('an official prompt command beside the system commands', () => {
  it('in a namespace of its own it is listed, named by its short name, and handed over as a text with its origin', async () => {
    const catalog = catalogWith('goal')
    const read = await catalog.read(asker)
    expect(read.errors).toEqual([])
    expect(read.catalog.entries.map(entry => `${entry.space}:${entry.name}:${entry.kind}`)).toEqual(
      [
        'goal:goal:prompt',
        'omne-official:archive:system',
        'omne-official:model:system',
        'omne-official:permission:system',
      ],
    )
    expect(
      await createResolver(catalog)({ text: '/goal 把首页加载降下来', seen: null, asker }),
    ).toEqual({
      kind: 'input',
      appended: [{ text: '人想给这段会话设一个目标。\n\n把首页加载降下来', origin: ORIGIN }],
    })
  })

  it('in the reserved namespace the system commands already hold, neither source can be taken from', async () => {
    const catalog = catalogWith('omne-official')
    expect((await catalog.read(asker)).catalog.entries.map(entry => entry.name)).toContain('goal')
    expect(await catalog.take(asker, 'omne-official:goal')).toEqual(fail('unavailable'))
    expect(await catalog.take(asker, 'omne-official:archive')).toEqual(fail('unavailable'))
  })
})
