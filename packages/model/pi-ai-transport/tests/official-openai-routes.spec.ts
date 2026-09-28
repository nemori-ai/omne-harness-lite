import { describe, expect, it } from 'vitest'
import { planRequest } from './synthetic-input-meter.ts'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
  type ModelDefinition,
  type ModelRoute,
} from '@omne-harness-lite/pi-ai-transport'
import { openaiRoutes } from '../src/official-models/openai.ts'
import { input as baseInput, judgedMessage, message } from './support.ts'

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

function fixture(modelId: string, route: ModelRoute): ModelDefinition {
  return {
    modelId,
    revision: 'synthetic-fixture',
    implementation: { name: 'pi-ai:openai-fixture', revision: '1' },
    // Invented text-only capacities are test inputs, never official profiles.
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1024,
      maxOutputTokens: 128,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
    },
    routes: { openai: route },
  }
}

function setup(modelId: (typeof ids)[number], parameters: ModelRequestParameters = {}) {
  const definition = fixture(modelId, openaiRoutes[modelId])
  const configuration = { revision: 'fixture', values: { cache: { mode: 'automatic' } } }
  const profile = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const original = baseInput()
  const request: PlanInput = {
    ...original,
    routeName: modelId,
    provider: 'openai',
    parameters,
    messages: [message('system', 'instruction'), message('system_reminder', 'continue'), message()],
    snapshot: {
      ...original.snapshot,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
    },
  }
  return { definition, request, result: planRequest(request, [definition]) }
}

describe('OpenAI selected route rules (offline fixtures, not official profiles)', () => {
  it('covers precisely the 12 confirmed IDs with an explicit openai route', () => {
    expect(Object.keys(openaiRoutes)).toEqual(ids)
    expect(new Set(Object.values(openaiRoutes).map(route => route.reminderRole))).toEqual(
      new Set(['developer']),
    )
  })

  it.each(ids)('%s retains marked developer reminder and automatic cache', modelId => {
    const { definition, result } = setup(modelId)
    expect(
      readModelDefinition([definition], {
        implementation: definition.implementation,
        definition: { modelId, revision: definition.revision },
      }),
    ).toEqual({ ok: definition })
    expect(interpretConfiguration(definition, { cache: { mode: 'automatic' } }, 'openai')).toEqual({
      ok: { mode: 'automatic' },
    })
    expect(
      interpretConfiguration(
        definition,
        { cache: { mode: 'explicit', ttl: '30m', breakpoints: ['system'] } },
        'openai',
      ),
    ).toEqual({ rejected: 'invalidInput' })
    const schema = configurationSchema(definition, 'openai')
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.body.provider).toEqual({
      order: ['openai'],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(result.planned.body.messages).toMatchObject([
      { role: 'system' },
      {
        role: 'developer',
        content: [{ text: '[system_reminder "system_reminder"]' }, { text: 'continue' }],
      },
      { role: 'user' },
    ])
    expect(result.planned.serialized).not.toContain('cache_control')
    expect(result.planned.serialized).not.toContain('prompt_cache_options')
    expect(result.planned.serialized).not.toContain('ttl')
  })

  it.each(ids)('%s passes only supplied effort values, and max output unchanged', modelId => {
    const accepted: readonly NonNullable<ModelRequestParameters['reasoningEffort']>[] =
      modelId.startsWith('openai/gpt-6-astra')
        ? ['low', 'medium', 'high', 'max']
        : ['none', 'low', 'medium', 'high', 'max']
    for (const effort of accepted) {
      const { result } = setup(modelId, {
        reasoningEffort: effort,
        maxOutputTokens: 64,
      })
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.body.reasoning).toEqual({ effort })
      expect(result.planned.body.max_tokens).toBe(64)
      expect(result.planned.parameters.maxOutputTokens).toBe(64)
    }
    if (modelId.includes('astra')) {
      const { result } = setup(modelId, { reasoningEffort: 'none' })
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.droppedParameters).toEqual(['reasoningEffort'])
      expect(result.planned.body).not.toHaveProperty('reasoning')
    }
  })

  it('traces unprovided sampling and private values instead of silently passing them', () => {
    const { result } = setup(ids[0], {
      temperature: 0.5,
      topP: 0.5,
      seed: 123,
      stopSequences: ['END'],
      frequencyPenalty: 1,
      presencePenalty: 1,
      extra: { include_reasoning: true, prompt_cache_options: { mode: 'explicit' } },
    })
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.parameters).toEqual({})
    expect(result.planned.droppedParameters).toEqual([
      'temperature',
      'topP',
      'seed',
      'stopSequences',
      'frequencyPenalty',
      'presencePenalty',
      'include_reasoning',
      'prompt_cache_options',
    ])
    expect(result.planned.body).not.toHaveProperty('prompt_cache_options')
  })

  it('preserves paired tool replay and rejects orphaned tool calls', () => {
    const assistant = judgedMessage({
      id: 'assistant1',
      type: 'assistant',
      response: 'response1',
      ending: 'complete',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [
        {
          id: 'callblock',
          kind: 'tool_call',
          callId: 'call with spaces',
          tool: 'lookup',
          complete: true,
          unparseable: true,
          rawArguments: '{"x":',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const tool = judgedMessage({
      id: 'tool1',
      type: 'tool',
      callId: 'call with spaces',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [
        {
          id: 'result1',
          kind: 'tool_result',
          callId: 'call with spaces',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'resulttext',
              kind: 'text',
              text: 'ok',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const { definition, request } = setup(ids[2])
    const planned = planRequest({ ...request, messages: [assistant, tool] }, [definition])
    if ('rejected' in planned) throw new Error(planned.rejected)
    expect(planned.planned.body.messages).toMatchObject([
      { tool_calls: [{ id: expect.stringMatching(/^call_/), function: { arguments: '{"x":' } }] },
      { role: 'tool', tool_call_id: expect.stringMatching(/^call_/), content: 'ok' },
    ])
    expect(planRequest({ ...request, messages: [assistant] }, [definition])).toEqual({
      rejected: 'orphan_tool_call',
    })
  })

  it('replays same-route opaque reasoning and leaves another route without those details', () => {
    const details = [{ type: 'reasoning.encrypted', data: 'fixture-only', index: 0 }]
    const assistant = judgedMessage({
      id: 'assistant-reasoning',
      type: 'assistant',
      response: 'response-reasoning',
      ending: 'complete',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [
        {
          id: 'thinking',
          kind: 'thinking',
          text: '',
          opaque: { routeName: ids[2], reasoning_details: details },
          visibility: { toHuman: false, toModel: true },
        },
      ],
    })
    const same = setup(ids[2])
    const samePlan = planRequest({ ...same.request, messages: [assistant] }, [same.definition])
    if ('rejected' in samePlan) throw new Error(samePlan.rejected)
    expect(samePlan.planned.body.messages).toMatchObject([
      { role: 'assistant', reasoning_details: details },
    ])
    const other = setup(ids[4])
    const otherPlan = planRequest({ ...other.request, messages: [assistant] }, [other.definition])
    if ('rejected' in otherPlan) throw new Error(otherPlan.rejected)
    expect(JSON.stringify(otherPlan.planned.body.messages)).not.toContain('reasoning_details')
  })

  it('rejects a wrong provider and output above the fixture profile', () => {
    const { definition, request } = setup(ids[2])
    expect(planRequest({ ...request, provider: 'other-provider' }, [definition])).toEqual({
      rejected: 'unavailable',
    })
    expect(planRequest({ ...request, parameters: { maxOutputTokens: 129 } }, [definition])).toEqual(
      {
        rejected: 'invalidInput',
        reason: 'malformed',
      },
    )
  })
})
