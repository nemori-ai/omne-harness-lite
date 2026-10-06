import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { planRequest } from './synthetic-input-meter.ts'
import { readOpaqueJson, toOpaqueJson } from '@omne-harness-lite/content-blocks'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { type PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
  readModelDefinition,
} from '@omne-harness-lite/pi-ai-transport'
import { type ModelDefinition, type ModelRoute } from '@omne-harness-lite/model-request-runtime'
import { grok47XaiRoute, grok46XaiRoute } from '../src/official-models/xai.ts'
import {
  certificate,
  content,
  finish,
  fixture,
  invocation,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

const provider = 'xai'
const at = '2026-09-28T00:00:00Z'
const routes = [
  ['x-ai/grok-4.7', grok47XaiRoute],
  ['x-ai/grok-4.6', grok46XaiRoute],
] as const
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function capabilityFixture(modelId: string, route: ModelRoute): ModelDefinition {
  return {
    modelId,
    revision: 'fixture-1',
    implementation: { name: 'pi-ai:xai-test', revision: '1' },
    // Synthetic text-only numbers exercise route semantics, not official capacities.
    // Both real models also accept image/file input, which this fixture cannot certify.
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

function request(
  modelId: string,
  route: ModelRoute,
  parameters: ModelRequestParameters = {},
): { definition: ModelDefinition; input: PlanInput } {
  const definition = capabilityFixture(modelId, route)
  const configuration = { revision: 'fixture-1', values: { cache: { mode: 'automatic' } } }
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    definition,
    input: {
      calibration: { kind: 'none' as const, reason: 'no_observation' as const },
      outputHistory: [],
      tokenMargin: { multiplier: 1, reserveTokens: 0 },
      target: { kind: 'model_call', callId: 'test-xai-call', dispatch: 1 },
      routeName: modelId,
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
      messages: [
        message('system', 'instruction'),
        message('system_reminder', 'continue'),
        message('user', 'hello'),
      ],
      tools: [],
    },
  }
}

describe.each(routes)('%s xai route (synthetic offline capability fixture)', (modelId, route) => {
  it('uses an exact xai binding, marked user reminder, and automatic cache without manual controls', async () => {
    const { definition, input } = await request(modelId, route)
    expect(
      readModelDefinition([definition], {
        implementation: definition.implementation,
        definition: { modelId, revision: definition.revision },
      }),
    ).toEqual({ ok: definition })
    expect(interpretConfiguration(definition, { cache: { mode: 'automatic' } }, provider)).toEqual({
      ok: { mode: 'automatic' },
    })
    const schema = configurationSchema(definition, provider)
    if ('rejected' in schema) throw new Error(schema.rejected)
    expect(JSON.stringify(schema.ok)).not.toContain('default')
    const result = await planRequest(input, [definition])
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.body.model).toBe(modelId)
    expect(result.planned.body.provider).toEqual({
      order: [provider],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(result.planned.body.messages).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'instruction' }] },
      {
        role: 'user',
        content: [
          { type: 'text', text: '[system_reminder "system_reminder"]' },
          { type: 'text', text: 'continue' },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ])
    expect(result.planned.serialized).not.toContain('cache_control')
    expect(result.planned.serialized).not.toContain('ttl')
    expect(result.planned.body).not.toHaveProperty('reasoning')
  })

  it('passes only representable xAI efforts and original output count; traces supplied drops', async () => {
    for (const effort of ['low', 'medium', 'high'] as const) {
      const { definition, input } = await request(modelId, route, {
        reasoningEffort: effort,
        maxOutputTokens: 64,
      })
      const result = await planRequest(input, [definition])
      if ('rejected' in result) throw new Error(result.rejected)
      expect(result.planned.parameters).toEqual({ reasoningEffort: effort, maxOutputTokens: 64 })
      expect(result.planned.body.reasoning).toEqual({ effort })
      expect(result.planned.body.max_tokens).toBe(64)
      expect(result.planned.droppedParameters).toBeUndefined()
    }
    const { definition, input } = await request(modelId, route, {
      reasoningEffort: 'max',
      temperature: 0.5,
      topP: 0.5,
      seed: 1,
      maxOutputTokens: 64,
      stopSequences: ['END'],
      frequencyPenalty: 1,
      presencePenalty: 1,
      extra: { unknown_xai_key: true },
    })
    const result = await planRequest(input, [definition])
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.parameters).toEqual({ maxOutputTokens: 64 })
    expect(result.planned.droppedParameters).toEqual([
      'reasoningEffort',
      'temperature',
      'topP',
      'seed',
      'stopSequences',
      'frequencyPenalty',
      'presencePenalty',
      'unknown_xai_key',
    ])
    expect(result.planned.body).not.toHaveProperty('reasoning')
    expect(result.planned.body).not.toHaveProperty('stop')
    expect(result.planned.serialized).not.toContain('unknown_xai_key')
  })

  it('replays same-route reasoning details and completed tool history without rewriting arguments', async () => {
    const { definition, input } = await request(modelId, route, { reasoningEffort: 'high' })
    const opaque = toOpaqueJson({
      routeName: modelId,
      reasoning_details: [{ type: 'reasoning.text', text: 'prior thought', signature: 'opaque' }],
    })
    const assistant = judgedMessage({
      id: 'assistant-xai',
      type: 'assistant',
      response: 'response-xai',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'thinking-xai',
          kind: 'thinking',
          text: 'prior thought',
          opaque,
          visibility: { toHuman: false, toModel: true },
        },
        {
          id: 'tool-call-xai',
          kind: 'tool_call',
          callId: 'call with spaces',
          tool: 'lookup__xai',
          complete: true,
          unparseable: true,
          rawArguments: '{"x":',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const tool = judgedMessage({
      id: 'tool-xai',
      type: 'tool',
      callId: 'call with spaces',
      createdAt: at,
      blocks: [
        {
          id: 'tool-result-xai',
          kind: 'tool_result',
          callId: 'call with spaces',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: 'tool-result-text-xai',
              kind: 'text',
              text: 'found',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    })
    const result = await planRequest({ ...input, messages: [assistant, tool] }, [definition])
    if ('rejected' in result) throw new Error(result.rejected)
    expect(result.planned.body.messages).toMatchObject([
      {
        role: 'assistant',
        reasoning_details: [{ type: 'reasoning.text', text: 'prior thought', signature: 'opaque' }],
        tool_calls: [
          {
            id: expect.stringMatching(/^call_/),
            function: { name: 'lookup__xai', arguments: '{"x":' },
          },
        ],
      },
      { role: 'tool', tool_call_id: expect.stringMatching(/^call_/), content: 'found' },
    ])
    expect(await planRequest({ ...input, messages: [assistant] }, [definition])).toEqual({
      rejected: 'orphan_tool_call',
    })
  })

  it('sends one controlled HTTPS request and preserves streamed reasoning for later replay', async () => {
    const { definition, input } = await request(modelId, route, { reasoningEffort: 'medium' })
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({
            choices: [
              {
                delta: {
                  reasoning_details: [
                    { type: 'reasoning.text', text: 'controlled thought', signature: 'fixture' },
                  ],
                },
              },
            ],
          }) +
            content('controlled answer') +
            finish(),
        ),
      {},
      undefined,
      [definition],
    )
    try {
      const result = invocation(
        await invokeModel({
          ...input,
          transport: host.transport,
          credential: 'synthetic-xai-credential',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      )
      expect(result.outcome).toBe('complete')
      expect(result.blocks).toMatchObject([
        { kind: 'thinking', text: '' },
        { kind: 'text', text: 'controlled answer' },
      ])
      const thinking = result.blocks[0]
      if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
        throw new Error('controlled reasoning block absent')
      expect(readOpaqueJson(thinking.opaque)).toEqual({
        routeName: modelId,
        reasoning_details: [
          { type: 'reasoning.text', text: 'controlled thought', signature: 'fixture' },
        ],
      })
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/chat/completions' })
      expect(host.requests[0]?.body).toContain('"order":["xai"]')
      expect(host.requests[0]?.body).toContain('"reasoning":{"effort":"medium"}')
      expect(host.requests[0]?.body).not.toContain('cache_control')
    } finally {
      await host.close()
    }
  })

  it('rejects explicit cache controls, another provider and output beyond the fixture profile', async () => {
    const { definition, input } = await request(modelId, route)
    for (const values of [
      {},
      { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } },
      { cache: { mode: 'automatic', ttl: '1h' } },
    ]) {
      expect(interpretConfiguration(definition, values, provider)).toEqual({
        rejected: 'invalidInput',
      })
      expect(
        await planRequest(
          {
            ...input,
            snapshot: {
              ...input.snapshot,
              adaptation: {
                ...input.snapshot.adaptation,
                configuration: { revision: 'negative', values },
              },
            },
          },
          [definition],
        ),
      ).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
    }
    expect(
      await planRequest({ ...input, provider: 'amazon-bedrock/us-west-2' }, [definition]),
    ).toEqual({
      rejected: 'unavailable',
    })
    expect(
      await planRequest({ ...input, parameters: { maxOutputTokens: 129 } }, [definition]),
    ).toEqual({
      rejected: 'invalidInput',
      reason: 'malformed',
    })
  })
})
