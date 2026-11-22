import { capabilityId, type AssetLayerSource } from '@omne-harness/assets'
import { broughtDefinitionsPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { parseConverterBody } from '@omne-harness/media-adapters'
import { converterCategoryPlugin } from '@omne-harness/media-adapters/cordis'
import { mediaConvertersPoint } from '@omne-harness/media-cordis-contract/cordis'
import { skillCategoryPlugin } from '@omne-harness/skill-host-local/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import {
  converterLayersOf,
  officialConverterBody,
  officialConverterItems,
  releaseConverters,
} from '../../src/assets/converters.ts'
import { heldRegistry } from '../support/held-registry.ts'

const id = (category: string, name: string) => {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error(name)
  return made.id
}

it('the release carries two converter definitions: voice and PDF, each judged sound', () => {
  expect(
    releaseConverters().map(item => [item.name, parseConverterBody(item.body, item.name)]),
  ).toEqual([
    ['voice', { ok: expect.objectContaining({ kind: 'voice', engine: 'voice.transcribe' }) }],
    [
      'application-pdf',
      { ok: expect.objectContaining({ kind: 'application-pdf', engine: 'pdf.extract-text' }) },
    ],
  ])
  for (const item of releaseConverters()) expect(item.version).toMatch(/^[0-9a-f]{64}$/u)
})

/** The official layer one tenant reads, on a tree where the release has brought its converters as the row does. */
async function officialLayer(): Promise<AssetLayerSource> {
  const registry = await heldRegistry([converterCategoryPlugin, skillCategoryPlugin])
  const brought = officialConverterItems()
  await registry.root.plugin(
    broughtDefinitionsPlugin('media-converters', mediaConvertersPoint.name, brought),
  )
  const [official] = registry.held.sourcesOf(async () => undefined)('tenant-a')
  if (official === undefined) throw new Error('no official layer')
  return official
}

it('the official layer offers them as candidates that are never disabled, and nothing else', async () => {
  const source = await officialLayer()
  expect(source.layer).toBe('official')
  const voice = await source.candidates(id('converter', 'voice'))
  expect(voice).toEqual({
    layer: 'official',
    state: 'read',
    candidates: [
      {
        asset: 'official/converter/voice',
        version: releaseConverters()[0]!.version,
        disabled: false,
        immutable: false,
        replaceLocked: false,
      },
    ],
  })
  expect(await source.candidates(id('converter', 'image'))).toEqual({
    layer: 'official',
    state: 'read',
    candidates: [],
  })
  expect(await source.candidates(id('skill', 'voice'))).toEqual({
    layer: 'official',
    state: 'read',
    candidates: [],
  })
})

it('reads the body of an official candidate, and nothing for any other', () => {
  const [voice] = releaseConverters()
  expect(officialConverterBody('official/converter/voice')).toBe(voice!.body)
  expect(officialConverterBody('official/converter/image')).toBeUndefined()
  expect(officialConverterBody('tenant/converter/voice')).toBeUndefined()
})

describe('the layers of one tenant', () => {
  const tenantText = JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  })
  const tenant = (() => {
    const parsed = tenantCodec.parse(tenantText)
    if (!parsed.ok) throw new Error('the test tenant text is not legal')
    return parsed.value
  })()
  const mine = { kind: 'object', entries: [] } as const
  const layer = (name: 'official' | 'tenant'): AssetLayerSource => ({
    layer: name,
    list: async () => ({ layer: name, state: 'not-applicable' }),
    candidates: async () => ({ layer: name, state: 'read', candidates: [] }),
  })
  const twoLayers = () => [layer('official'), layer('tenant')]
  function assets(version: { kind: string; version?: { body: unknown } }) {
    const asked: unknown[] = []
    const local = {
      listHeld: async () => ({ kind: 'rejected', reason: 'unavailable' }),
      readHeldCapability: async () => ({ kind: 'absent' }),
      readVersion: async (input: unknown) => {
        asked.push(input)
        return version
      },
    }
    return { asked, local: local as never }
  }

  it('opens the assets of the tenant by its text, and answers nothing when they cannot be had', async () => {
    const opened: string[] = []
    const none = converterLayersOf(async ref => {
      opened.push(ref)
      return undefined
    }, twoLayers)
    expect(await none(tenant)).toBeUndefined()
    expect(opened).toEqual([tenantText])
  })

  it('puts the official layer before the tenant one, and reads an official body without the assets', async () => {
    const { asked, local } = assets({ kind: 'absent' })
    const layers = await converterLayersOf(async () => local, twoLayers)(tenant)
    expect(layers?.sources.map(source => source.layer)).toEqual(['official', 'tenant'])
    const voice = releaseConverters()[0]!
    const official = { asset: 'official/converter/voice', version: voice.version }
    expect(
      await layers?.body({ ...official, disabled: false, immutable: false, replaceLocked: false }),
    ).toBe(voice.body)
    expect(asked).toEqual([])
  })

  it("reads a tenant's body from the version it selects, and nothing when the version is not there", async () => {
    const candidate = {
      asset: 'tenant-asset-1',
      version: 'v1',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    const held = assets({ kind: 'version', version: { body: mine } })
    const layers = await converterLayersOf(async () => held.local, twoLayers)(tenant)
    expect(await layers?.body(candidate)).toBe(mine)
    expect(held.asked).toEqual([{ assetRef: 'tenant-asset-1', version: 'v1' }])
    const gone = assets({ kind: 'absent' })
    expect(
      await (await converterLayersOf(async () => gone.local, twoLayers)(tenant))?.body(candidate),
    ).toBeUndefined()
  })
})
