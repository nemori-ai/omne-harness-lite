import { describe, expect, it } from 'vitest'
import { planRequest } from './synthetic-input-meter.ts'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
  type ModelDefinition,
  type ModelRoute,
} from '@omne-harness-lite/pi-ai-transport'
import {
  qwen37FlashAlibabaRoute,
  qwen38FlashAlibabaRoute,
  qwenAlibabaModelIds,
  qwenAlibabaParameters,
  qwenAlibabaRoutes,
  type QwenAlibabaModelId,
} from '../src/official-models/qwen.ts'

const provider = 'alibaba'
const at = '2026-09-28T00:00:00Z'

// Fictional capacities and cache mode keep these planner checks separate from
// official model publication and actual Alibaba cache certification.
function fixture(route: ModelRoute): ModelDefinition {
  return {
    modelId: 'fixture/qwen-alibaba-route',
    revision: 'fixture-1',
    implementation: { name: 'pi-ai:qwen-fixture', revision: '1' },
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
    routes: { [provider]: route },
  }
}
function message(raw: unknown): Message {
  const result = judgeMessage(raw)
  if ('rejected' in result) throw new Error(result.rejected)
  return result.ok
}
function textMessage(type: 'system' | 'system_reminder' | 'user'): Message {
  return message({
    id: type,
    type,
    createdAt: at,
    blocks: [
      {
        id: `${type}-text`,
        kind: 'text',
        text: type,
        visibility: { toHuman: true, toModel: true },
      },
    ],
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'attempt_started', attempt: 1, reason: 'first', at } }
      : {}),
  })
}
function request(route: ModelRoute, parameters: ModelRequestParameters = {}) {
  const definition = fixture(route)
  const cache =
    route.cache.mode === 'automatic'
      ? { mode: 'automatic' }
      : { mode: 'explicit', ttl: '5m', breakpoints: ['system'] }
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration: { revision: 'fixture-1', values: { cache } },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const input: PlanInput = {
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('qwen-fixture-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider,
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
    parameters,
    messages: [textMessage('system'), textMessage('system_reminder'), textMessage('user')],
    tools: [],
  }
  return { definition, input, result: planRequest(input, [definition]) }
}
function routeForParameters(modelId: QwenAlibabaModelId): ModelRoute {
  return qwenAlibabaRoutes[modelId]
}

describe('Qwen Alibaba supplied route rules (offline, not complete official definitions)', () => {
  it('covers the exact eight target IDs and preserves the two evidenced automatic Flash routes', () => {
    expect(qwenAlibabaModelIds).toEqual([
      'qwen/qwen3.8-max-0902',
      'qwen/qwen3.8-max-prime',
      'qwen/qwen3.8-flash',
      'qwen/qwen3.8-2.4t-a95b',
      'qwen/qwen3.8-27b',
      'qwen/qwen3.7-max',
      'qwen/qwen3.7-plus',
      'qwen/qwen3.7-flash',
    ])
    expect(Object.keys(qwenAlibabaParameters)).toEqual(qwenAlibabaModelIds)
    expect(Object.keys(qwenAlibabaRoutes)).toEqual(qwenAlibabaModelIds)
    for (const route of [qwen38FlashAlibabaRoute, qwen37FlashAlibabaRoute]) {
      const { definition, result } = request(route)
      expect(
        readModelDefinition([definition], {
          implementation: definition.implementation,
          definition: { modelId: definition.modelId, revision: definition.revision },
        }),
      ).toEqual({ ok: definition })
      expect(
        interpretConfiguration(definition, { cache: { mode: 'automatic' } }, provider),
      ).toEqual({
        ok: { mode: 'automatic' },
      })
      expect(
        interpretConfiguration(
          definition,
          { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] } },
          provider,
        ),
      ).toEqual({ rejected: 'invalidInput' })
      const schema = configurationSchema(definition, provider)
      if ('rejected' in schema) throw new Error(schema.rejected)
      expect(JSON.stringify(schema.ok)).not.toContain('default')
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.body.messages).toEqual([
        { role: 'system', content: [{ type: 'text', text: 'system' }] },
        {
          role: 'user',
          content: [
            { type: 'text', text: '[system_reminder "system_reminder"]' },
            { type: 'text', text: 'system_reminder' },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'user' }] },
      ])
      expect(result.planned.body.provider).toEqual({
        order: [provider],
        allow_fallbacks: false,
        require_parameters: true,
      })
      expect(result.planned.serialized).not.toContain('cache_control')
    }
  })

  it.each(
    qwenAlibabaModelIds.filter(modelId => qwenAlibabaRoutes[modelId].cache.mode === 'explicit'),
  )('%s requires a supplied 5m system breakpoint and places it on the wire', modelId => {
    const route = qwenAlibabaRoutes[modelId]
    const { definition, result } = request(route)
    expect(
      interpretConfiguration(
        definition,
        { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } },
        provider,
      ),
    ).toEqual({ ok: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } })
    const schema = configurationSchema(definition, provider)
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
    for (const cache of [
      { mode: 'explicit', breakpoints: ['system'] },
      { mode: 'explicit', ttl: '1h', breakpoints: ['system'] },
      { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] },
      { mode: 'automatic' },
    ])
      expect(interpretConfiguration(definition, { cache }, provider)).toEqual({
        rejected: 'invalidInput',
      })
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.body.messages).toMatchObject([
      {
        role: 'system',
        content: [{ type: 'text', cache_control: { type: 'ephemeral', ttl: '5m' } }],
      },
      { role: 'user' },
      { role: 'user' },
    ])
    expect(result.planned.body.provider).toEqual({
      order: [provider],
      allow_fallbacks: false,
      require_parameters: true,
    })
  })

  it.each(qwenAlibabaModelIds)(
    '%s passes the output cap unchanged and traces the supplied subset',
    modelId => {
      const { result } = request(routeForParameters(modelId), {
        maxOutputTokens: 64,
        temperature: 0.5,
        topP: 0.8,
        seed: 7,
        stopSequences: ['END'],
        frequencyPenalty: 0.5,
        presencePenalty: -0.5,
        extra: { unverified_key: true },
      })
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.parameters).toEqual({ maxOutputTokens: 64 })
      expect(result.planned.body.max_tokens).toBe(64)
      expect(result.planned.droppedParameters).toEqual([
        'temperature',
        'topP',
        'seed',
        'stopSequences',
        'frequencyPenalty',
        'presencePenalty',
        'unverified_key',
      ])
    },
  )

  it.each(['qwen/qwen3.8-max-0902', 'qwen/qwen3.8-2.4t-a95b'] as const)(
    '%s excludes mandatory-reasoning none but passes the evidenced high and max values',
    modelId => {
      const route = routeForParameters(modelId)
      for (const effort of ['high', 'max'] as const) {
        const { result } = request(route, { reasoningEffort: effort })
        if ('rejected' in result) throw new Error(result.rejected)
        expect(result.planned.body.reasoning).toEqual({ effort })
      }
      const { result } = request(route, { reasoningEffort: 'none' })
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.droppedParameters).toEqual(['reasoningEffort'])
      expect(result.planned.body).not.toHaveProperty('reasoning')
    },
  )

  it('passes the narrow Alibaba 27B none value and rejects an unevidenced effort', () => {
    const route = routeForParameters('qwen/qwen3.8-27b')
    const disabled = request(route, { reasoningEffort: 'none' }).result
    if ('rejected' in disabled) throw new Error(disabled.rejected)
    expect(disabled.planned.body.reasoning).toEqual({ effort: 'none' })
    const unknown = request(route, { reasoningEffort: 'medium' }).result
    if ('rejected' in unknown) throw new Error(unknown.rejected)
    expect(unknown.planned.droppedParameters).toEqual(['reasoningEffort'])
  })

  it('preserves reasoning and paired tool history, and rejects orphan calls before network send', () => {
    const route = qwen38FlashAlibabaRoute
    const { definition, input } = request(route)
    const assistant = message({
      id: 'assistant',
      type: 'assistant',
      response: 'response-1',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'thinking',
          kind: 'thinking',
          text: 'reasoned',
          visibility: { toHuman: false, toModel: true },
        },
        {
          id: 'tool-call',
          kind: 'tool_call',
          callId: 'tool-call-1',
          tool: 'lookup__exact',
          complete: true,
          arguments: { query: 'alpha' },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const tool = message({
      id: 'tool',
      type: 'tool',
      callId: 'tool-call-1',
      createdAt: at,
      blocks: [
        {
          id: 'result',
          kind: 'tool_result',
          callId: 'tool-call-1',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'result-text',
              kind: 'text',
              text: 'ok',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const result = planRequest({ ...input, messages: [...input.messages, assistant, tool] }, [
      definition,
    ])
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.body.messages).toMatchObject([
      { role: 'system' },
      { role: 'user' },
      { role: 'user' },
      {
        role: 'assistant',
        reasoning: 'reasoned',
        tool_calls: [{ function: { name: 'lookup__exact' } }],
      },
      { role: 'tool', content: 'ok' },
    ])
    expect(
      planRequest({ ...input, messages: [...input.messages, assistant] }, [definition]),
    ).toEqual({
      rejected: 'orphan_tool_call',
    })
    expect(planRequest({ ...input, provider: 'unselected' }, [definition])).toEqual({
      rejected: 'unavailable',
    })
    expect(planRequest({ ...input, parameters: { maxOutputTokens: 129 } }, [definition])).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
  })
})
