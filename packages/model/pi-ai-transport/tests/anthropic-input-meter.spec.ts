import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isJsonNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime-local'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { object } from '../src/json.ts'
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
  const result = directFull(createAnthropicInputMeter(definition(modelId)), {
    body,
    serialized: writeJsonLossless(body),
  })
  if (result.kind !== 'estimated') throw new Error('expected rough Anthropic estimate')
  return Number(result.tokens)
}

describe('four exact Anthropic projected-input rough estimates', () => {
  it('matches an external-tokenizer fixture for full text/tool history with cache marker', () => {
    const parsed = readJsonStrict(
      readFileSync(new URL('./fixtures/anthropic/reference-input.json', import.meta.url), 'utf8'),
    )
    if (!('ok' in parsed) || !object(parsed.ok) || !object(parsed.ok.body))
      throw new Error('invalid Anthropic reference fixture')
    const { body, referenceTokens } = parsed.ok
    if (!isJsonNumber(referenceTokens)) throw new Error('missing reference token count')
    const result = directFull(createAnthropicInputMeter(definition('anthropic/claude-opus-5.5')), {
      body,
      serialized: writeJsonLossless(body),
    })
    if (result.kind !== 'estimated') throw new Error('reference input became unmeasurable')
    expect(ExactDecimal.from(result.tokens).compare(ExactDecimal.from(referenceTokens))).toBe(0)
  })

  it('matches independently run @anthropic-ai/tokenizer 0.0.4 on the projected input', () => {
    const model = modelIds[0]
    if (!model) throw new Error('missing model')
    // Independently run @anthropic-ai/tokenizer 0.0.4 on the canonical
    // {messages:[{role:'user',content:text}]} projection: 18, 21 and 32.
    const vectors = [
      ['Hello, 世界!', 18],
      ['{"role":"user","content":"hello"}', 21],
      ['{"role":"tool","tool_call_id":"call_1","content":"sunny"}', 32],
    ] as const
    for (const [text, expected] of vectors) {
      const body = {
        model,
        provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
        messages: [{ role: 'user', content: text }],
      }
      expect(measuredTokens(model, body)).toBe(expected)
    }
  })

  it('binds only the four explicit definitions and selected Anthropic provider', () => {
    for (const modelId of modelIds) {
      const meter = createAnthropicInputMeter(definition(modelId))
      expect(meter).toMatchObject({ modelId, definitionRevision: '4', provider: 'anthropic' })
      expect(meter.algorithmRevision).toBe(
        'anthropic-legacy-bpe-plus-vision-patches-complete-output-5/response-calibration-1',
      )
      expect(meter.evidence).toContain('very rough approximation')
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
    const selected = definition(modelIds[0] ?? '')
    const route = selected.routes.anthropic
    if (!route) throw new Error('missing selected Anthropic route')
    expect(() =>
      createAnthropicInputMeter({
        ...selected,
        routes: { anthropic: { ...route, cache: { mode: 'automatic' } } },
      }),
    ).toThrow(TypeError)
  })

  it.each(modelIds)('%s validates cache markers against its bound route declaration', model => {
    const selected = definition(model)
    const cache = selected.routes.anthropic?.cache
    if (cache?.mode !== 'explicit') throw new Error('missing explicit Anthropic cache policy')
    expect(cache.ttlValues).toEqual(['1h'])
    const ttl = cache.ttlValues[0]
    if (!ttl) throw new Error('missing declared Anthropic TTL')
    const base = {
      model,
      provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reuse this exact text.' }] }],
    }
    const marked = {
      ...base,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Reuse this exact text.',
              cache_control: { type: 'ephemeral', ttl },
            },
          ],
        },
      ],
    }
    expect(measuredTokens(model, marked)).toBe(measuredTokens(model, base))
    const unsupported = {
      ...marked,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Reuse this exact text.',
              cache_control: { type: 'ephemeral', ttl: '5m' },
            },
          ],
        },
      ],
    }
    expect(
      directFull(createAnthropicInputMeter(selected), {
        body: unsupported,
        serialized: writeJsonLossless(unsupported),
      }),
    ).toEqual({ kind: 'unavailable' })
  })

  it('counts complete text, tools, results and reminder while excluding request controls', () => {
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
    expect(measuredTokens(model, withoutReasoning)).toBe(complete)
    expect(
      measuredTokens(model, {
        ...body,
        max_tokens: 123456,
        stop: ['A long stop sequence that is not prompt input'],
        reasoning: { effort: 'max' },
        stream: false,
        store: true,
      }),
    ).toBe(complete)
    expect(
      measuredTokens(model, {
        ...body,
        messages: body.messages.map(message =>
          message.role === 'user' && Array.isArray(message.content)
            ? {
                ...message,
                content: message.content.map(part =>
                  'cache_control' in part ? { type: 'text', text: part.text } : part,
                ),
              }
            : message,
        ),
      }),
    ).toBe(complete)
    const meter = createAnthropicInputMeter(definition(model))
    expect(directFull(meter, { body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    expect(
      directFull(meter, {
        body: { ...body, model: 'anthropic/other' },
        serialized: writeJsonLossless({ ...body, model: 'anthropic/other' }),
      }),
    ).toEqual({ kind: 'unavailable' })
    for (const unknownInput of [
      {
        ...body,
        provider: { order: ['other'], allow_fallbacks: false, require_parameters: true },
      },
      { ...body, tool_choice: { type: 'function', function: { name: 'weather' } } },
      { ...body, messages: [...body.messages, { role: 'user', content: 'x', name: 'alice' }] },
      { ...body, tools: [{ type: 'function', function: { name: 'weather', prompt: 'hidden' } }] },
    ]) {
      expect(
        directFull(meter, { body: unknownInput, serialized: writeJsonLossless(unknownInput) }),
      ).toEqual({ kind: 'unavailable' })
    }
  })

  it('refuses unbacked reasoning details while preserving independent plain reasoning', () => {
    for (const model of modelIds) {
      const textBody = {
        model,
        provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
        messages: [
          { role: 'assistant', content: '', reasoning: 'Need to check the result.' },
          { role: 'user', content: 'Continue.' },
        ],
      }
      expect(measuredTokens(model, textBody)).toBeGreaterThan(0)
      const unsigned = {
        ...textBody,
        messages: [
          {
            role: 'assistant',
            content: '',
            reasoning_details: [{ type: 'reasoning.text', text: 'The result is valid.' }],
          },
        ],
      }
      expect(
        directFull(createAnthropicInputMeter(definition(model)), {
          body: unsigned,
          serialized: writeJsonLossless(unsigned),
        }),
      ).toEqual({ kind: 'unavailable' })
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
        directFull(createAnthropicInputMeter(definition(model)), {
          body,
          serialized: writeJsonLossless(body),
        }),
      ).toEqual({ kind: 'unavailable' })
    }
  })

  it('matches the published high-resolution visual-token example plus independent BPE frame', () => {
    const image = readFileSync(
      new URL('./fixtures/anthropic/reference-green-1920x1080.png', import.meta.url),
    )
    for (const model of modelIds) {
      const body = {
        model,
        provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${image.toString('base64')}` },
              },
            ],
          },
        ],
      }
      // Anthropic Vision: 1920x1080 high-resolution = 2691 patches;
      // @anthropic-ai/tokenizer 0.0.4: projected frame with [image] = 27.
      expect(measuredTokens(model, body)).toBe(2718)
    }
  })

  it('uses the first GIF frame and refuses a false image MIME declaration', () => {
    const image = readFileSync(
      new URL('./fixtures/anthropic/reference-single-frame.gif', import.meta.url),
    )
    const url = `data:image/gif;base64,${image.toString('base64')}`
    for (const model of modelIds) {
      const body = {
        model,
        provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
        messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }],
      }
      expect(measuredTokens(model, body)).toBe(28)
      const wrongMime = {
        ...body,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: url.replace('image/gif', 'image/png') } },
            ],
          },
        ],
      }
      expect(
        directFull(createAnthropicInputMeter(definition(model)), {
          body: wrongMime,
          serialized: writeJsonLossless(wrongMime),
        }),
      ).toEqual({ kind: 'unavailable' })
    }
  })

  it('refuses malformed image, unsupported media and unknown content blocks', () => {
    for (const model of modelIds) {
      const body = {
        model,
        provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }],
          },
        ],
      }
      expect(
        directFull(createAnthropicInputMeter(definition(model)), {
          body,
          serialized: writeJsonLossless(body),
        }),
      ).toEqual({ kind: 'unavailable' })
      const unknown = {
        ...body,
        messages: [{ role: 'user', content: [{ type: 'audio_url', audio_url: { url: 'x' } }] }],
      }
      expect(
        directFull(createAnthropicInputMeter(definition(model)), {
          body: unknown,
          serialized: writeJsonLossless(unknown),
        }),
      ).toEqual({ kind: 'unavailable' })
    }
  })

  it('admits a real final plan with explicit caller margin and cache marker', async () => {
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
      calibration: { kind: 'none' as const, reason: 'no_observation' as const },
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
    const planned = await planRequest(
      input,
      [selected],
      meter,
      {
        signal: new AbortController().signal,
      },
      testImagePreparerFor(planRequest),
    )
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
    const controlled = await planRequest(
      { ...input, parameters: { reasoningEffort: 'low', maxOutputTokens: 10 } },
      [selected],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    const controlledAgain = await planRequest(
      { ...input, parameters: { reasoningEffort: 'max', maxOutputTokens: 100 } },
      [selected],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    if ('rejected' in controlled || 'rejected' in controlledAgain)
      throw new Error('valid Anthropic generation controls rejected')
    expect(controlled.planned.serialized).not.toBe(controlledAgain.planned.serialized)
    expect(measuredTokens(selected.modelId, controlled.planned.body)).toBe(
      measuredTokens(selected.modelId, controlledAgain.planned.body),
    )
    const exceeded = await planRequest(
      { ...input, tokenMargin: { multiplier: 1, reserveTokens: 872000 } },
      [selected],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    expect(exceeded).toMatchObject({
      rejected: 'invalidInput',
      reason: 'input_limit_exceeded',
      basis: 'estimated',
      metric: 'maxInputTokens',
    })
    const inline = readFileSync(new URL('./fixtures/anthropic/reference-1x1.png', import.meta.url))
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
    const imagePlan = await planRequest(
      { ...input, messages: [...input.messages, visual] },
      [selected],
      meter,
      { signal: new AbortController().signal },
      testImagePreparerFor(planRequest),
    )
    if ('rejected' in imagePlan) throw new Error(JSON.stringify(imagePlan))
    expect(imagePlan.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(imagePlan.planned.inputLimitEvidence.images).toBe(1)
    expect(imagePlan.planned.inputLimitEvidence.imageBytes).toEqual([inline.byteLength])
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
      await planRequest(
        { ...input, messages: [...input.messages, encryptedReplay, message('user', 'Continue?')] },
        [selected],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
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
      const image = readFileSync(new URL('./fixtures/anthropic/reference-1x1.png', import.meta.url))
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
              {
                id: 'previous-result-image',
                kind: 'image',
                mediaType: 'image/png',
                data: { inline: image.toString('base64') },
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      const visual = judgedMessage({
        type: 'user',
        id: 'prior-visual',
        createdAt: at,
        blocks: [
          {
            id: 'prior-image',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: image.toString('base64') },
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      const base = testInput()
      const input: PlanInput = {
        ...base,
        routeName: modelId,
        provider: 'anthropic',
        parameters: { reasoningEffort: 'high', maxOutputTokens: 64 },
        calibration: { kind: 'none' as const, reason: 'no_observation' as const },
        tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
        tools: [tool],
        messages: [
          ...base.messages,
          visual,
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
        const planned = await transport.plan(input, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
        expect(planned.planned.inputLimitEvidence.images).toBe(2)
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
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${image.toString('base64')}` },
                },
              ],
            },
            { role: 'assistant', tool_calls: [{ id: 'call_1' }] },
            {
              role: 'tool',
              tool_call_id: 'call_1',
              content: [{ type: 'text', text: 'Sunny in Paris' }],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${image.toString('base64')}` },
                },
              ],
            },
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
