import { describe, expect, it } from 'vitest'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '../src/index.ts'
import { anthropicDefinitions, anthropicModelRoutes } from '../src/official-models/anthropic.ts'

const expectedIds = [
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-fable-5.1',
]
const selectedProvider = 'anthropic'
const configuredCache = {
  revision: '1',
  values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
}

describe('four complete Anthropic official definitions', () => {
  it('reads exactly the confirmed models with complete MP4 limits and exact selected routes', () => {
    expect(anthropicDefinitions.map(value => value.modelId)).toEqual(expectedIds)
    for (const definition of anthropicDefinitions) {
      expect(
        readModelDefinition(anthropicDefinitions, {
          implementation: { name: 'pi-ai:anthropic', revision: 'mp4-5' },
          definition: { modelId: definition.modelId, revision: '2' },
        }),
      ).toEqual({ ok: definition })
      expect(definition.capabilities).toEqual({
        inputModalities: ['image', 'text'],
        outputModalities: ['text'],
        maxInputTokens: 1000000 - 128000,
        maxOutputTokens: 128000,
        inputConstraints: { maxImageBytes: 4194304 },
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
          maxImageBytes: { status: 'unknown' },
          maxImages: { status: 'unknown' },
        },
      })
      const selected = Object.entries(anthropicModelRoutes).find(
        ([modelId]) => modelId === definition.modelId,
      )
      expect(definition.routes).toEqual(selected?.[1])
      expect(Object.keys(definition.routes)).toEqual([selectedProvider])
      expect(definition.routes[selectedProvider]?.reminderRole).toBe('user')
    }
    expect(
      readModelDefinition(anthropicDefinitions, {
        implementation: { name: 'pi-ai:anthropic', revision: 'mp4-5' },
        definition: { modelId: 'anthropic/claude-unlisted', revision: '2' },
      }),
    ).toEqual({ rejected: 'unavailable' })
  })

  it.each(expectedIds)(
    '%s builds full official profile content only from caller cache configuration',
    id => {
      const definition = anthropicDefinitions.find(value => value.modelId === id)
      if (!definition) throw new Error('missing confirmed Anthropic definition')
      const profile = createOfficialProfileContent(definition, {
        providers: [selectedProvider],
        allowFallback: false,
        configuration: configuredCache,
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      expect(profile.ok.routeName).toBe(id)
      expect(profile.ok.adaptation).toEqual({
        implementation: definition.implementation,
        definition: { modelId: id, revision: definition.revision },
        configuration: configuredCache,
      })
      expect(profile.ok).toMatchObject(definition.capabilities)
    },
  )

  it.each(expectedIds)('%s requires an explicit supported TTL and attachable breakpoint', id => {
    const definition = anthropicDefinitions.find(value => value.modelId === id)
    if (!definition) throw new Error('missing confirmed Anthropic definition')
    const schema = configurationSchema(definition, selectedProvider)
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('"default"')
    expect(interpretConfiguration(definition, configuredCache.values, selectedProvider)).toEqual({
      ok: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] },
    })
    for (const cache of [
      { mode: 'explicit', breakpoints: ['last_message'] },
      { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] },
      { mode: 'explicit', ttl: '1h', breakpoints: ['system'] },
      { mode: 'automatic' },
    ]) {
      expect(interpretConfiguration(definition, { cache }, selectedProvider)).toEqual({
        rejected: 'invalidInput',
      })
      expect(
        createOfficialProfileContent(definition, {
          providers: [selectedProvider],
          allowFallback: false,
          configuration: { revision: '1', values: { cache } },
        }),
      ).toEqual({ rejected: 'invalidInput' })
    }
  })
})
