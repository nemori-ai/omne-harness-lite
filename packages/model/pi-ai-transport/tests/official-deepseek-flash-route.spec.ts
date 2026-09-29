import { describe, expect, it } from 'vitest'
import { planRequest } from './synthetic-input-meter.ts'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
  type ModelDefinition,
} from '@omne-harness-lite/pi-ai-transport'
import { deepseekV41FlashDeepInfraRoute } from '../src/official-models/deepseek.ts'

const provider = 'deepinfra/fp8'
const at = '2026-09-28T00:00:00Z'

// Offline projection fixture only. Its invented capacities and finite image
// limit are never an official Flash profile or a claim about DeepInfra.
const fixture: ModelDefinition = {
  modelId: 'test/deepseek-flash-route',
  revision: 'fixture-1',
  implementation: { name: 'pi-ai:deepseek-test', revision: '1' },
  capabilities: {
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    maxInputTokens: 1024,
    maxOutputTokens: 128,
    inputConstraints: { maxImageBytes: 1024 },
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
      maxImageBytes: { status: 'unknown' },
      maxImages: { status: 'unknown' },
    },
  },
  routes: { [provider]: deepseekV41FlashDeepInfraRoute },
}
const configuration = { revision: 'fixture-1', values: { cache: { mode: 'automatic' } } }

function message(raw: unknown): Message {
  const value = judgeMessage(raw)
  if ('rejected' in value) throw new Error(value.rejected)
  return value.ok
}
const visible = { toHuman: true, toModel: true }
function input(messages: Message[], parameters: ModelRequestParameters = {}): PlanInput {
  const profile = createOfficialProfileContent(fixture, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('test-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: fixture.modelId,
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
    messages,
    tools: [],
  }
}

describe('DeepSeek V4.1 Flash route policy through public planner (synthetic profile)', () => {
  it('keeps image history and assistant reasoning while mapping reminders to user', async () => {
    const system = message({
      type: 'system',
      id: 'system',
      createdAt: at,
      blocks: [{ id: 'system-text', kind: 'text', text: 'policy', visibility: visible }],
    })
    const reminder = message({
      type: 'system_reminder',
      id: 'reminder',
      createdAt: at,
      nature: 'event',
      source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
      blocks: [{ id: 'reminder-text', kind: 'text', text: 'continue', visibility: visible }],
    })
    const assistant = message({
      type: 'assistant',
      id: 'assistant',
      response: 'response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        { id: 'thought', kind: 'thinking', text: 'reasoned', visibility: visible },
        { id: 'answer', kind: 'text', text: 'answer', visibility: visible },
      ],
    })
    const user = message({
      type: 'user',
      id: 'user',
      createdAt: at,
      blocks: [
        { id: 'prompt', kind: 'text', text: 'describe', visibility: visible },
        {
          id: 'image',
          kind: 'image',
          mediaType: 'image/png',
          data: {
            inline:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          },
          visibility: visible,
        },
      ],
    })
    const request = input([system, reminder, assistant, user], {
      reasoningEffort: 'low',
      temperature: 0.5,
      maxOutputTokens: 64,
    })
    const result = await planRequest(request, [fixture])
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.body.model).toBe('test/deepseek-flash-route')
    expect(result.planned.body.provider).toEqual({
      order: [provider],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(result.planned.body.messages).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'policy' }] },
      {
        role: 'user',
        content: [
          { type: 'text', text: '[system_reminder "reminder"]' },
          { type: 'text', text: 'continue' },
        ],
      },
      { role: 'assistant', content: 'answer', reasoning: 'reasoned' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe' },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
            },
          },
        ],
      },
    ])
    expect(result.planned.parameters).toEqual({ reasoningEffort: 'low', maxOutputTokens: 64 })
    expect(result.planned.droppedParameters).toEqual(['temperature'])
    expect(result.planned.body.reasoning).toEqual({ effort: 'low' })
    expect(result.planned.body.max_tokens).toBe(64)
    expect(result.planned.body).not.toHaveProperty('temperature')
    expect(result.planned.serialized).not.toContain('cache_control')
    expect(result.planned.serialized).not.toContain('ttl')
  })

  it('preserves a completed tool call and its paired result in the request history', async () => {
    const assistant = message({
      type: 'assistant',
      id: 'assistant-tool',
      response: 'response-tool',
      ending: 'complete',
      createdAt: at,
      blocks: [
        { id: 'thought', kind: 'thinking', text: 'look up', visibility: visible },
        {
          id: 'call',
          kind: 'tool_call',
          callId: 'lookup-1',
          tool: 'lookup',
          complete: true,
          arguments: { query: 'x' },
          visibility: visible,
        },
      ],
    })
    const tool = message({
      type: 'tool',
      id: 'tool',
      callId: 'lookup-1',
      createdAt: at,
      blocks: [
        {
          id: 'result',
          kind: 'tool_result',
          callId: 'lookup-1',
          outcome: 'completed',
          visibility: visible,
          blocks: [{ id: 'result-text', kind: 'text', text: 'found', visibility: visible }],
        },
      ],
    })
    const result = await planRequest(input([assistant, tool]), [fixture])
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.body.messages).toEqual([
      {
        role: 'assistant',
        content: '',
        reasoning: 'look up',
        tool_calls: [
          {
            id: 'lookup-1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"query":"x"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'lookup-1', content: 'found' },
    ])
  })

  it('requires exact automatic configuration and refuses wrong route or output budget', async () => {
    expect(
      readModelDefinition([fixture], {
        implementation: fixture.implementation,
        definition: { modelId: fixture.modelId, revision: fixture.revision },
      }),
    ).toEqual({ ok: fixture })
    expect(interpretConfiguration(fixture, configuration.values, provider)).toEqual({
      ok: { mode: 'automatic' },
    })
    const schema = configurationSchema(fixture, provider)
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
    for (const values of [{}, { cache: { mode: 'automatic', ttl: '1h' } }])
      expect(interpretConfiguration(fixture, values, provider)).toEqual({
        rejected: 'invalidInput',
      })
    const request = input([])
    expect(await planRequest({ ...request, provider: 'deepseek' }, [fixture])).toEqual({
      rejected: 'unavailable',
    })
    expect(
      await planRequest({ ...request, parameters: { maxOutputTokens: 129 } }, [fixture]),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
  })
})
