import { describe, expect, it } from 'vitest'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '../src/index.ts'
import { ownDefinitions } from '../src/definitions.ts'
import { googleDefinitions, googleModelRoutes } from '../src/official-models/google.ts'

const ids = ['google/gemini-3.8-flash', 'google/gemini-3.7-flash'] as const
const configuration = { revision: '1', values: { cache: { mode: 'automatic' } } } as const

describe('complete Google Flash declarations', () => {
  it('publishes precisely two selected Google AI Studio definitions with complete MP4 facts', () => {
    expect(googleDefinitions.map(definition => definition.modelId)).toEqual(ids)
    for (const id of ids) {
      const definition = googleDefinitions.find(item => item.modelId === id)
      if (!definition) throw new Error(`Google definition missing: ${id}`)
      expect(definition.implementation).toEqual({ name: 'pi-ai:google', revision: 'mp4-2' })
      expect(definition.revision).toBe('1')
      expect(Object.keys(definition.routes)).toEqual(['google-ai-studio'])
      expect(definition.routes['google-ai-studio']).toEqual(
        googleModelRoutes[id]['google-ai-studio'],
      )
      expect(Object.keys(googleModelRoutes[id]).sort()).toEqual([
        'google-ai-studio',
        'google-vertex',
      ])
      expect(definition.capabilities).toEqual({
        inputModalities: ['audio', 'image', 'text', 'video'],
        outputModalities: ['text'],
        maxInputTokens: 983040,
        maxOutputTokens: 65536,
        inputConstraints: { maxImageBytes: 4194304 },
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
          maxImageBytes: { status: 'unknown' },
          maxImages: { status: 'unknown' },
        },
      })
    }
  })

  it.each(ids)(
    '%s reads by full identity and constructs the same complete official content',
    id => {
      const found = readModelDefinition(googleDefinitions, {
        implementation: { name: 'pi-ai:google', revision: 'mp4-2' },
        definition: { modelId: id, revision: '1' },
      })
      if ('rejected' in found) throw new Error(found.rejected)
      const profile = createOfficialProfileContent(found.ok, {
        providers: ['google-ai-studio'],
        allowFallback: false,
        configuration,
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      expect(profile.ok.routeName).toBe(id)
      expect(profile.ok.origin).toBe('official')
      expect(profile.ok.providers).toEqual(['google-ai-studio'])
      expect(profile.ok.allowFallback).toBe(false)
      expect(profile.ok.adaptation).toEqual({
        implementation: found.ok.implementation,
        definition: { modelId: id, revision: '1' },
        configuration,
      })
      for (const key of [
        'inputModalities',
        'outputModalities',
        'maxInputTokens',
        'maxOutputTokens',
        'inputConstraints',
        'upstreamInputLimits',
      ] as const)
        expect(profile.ok[key]).toEqual(found.ok.capabilities[key])
      expect(judgeModelProfileDocument('ModelProfileContent', profile.ok)).toHaveProperty('ok')
    },
  )

  it('uses caller-supplied automatic cache configuration without a TTL or fallback provider', () => {
    for (const definition of googleDefinitions) {
      expect(interpretConfiguration(definition, configuration.values, 'google-ai-studio')).toEqual({
        ok: { mode: 'automatic' },
      })
      expect(
        interpretConfiguration(
          definition,
          { cache: { mode: 'explicit', ttl: '1h' } },
          'google-ai-studio',
        ),
      ).toEqual({ rejected: 'invalidInput' })
      expect(interpretConfiguration(definition, configuration.values, 'google-vertex')).toEqual({
        rejected: 'unavailable',
      })
      const schema = configurationSchema(definition, 'google-ai-studio')
      if ('rejected' in schema) throw new Error(schema.rejected)
      expect(JSON.stringify(schema.ok)).not.toContain('default')
    }
  })

  it('does not turn an unknown upstream limit into an absent, unbounded, or invented finite fact', () => {
    const original = googleDefinitions[0]
    if (!original) throw new Error('Google definition missing')
    const missing = {
      ...original,
      capabilities: {
        ...original.capabilities,
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
          maxImageBytes: { status: 'unknown' },
        },
      },
    }
    expect(() => Reflect.apply(ownDefinitions, undefined, [[missing]])).toThrow(TypeError)
    expect(() =>
      Reflect.apply(ownDefinitions, undefined, [
        [
          {
            ...original,
            capabilities: {
              ...original.capabilities,
              upstreamInputLimits: {
                ...original.capabilities.upstreamInputLimits,
                maxInputTokens: { status: 'limited', value: 983039 },
              },
            },
          },
        ],
      ]),
    ).toThrow(TypeError)
    expect(original.capabilities.upstreamInputLimits.maxInputTokens).toEqual({ status: 'unknown' })
  })
})
