import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { planRequest } from '../src/plan.ts'
import { createPiAiTransport } from '../src/transport.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture as httpsFixture,
  input as testInput,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

const modelIds = [
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-fable-5.1',
]

function definition(modelId: string) {
  const found = anthropicDefinitions.find(item => item.modelId === modelId)
  if (!found) throw new Error(`missing Anthropic definition: ${modelId}`)
  return found
}

function measuredTokens(modelId: string, body: JsonObject) {
  const result = createAnthropicInputMeter(definition(modelId)).measure({
    body,
    serialized: writeJsonLossless(body),
  })
  if (result.kind !== 'estimated') throw new Error('expected rough Anthropic estimate')
  return Number(result.tokens)
}

describe('four exact Anthropic legacy-BPE rough estimates', () => {
  it('matches independent @anthropic-ai/tokenizer 0.0.4 vectors through js-tiktoken/lite', () => {
    const model = modelIds[0]
    if (!model) throw new Error('missing model')
    // Independently run @anthropic-ai/tokenizer 0.0.4 counted these complete
    // JSON bodies as 32, 35 and 46 (raw content alone: 7, 9 and 20).
    const vectors = [
      ['Hello, 世界!', 32],
      ['{"role":"user","content":"hello"}', 35],
      ['{"role":"tool","tool_call_id":"call_1","content":"sunny"}', 46],
    ] as const
    for (const [text, expected] of vectors) {
      const body = { model, messages: [{ role: 'user', content: text }] }
      expect(measuredTokens(model, body)).toBe(expected)
    }
  })

  it('binds only the four explicit definitions and selected Anthropic provider', () => {
    for (const modelId of modelIds) {
      const meter = createAnthropicInputMeter(definition(modelId))
      expect(meter).toMatchObject({ modelId, definitionRevision: '1', provider: 'anthropic' })
      expect(meter.algorithmRevision).toContain('rough')
    }
    expect(() =>
      createAnthropicInputMeter({ ...definition(modelIds[0] ?? ''), revision: '2' }),
    ).toThrow(TypeError)
    expect(() =>
      createAnthropicInputMeter({
        ...definition(modelIds[0] ?? ''),
        implementation: { name: 'pi-ai:anthropic', revision: 'mp4-1' },
      }),
    ).toThrow(TypeError)
    expect(() =>
      createAnthropicInputMeter({ ...definition(modelIds[0] ?? ''), routes: {} }),
    ).toThrow(TypeError)
    expect(() =>
      createAnthropicInputMeter({ ...definition(modelIds[0] ?? ''), modelId: 'anthropic/unknown' }),
    ).toThrow(TypeError)
  })

  it('counts the complete text, tools, results, reminder, cache and provider body', () => {
    const model = modelIds[0]
    if (!model) throw new Error('missing model')
    const body = {
      model,
      provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
      stream: true,
      store: false,
      reasoning: { effort: 'high' },
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'Read the weather.' }] },
        {
          role: 'user',
          content: [{ type: 'text', text: '[system_reminder "r"] keep going' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'What is it?' }] },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'weather', arguments: '{"city":"Paris"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'Sunny, 22 C' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Tomorrow?', cache_control: { type: 'ephemeral', ttl: '1h' } },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'weather',
            description: 'Read forecasts',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        },
      ],
    }
    const complete = measuredTokens(model, body)
    expect(complete).toBeGreaterThan(0)
    expect(measuredTokens(model, { ...body, tools: [] })).not.toBe(complete)
    expect(
      measuredTokens(model, {
        ...body,
        messages: body.messages.filter(message => message.role !== 'tool'),
      }),
    ).not.toBe(complete)
    expect(
      measuredTokens(model, {
        ...body,
        messages: body.messages.filter(message => message.role !== 'assistant'),
      }),
    ).not.toBe(complete)
    expect(
      measuredTokens(model, {
        ...body,
        messages: body.messages.filter(message => message.role !== 'user'),
      }),
    ).not.toBe(complete)
    const { reasoning: _reasoning, ...withoutReasoning } = body
    expect(measuredTokens(model, withoutReasoning)).not.toBe(complete)
    const meter = createAnthropicInputMeter(definition(model))
    expect(meter.measure({ body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    expect(
      meter.measure({
        body: { ...body, model: 'anthropic/other' },
        serialized: writeJsonLossless({ ...body, model: 'anthropic/other' }),
      }),
    ).toEqual({ kind: 'unavailable' })
  })

  it('refuses encrypted reasoning replay rather than counting ciphertext as model input', () => {
    for (const model of modelIds) {
      const textBody = {
        model,
        messages: [
          { role: 'assistant', content: '', reasoning: 'Need to check the result.' },
          {
            role: 'assistant',
            content: '',
            reasoning_details: [{ type: 'reasoning.text', text: 'The result is valid.' }],
          },
          { role: 'user', content: 'Continue.' },
        ],
      }
      expect(measuredTokens(model, textBody)).toBeGreaterThan(0)
      const body = {
        model,
        messages: [
          {
            role: 'assistant',
            content: '',
            reasoning_details: [{ type: 'reasoning.encrypted', signature: 'opaque-ciphertext' }],
          },
          { role: 'user', content: 'Continue.' },
        ],
      }
      expect(
        createAnthropicInputMeter(definition(model)).measure({
          body,
          serialized: writeJsonLossless(body),
        }),
      ).toEqual({ kind: 'unavailable' })
    }
  })

  it('refuses image and unknown content blocks before final token admission', () => {
    for (const model of modelIds) {
      const body = {
        model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }],
          },
        ],
      }
      expect(
        createAnthropicInputMeter(definition(model)).measure({
          body,
          serialized: writeJsonLossless(body),
        }),
      ).toEqual({ kind: 'unavailable' })
    }
  })

  it('admits a real final plan with explicit caller margin and cache marker', () => {
    const selected = definition(modelIds[0] ?? '')
    const configuration = {
      revision: '1',
      values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
    }
    const profile = createOfficialProfileContent(selected, {
      providers: ['anthropic'],
      allowFallback: false,
      configuration,
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const request = testInput()
    const input = {
      ...request,
      routeName: selected.modelId,
      provider: 'anthropic',
      tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
      snapshot: {
        ...request.snapshot,
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
    const meter = createAnthropicInputMeter(selected)
    const planned = planRequest(input, [selected], meter)
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.body.messages).toContainEqual({
      role: 'user',
      content: [
        { type: 'text', text: '[system_reminder "system_reminder"]' },
        { type: 'text', text: 'keep going' },
      ],
    })
    expect(planned.planned.serialized).toContain('cache_control')
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.inputLimitEvidence.tokenMargin).toEqual({
      multiplier: 1.2,
      reserveTokens: 32,
    })
    expect(planned.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(planned.planned.serialized),
    )
    const exceeded = planRequest(
      { ...input, tokenMargin: { multiplier: 1, reserveTokens: 872000 } },
      [selected],
      meter,
    )
    expect(exceeded).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
    })
    const inline = readFileSync(new URL('./fixtures/openai-meter/1x1.png', import.meta.url))
    const visual = judgedMessage({
      type: 'user',
      id: 'visual',
      createdAt: at,
      blocks: [
        {
          id: 'visual-image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: inline.toString('base64') },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    const imageRefusal = planRequest(
      { ...input, messages: [...input.messages, visual] },
      [selected],
      meter,
    )
    expect(imageRefusal).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
      metrics: ['maxInputTokens'],
    })
    const encryptedReplay = judgedMessage({
      type: 'assistant',
      id: 'opaque-assistant',
      response: 'previous-response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'opaque-thinking',
          kind: 'thinking',
          text: '',
          opaque: {
            routeName: selected.modelId,
            reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque-ciphertext' }],
          },
          visibility: { toHuman: false, toModel: true },
        },
        {
          id: 'opaque-answer',
          kind: 'text',
          text: 'Previous answer',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    expect(
      planRequest(
        { ...input, messages: [...input.messages, encryptedReplay, message('user', 'Continue?')] },
        [selected],
        meter,
      ),
    ).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_size_unavailable',
      metrics: ['maxInputTokens'],
    })
  })

  it.each(modelIds)(
    '%s sends the measured final text/tool request through the public factory',
    async modelId => {
      const selected = definition(modelId)
      const meter = createAnthropicInputMeter(selected)
      const configuration = {
        revision: 'factory-1',
        values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
      }
      const profile = createOfficialProfileContent(selected, {
        providers: ['anthropic'],
        allowFallback: false,
        configuration,
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      const tool: ModelToolEntry = {
        name: 'lookup',
        description: 'Look up a forecast',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      }
      const assistant = judgedMessage({
        type: 'assistant',
        id: 'previous-assistant',
        response: 'previous-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'previous-call',
            kind: 'tool_call',
            callId: 'call_1',
            tool: 'lookup',
            complete: true,
            unparseable: true,
            rawArguments: '{"city":"Paris"}',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      const toolResult = judgedMessage({
        type: 'tool',
        id: 'previous-result',
        callId: 'call_1',
        createdAt: at,
        blocks: [
          {
            id: 'previous-result-block',
            kind: 'tool_result',
            callId: 'call_1',
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: 'previous-result-text',
                kind: 'text',
                text: 'Sunny in Paris',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      const base = testInput()
      const input: PlanInput = {
        ...base,
        routeName: modelId,
        provider: 'anthropic',
        parameters: { reasoningEffort: 'high', maxOutputTokens: 64 },
        tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
        tools: [tool],
        messages: [
          ...base.messages,
          assistant,
          toolResult,
          message('user', 'And tomorrow?', 'tomorrow'),
        ],
        snapshot: {
          ...base.snapshot,
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
      const cert = certificate()
      const host = await httpsFixture(
        cert.tls,
        res =>
          res.end(
            content('Forecast ready') +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 3,
                  prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 },
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [selected],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [selected],
        inputMeters: [meter],
      })
      try {
        const planned = transport.plan(input)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
        const handle = invokeModel({
          ...input,
          transport,
          credential: 'synthetic-credential',
          signal: new AbortController().signal,
          policy: policy(),
          onAccepted: () => {},
        })
        const result = await handle.outcome
        if (!('outcome' in result)) throw new Error(JSON.stringify(result))
        expect(result.outcome).toBe('complete')
        if (result.usage.input_tokens === 'unknown') throw new Error('missing upstream input usage')
        expect(ExactDecimal.from(result.usage.input_tokens).compare(ExactDecimal.from(75))).toBe(0)
        expect(result.usage).toMatchObject({
          cache_read_tokens: 20,
          cache_write_tokens: 5,
          output_tokens: 3,
        })
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
        const observed = readJsonStrict(host.requests[0]?.body ?? '')
        if (!('ok' in observed)) throw new Error('invalid captured request')
        expect(observed.ok).toMatchObject({
          model: modelId,
          provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
          reasoning: { effort: 'high' },
          max_tokens: 64,
          tools: [{ function: { name: 'lookup', parameters: tool.parameters } }],
          messages: [
            { role: 'system' },
            { role: 'user' },
            { role: 'user' },
            { role: 'assistant', tool_calls: [{ id: 'call_1' }] },
            { role: 'tool', tool_call_id: 'call_1', content: 'Sunny in Paris' },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'And tomorrow?',
                  cache_control: { type: 'ephemeral', ttl: '1h' },
                },
              ],
            },
          ],
        })
      } finally {
        await transport.close()
        await host.close()
        cert.dispose()
      }
    },
  )
})
