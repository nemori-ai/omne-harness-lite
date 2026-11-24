import { describe, expect, it } from 'vitest'
import {
  createCategoryPoint,
  digestBytes,
  type BodyContract,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  PLUGIN_CATEGORY,
  SKIN_CATEGORY,
  pluginBodyContract,
  pluginCategoryDisplay,
  pluginPluginsPoint,
  skinBodyContract,
  skinCategoryDisplay,
  skinSkinsPoint,
} from '@omne-harness/plugin-host-local'
import { readManifest } from '@omne-harness/plugin-protocol'

const encoder = new TextEncoder()

function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  return {
    manifest: async () =>
      succeed({
        entries: Object.entries(files).map(([path, text]) => ({
          path,
          bytes: encoder.encode(text).length,
          digest: digestBytes(encoder.encode(text)),
        })),
      }),
    open: async path =>
      files[path] === undefined ? fail('entry-not-found') : succeed(encoder.encode(files[path])),
  }
}

function world() {
  const categories = createCategoryPoint()
  const plugin = pluginBodyContract(categories)
  const skin = skinBodyContract(categories)
  categories.contribute({
    point: pluginPluginsPoint.name,
    display: pluginCategoryDisplay,
    contract: plugin,
  })
  categories.contribute({
    point: skinSkinsPoint.name,
    display: skinCategoryDisplay,
    contract: skin,
  })
  return { categories, contracts: { plugin, skin } }
}

const TOKENS = { point: 'shell.tokens', key: 'shell.app', data: { '--omne-accent': '#0a7a4a' } }
const PORT = { point: 'notes.cards', key: 'todo', data: { anything: 1 } }

type Written = Readonly<{ kind?: string; server?: unknown }>

const manifest = ({ kind, server }: Written, name = 'sea'): string =>
  JSON.stringify({
    schema: 1,
    name,
    summary: 'The sea.',
    ...(kind !== undefined && { kind }),
    client: { members: [TOKENS] },
    ...(server !== undefined && { server }),
  })

async function inspected(to: 'plugin' | 'skin', written: Written) {
  const contract: BodyContract = world().contracts[to]
  return contract.layout!.inspect(
    packageOf({ 'plugin.json': manifest(written), 'inner/plugin.json': '{}' }),
  )
}

const rejected = (reason: string) => fail({ kind: 'invalid-package', reason })

const NOT_A_SKIN =
  'the manifest does not say it is a skin: write "kind":"skin", or publish it to the category plugin'
const IS_A_SKIN = 'the manifest says it is a skin: publish it to the category skin'
const SERVER_SIDE =
  'a skin has members of the interface only, and this manifest writes a server side: leave server out'

describe('the two categories of Plugin', () => {
  it('are directory categories, each with a point and a namespace of its own', () => {
    const { categories, contracts } = world()
    expect([PLUGIN_CATEGORY, SKIN_CATEGORY]).toEqual(['plugin', 'skin'])
    expect(categories.describe('skin')).toMatchObject({
      creation: 'directory',
      point: 'plugin.skins',
    })
    expect(categories.describe('plugin')).toMatchObject({ point: 'plugin.plugins' })
    expect(contracts.skin.layout?.namespace).toBe('skins')
    expect(contracts.plugin.layout?.namespace).toBe('plugins')
  })

  it('the text on how a skin is written gives a whole manifest the reader reads as a skin', () => {
    const written = (skinCategoryDisplay.authoring ?? '').split('\n').find(line => line[0] === '{')
    const read = readManifest(written ?? '')
    expect(read).toMatchObject({ kind: 'read', unread: [], manifest: { kind: 'skin' } })
    expect(read.kind === 'read' && read.manifest.server).toBeUndefined()
  })
})

describe('what a manifest says it is, by the category it is published to', () => {
  it('a manifest that says nothing is held as a plugin, and not as a skin', async () => {
    expect('ok' in (await inspected('plugin', {}))).toBe(true)
    expect(await inspected('skin', {})).toEqual(rejected(NOT_A_SKIN))
  })

  it('a manifest that says it is a skin and writes no server side is held as a skin, and not as a plugin', async () => {
    expect('ok' in (await inspected('skin', { kind: 'skin' }))).toBe(true)
    expect(await inspected('plugin', { kind: 'skin' })).toEqual(rejected(IS_A_SKIN))
  })

  it('an empty server side is as good as none', async () => {
    const answer = await inspected('skin', { kind: 'skin', server: { members: [] } })
    expect('ok' in answer).toBe(true)
  })

  it.each<[string, unknown]>([
    ['a member', { members: [PORT] }],
    ['a need', { needs: ['extensions'], members: [] }],
  ])(
    'a manifest that says it is a skin and writes %s on the server is held as neither',
    async (_name, server) => {
      expect(await inspected('skin', { kind: 'skin', server })).toEqual(rejected(SERVER_SIDE))
      expect(await inspected('plugin', { kind: 'skin', server })).toEqual(
        rejected(`${IS_A_SKIN}; ${SERVER_SIDE}`),
      )
    },
  )

  it.each(['plugin', 'skin'] as const)(
    'a kind the reader does not know is not held as a %s: the manifest is not read',
    async to => {
      expect(await inspected(to, { kind: 'theme' })).toEqual(
        rejected('the kind "theme" is not one this reader knows; it knows skin'),
      )
    },
  )

  it.each(['plugin', 'skin'] as const)('a %s does not hold a skin', async to => {
    const inner = { point: 'plugin.skins', key: 'inner', directory: 'inner' }
    const written = to === 'skin' ? { kind: 'skin' } : {}
    const answer = await inspected(to, { ...written, server: { members: [inner] } })
    expect(answer).toEqual(
      rejected(
        to === 'skin'
          ? SERVER_SIDE
          : 'server.members[0] (plugin.skins, inner): a plugin does not hold a skin',
      ),
    )
  })
})

describe('judging a body', () => {
  async function bodyOf(written: Written): Promise<JsonValue> {
    const to = written.kind === 'skin' ? 'skin' : 'plugin'
    const answer = await inspected(to, written)
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    return answer.ok
  }

  it('holds a body to the same: a skin is not a plugin, and a plugin is not a skin', async () => {
    const { contracts } = world()
    const skin = await bodyOf({ kind: 'skin' })
    const plain = await bodyOf({})
    expect(contracts.skin.judge(skin, { capabilityName: 'sea' })).toEqual({ ok: true })
    expect(contracts.plugin.judge(plain, { capabilityName: 'sea' })).toEqual({ ok: true })
    expect(contracts.plugin.judge(skin)).toEqual({ ok: false, rejected: IS_A_SKIN })
    expect(contracts.skin.judge(plain)).toEqual({ ok: false, rejected: NOT_A_SKIN })
  })

  it('rejects a skin published under another name than its manifest writes', async () => {
    const { contracts } = world()
    expect(contracts.skin.judge(await bodyOf({ kind: 'skin' }), { capabilityName: 'ink' })).toEqual(
      {
        ok: false,
        rejected: 'the manifest names sea; it is published as ink',
      },
    )
  })
})
