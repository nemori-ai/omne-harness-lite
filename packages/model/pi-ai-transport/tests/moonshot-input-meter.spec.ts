import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  createMoonshotInputMeter,
  renderMoonshotPromptSegments,
} from '../src/input-meters/moonshot.ts'
import { moonshotTokenizer } from '../src/input-meters/moonshot-tokenizer.ts'
import {
  moonshotDefinitions,
  moonshotAutomaticConfiguration,
} from '../src/official-models/moonshot.ts'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { planRequest } from '../src/plan.ts'
import { object } from '../src/json.ts'
import { createPiAiTransport } from '@omne-harness-lite/pi-ai-transport'
import {
  certificate,
  content,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  networkPolicy,
  policy,
  sse,
} from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function request(index: 0 | 1): PlanInput {
  const definition = moonshotDefinitions[index]
  if (!definition) throw new Error('missing Moonshot definition')
  const provider = index === 0 ? 'moonshotai/mxfp4' : 'moonshotai/int4'
  const profile = createOfficialProfileContent(definition, {
    providers: [provider],
    allowFallback: false,
    configuration: moonshotAutomaticConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider,
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    parameters: { maxOutputTokens: 128, ...(index === 0 ? { reasoningEffort: 'high' } : {}) },
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
}

function moonshotFixture(name: 'multi-turn' | 'parallel-results') {
  const parsed = readJsonStrict(
    readFileSync(new URL(`./fixtures/moonshot/${name}.json`, import.meta.url), 'utf8'),
  )
  if (!('ok' in parsed) || !object(parsed.ok)) throw new Error('invalid pinned Moonshot fixture')
  return parsed.ok
}

describe('Moonshot pinned public tokenizers and route templates', () => {
  it.each(['k3', 'k27'] as const)('matches Python tiktoken 0.7.0 golden IDs for %s', route => {
    // Regenerate against the pinned tiktoken.model with tokenization_kimi.py's
    // pat_str, no special tokens allowed for ordinary user text.
    const vectors = [
      ['Hello world', '830960b76fc1f73f576717067dffe2ee477c446ee52fca951ab55dd4994c202d'],
      ['你好，Moonshot!', 'e1afaf3414bbf50e8cc0e872db9aaa7320c202f783e29be08556e372aaab90c7'],
      ['A+B\n12345', '418071d3921e576665d7d46c401d15bc9d0a47cc4885a994ae4e0beff56cf183'],
      [
        '<|open|> should be ordinary text',
        '12fc2260097f9cf89e0fbae0a2550d607b2beef2bf3ecf3219a92b408102610c',
      ],
    ] as const
    for (const [sample, hash] of vectors) {
      const ids = moonshotTokenizer(route).encode(sample, [], [])
      expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex')).toBe(hash)
    }
  })

  it.each([
    [0, 23],
    [1, 10],
  ] as const)('matches pinned model %i one-turn template golden', (index, expected) => {
    const definition = moonshotDefinitions[index]
    if (!definition) throw new Error('missing Moonshot definition')
    const body = { model: definition.modelId, messages: [{ role: 'user', content: 'Hello world' }] }
    const serialized = writeJsonLossless(body)
    const measurement = createMoonshotInputMeter(definition).measure({ body, serialized })
    if (measurement.kind === 'unavailable') throw new Error('meter unavailable')
    expect(Number(measurement.tokens)).toBe(expected)
  })

  it.each([
    [0, 'k3', 329, '6b1fdce6d18a752f39b9395aa91c4573dea677bd08593490d214153c5c106074'],
    [1, 'k27', 147, '0a60e5dce0866435ca7eb9f892e0f4b5a980dec68865b8cfa11112df1b371fe0'],
  ] as const)(
    'matches model %i upstream multi-turn tool template golden',
    (index, route, expected, idsHash) => {
      const definition = moonshotDefinitions[index]
      if (!definition) throw new Error('missing Moonshot definition')
      const body = {
        model: definition.modelId,
        ...moonshotFixture('multi-turn'),
        ...(index === 0 ? { reasoning: { effort: 'high' } } : {}),
      }
      const measurement = createMoonshotInputMeter(definition).measure({
        body,
        serialized: writeJsonLossless(body),
      })
      expect(measurement).toEqual({ kind: 'estimated', tokens: expected })
      const segments = renderMoonshotPromptSegments(route, body)
      if (!segments) throw new Error('missing Moonshot prompt projection')
      const tokenizer = moonshotTokenizer(route)
      const ids = segments.flatMap(segment =>
        tokenizer.encode(segment.text, segment.control ? [segment.text] : [], []),
      )
      expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex')).toBe(idsHash)
    },
  )

  it.each([
    [0, 'k3', 381, '3185c8fc964f3b6caa331b622e63b4450f510883fe0de9175e38f7444f47f038'],
    [1, 'k27', 169, 'e63b8bc6a00c373ef6707e34a56238cf26c363ca547052a7c47fb6948fb4f4dc'],
  ] as const)(
    'matches model %i public template for reversed parallel tool results and later plain reasoning',
    (index, route, tokens, idsHash) => {
      const definition = moonshotDefinitions[index]
      if (!definition) throw new Error('missing Moonshot definition')
      const body = {
        model: definition.modelId,
        ...moonshotFixture('parallel-results'),
        ...(index === 0 ? { reasoning: { effort: 'high' } } : {}),
      }
      const meter = createMoonshotInputMeter(definition)
      expect(meter.algorithmRevision).toBe(
        index === 0 ? 'moonshot-k3-xtml-3' : 'moonshot-k27-jinja-2',
      )
      expect(meter.measure({ body, serialized: writeJsonLossless(body) })).toEqual({
        kind: 'estimated',
        tokens,
      })
      const segments = renderMoonshotPromptSegments(route, body)
      if (!segments) throw new Error('missing Moonshot prompt projection')
      const tokenizer = moonshotTokenizer(route)
      const ids = segments.flatMap(segment =>
        tokenizer.encode(segment.text, segment.control ? [segment.text] : [], []),
      )
      expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex')).toBe(idsHash)
    },
  )

  it('preserves K3 XTML text-part segmentation used by marked reminders', () => {
    const definition = moonshotDefinitions[0]
    if (!definition) throw new Error('missing Moonshot definition')
    const body = {
      model: definition.modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    }
    expect(
      createMoonshotInputMeter(definition).measure({ body, serialized: writeJsonLossless(body) }),
    ).toEqual({ kind: 'estimated', tokens: 24 })
    const segments = renderMoonshotPromptSegments('k3', body)
    if (!segments) throw new Error('missing split-text projection')
    const tokenizer = moonshotTokenizer('k3')
    const ids = segments.flatMap(segment =>
      tokenizer.encode(segment.text, segment.control ? [segment.text] : [], []),
    )
    expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex')).toBe(
      '2030a249c26f4246583c16a72ba4e581b9ec4fd45099f422de59ce2be5200d31',
    )
  })

  it.each([0, 1] as const)(
    'ignores model control fields and refuses opaque reasoning on model %i',
    index => {
      const definition = moonshotDefinitions[index]
      if (!definition) throw new Error('missing Moonshot definition')
      const meter = createMoonshotInputMeter(definition)
      const base = {
        model: definition.modelId,
        messages: [{ role: 'user', content: 'Hello world' }],
      }
      const altered = {
        ...base,
        provider: { order: [meter.provider], allow_fallbacks: false },
        max_tokens: 200,
        temperature: 0.7,
        stream: false,
        store: true,
      }
      expect(meter.measure({ body: altered, serialized: writeJsonLossless(altered) })).toEqual(
        meter.measure({ body: base, serialized: writeJsonLossless(base) }),
      )
      const unknown = { ...base, prompt_hint: 'unmapped model input' }
      expect(meter.measure({ body: unknown, serialized: writeJsonLossless(unknown) })).toEqual({
        kind: 'unavailable',
      })
      const opaque = {
        ...base,
        messages: [
          {
            role: 'assistant',
            content: 'reply',
            reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque' }],
          },
        ],
      }
      expect(meter.measure({ body: opaque, serialized: writeJsonLossless(opaque) })).toEqual({
        kind: 'unavailable',
      })
    },
  )

  it.each([0, 1] as const)('admits model %i with actual final body and caller margin', index => {
    const definition = moonshotDefinitions[index]
    if (!definition) throw new Error('missing Moonshot definition')
    const meter = createMoonshotInputMeter(definition)
    const planned = planRequest(request(index), moonshotDefinitions, meter)
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.inputLimitEvidence.tokenMargin).toEqual({
      multiplier: 1.2,
      reserveTokens: 32,
    })
    expect(planned.planned.inputLimitEvidence.requestBytes).toBe(
      Buffer.byteLength(planned.planned.serialized),
    )
    expect(planned.planned.body.provider).toEqual({
      order: [meter.provider],
      allow_fallbacks: false,
      require_parameters: true,
    })
    expect(planned.planned.serialized).toContain('[system_reminder')
    expect(planned.planned.serialized).not.toContain('cache_control')
    expect(planned.planned.body).not.toHaveProperty('temperature')
    expect(planned.planned.body).not.toHaveProperty('top_p')
    expect(planned.planned.body.reasoning).toEqual(index === 0 ? { effort: 'high' } : undefined)
  })

  it.each([0, 1] as const)(
    'accounts for tools, results, history and rejects unsupported image on model %i',
    index => {
      const definition = moonshotDefinitions[index]
      if (!definition) throw new Error('missing Moonshot definition')
      const meter = createMoonshotInputMeter(definition)
      const base = {
        model: definition.modelId,
        messages: [
          { role: 'system', content: 'Follow the instructions' },
          { role: 'user', content: 'Search now' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'Find a value',
              parameters: { type: 'object', properties: { query: { type: 'string' } } },
            },
          },
        ],
      }
      const toolHistory = {
        ...base,
        messages: [
          ...base.messages,
          {
            role: 'assistant',
            content: '',
            reasoning: 'I should search',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'search', arguments: '{"query":"example"}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call_1', content: 'Found example' },
          { role: 'user', content: 'Summarize it' },
        ],
      }
      const simple = meter.measure({ body: base, serialized: writeJsonLossless(base) })
      const detailed = meter.measure({
        body: toolHistory,
        serialized: writeJsonLossless(toolHistory),
      })
      expect(simple.kind).toBe('estimated')
      expect(detailed.kind).toBe('estimated')
      if (simple.kind === 'unavailable' || detailed.kind === 'unavailable')
        throw new Error('meter unavailable')
      expect(Number(detailed.tokens)).toBeGreaterThan(Number(simple.tokens))
      const image = {
        ...base,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }],
          },
        ],
      }
      expect(meter.measure({ body: image, serialized: writeJsonLossless(image) })).toEqual({
        kind: 'unavailable',
      })
      expect(meter.measure({ body: base, serialized: '{}' })).toEqual({ kind: 'unavailable' })
    },
  )

  it.each([0, 1] as const)(
    'admits model %i replayed plain reasoning and paired tool result',
    index => {
      const definition = moonshotDefinitions[index]
      if (!definition) throw new Error('missing Moonshot definition')
      const assistant = judgedMessage({
        id: 'moonshot-assistant',
        type: 'assistant',
        response: 'response-1',
        ending: 'complete',
        createdAt: '2026-09-28T00:00:00Z',
        blocks: [
          {
            id: 'thinking',
            kind: 'thinking',
            text: 'I should search first.',
            visibility: { toHuman: false, toModel: true },
          },
          {
            id: 'call',
            kind: 'tool_call',
            callId: 'call_1',
            tool: 'search',
            complete: true,
            arguments: { query: 'Moonshot' },
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      const result = judgedMessage({
        id: 'moonshot-result',
        type: 'tool',
        callId: 'call_1',
        createdAt: '2026-09-28T00:00:01Z',
        blocks: [
          {
            id: 'result',
            kind: 'tool_result',
            callId: 'call_1',
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: 'result-text',
                kind: 'text',
                text: 'found',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      const base = request(index)
      const plan = planRequest(
        {
          ...base,
          messages: [
            ...base.messages,
            assistant,
            result,
            message('user', 'Summarize the result', 'followup'),
          ],
          tools: [
            {
              name: 'search',
              description: 'Search public data',
              parameters: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
          ],
        },
        moonshotDefinitions,
        createMoonshotInputMeter(definition),
      )
      if ('rejected' in plan) throw new Error(JSON.stringify(plan))
      expect(plan.planned.body.messages).toMatchObject([
        {},
        {},
        {},
        {
          role: 'assistant',
          reasoning: 'I should search first.',
          tool_calls: [{ id: 'call_1', function: { name: 'search' } }],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'found' },
        { role: 'user' },
      ])
      expect(plan.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    },
  )

  it('rejects mismatched definition and prevents unmeasured model dispatch', async () => {
    const selected = moonshotDefinitions[0]
    if (!selected) throw new Error('missing Moonshot definition')
    expect(() => createMoonshotInputMeter({ ...selected, revision: '2' })).toThrow(TypeError)
    expect(() => createMoonshotInputMeter({ ...selected, routes: {} })).toThrow(TypeError)
    const absent = planRequest(request(0), moonshotDefinitions)
    expect(absent).toEqual({ rejected: 'unavailable' })
    const transport = createPiAiTransport({
      definitions: moonshotDefinitions,
      inputMeters: moonshotDefinitions.map(createMoonshotInputMeter),
      policy: networkPolicy,
    })
    try {
      const planned = transport.plan(request(0))
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    } finally {
      await transport.close()
    }
  })

  it.each([0, 1] as const)(
    'sends model %i through the real meter and controlled TLS transport',
    async index => {
      const host = await fixture(
        cert.tls,
        res => {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(
            content('Measured reply.') +
              sse({
                choices: [],
                usage: {
                  prompt_tokens: 80,
                  completion_tokens: 4,
                  prompt_tokens_details: { cached_tokens: 5, cache_write_tokens: 0 },
                },
              }) +
              finish(),
          )
        },
        {},
        undefined,
        moonshotDefinitions,
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: moonshotDefinitions,
        inputMeters: moonshotDefinitions.map(createMoonshotInputMeter),
      })
      try {
        const result = await invokeModel({
          ...request(index),
          transport,
          credential: 'controlled-test-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in result)) throw new Error(JSON.stringify(result))
        expect(result.outcome).toBe('complete')
        expect(result.blocks).toMatchObject([{ kind: 'text', text: 'Measured reply.' }])
        expect(result.usage).toMatchObject({ output_tokens: 4, source: 'upstream' })
        expect(writeJsonLossless(result.usage)).toContain('"input_tokens":75')
        expect(host.requests).toHaveLength(1)
        const wire = host.requests[0]
        if (!wire) throw new Error('missing controlled request')
        const parsed = readJsonStrict(wire.body)
        if (!('ok' in parsed)) throw new Error('invalid controlled request')
        expect(parsed.ok).toMatchObject({
          model: moonshotDefinitions[index]?.modelId,
          provider: {
            order: [index === 0 ? 'moonshotai/mxfp4' : 'moonshotai/int4'],
            allow_fallbacks: false,
            require_parameters: true,
          },
          max_tokens: 128,
        })
        expect(wire.body).not.toContain('cache_control')
        expect(wire.body).not.toContain('test-only')
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )
})
