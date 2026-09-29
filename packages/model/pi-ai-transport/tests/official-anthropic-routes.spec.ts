import { describe, expect, it } from 'vitest'
import { planRequest } from './synthetic-input-meter.ts'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
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
  claudeOpus55AnthropicRoute,
  claudeOpus5AnthropicRoute,
  claudeSonnet5AnthropicRoute,
  claudeFable51AnthropicRoute,
} from '../src/official-models/anthropic.ts'
import { certificate, content, finish, fixture as httpsFixture, policy } from './support.ts'

const provider = 'anthropic'
const at = '2026-09-28T00:00:00Z'
const routes = [
  ['anthropic/claude-opus-5.5', claudeOpus55AnthropicRoute],
  ['anthropic/claude-opus-5', claudeOpus5AnthropicRoute],
  ['anthropic/claude-sonnet-5', claudeSonnet5AnthropicRoute],
  ['anthropic/claude-fable-5.1', claudeFable51AnthropicRoute],
] as const

function judged(raw: unknown): Message {
  const result = judgeMessage(raw)
  if ('rejected' in result) throw new Error(result.rejected)
  return result.ok
}
function message(type: 'system' | 'system_reminder' | 'user'): Message {
  return judged({
    type,
    id: type,
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
function fixture(modelId: string, route: ModelRoute): ModelDefinition {
  return {
    modelId,
    revision: 'offline-fixture-1',
    implementation: { name: 'fixture:anthropic-route', revision: '1' },
    // Intentionally synthetic. The real models' image/file bounds are unresolved.
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
function prepared(
  modelId: string,
  route: ModelRoute,
  parameters: ModelRequestParameters = {},
  cache: { mode: string; ttl?: string; breakpoints?: string[] } = {
    mode: 'explicit',
    ttl: '1h',
    breakpoints: ['last_message'],
  },
) {
  const definition = fixture(modelId, route)
  const configuration = { revision: 'fixture-1', values: { cache } }
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  const input: PlanInput = {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('anthropic-fixture-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: modelId,
    provider,
    snapshot: {
      adaptation: {
        implementation: definition.implementation,
        definition: { modelId, revision: definition.revision },
        configuration,
      },
      providers: [provider],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1024,
      maxOutputTokens: 128,
      inputConstraints: definition.capabilities.inputConstraints,
      upstreamInputLimits: definition.capabilities.upstreamInputLimits,
      updatedAt: at,
    },
    parameters,
    messages: [message('system'), message('system_reminder'), message('user')],
    tools: [],
  }
  return { definition, profile, input, result: planRequest(input, [definition]) }
}

describe('four Anthropic routes in offline synthetic profiles', () => {
  it.each(routes)(
    '%s keeps its exact route, user reminder and explicit 1h cache on the wire',
    (id, route) => {
      const { definition, profile, result } = prepared(id, route, {
        reasoningEffort: 'high',
        maxOutputTokens: 64,
        stopSequences: ['STOP'],
      })
      expect(
        readModelDefinition([definition], {
          implementation: definition.implementation,
          definition: { modelId: id, revision: definition.revision },
        }),
      ).toEqual({ ok: definition })
      if ('rejected' in profile) throw new Error(profile.rejected)
      expect(profile.ok.routeName).toBe(id)
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.body).toMatchObject({
        model: id,
        provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
        stream: true,
        store: false,
        reasoning: { effort: 'high' },
        max_tokens: 64,
        stop: ['STOP'],
      })
      expect(result.planned.body.messages).toEqual([
        { role: 'system', content: [{ type: 'text', text: 'system' }] },
        {
          role: 'user',
          content: [
            { type: 'text', text: '[system_reminder "system_reminder"]' },
            { type: 'text', text: 'system_reminder' },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'user', cache_control: { type: 'ephemeral', ttl: '1h' } },
          ],
        },
      ])
      expect(result.planned.parameters).toEqual({
        reasoningEffort: 'high',
        maxOutputTokens: 64,
        stopSequences: ['STOP'],
      })
      expect(result.planned.serialized).not.toContain('session_id')
      expect(result.planned.serialized).not.toContain('prompt_cache_key')
    },
  )

  it.each(routes)('%s requires caller TTL/layout and refuses unrepresented 5m', (id, route) => {
    const { definition } = prepared(id, route)
    const schema = configurationSchema(definition, provider)
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
    expect(
      interpretConfiguration(
        definition,
        { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
        provider,
      ),
    ).toEqual({
      ok: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] },
    })
    for (const cache of [
      { mode: 'explicit', breakpoints: ['last_message'] },
      { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] },
      { mode: 'explicit', ttl: '1h', breakpoints: ['system'] },
      { mode: 'explicit', ttl: '1h', breakpoints: ['last_message', 'system'] },
      { mode: 'automatic' },
    ]) {
      expect(interpretConfiguration(definition, { cache }, provider)).toEqual({
        rejected: 'invalidInput',
      })
      expect(prepared(id, route, {}, cache).result).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
    }
  })

  it.each(routes)(
    '%s exposes a bounded parameter subset and rejects a wrong route',
    (id, route) => {
      const { definition, input, result } = prepared(id, route, {
        reasoningEffort: 'none',
        temperature: 0.5,
        topP: 0.5,
        seed: 12,
        frequencyPenalty: 1,
        presencePenalty: 1,
        extra: { user: 'private-user-value' },
      })
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.parameters).toEqual({})
      expect(result.planned.droppedParameters).toEqual([
        'reasoningEffort',
        'temperature',
        'topP',
        'seed',
        'frequencyPenalty',
        'presencePenalty',
        'user',
      ])
      expect(result.planned.serialized).not.toContain('private-user-value')
      expect(result.planned.body).not.toHaveProperty('reasoning')
      expect(planRequest({ ...input, provider: 'anthropic/other' }, [definition])).toEqual({
        rejected: 'unavailable',
      })
      expect(planRequest({ ...input, parameters: { maxOutputTokens: 129 } }, [definition])).toEqual(
        { rejected: 'invalidInput', reason: 'malformed' },
      )
    },
  )

  it.each([routes[0], routes[3]])(
    '%s replays same-route signed thinking and paired tools without rewriting them',
    (id, route) => {
      const details = [
        {
          type: 'reasoning.encrypted',
          signature: 'synthetic-signature',
          index: new LosslessNumber('9007199254740993'),
        },
      ]
      const assistant = judged({
        type: 'assistant',
        id: 'previous-assistant',
        response: 'previous-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'thinking',
            kind: 'thinking',
            text: '',
            opaque: { routeName: id, reasoning_details: details },
            visibility: { toHuman: false, toModel: true },
          },
          {
            id: 'call',
            kind: 'tool_call',
            callId: 'call-1',
            tool: 'lookup',
            complete: true,
            unparseable: true,
            rawArguments: '{"x":',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      const tool = judged({
        type: 'tool',
        id: 'tool-result',
        callId: 'call-1',
        createdAt: at,
        blocks: [
          {
            id: 'tool-block',
            kind: 'tool_result',
            callId: 'call-1',
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: 'tool-text',
                kind: 'text',
                text: 'found',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      const { definition, input } = prepared(id, route)
      const result = planRequest({ ...input, messages: [assistant, tool, message('user')] }, [
        definition,
      ])
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.body.messages).toMatchObject([
        {
          role: 'assistant',
          tool_calls: [{ id: 'call-1', function: { name: 'lookup', arguments: '{"x":' } }],
        },
        { role: 'tool', tool_call_id: 'call-1', content: 'found' },
        { role: 'user' },
      ])
      expect(writeJsonLossless(result.planned.body.messages)).toContain('9007199254740993')
      expect(writeJsonLossless(result.planned.body.messages)).toContain('synthetic-signature')
      expect(planRequest({ ...input, messages: [assistant] }, [definition])).toEqual({
        rejected: 'orphan_tool_call',
      })
      const changed = prepared('anthropic/other-claimed-route', route)
      const different = planRequest({ ...changed.input, messages: [assistant, tool] }, [
        changed.definition,
      ])
      if ('rejected' in different) throw new Error(different.rejected)
      expect(different.planned.serialized).not.toContain('synthetic-signature')
    },
  )
})

describe('Anthropic route through the public invocation and controlled HTTPS transport', () => {
  it('sends the pinned provider, reminder and configured breakpoint once, then consumes the stream', async () => {
    const { definition, input } = prepared('anthropic/claude-opus-5.5', claudeOpus55AnthropicRoute)
    const cert = certificate()
    const host = await httpsFixture(
      cert.tls,
      res => res.end(content('visible') + finish()),
      {},
      undefined,
      [definition],
    )
    try {
      const handle = invokeModel({
        ...input,
        transport: host.transport,
        credential: 'synthetic-credential',
        signal: new AbortController().signal,
        policy: policy(),
        onAccepted: () => {},
      })
      const result = await handle.outcome
      if (!('outcome' in result)) throw new Error('unexpected pre-send rejection')
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toMatchObject([{ kind: 'text', text: 'visible' }])
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/chat/completions' })
      const body = host.requests[0]?.body ?? ''
      expect(body).toContain('"order":["anthropic"]')
      expect(body).toContain('"allow_fallbacks":false')
      expect(body).toContain('"role":"user"')
      expect(body).toContain('"cache_control":{"type":"ephemeral","ttl":"1h"}')
      expect(body).not.toContain('synthetic-credential')
    } finally {
      await host.close()
      cert.dispose()
    }
  })
})
