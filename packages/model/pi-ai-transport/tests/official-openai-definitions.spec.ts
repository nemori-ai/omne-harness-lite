import { describe, expect, it } from 'vitest'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import {
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '../src/index.ts'
import {
  openaiConfiguration,
  openaiDefinitions,
  openaiModelRoutes,
} from '../src/official-models/openai.ts'

const ids = [
  'openai/gpt-6-astra',
  'openai/gpt-6-astra-pro',
  'openai/gpt-6-sol',
  'openai/gpt-6-sol-pro',
  'openai/gpt-6-luna',
  'openai/gpt-6-luna-pro',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
] as const

describe('OpenAI complete MP4 definitions (offline declaration checks)', () => {
  it('publishes exactly the fixed 12 models and each selected provider route', () => {
    expect(openaiDefinitions.map(value => value.modelId)).toEqual(ids)
    expect(Object.keys(openaiModelRoutes)).toEqual(ids)
    for (const definition of openaiDefinitions) {
      expect(Object.keys(definition.routes)).toEqual(['openai'])
      const selected = Object.entries(openaiModelRoutes).find(([id]) => id === definition.modelId)
      expect(definition.routes.openai).toEqual(selected?.[1].openai)
      expect(definition.routes.openai?.reminderRole).toBe('developer')
      expect(definition.routes.openai?.cache).toEqual({ mode: 'automatic' })
    }
  })

  it.each(ids)(
    '%s reads and constructs a complete official profile without default configuration',
    modelId => {
      const definition = openaiDefinitions.find(value => value.modelId === modelId)
      if (!definition) throw new Error('missing selected OpenAI definition')
      const coordinates = {
        implementation: definition.implementation,
        definition: { modelId, revision: definition.revision },
      }
      const read = readModelDefinition(openaiDefinitions, coordinates)
      if ('rejected' in read) throw new Error(read.rejected)
      expect(read.ok).toEqual(definition)
      const pro = [
        'openai/gpt-6-astra-pro',
        'openai/gpt-6-sol-pro',
        'openai/gpt-6-luna-pro',
        'openai/gpt-5.6-sol-pro',
        'openai/gpt-5.6-terra-pro',
        'openai/gpt-5.6-luna-pro',
      ].includes(modelId)
      const astraTextMetered = modelId === 'openai/gpt-6-astra'
      const gpt6ProMetered = [
        'openai/gpt-6-astra-pro',
        'openai/gpt-6-sol-pro',
        'openai/gpt-6-luna-pro',
      ].includes(modelId)
      const metered = modelId.startsWith('openai/gpt-5.6-')
      const solTextMetered = modelId === 'openai/gpt-6-sol'
      const lunaHistoryMetered = modelId === 'openai/gpt-6-luna'
      expect(definition.implementation).toEqual({
        name: 'pi-ai:openai',
        revision: astraTextMetered
          ? 'mp4-10'
          : gpt6ProMetered
            ? 'mp4-8'
            : pro
              ? 'mp4-13'
              : metered
                ? 'mp4-12'
                : lunaHistoryMetered
                  ? 'mp4-9'
                  : solTextMetered
                    ? 'mp4-6'
                    : 'mp4-1',
      })
      expect(definition.revision).toBe(
        gpt6ProMetered
          ? '3'
          : astraTextMetered
            ? '3'
            : pro
              ? metered
                ? '6'
                : '2'
              : metered
                ? '6'
                : lunaHistoryMetered
                  ? '4'
                  : solTextMetered
                    ? '3'
                    : '1',
      )
      expect(definition.capabilities).toEqual({
        inputModalities: ['image', 'text'],
        outputModalities: ['text'],
        maxInputTokens: 922000,
        maxOutputTokens: 128000,
        inputConstraints: { maxImageBytes: 4194304 },
        upstreamInputLimits: {
          maxInputTokens: { status: 'limited', value: 922000 },
          maxRequestBytes: { status: 'unknown' },
          maxImageBytes: { status: 'unknown' },
          maxImages: { status: 'unknown' },
        },
      })
      expect(interpretConfiguration(definition, openaiConfiguration.values, 'openai')).toEqual({
        ok: { mode: 'automatic' },
      })
      const profile = createOfficialProfileContent(read.ok, {
        providers: ['openai'],
        allowFallback: false,
        configuration: openaiConfiguration,
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      expect(judgeModelProfileDocument('ModelProfileContent', profile.ok)).toEqual({ ok: true })
      expect(profile.ok).toMatchObject({
        routeName: modelId,
        origin: 'official',
        adaptation: { ...coordinates, configuration: openaiConfiguration },
        ...definition.capabilities,
      })
      expect(profile.ok).not.toHaveProperty('registration')
      expect(profile.ok).not.toHaveProperty('updatedAt')
    },
  )

  it('refuses an upstream limit below the project cap and an invented cache TTL', () => {
    const definition = openaiDefinitions[0]
    if (!definition) throw new Error('missing selected OpenAI definition')
    const invalid = {
      ...definition,
      capabilities: {
        ...definition.capabilities,
        upstreamInputLimits: {
          ...definition.capabilities.upstreamInputLimits,
          maxInputTokens: { status: 'limited' as const, value: 921999 },
        },
      },
    }
    expect(
      readModelDefinition([invalid], {
        implementation: definition.implementation,
        definition: { modelId: definition.modelId, revision: definition.revision },
      }),
    ).toEqual({ rejected: 'invalidInput' })
    expect(
      interpretConfiguration(
        definition,
        { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } },
        'openai',
      ),
    ).toEqual({ rejected: 'invalidInput' })
  })

  it('returns immutable copies so a caller cannot alter another read', () => {
    const definition = openaiDefinitions[0]
    if (!definition) throw new Error('missing selected OpenAI definition')
    const coordinates = {
      implementation: definition.implementation,
      definition: { modelId: definition.modelId, revision: definition.revision },
    }
    const first = readModelDefinition(openaiDefinitions, coordinates)
    if ('rejected' in first) throw new Error(first.rejected)
    expect(Reflect.set(first.ok.capabilities.inputConstraints, 'maxImageBytes', 1)).toBe(false)
    const second = readModelDefinition(openaiDefinitions, coordinates)
    if ('rejected' in second) throw new Error(second.rejected)
    expect(second.ok.capabilities.inputConstraints.maxImageBytes).toBe(4194304)
  })
})
