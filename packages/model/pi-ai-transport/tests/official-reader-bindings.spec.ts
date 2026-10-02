// @module-tag slow
// 归慢层：重 CPU：为全部官方模型逐个构造真实输入计量器（加载真实分词器）并各规划一次请求。
import { testImagePreparerFor } from './image-transport-support.ts'
import { describe, expect, it } from 'vitest'
import before from './fixtures/shared-reader/before-mp4-17.json' with { type: 'json' }
import priorityRelease from './fixtures/shared-reader/priority-family-mp4-18.json' with { type: 'json' }
import nextRelease from './fixtures/shared-reader/deepseek-xai-current.json' with { type: 'json' }
import qwenOpenEffort from './fixtures/shared-reader/qwen-open-effort.json' with { type: 'json' }
import moonshotVisible from './fixtures/shared-reader/moonshot-visible-reasoning.json' with { type: 'json' }
import qwenVisible from './fixtures/shared-reader/qwen-visible-reasoning.json' with { type: 'json' }
import zaiVisible from './fixtures/shared-reader/zai-visible-reasoning.json' with { type: 'json' }
import qwenCommercial from './fixtures/shared-reader/qwen-commercial-public-template.json' with { type: 'json' }
import {
  openaiDefinitions,
  anthropicDefinitions,
  deepseekDefinitions,
  googleDefinitions,
  xaiDefinitions,
  qwenDefinitions,
  moonshotDefinitions,
  zaiDefinitions,
  createOpenAiInputMeter,
  createAnthropicInputMeter,
  createDeepSeekV4ProInputMeter,
  createDeepSeekV41FlashInputMeter,
  createGoogleInputMeter,
  createXaiInputMeter,
  createQwenInputMeter,
  createMoonshotInputMeter,
  createGlm52InputMeter,
  createGlm53InputMeter,
  createZaiCommercialInputMeter,
  createOfficialProfileContent,
  type ModelDefinition,
  type InputMeter,
} from '../src/index.ts'
import { planRequest } from '../src/plan.ts'
import { usageScope } from '../src/usage-scope.ts'
import { input, message } from './support.ts'

const definitions = [
  ...openaiDefinitions,
  ...anthropicDefinitions,
  ...deepseekDefinitions,
  ...googleDefinitions,
  ...xaiDefinitions,
  ...qwenDefinitions,
  ...moonshotDefinitions,
  ...zaiDefinitions,
]
const factories: Readonly<Record<string, (d: ModelDefinition) => InputMeter | undefined>> = {
  openai: createOpenAiInputMeter,
  anthropic: createAnthropicInputMeter,
  google: createGoogleInputMeter,
  xai: createXaiInputMeter,
  qwen: createQwenInputMeter,
  moonshot: createMoonshotInputMeter,
  deepseek: d =>
    d.modelId === 'deepseek/deepseek-v4.1-flash'
      ? createDeepSeekV41FlashInputMeter(d)
      : createDeepSeekV4ProInputMeter(d),
  zai: d =>
    d.modelId === 'z-ai/glm-5.2'
      ? createGlm52InputMeter(d)
      : ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash'].includes(d.modelId)
        ? createGlm53InputMeter(d)
        : createZaiCommercialInputMeter(d),
}
const successors: Readonly<Record<string, (typeof priorityRelease)[keyof typeof priorityRelease]>> =
  {
    ...priorityRelease,
    ...nextRelease,
    ...qwenOpenEffort,
    ...moonshotVisible,
    ...qwenVisible,
    ...zaiVisible,
    ...qwenCommercial,
  }

describe('Current official reader and priority-family releases', () => {
  it('enumerates exactly the frozen 37 supplied leaves', () => {
    expect(definitions.map(d => d.modelId).sort()).toEqual(before.map(d => d.modelId).sort())
    expect(new Set(definitions.map(d => d.modelId)).size).toBe(37)
  })
  it.each(before)(
    '$modelId factory/profile/plan use the current release and preserve unchanged facts',
    async row => {
      const definition = definitions.find(d => d.modelId === row.modelId)
      const factory = factories[row.family]
      if (!definition || !factory) throw Error('missing release leaf')
      const expected = successors[row.modelId] ?? { ...row, ...row.expected }
      expect(definition.revision).toBe(expected.definition)
      expect(definition.implementation).toEqual(expected.implementation)
      expect(definition.capabilities).toEqual(row.capabilities)
      const meter = factory(definition)
      if (!meter) throw Error('missing current meter')
      expect({
        algorithm: meter.algorithmRevision,
        tokenizer: meter.tokenizerRevision,
        replay: meter.replayRevision,
        transform: meter.transformRevision,
      }).toEqual({
        algorithm: expected.algorithm,
        tokenizer: expected.tokenizer,
        replay: expected.replay,
        transform: expected.transform,
      })
      expect(meter.definitionRevision).toBe(definition.revision)
      expect(meter.implementation).toEqual(definition.implementation)
      const route = definition.routes[meter.provider]
      if (!route) throw Error('missing fixed route')
      const cache = route.cache
      const ttl = cache.mode === 'explicit' ? cache.ttlValues[0] : undefined
      const breakpoints = cache.mode === 'explicit' ? cache.breakpointLayouts[0] : undefined
      if (cache.mode === 'explicit' && (!ttl || !breakpoints))
        throw Error('missing cache declaration')
      const profile = createOfficialProfileContent(definition, {
        providers: [meter.provider],
        allowFallback: false,
        configuration: {
          revision: 'reader-release-1',
          values: {
            cache:
              ttl && breakpoints ? { mode: 'explicit', ttl, breakpoints } : { mode: 'automatic' },
          },
        },
      })
      if ('rejected' in profile) throw Error(JSON.stringify(profile))
      const base = input()
      const result = await planRequest(
        {
          ...base,
          routeName: definition.modelId,
          provider: meter.provider,
          snapshot: {
            ...base.snapshot,
            ...definition.capabilities,
            adaptation: profile.ok.adaptation,
            providers: profile.ok.providers,
            allowFallback: false,
          },
          messages: [message('user', 'Hello')],
          tools: [],
          outputHistory: [],
          parameters: { maxOutputTokens: 16 },
          tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
        },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      )
      expect(result).toHaveProperty('planned')
      if (!('planned' in result)) throw Error(JSON.stringify(result))
      expect(result.planned.input.snapshot.adaptation).toEqual(profile.ok.adaptation)
      expect(result.planned.body).toMatchObject({
        model: row.modelId,
        provider: { order: [meter.provider], allow_fallbacks: false, require_parameters: true },
      })
      expect(result.planned.measurement.mode).toBe('full')
      if (row.family === 'openai' && row.modelId.endsWith('-pro'))
        expect(usageScope(row.modelId)).toBe('scope_unknown')
      let old: InputMeter | undefined
      try {
        old = factory({
          ...definition,
          revision: row.definition,
          implementation: row.implementation,
        })
      } catch {
        old = undefined
      }
      expect(old).toBeUndefined()
    },
  )
})
