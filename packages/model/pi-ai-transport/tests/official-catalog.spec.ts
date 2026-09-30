import { describe, expect, it, vi } from 'vitest'
import {
  anthropicDefinitions,
  createOfficialCatalogProfile,
  deepseekDefinitions,
  googleDefinitions,
  interpretConfiguration,
  moonshotDefinitions,
  officialCatalog,
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
