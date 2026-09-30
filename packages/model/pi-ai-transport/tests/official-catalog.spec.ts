import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import fingerprint from './fixtures/official-catalog/fingerprint.json' with { type: 'json' }
import * as pkg from '../src/index.ts'
import {
  anthropicDefinitions,
  createOfficialCatalogProfile,
  deepseekDefinitions,
  googleDefinitions,
  interpretConfiguration,
  moonshotDefinitions,
  officialCatalog,
  officialCatalogRevision,
  officialModelIds,
  openaiDefinitions,
  qwenDefinitions,
  xaiDefinitions,
  zaiDefinitions,
  type ModelDefinition,
} from '../src/index.ts'

const familyExports: Readonly<Record<string, readonly ModelDefinition[]>> = {
  openai: openaiDefinitions,
  anthropic: anthropicDefinitions,
  google: googleDefinitions,
  deepseek: deepseekDefinitions,
  xai: xaiDefinitions,
  qwen: qwenDefinitions,
  moonshot: moonshotDefinitions,
  zai: zaiDefinitions,
}

describe('official catalog', () => {
  it('lists exactly the official identities once each, grouped by their family export', () => {
    const ids = officialCatalog.map(entry => entry.definition.modelId)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...officialModelIds].sort())
    expect(ids).toHaveLength(37)
    const counts: Record<string, number> = {}
    for (const entry of officialCatalog) {
      counts[entry.family] = (counts[entry.family] ?? 0) + 1
      expect(familyExports[entry.family]).toContain(entry.definition)
    }
    expect(counts).toEqual({
      openai: 12,
      anthropic: 4,
      google: 2,
      deepseek: 2,
      xai: 2,
      qwen: 8,
      moonshot: 2,
      zai: 5,
    })
  })

  it.each(officialCatalog.map(entry => [entry.definition.modelId, entry] as const))(
    '%s pins one route, builds its meter and an accepted profile with the declared cache',
    (_modelId, entry) => {
      const routes = Object.keys(entry.definition.routes)
      expect(routes).toEqual([entry.provider])
      const declaration = entry.definition.routes[entry.provider]?.cache
      if (declaration === undefined) throw new Error('route missing')
      expect(entry.cache).toEqual(
        declaration.mode === 'automatic'
          ? { mode: 'automatic' }
          : {
              mode: 'explicit',
              ttl: declaration.ttlValues[0],
              breakpoints: declaration.breakpointLayouts[0],
            },
      )
      expect(
        interpretConfiguration(entry.definition, { cache: entry.cache }, entry.provider),
      ).toEqual({ ok: entry.cache })

      const meter = entry.createInputMeter(entry.definition)
      expect(meter.modelId).toBe(entry.definition.modelId)
      expect(meter.definitionRevision).toBe(entry.definition.revision)
      expect(meter.implementation).toEqual(entry.definition.implementation)
      expect(meter.provider).toBe(entry.provider)

      const profile = createOfficialCatalogProfile(entry, 'catalog-test-1')
      if (!('ok' in profile)) throw new Error(`profile rejected: ${profile.rejected}`)
      expect(profile.ok.routeName).toBe(entry.definition.modelId)
      expect(profile.ok.providers).toEqual([entry.provider])
      expect(profile.ok.allowFallback).toBe(false)
      expect(profile.ok.adaptation.configuration).toEqual({
        revision: 'catalog-test-1',
        values: { cache: entry.cache },
      })
    },
    30_000,
  )

  it('rejects a definition its bound factory does not own instead of building a meter', () => {
    const google = officialCatalog.find(entry => entry.family === 'google')
    const qwen = officialCatalog.find(entry => entry.family === 'qwen')
    if (!google || !qwen) throw new Error('family missing')
    expect(() =>
      google.createInputMeter({ ...google.definition, revision: 'not-the-published-one' }),
    ).toThrow(TypeError)
    expect(() => qwen.createInputMeter(google.definition)).toThrow(TypeError)
  })

  it('names an exported package factory for every leaf and lists each ZAI leaf explicitly', () => {
    for (const entry of officialCatalog)
      expect(typeof (pkg as Record<string, unknown>)[entry.inputMeterFactory]).toBe('function')
    expect(
      Object.fromEntries(
        officialCatalog
          .filter(entry => entry.family === 'zai' || entry.family === 'deepseek')
          .map(entry => [entry.definition.modelId, entry.inputMeterFactory]),
      ),
    ).toEqual({
      'deepseek/deepseek-v4.1-flash': 'createDeepSeekV41FlashInputMeter',
      'deepseek/deepseek-v4-pro-0813': 'createDeepSeekV4ProInputMeter',
      'z-ai/glm-5.2': 'createGlm52InputMeter',
      'z-ai/glm-5.3': 'createGlm53InputMeter',
      'z-ai/glm-5.3-flash': 'createGlm53InputMeter',
      'z-ai/glm-5.3-prime': 'createZaiCommercialInputMeter',
      'z-ai/glm-5.3-flashx': 'createZaiCommercialInputMeter',
    })
  })

  it('raises officialCatalogRevision whenever the catalog fingerprint changes', () => {
    const leaves = officialCatalog
      .map(entry => {
        const meter = entry.createInputMeter(entry.definition)
        return {
          modelId: entry.definition.modelId,
          definition: entry.definition.revision,
          implementation: `${entry.definition.implementation.name}@${entry.definition.implementation.revision}`,
          algorithm: meter.algorithmRevision,
          factory: entry.inputMeterFactory,
        }
      })
      .sort((left, right) => (left.modelId < right.modelId ? -1 : 1))
    const digest = createHash('sha256').update(JSON.stringify(leaves)).digest('hex')
    const history = fingerprint.history
    // Revisions count up from 1 without gaps and each names a distinct catalog.
    expect(history.map(item => item.revision)).toEqual(history.map((_item, index) => index + 1))
    expect(new Set(history.map(item => item.sha256)).size).toBe(history.length)
    // Changing the catalog means: raise the revision and append its fingerprint; never rewrite.
    expect({ leaves, digest }).toEqual({
      leaves: fingerprint.leaves,
      digest: history.at(-1)?.sha256,
    })
    expect(officialCatalogRevision).toBe(history.at(-1)?.revision)
  }, 60_000)

  it('fails at module load when a ZAI leaf has no explicit meter binding', async () => {
    vi.resetModules()
    vi.doMock('../src/official-models/zai.ts', async importOriginal => {
      const actual = await importOriginal<typeof import('../src/official-models/zai.ts')>()
      const [first] = actual.zaiDefinitions
      if (first === undefined) throw new Error('ZAI definitions missing')
      return {
        ...actual,
        zaiDefinitions: [...actual.zaiDefinitions, { ...first, modelId: 'z-ai/glm-unlisted' }],
      }
    })
    try {
      await expect(import('../src/official-catalog.ts')).rejects.toThrow(
        'official model z-ai/glm-unlisted has no input meter binding',
      )
    } finally {
      vi.doUnmock('../src/official-models/zai.ts')
      vi.resetModules()
    }
  })

  it('fails at module load when an official identity has no catalog entry', async () => {
    vi.resetModules()
    vi.doMock('../src/official.ts', () => ({
      officialModelIds: Object.freeze([...officialModelIds, 'example/unbound-leaf']),
    }))
    try {
      await expect(import('../src/official-catalog.ts')).rejects.toThrow(
        'official catalog differs from officialModelIds',
      )
    } finally {
      vi.doUnmock('../src/official.ts')
      vi.resetModules()
    }
  })
})
