import { describe, expect, it } from 'vitest'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { readModelDefinition } from '../src/definitions.ts'
import {
  deepseekDefinitions,
  deepseekModelRoutes,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
} from '../src/official-models/deepseek.ts'

const provider = 'deepinfra/fp8'

describe('two complete DeepSeek MP4 declarations', () => {
  it('publishes exact identities, selected route and full-output-reserving project limits', () => {
    expect(deepseekDefinitions).toHaveLength(2)
    expect(deepseekDefinitions).toEqual([deepseekV41FlashDefinition, deepseekV4Pro0813Definition])
    for (const [definition, revision, implementationRevision, maxInputTokens, maxOutputTokens] of [
      [deepseekV41FlashDefinition, '5', 'mp4-19', 917504, 131072],
      [deepseekV4Pro0813Definition, '6', 'mp4-19', 1032192, 16384],
    ] as const) {
      expect(definition.revision).toBe(revision)
      expect(definition.implementation).toEqual({
        name: 'pi-ai:deepseek',
        revision: implementationRevision,
      })
      expect(definition.capabilities.maxInputTokens).toBe(maxInputTokens)
      expect(definition.capabilities.maxOutputTokens).toBe(maxOutputTokens)
      expect(maxInputTokens + maxOutputTokens).toBe(1048576)
      expect(definition.routes).toEqual(
        Object.entries(deepseekModelRoutes).find(
          ([modelId]) => modelId === definition.modelId,
        )?.[1],
      )
      expect(Object.keys(definition.routes)).toEqual([provider])
      expect(
        readModelDefinition(deepseekDefinitions, {
          implementation: definition.implementation,
          definition: { modelId: definition.modelId, revision },
        }),
      ).toEqual({ ok: definition })
    }
    expect(
      readModelDefinition(deepseekDefinitions, {
        implementation: { name: 'pi-ai:deepseek', revision: 'd095-1' },
        definition: { modelId: deepseekV4Pro0813Definition.modelId, revision: '1' },
      }),
    ).toEqual({ rejected: 'unavailable' })
  })

  it('preserves image support with a finite project cap and unknown selected-route facts', () => {
    const flash = deepseekV41FlashDefinition.capabilities
    expect(flash.inputModalities).toEqual(['image', 'text'])
    expect(flash.inputConstraints).toEqual({ maxImageBytes: 4194304 })
    expect(flash.upstreamInputLimits).toEqual({
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
      maxImageBytes: { status: 'unknown' },
      maxImages: { status: 'unknown' },
    })
    const pro = deepseekV4Pro0813Definition.capabilities
    expect(pro.inputModalities).toEqual(['text'])
    expect(pro.inputConstraints).toEqual({})
    expect(pro.upstreamInputLimits).toEqual({
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    })
  })

  it('constructs valid complete profile contents with explicit automatic-cache configurations', () => {
    for (const [definition, configuration] of [
      [deepseekV41FlashDefinition, deepseekV41FlashConfiguration],
      [deepseekV4Pro0813Definition, deepseekV4Pro0813Configuration],
    ] as const) {
      const result = createOfficialProfileContent(definition, {
        providers: [provider],
        allowFallback: false,
        configuration,
      })
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.ok.upstreamInputLimits).toEqual(definition.capabilities.upstreamInputLimits)
      expect(result.ok.inputConstraints).toEqual(definition.capabilities.inputConstraints)
      expect(result.ok.adaptation).toEqual({
        implementation: definition.implementation,
        definition: { modelId: definition.modelId, revision: definition.revision },
        configuration,
      })
      expect(judgeModelProfileDocument('ModelProfileContent', result.ok)).toEqual({ ok: true })
    }
  })

  it('rejects missing image cap and false upstream fact instead of repairing a declaration', () => {
    const definition = deepseekV41FlashDefinition
    for (const capabilities of [
      { ...definition.capabilities, inputConstraints: {} },
      {
        ...definition.capabilities,
        upstreamInputLimits: {
          ...definition.capabilities.upstreamInputLimits,
          maxImageBytes: { status: 'limited', value: 4194303 },
        },
      },
    ]) {
      expect(
        Reflect.apply(readModelDefinition, undefined, [
          [{ ...definition, capabilities }],
          {
            implementation: definition.implementation,
            definition: { modelId: definition.modelId, revision: definition.revision },
          },
        ]),
      ).toEqual({ rejected: 'invalidInput' })
    }
    expect(Reflect.set(definition.capabilities.inputConstraints, 'maxImageBytes', 1)).toBe(false)
    expect(
      Reflect.set(
        definition.capabilities.upstreamInputLimits.maxImageBytes ?? {},
        'status',
        'unbounded',
      ),
    ).toBe(false)
  })
})
