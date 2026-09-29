import { describe, expect, it } from 'vitest'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '@omne-harness-lite/pi-ai-transport'
import { zaiDefinitions, zaiModelRoutes } from '../src/official-models/zai.ts'

const supplied = [
  { id: 'z-ai/glm-5.3', provider: 'z-ai/fp8', input: 917504, modalities: ['text'] },
  { id: 'z-ai/glm-5.3-prime', provider: 'alibaba', input: 868928, modalities: ['text'] },
  {
    id: 'z-ai/glm-5.3-flash',
    provider: 'z-ai/fp8',
    input: 917504,
    modalities: ['image', 'text', 'video'],
  },
  {
    id: 'z-ai/glm-5.3-flashx',
    provider: 'z-ai/fp8',
    input: 917504,
    modalities: ['image', 'text', 'video'],
  },
  { id: 'z-ai/glm-5.2', provider: 'z-ai/fp8', input: 917504, modalities: ['text'] },
] as const

describe('ZAI complete official declarations (MP4)', () => {
  it('publishes exactly five selected model/provider definitions with full input facts', () => {
    expect(zaiDefinitions).toHaveLength(supplied.length)
    expect(zaiDefinitions.map(value => value.modelId).sort()).toEqual(
      supplied.map(value => value.id).sort(),
    )
    for (const expected of supplied) {
      const definition = zaiDefinitions.find(value => value.modelId === expected.id)
      if (!definition) throw new Error(`missing ${expected.id}`)
      expect(definition.revision).toBe(expected.id === 'z-ai/glm-5.3-prime' ? '2' : '1')
      expect(definition.implementation).toEqual({
        name: 'pi-ai:zai',
        revision: expected.id === 'z-ai/glm-5.3-prime' ? 'mp4-2' : 'mp4-1',
      })
      expect(Object.keys(definition.routes)).toEqual([expected.provider])
      expect(Object.values(definition.routes)[0]).toEqual(
        Object.values(zaiModelRoutes[expected.id])[0],
      )
      expect(definition.capabilities.inputModalities).toEqual(expected.modalities)
      expect(definition.capabilities.outputModalities).toEqual(['text'])
      expect(definition.capabilities.maxInputTokens).toBe(expected.input)
      expect(definition.capabilities.maxOutputTokens).toBe(131072)
      expect(definition.capabilities.upstreamInputLimits).toEqual(
        expected.modalities.some(modality => modality === 'image')
          ? {
              maxInputTokens: { status: 'unknown' },
              maxRequestBytes: { status: 'unknown' },
              maxImageBytes: { status: 'unknown' },
              maxImages: { status: 'unknown' },
            }
          : {
              maxInputTokens: { status: 'unknown' },
              maxRequestBytes: { status: 'unknown' },
            },
      )
      expect(definition.capabilities.inputConstraints).toEqual(
        expected.modalities.some(modality => modality === 'image')
          ? { maxImageBytes: 4194304 }
          : {},
      )
    }
  })

  it.each(supplied)('$id reads by exact coordinates and produces judged MP4 content', expected => {
    const definition = zaiDefinitions.find(value => value.modelId === expected.id)
    if (!definition) throw new Error(`missing ${expected.id}`)
    const coordinates = {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
    }
    expect(readModelDefinition(zaiDefinitions, coordinates)).toEqual({ ok: definition })
    expect(
      readModelDefinition(zaiDefinitions, {
        ...coordinates,
        definition: { ...coordinates.definition, revision: 'old' },
      }),
    ).toEqual({ rejected: 'unavailable' })
    const configuration = {
      revision: '1',
      values:
        expected.provider === 'alibaba'
          ? { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } }
          : { cache: { mode: 'automatic' } },
    }
    const content = createOfficialProfileContent(definition, {
      providers: [expected.provider],
      allowFallback: false,
      configuration,
    })
    if ('rejected' in content) throw new Error(content.rejected)
    expect(content.ok.routeName).toBe(expected.id)
    expect(content.ok.providers).toEqual([expected.provider])
    expect(content.ok.upstreamInputLimits).toEqual(definition.capabilities.upstreamInputLimits)
    expect(judgeModelProfileDocument('ModelProfileContent', content.ok)).toEqual({ ok: true })
  })

  it('keeps Prime cache TTL caller-selected and does not install a schema default', () => {
    const prime = zaiDefinitions.find(value => value.modelId === 'z-ai/glm-5.3-prime')
    if (!prime) throw new Error('missing Prime')
    const selected = { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } }
    expect(interpretConfiguration(prime, selected, 'alibaba')).toEqual({
      ok: selected.cache,
    })
    for (const rejected of [
      {},
      { cache: { mode: 'automatic' } },
      { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
      { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } },
    ])
      expect(interpretConfiguration(prime, rejected, 'alibaba')).toEqual({
        rejected: 'invalidInput',
      })
    const schema = configurationSchema(prime, 'alibaba')
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
    expect(configurationSchema(prime, 'z-ai/fp8')).toEqual({ rejected: 'unavailable' })
  })

  it('keeps automatic fp8 caching free of manual TTL controls', () => {
    for (const definition of zaiDefinitions.filter(
      value => value.modelId !== 'z-ai/glm-5.3-prime',
    )) {
      expect(
        interpretConfiguration(definition, { cache: { mode: 'automatic' } }, 'z-ai/fp8'),
      ).toEqual({
        ok: { mode: 'automatic' },
      })
      expect(
        interpretConfiguration(
          definition,
          { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } },
          'z-ai/fp8',
        ),
      ).toEqual({ rejected: 'invalidInput' })
    }
  })
})
