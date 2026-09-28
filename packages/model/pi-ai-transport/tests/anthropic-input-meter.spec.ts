import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { planRequest } from '../src/plan.ts'
import { at, input as testInput, judgedMessage } from './support.ts'

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
      createAnthropicInputMeter({ ...definition(modelIds[0] ?? ''), routes: {} }),
    ).toThrow(TypeError)
    expect(() =>
      createAnthropicInputMeter({ ...definition(modelIds[0] ?? ''), modelId: 'anthropic/unknown' }),
    ).toThrow(TypeError)
  })

  it('counts the complete text, tools, results, reasoning, reminder, cache and provider body', () => {
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
          reasoning_details: [{ type: 'reasoning.encrypted', signature: 'synthetic-signature' }],
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
  })
})
