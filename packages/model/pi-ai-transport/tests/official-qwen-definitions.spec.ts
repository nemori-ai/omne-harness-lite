import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '../src/index.ts'
import {
  qwenAlibabaModelIds,
  qwenDefinitions,
  qwenModelRoutes,
} from '../src/official-models/qwen.ts'

const imageBytes = 4 * 1024 * 1024
const expected = {
  'qwen/qwen3.8-max-0902': {
    input: ['image', 'text', 'video'],
    output: 131072,
    prompt: 983616,
    cache: 'explicit',
  },
  'qwen/qwen3.8-max-prime': {
    input: ['image', 'text', 'video'],
    output: 131072,
    prompt: 983616,
    cache: 'explicit',
  },
  'qwen/qwen3.8-flash': {
    input: ['image', 'text', 'video'],
    output: 131072,
    prompt: 983616,
    cache: 'automatic',
  },
  'qwen/qwen3.8-2.4t-a95b': { input: ['text'], output: 131072, prompt: null, cache: 'explicit' },
  'qwen/qwen3.8-27b': {
    input: ['image', 'text', 'video'],
    output: 131072,
    prompt: null,
    cache: 'explicit',
  },
  'qwen/qwen3.7-max': { input: ['text'], output: 131072, prompt: 983616, cache: 'explicit' },
  'qwen/qwen3.7-plus': {
    input: ['image', 'text'],
    output: 131072,
    prompt: 983616,
    cache: 'explicit',
  },
  'qwen/qwen3.7-flash': {
    input: ['image', 'text', 'video'],
    output: 65536,
    prompt: 983616,
    cache: 'automatic',
  },
} as const

function definitionFor(modelId: (typeof qwenAlibabaModelIds)[number]) {
  const definition = qwenDefinitions.find(value => value.modelId === modelId)
  if (!definition) throw new Error(`missing ${modelId}`)
  return definition
}

function configuration(modelId: (typeof qwenAlibabaModelIds)[number]) {
  return {
    revision: '1',
    values:
      expected[modelId].cache === 'automatic'
        ? { cache: { mode: 'automatic' } }
        : { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } },
  } as const
}

describe('official Qwen complete declarations (offline)', () => {
  it('publishes exactly eight owned definitions with exact selected Alibaba route and MP4 limits', () => {
    expect(qwenDefinitions.map(value => value.modelId)).toEqual(qwenAlibabaModelIds)
    for (const modelId of qwenAlibabaModelIds) {
      const definition = definitionFor(modelId)
      const row = expected[modelId]
      const facts = definition.capabilities.upstreamInputLimits
      const image = (row.input as readonly string[]).includes('image')
      expect(definition).toMatchObject({
        modelId,
        revision: '1',
        implementation: {
          name: 'pi-ai:qwen',
          revision:
            modelId === 'qwen/qwen3.8-max-0902' ||
            modelId === 'qwen/qwen3.8-2.4t-a95b' ||
            modelId === 'qwen/qwen3.8-27b'
              ? 'mp4-2'
              : 'mp4-1',
        },
        capabilities: {
          inputModalities: [...row.input],
          outputModalities: ['text'],
          maxInputTokens: 1000000 - row.output,
          maxOutputTokens: row.output,
          inputConstraints: image ? { maxImageBytes: imageBytes } : {},
        },
      })
      expect(definition.routes).toEqual(qwenModelRoutes[modelId])
      expect(Object.keys(definition.routes)).toEqual(['alibaba'])
      expect(facts.maxInputTokens).toEqual(
        row.prompt === null ? { status: 'unknown' } : { status: 'limited', value: row.prompt },
      )
      expect(facts.maxRequestBytes).toEqual({ status: 'unknown' })
      expect(Object.keys(facts).sort()).toEqual(
        image
          ? ['maxImageBytes', 'maxImages', 'maxInputTokens', 'maxRequestBytes'].sort()
          : ['maxInputTokens', 'maxRequestBytes'].sort(),
      )
      if (image) {
        expect(facts.maxImageBytes).toEqual({ status: 'unknown' })
        expect(facts.maxImages).toEqual({ status: 'unknown' })
      }
      expect(definition.routes.alibaba?.cache.mode).toBe(row.cache)
    }
  })

  it.each(qwenAlibabaModelIds)('%s reads and builds exact complete profile content', modelId => {
    const definition = definitionFor(modelId)
    const coordinates = {
      implementation: definition.implementation,
      definition: { modelId, revision: definition.revision },
    }
    expect(readModelDefinition(qwenDefinitions, coordinates)).toEqual({ ok: definition })
    const built = createOfficialProfileContent(definition, {
      providers: ['alibaba'],
      allowFallback: false,
      configuration: configuration(modelId),
    })
    if ('rejected' in built) throw new Error(`${modelId}: ${built.rejected}`)
    expect(built.ok).toMatchObject({
      routeName: modelId,
      origin: 'official',
      ...definition.capabilities,
      providers: ['alibaba'],
      allowFallback: false,
      adaptation: { ...coordinates, configuration: configuration(modelId) },
    })
    expect(judgeModelProfileDocument('ModelProfileContent', built.ok)).toEqual({ ok: true })
    expect(built.ok).not.toHaveProperty('registration')
    expect(built.ok).not.toHaveProperty('updatedAt')
    expect(
      readModelDefinition(qwenDefinitions, {
        ...coordinates,
        implementation: { ...coordinates.implementation, revision: 'old' },
      }),
    ).toEqual({ rejected: 'unavailable' })
    expect(
      createOfficialProfileContent(definition, {
        providers: ['not-alibaba'],
        allowFallback: false,
        configuration: configuration(modelId),
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(Reflect.set(definition.capabilities, 'maxInputTokens', 1)).toBe(false)
  })

  it('requires exact caller cache choice and does not install a TTL default', () => {
    for (const modelId of qwenAlibabaModelIds) {
      const definition = definitionFor(modelId)
      const schema = configurationSchema(definition, 'alibaba')
      if ('rejected' in schema) throw new Error(`${modelId}: ${schema.rejected}`)
      expect(writeJsonLossless(schema.ok)).not.toContain('"default"')
      expect(
        interpretConfiguration(definition, configuration(modelId).values, 'alibaba'),
      ).toHaveProperty('ok')
      for (const bad of [
        {},
        { cache: {} },
        { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['system'] } },
      ]) {
        expect(interpretConfiguration(definition, bad, 'alibaba')).toEqual({
          rejected: 'invalidInput',
        })
      }
      const wrongMode =
        expected[modelId].cache === 'automatic'
          ? { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } }
          : { cache: { mode: 'automatic' } }
      expect(interpretConfiguration(definition, wrongMode, 'alibaba')).toEqual({
        rejected: 'invalidInput',
      })
    }
  })

  it('refuses malformed upstream facts and project caps before publication', () => {
    const definition = definitionFor('qwen/qwen3.8-max-0902')
    const options = {
      providers: ['alibaba'],
      allowFallback: false,
      configuration: configuration('qwen/qwen3.8-max-0902'),
    }
    const variants = [
      { ...definition.capabilities, upstreamInputLimits: undefined },
      { ...definition.capabilities, inputConstraints: {} },
      {
        ...definition.capabilities,
        maxInputTokens: 983617,
        upstreamInputLimits: {
          ...definition.capabilities.upstreamInputLimits,
          maxInputTokens: { status: 'limited', value: 983616 },
        },
      },
      {
        ...definition.capabilities,
        upstreamInputLimits: {
          ...definition.capabilities.upstreamInputLimits,
          maxImages: { status: 'unbounded', value: 1 },
        },
      },
    ]
    for (const capabilities of variants) {
      const malformed = { ...definition, capabilities }
      expect(
        Reflect.apply(readModelDefinition, undefined, [
          [malformed],
          {
            implementation: definition.implementation,
            definition: { modelId: definition.modelId, revision: definition.revision },
          },
        ]),
      ).toEqual({ rejected: 'invalidInput' })
      expect(Reflect.apply(createOfficialProfileContent, undefined, [malformed, options])).toEqual({
        rejected: 'invalidInput',
      })
    }
  })
})
