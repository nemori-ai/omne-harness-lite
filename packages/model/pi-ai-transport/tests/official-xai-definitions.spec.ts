import { describe, expect, it } from 'vitest'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '@omne-harness-lite/pi-ai-transport'
import { xaiDefinitions, xaiModelRoutes } from '../src/official-models/xai.ts'

const expectedIds = ['x-ai/grok-4.7', 'x-ai/grok-4.6']
const configuration = { revision: '1', values: { cache: { mode: 'automatic' } } } as const

describe('xAI complete MP4 declarations', () => {
  it('publishes exactly the two selected Grok routes and owns each complete definition', () => {
    expect(xaiDefinitions.map(definition => definition.modelId)).toEqual(expectedIds)
    for (const definition of xaiDefinitions) {
      expect(definition).toMatchObject({
        revision: '1',
        implementation: { name: 'pi-ai:xai', revision: 'mp4-1' },
      })
      expect(Object.keys(definition.routes)).toEqual(['xai'])
      expect(definition.routes.xai).toEqual(
        definition.modelId === 'x-ai/grok-4.7'
          ? xaiModelRoutes['x-ai/grok-4.7'].xai
          : xaiModelRoutes['x-ai/grok-4.6'].xai,
      )
      expect(
        readModelDefinition(xaiDefinitions, {
          implementation: definition.implementation,
          definition: { modelId: definition.modelId, revision: definition.revision },
        }),
      ).toEqual({ ok: definition })
      expect(Reflect.set(definition.capabilities, 'maxInputTokens', 500000)).toBe(false)
      const imageFact = definition.capabilities.upstreamInputLimits.maxImageBytes
      if (!imageFact) throw new Error('missing required image fact')
      expect(Reflect.set(imageFact, 'status', 'unbounded')).toBe(false)
    }
  })

  it.each(expectedIds)(
    '%s preserves the project cap and unknown route facts in a valid profile',
    modelId => {
      const definition = xaiDefinitions.find(candidate => candidate.modelId === modelId)
      if (!definition) throw new Error(`missing ${modelId}`)
      const content = createOfficialProfileContent(definition, {
        providers: ['xai'],
        allowFallback: false,
        configuration,
      })
      if ('rejected' in content) throw new Error(content.rejected)
      expect(content.ok).toMatchObject({
        routeName: modelId,
        inputModalities: ['image', 'text'],
        outputModalities: ['text'],
        maxInputTokens: 50000,
        maxOutputTokens: 450000,
        inputConstraints: { maxImageBytes: 4194304 },
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
          maxImageBytes: { status: 'unknown' },
          maxImages: { status: 'unknown' },
        },
        providers: ['xai'],
        allowFallback: false,
        adaptation: {
          implementation: definition.implementation,
          definition: { modelId, revision: '1' },
          configuration,
        },
      })
      expect(judgeModelProfileDocument('ModelProfileContent', content.ok)).toEqual({ ok: true })
      expect(interpretConfiguration(definition, configuration.values, 'xai')).toEqual({
        ok: { mode: 'automatic' },
      })
      const schema = configurationSchema(definition, 'xai')
      if ('rejected' in schema) throw new Error(schema.rejected)
      expect(JSON.stringify(schema.ok)).not.toContain('default')
      expect(configurationSchema(definition, 'amazon-bedrock/us-west-2')).toEqual({
        rejected: 'unavailable',
      })
    },
  )

  it('rejects missing facts, missing image cap and a project cap above a known upstream limit', () => {
    const definition = xaiDefinitions[0]
    if (!definition) throw new Error('missing Grok definition')
    const { upstreamInputLimits } = definition.capabilities
    const invalidCapabilities = [
      {
        ...definition.capabilities,
        upstreamInputLimits: { maxInputTokens: upstreamInputLimits.maxInputTokens },
      },
      { ...definition.capabilities, inputConstraints: {} },
      {
        ...definition.capabilities,
        upstreamInputLimits: {
          ...upstreamInputLimits,
          maxImageBytes: { status: 'limited', value: 4194303 },
        },
      },
    ]
    for (const capabilities of invalidCapabilities) {
      const malformed = { ...definition, capabilities }
      const coordinates = {
        implementation: definition.implementation,
        definition: { modelId: definition.modelId, revision: definition.revision },
      }
      expect(Reflect.apply(readModelDefinition, undefined, [[malformed], coordinates])).toEqual({
        rejected: 'invalidInput',
      })
      expect(
        Reflect.apply(createOfficialProfileContent, undefined, [
          malformed,
          {
            providers: ['xai'],
            allowFallback: false,
            configuration,
          },
        ]),
      ).toEqual({ rejected: 'invalidInput' })
    }
  })
})
