import { describe, expect, it } from 'vitest'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  officialDefinitions,
  pilotDefinitions,
  planRequest,
  type ModelDefinition,
  type PlannedRequest,
} from '@omne-harness-lite/pi-ai-transport'
import { input } from './support.ts'

interface ExpectedDefinition {
  modelId: string
  family: string
  route: string
  mode: 'automatic' | 'explicit'
  reminderRole: 'developer' | 'user'
}

// Independent expectations from D076's adopted model table and confirmed list.
const expected: ExpectedDefinition[] = [
  ...[
    'gpt-6-astra',
    'gpt-6-astra-pro',
    'gpt-6-sol',
    'gpt-6-sol-pro',
    'gpt-6-luna',
    'gpt-6-luna-pro',
    'gpt-5.6-sol',
    'gpt-5.6-sol-pro',
    'gpt-5.6-terra',
    'gpt-5.6-terra-pro',
    'gpt-5.6-luna',
    'gpt-5.6-luna-pro',
  ].map((name): ExpectedDefinition => ({
    modelId: `openai/${name}`,
    family: 'openai',
    route: 'openai',
    mode: 'automatic',
    reminderRole: 'developer',
  })),
  ...['claude-opus-5.5', 'claude-opus-5', 'claude-sonnet-5', 'claude-fable-5.1'].map(
    (name): ExpectedDefinition => ({
      modelId: `anthropic/${name}`,
      family: 'anthropic',
      route: 'anthropic',
      mode: 'explicit',
      reminderRole: 'user',
    }),
  ),
  ...['deepseek-v4.1-flash', 'deepseek-v4-pro-0813'].map((name): ExpectedDefinition => ({
    modelId: `deepseek/${name}`,
    family: 'deepseek',
    route: 'deepinfra/fp8',
    mode: 'automatic',
    reminderRole: 'user',
  })),
  ...['gemini-3.8-flash', 'gemini-3.7-flash'].map((name): ExpectedDefinition => ({
    modelId: `google/${name}`,
    family: 'google',
    route: 'google-ai-studio',
    mode: 'automatic',
    reminderRole: 'user',
  })),
  ...['grok-4.7', 'grok-4.6'].map((name): ExpectedDefinition => ({
    modelId: `x-ai/${name}`,
    family: 'xai',
    route: 'xai',
    mode: 'automatic',
    reminderRole: 'user',
  })),
  ...[
    'qwen3.8-max-0902',
    'qwen3.8-max-prime',
    'qwen3.8-flash',
    'qwen3.8-2.4t-a95b',
    'qwen3.8-27b',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.7-flash',
  ].map((name): ExpectedDefinition => ({
    modelId: `qwen/${name}`,
    family: 'qwen',
    route: 'alibaba',
    mode: ['qwen3.8-flash', 'qwen3.7-flash'].includes(name) ? 'automatic' : 'explicit',
    reminderRole: 'user',
  })),
  {
    modelId: 'moonshotai/kimi-k3',
    family: 'moonshot',
    route: 'moonshotai/mxfp4',
    mode: 'automatic',
    reminderRole: 'user',
  },
  {
    modelId: 'moonshotai/kimi-k2.7-code',
    family: 'moonshot',
    route: 'moonshotai/int4',
    mode: 'automatic',
    reminderRole: 'user',
  },
  ...['glm-5.3', 'glm-5.3-prime', 'glm-5.3-flash', 'glm-5.3-flashx', 'glm-5.2'].map(
    (name): ExpectedDefinition => ({
      modelId: `z-ai/${name}`,
      family: 'zai',
      route: name === 'glm-5.3-prime' ? 'alibaba' : 'z-ai/fp8',
      mode: name === 'glm-5.3-prime' ? 'explicit' : 'automatic',
      reminderRole: 'user',
    }),
  ),
]

function definition(modelId: string): ModelDefinition {
  const value = officialDefinitions.find(value => value.modelId === modelId)
  if (!value) throw new Error(`missing official definition: ${modelId}`)
  return value
}

function request(value: ExpectedDefinition): PlanInput {
  const base = input()
  const model = definition(value.modelId)
  return {
    ...base,
    routeName: value.modelId,
    provider: value.route,
    snapshot: {
      ...base.snapshot,
      providers: [value.route],
      adaptation: {
        implementation: model.implementation,
        definition: { modelId: model.modelId, revision: model.revision },
        configuration: {
          revision: 'caller-cache-1',
          values: {
            cache:
              value.mode === 'automatic'
                ? { mode: 'automatic' }
                : { mode: 'explicit', ttl: '1h', breakpoints: ['system', 'last_message'] },
          },
        },
      },
    },
  }
}

function planned(value: ExpectedDefinition): PlannedRequest {
  const result = planRequest(request(value), officialDefinitions)
  if ('rejected' in result) throw new Error(`unexpected planning rejection: ${result.rejected}`)
  return result.planned
}

describe('P2 confirmed official model definitions', () => {
  it('has exactly the confirmed 37 names and unique precise version identities', () => {
    expect(officialDefinitions).toHaveLength(37)
    expect(officialDefinitions.map(value => value.modelId).sort()).toEqual(
      expected.map(value => value.modelId).sort(),
    )
    expect(
      new Set(
        officialDefinitions.map(value =>
          JSON.stringify([value.implementation, value.modelId, value.revision]),
        ),
      ).size,
    ).toBe(37)
    const counts = Object.fromEntries(
      [...new Set(expected.map(value => value.family))].map(family => [
        family,
        officialDefinitions.filter(
          value => value.implementation.name === `omne-official:openrouter-${family}`,
        ).length,
      ]),
    )
    expect(counts).toEqual({
      openai: 12,
      anthropic: 4,
      deepseek: 2,
      google: 2,
      xai: 2,
      qwen: 8,
      moonshot: 2,
      zai: 5,
    })
  })

  it.each(expected)('pins $modelId to its accepted family, route, mode and reminder', value => {
    expect(definition(value.modelId)).toEqual({
      modelId: value.modelId,
      revision: '1',
      implementation: { name: `omne-official:openrouter-${value.family}`, revision: '6' },
      reminderRole: value.reminderRole,
      routes: { [value.route]: value.mode },
    })
  })

  it.each(expected)('plans $modelId through the common public implementation', value => {
    const result = planned(value)
    expect(result.body.model).toBe(value.modelId)
    expect(result.body.provider).toEqual({
      order: [value.route],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(result.body.messages).toMatchObject([
      { role: 'system' },
      { role: value.reminderRole },
      { role: 'user' },
    ])
    expect(result.input.snapshot.adaptation).toEqual(request(value).snapshot.adaptation)
    if (value.mode === 'automatic') expect(result.serialized).not.toContain('cache_control')
    else {
      expect(result.body.messages).toMatchObject([
        { content: [{ cache_control: { type: 'ephemeral', ttl: '1h' } }] },
        {},
        { content: [{ cache_control: { type: 'ephemeral', ttl: '1h' } }] },
      ])
    }
    for (const key of ['user', 'session_id', 'prompt_cache_key', 'models', 'route'])
      expect(result.body).not.toHaveProperty(key)
  })

  it.each(expected)('rejects a wrong route or uninstalled revision for $modelId', value => {
    const current = request(value)
    const binding = current.snapshot.adaptation
    expect(
      planRequest({ ...current, provider: 'unregistered-provider' }, officialDefinitions),
    ).toEqual({ rejected: 'unavailable' })
    expect(
      planRequest(
        {
          ...current,
          snapshot: {
            ...current.snapshot,
            adaptation: {
              ...binding,
              implementation: { ...binding.implementation, revision: 'not-installed' },
            },
          },
        },
        officialDefinitions,
      ),
    ).toEqual({ rejected: 'unavailable' })
    expect(
      planRequest(
        {
          ...current,
          snapshot: {
            ...current.snapshot,
            adaptation: {
              ...binding,
              definition: { ...binding.definition, revision: 'not-installed' },
            },
          },
        },
        officialDefinitions,
      ),
    ).toEqual({ rejected: 'unavailable' })
  })

  it.each(expected.filter(value => value.mode === 'explicit'))(
    'requires a caller TTL for $modelId and preserves the supplied 5m value',
    value => {
      const current = request(value)
      const binding = current.snapshot.adaptation
      const withCache = (
        cache: PlanInput['snapshot']['adaptation']['configuration']['values'],
      ) => ({
        ...current,
        snapshot: {
          ...current.snapshot,
          adaptation: {
            ...binding,
            configuration: { revision: 'caller-cache-2', values: cache },
          },
        },
      })
      expect(
        planRequest(
          withCache({ cache: { mode: 'explicit', breakpoints: ['system'] } }),
          officialDefinitions,
        ),
      ).toEqual({ rejected: 'invalidInput' })
      const result = planRequest(
        withCache({ cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } }),
        officialDefinitions,
      )
      if ('rejected' in result) throw new Error(`unexpected rejection: ${result.rejected}`)
      expect(result.planned.body.messages).toMatchObject([
        { content: [{ cache_control: { type: 'ephemeral', ttl: '5m' } }] },
        {},
        {},
      ])
      expect(result.planned.serialized).not.toContain('1h')
    },
  )

  it('owns frozen definitions and nested route/implementation values', () => {
    expect(Object.isFrozen(officialDefinitions)).toBe(true)
    for (const value of officialDefinitions) {
      expect(Object.isFrozen(value)).toBe(true)
      expect(Object.isFrozen(value.implementation)).toBe(true)
      expect(Object.isFrozen(value.routes)).toBe(true)
      expect(Reflect.set(value, 'modelId', 'other/model')).toBe(false)
      expect(Reflect.set(value.implementation, 'revision', 'replacement')).toBe(false)
      expect(Reflect.set(value.routes, 'other-provider', 'automatic')).toBe(false)
    }
  })

  it('keeps existing pilot coordinates and content identical', () => {
    for (const value of pilotDefinitions) expect(definition(value.modelId)).toEqual(value)
  })

  it('does not infer a definition for another model in an installed family', () => {
    const value = expected[0]
    if (!value) throw new Error('missing expected definition')
    const current = request(value)
    expect(
      planRequest(
        {
          ...current,
          routeName: 'openai/not-confirmed',
          snapshot: {
            ...current.snapshot,
            adaptation: {
              ...current.snapshot.adaptation,
              definition: { modelId: 'openai/not-confirmed', revision: '1' },
            },
          },
        },
        officialDefinitions,
      ),
    ).toEqual({ rejected: 'unavailable' })
  })
})
